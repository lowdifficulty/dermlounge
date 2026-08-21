import "server-only";
import { deleteLeadById } from "@/lib/leads/store";
import { readSchedulingData } from "@/lib/scheduling/store";
import { readWoundCareConsultations } from "@/lib/wound-care/store";
import { twilioStatus } from "@/lib/notifications/twilio-client";
import { isSmsBotEnabled } from "./sms-bot";
import { metaMessagingStatus } from "@/lib/meta/config";
import { isMetaBotEnabled } from "@/lib/meta/bot";
import {
  ensureCrmSeeded,
  refreshCrmContactsPreservingLiveInteractions,
} from "./seed";
import { getPersistenceMode } from "@/lib/scheduling/persistence";
import { dedupeAllContacts, dedupeLeads } from "./dedupe";
import {
  deleteContactById,
  findContactById,
  findContactByPhone,
  invalidateCrmReadCache,
  listInteractionsForContact,
  listRecentInteractions,
  markContactRead,
  newContactId,
  readCrmData,
  setContactBotEnabled,
  upsertContact,
  patchContact,
} from "./store";
import { crmPhoneDigits, crmPhoneE164, displayNameFromContact } from "./phone";
import {
  extractAreaCode,
  getContactServiceZone,
  zoneSortRank,
} from "./contact-zones";
import { parseContactAddress } from "./parse-address";
import {
  getMedicalService,
  resolveMedicalServiceId,
} from "@/lib/medical-services";
import type {
  CrmContact,
  CrmContactDetail,
  CrmContactListItem,
  CrmContactSortField,
  CrmContactStatus,
  CrmConversationView,
  CrmInteraction,
} from "./types";
import {
  emptyPipelineCounts,
  isCrmContactStatus,
  normalizeCrmContactStatus,
} from "./pipeline";

const FOLLOW_UP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type LinkedAppointment = {
  id: string;
  phone: string;
  startAt: string;
  groomerId: string;
  status: string;
};

export type CrmListFilter = {
  q?: string;
  status?: "all" | CrmContactStatus;
  tag?: string;
  unread?: boolean;
  view?: CrmConversationView;
  sort?: CrmContactSortField;
  order?: "asc" | "desc";
};

function enrichContactWithSortMeta(
  contact: CrmContact,
  appointments: LinkedAppointment[]
): CrmContactListItem {
  const phoneDigits = contact.phone.replace(/\D/g, "");
  const linked = appointments.filter(
    (a) =>
      contact.appointmentIds.includes(a.id) ||
      a.phone.replace(/\D/g, "").endsWith(phoneDigits)
  );
  const hasBookedAppointment = contact.appointmentIds.length > 0 || linked.length > 0;
  const now = Date.now();

  const confirmedLinked = linked.filter((a) => a.status === "confirmed");
  const pastAppointments = confirmedLinked
    .filter((a) => new Date(a.startAt).getTime() < now)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const upcomingAppointments = confirmedLinked.filter(
    (a) => new Date(a.startAt).getTime() >= now
  );

  const lastPastAppointmentAt = pastAppointments[0]?.startAt ?? null;
  const lastAppointmentAt = lastPastAppointmentAt;
  const hasUpcomingAppointment = upcomingAppointments.length > 0;
  const daysSinceLastAppointment = lastPastAppointmentAt
    ? Math.floor((now - new Date(lastPastAppointmentAt).getTime()) / DAY_MS)
    : null;
  const isFollowUp = Boolean(
    lastPastAppointmentAt &&
      !hasUpcomingAppointment &&
      daysSinceLastAppointment !== null &&
      daysSinceLastAppointment >= FOLLOW_UP_DAYS
  );
  const primaryMedicalService = resolveMedicalServiceId(contact);

  const parsed = parseContactAddress(contact);

  return {
    ...contact,
    areaCode: extractAreaCode(contact.phone),
    hasBookedAppointment,
    lastAppointmentAt,
    lastPastAppointmentAt,
    daysSinceLastAppointment,
    hasUpcomingAppointment,
    isFollowUp,
    primaryMedicalService,
    serviceZone: getContactServiceZone({
      ...contact,
      city: contact.city || parsed.city,
      zipCode: contact.zipCode || parsed.zipCode,
    }),
    street: parsed.street,
    parsedCity: parsed.city || contact.city || "",
    parsedZip: parsed.zipCode || normalizeZipField(contact.zipCode),
  };
}

function normalizeZipField(raw?: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

function sortContacts(
  contacts: CrmContactListItem[],
  sort: CrmContactSortField,
  order: "asc" | "desc"
): CrmContactListItem[] {
  const dir = order === "asc" ? 1 : -1;
  const neverLast = order === "asc" ? 1 : -1;

  return [...contacts].sort((a, b) => {
    const nameCompare = () =>
      displayNameFromContact(a).localeCompare(displayNameFromContact(b)) * dir;

    switch (sort) {
      case "name":
        return nameCompare();
      case "phone":
        return a.phone.localeCompare(b.phone) * dir || nameCompare();
      case "email": {
        const av = (a.email || "").toLowerCase();
        const bv = (b.email || "").toLowerCase();
        if (!av && bv) return neverLast;
        if (av && !bv) return -neverLast;
        return av.localeCompare(bv) * dir || nameCompare();
      }
      case "status":
        return a.status.localeCompare(b.status) * dir || nameCompare();
      case "street": {
        const av = a.street.toLowerCase();
        const bv = b.street.toLowerCase();
        if (!av && bv) return neverLast;
        if (av && !bv) return -neverLast;
        return av.localeCompare(bv) * dir || nameCompare();
      }
      case "city": {
        const av = a.parsedCity.toLowerCase();
        const bv = b.parsedCity.toLowerCase();
        if (!av && bv) return neverLast;
        if (av && !bv) return -neverLast;
        return av.localeCompare(bv) * dir || nameCompare();
      }
      case "zipCode": {
        const av = a.parsedZip;
        const bv = b.parsedZip;
        if (!av && bv) return neverLast;
        if (av && !bv) return -neverLast;
        return av.localeCompare(bv) * dir || nameCompare();
      }
      case "medicalService": {
        const av = getMedicalService(a.primaryMedicalService).label.toLowerCase();
        const bv = getMedicalService(b.primaryMedicalService).label.toLowerCase();
        return av.localeCompare(bv) * dir || nameCompare();
      }
      case "pets": {
        const av = a.pets.map((p) => p.petName).join(", ").toLowerCase();
        const bv = b.pets.map((p) => p.petName).join(", ").toLowerCase();
        if (!av && bv) return neverLast;
        if (av && !bv) return -neverLast;
        return av.localeCompare(bv) * dir || nameCompare();
      }
      case "areaCode": {
        const av = a.areaCode ?? "";
        const bv = b.areaCode ?? "";
        if (!av && bv) return neverLast;
        if (av && !bv) return -neverLast;
        return av.localeCompare(bv) * dir || a.fullName?.localeCompare(b.fullName ?? "") || 0;
      }
      case "address": {
        const av = [a.street, a.parsedCity, a.parsedZip].filter(Boolean).join(" ").toLowerCase();
        const bv = [b.street, b.parsedCity, b.parsedZip].filter(Boolean).join(" ").toLowerCase();
        if (!av && bv) return neverLast;
        if (av && !bv) return -neverLast;
        return av.localeCompare(bv) * dir || nameCompare();
      }
      case "booked": {
        const av = a.hasBookedAppointment ? 1 : 0;
        const bv = b.hasBookedAppointment ? 1 : 0;
        return (av - bv) * dir || a.fullName?.localeCompare(b.fullName ?? "") || 0;
      }
      case "lastAppointment": {
        const av = a.lastAppointmentAt;
        const bv = b.lastAppointmentAt;
        if (!av && bv) return neverLast;
        if (av && !bv) return -neverLast;
        if (!av || !bv) return nameCompare();
        return av.localeCompare(bv) * dir;
      }
      case "daysSinceLastAppointment": {
        const av = a.daysSinceLastAppointment;
        const bv = b.daysSinceLastAppointment;
        if (av == null && bv != null) return neverLast;
        if (av != null && bv == null) return -neverLast;
        if (av == null || bv == null) return nameCompare();
        return (av - bv) * dir || nameCompare();
      }
      case "zone": {
        const av = zoneSortRank(a.serviceZone);
        const bv = zoneSortRank(b.serviceZone);
        return (av - bv) * dir || a.fullName?.localeCompare(b.fullName ?? "") || 0;
      }
      case "lastInteraction":
      default:
        return (
          (a.lastInteractionAt || a.updatedAt).localeCompare(
            b.lastInteractionAt || b.updatedAt
          ) * dir
        );
    }
  });
}

export async function listCrmContacts(filter: CrmListFilter = {}): Promise<{
  contacts: CrmContactListItem[];
  stats: {
    total: number;
    unread: number;
    byStage: Record<CrmContactStatus, number>;
  };
  platform: Awaited<ReturnType<typeof twilioStatus>> & {
    smsBotEnabled: boolean;
    smsBotMode?: string;
    metaConfigured: boolean;
    metaBotEnabled: boolean;
    metaBotMode?: string;
    crmStorage: ReturnType<typeof getPersistenceMode>;
  };
}> {
  await ensureCrmSeeded();
  await dedupeAllContacts();
  await dedupeLeads();
  const data = await readCrmData();
  const { appointments } = await readSchedulingData();
  const q = filter.q?.trim().toLowerCase();

  let contacts = data.contacts.map((c) => enrichContactWithSortMeta(c, appointments));
  if (filter.status && filter.status !== "all") {
    const stage = normalizeCrmContactStatus(filter.status);
    contacts = contacts.filter((c) => c.status === stage);
  }
  if (filter.tag) {
    contacts = contacts.filter((c) => c.tags.includes(filter.tag!));
  }
  if (filter.unread) {
    contacts = contacts.filter((c) => (c.unreadCount ?? 0) > 0);
  }
  if (filter.view && filter.view !== "all") {
    contacts = contacts.filter((c) => c.primaryMedicalService === filter.view);
  }
  if (q) {
    contacts = contacts.filter((c) => {
      const hay = [
        c.fullName,
        c.firstName,
        c.lastName,
        c.email,
        c.phone,
        c.address,
        c.city,
        c.zipCode,
        c.street,
        c.parsedCity,
        c.parsedZip,
        ...c.pets.map((p) => p.petName),
        ...c.tags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const sortField = filter.sort ?? "lastInteraction";
  const sortOrder = filter.order ?? "desc";
  contacts = sortContacts(contacts, sortField, sortOrder);

  const all = data.contacts;
  const byStage = emptyPipelineCounts();
  for (const contact of all) {
    byStage[normalizeCrmContactStatus(contact.status)] += 1;
  }
  const [platform, botEnabled, botConfig, metaStatus, metaBotEnabled, metaBotConfig] =
    await Promise.all([
      twilioStatus(),
      isSmsBotEnabled(),
      import("./sms-bot-config").then((m) => m.readSmsBotConfig()).catch(() => null),
      metaMessagingStatus(),
      isMetaBotEnabled(),
      import("@/lib/meta/meta-bot-config").then((m) => m.readMetaBotConfig()).catch(() => null),
    ]);
  return {
    contacts,
    stats: {
      total: all.length,
      unread: all.filter((c) => (c.unreadCount ?? 0) > 0).length,
      byStage,
    },
    platform: {
      ...platform,
      smsBotEnabled: botConfig?.enabled ?? botEnabled,
      smsBotMode: botConfig?.mode,
      metaConfigured: metaStatus.configured,
      metaBotEnabled: metaBotConfig?.enabled ?? metaBotEnabled,
      metaBotMode: metaBotConfig?.mode,
      crmStorage: getPersistenceMode(),
    },
  };
}

export async function getCrmContactDetail(
  contactId: string
): Promise<CrmContactDetail | null> {
  await ensureCrmSeeded();
  invalidateCrmReadCache();
  const contact = await findContactById(contactId);
  if (!contact) return null;

  const { appointments } = await readSchedulingData();
  const woundConsultations = await readWoundCareConsultations();
  const now = Date.now();
  const mine = appointments.filter(
    (a) =>
      contact.appointmentIds.includes(a.id) ||
      a.phone.replace(/\D/g, "").endsWith(contact.phone)
  );

  const woundMine = woundConsultations.filter(
    (c) =>
      contact.appointmentIds.includes(c.id) ||
      c.phone.replace(/\D/g, "").endsWith(contact.phone)
  );

  const interactions = await listInteractionsForContact(contactId);

  const mapped = mine.map((a) => ({
    id: a.id,
    startAt: a.startAt,
    status: a.status,
    service: a.service,
    petName: a.petName,
    groomerId: a.groomerId,
    kind: "appointment" as const,
  }));

  const woundMapped = woundMine.map((c) => ({
    id: c.id,
    startAt: c.startAt,
    status: c.status,
    service: "Wound care consultation",
    petName: "",
    groomerId: "",
    kind: "wound_consultation" as const,
  }));

  const allMapped = [...mapped, ...woundMapped];

  await markContactRead(contactId);
  const refreshed = (await findContactById(contactId)) ?? contact;

  return {
    ...refreshed,
    fullName: displayNameFromContact(refreshed),
    interactions,
    upcomingAppointments: allMapped
      .filter((a) => a.status === "confirmed" && new Date(a.startAt).getTime() >= now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    pastAppointments: allMapped
      .filter((a) => new Date(a.startAt).getTime() < now)
      .sort((a, b) => b.startAt.localeCompare(a.startAt)),
  };
}

export async function listCrmInbox(limit = 80): Promise<{
  interactions: (CrmInteraction & { contactName: string })[];
}> {
  await ensureCrmSeeded();
  const data = await readCrmData();
  const byId = new Map(data.contacts.map((c) => [c.id, c]));
  const recent = await listRecentInteractions(limit);
  return {
    interactions: recent.map((i) => ({
      ...i,
      contactName: displayNameFromContact(byId.get(i.contactId) || { phone: i.phone }),
    })),
  };
}

export async function refreshCrm(): Promise<{ contactCount: number; interactionCount: number }> {
  const data = await refreshCrmContactsPreservingLiveInteractions();
  return {
    contactCount: data.contacts.length,
    interactionCount: data.interactions.length,
  };
}

export async function updateContactBot(
  contactId: string,
  botEnabled: boolean
): Promise<CrmContact | null> {
  return setContactBotEnabled(contactId, botEnabled);
}

export async function updateContactProfile(
  contactId: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    zipCode?: string;
    status?: CrmContactStatus;
    medicalService?: string;
  }
): Promise<CrmContact | null> {
  const existing = await findContactById(contactId);
  if (!existing) return null;

  let phone = existing.phone;
  let phoneE164 = existing.phoneE164;
  if (typeof input.phone === "string" && input.phone.trim()) {
    const digits = crmPhoneDigits(input.phone);
    if (digits.length < 10) {
      throw new Error("Enter a valid 10-digit US phone number");
    }
    const other = await findContactByPhone(digits);
    if (other && other.id !== contactId) {
      throw new Error("Another contact already uses that phone number");
    }
    phone = digits;
    phoneE164 = crmPhoneE164(input.phone) ?? `+1${digits}`;
  }

  const firstName =
    input.firstName !== undefined ? input.firstName.trim() || undefined : existing.firstName;
  const lastName =
    input.lastName !== undefined ? input.lastName.trim() || undefined : existing.lastName;
  const email =
    input.email !== undefined ? input.email.trim() || undefined : existing.email;
  const address =
    input.address !== undefined ? input.address.trim() || undefined : existing.address;
  const city = input.city !== undefined ? input.city.trim() || undefined : existing.city;
  const zipCode =
    input.zipCode !== undefined ? input.zipCode.trim() || undefined : existing.zipCode;
  const status = input.status
    ? isCrmContactStatus(input.status)
      ? input.status
      : normalizeCrmContactStatus(input.status)
    : existing.status;
  const serviceId = resolveMedicalServiceId({
    medicalService: input.medicalService || existing.medicalService,
  });
  const def = getMedicalService(serviceId);

  return patchContact(contactId, {
    phone,
    phoneE164,
    firstName,
    lastName,
    email,
    address,
    city,
    zipCode,
    status,
    medicalService: serviceId,
    service: def.label,
    fullName: displayNameFromContact({ firstName, lastName, phone }),
    tags: Array.from(new Set([...(existing.tags || []), def.crmTag])),
  });
}

export async function createManualContact(input: {
  phone: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  medicalService?: string;
}): Promise<{ contact: CrmContact; created: boolean }> {
  await ensureCrmSeeded();
  const digits = crmPhoneDigits(input.phone);
  if (digits.length < 10) {
    throw new Error("Enter a valid 10-digit US phone number");
  }

  const existing = await findContactByPhone(digits);
  if (existing) {
    return { contact: existing, created: false };
  }

  const now = new Date().toISOString();
  const serviceId = resolveMedicalServiceId({ medicalService: input.medicalService });
  const def = getMedicalService(serviceId);
  const firstName = input.firstName?.trim() || undefined;
  const lastName = input.lastName?.trim() || undefined;
  const email = input.email?.trim() || undefined;
  const contact: CrmContact = {
    id: newContactId(),
    phone: digits,
    phoneE164: crmPhoneE164(input.phone) ?? `+1${digits}`,
    firstName,
    lastName,
    fullName: displayNameFromContact({ firstName, lastName, phone: digits }),
    email,
    pets: [],
    appointmentIds: [],
    medicalService: serviceId,
    service: def.label,
    status: "contact",
    tags: ["manual", def.crmTag],
    source: "manual",
    unreadCount: 0,
    botEnabled: true,
    createdAt: now,
    updatedAt: now,
    lastInteractionAt: now,
  };

  return { contact: await upsertContact(contact), created: true };
}

export async function deleteCrmContact(contactId: string): Promise<CrmContact | null> {
  const contact = await findContactById(contactId);
  if (!contact) return null;

  if (contact.leadId) {
    await deleteLeadById(contact.leadId);
  }

  return deleteContactById(contactId);
}
