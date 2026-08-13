import "server-only";
import { readSchedulingData } from "@/lib/scheduling/store";
import { twilioStatus } from "@/lib/notifications/twilio-client";
import { isSmsBotEnabled } from "./sms-bot";
import {
  ensureCrmSeeded,
  refreshCrmContactsPreservingLiveInteractions,
} from "./seed";
import { getPersistenceMode } from "@/lib/scheduling/persistence";
import {
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
  CrmConversationView,
  CrmInteraction,
} from "./types";

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
  status?: "all" | "lead" | "customer" | "inactive";
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
    leads: number;
    customers: number;
    inactive: number;
    unread: number;
  };
  platform: Awaited<ReturnType<typeof twilioStatus>> & {
    smsBotEnabled: boolean;
    smsBotMode?: string;
    crmStorage: ReturnType<typeof getPersistenceMode>;
  };
}> {
  await ensureCrmSeeded();
  const data = await readCrmData();
  const { appointments } = await readSchedulingData();
  const q = filter.q?.trim().toLowerCase();

  let contacts = data.contacts.map((c) => enrichContactWithSortMeta(c, appointments));
  if (filter.status && filter.status !== "all") {
    contacts = contacts.filter((c) => c.status === filter.status);
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
  const [platform, botEnabled, botConfig] = await Promise.all([
    twilioStatus(),
    isSmsBotEnabled(),
    import("./sms-bot-config").then((m) => m.readSmsBotConfig()).catch(() => null),
  ]);
  return {
    contacts,
    stats: {
      total: all.length,
      leads: all.filter((c) => c.status === "lead").length,
      customers: all.filter((c) => c.status === "customer").length,
      inactive: all.filter((c) => c.status === "inactive").length,
      unread: all.filter((c) => (c.unreadCount ?? 0) > 0).length,
    },
    platform: {
      ...platform,
      smsBotEnabled: botConfig?.enabled ?? botEnabled,
      smsBotMode: botConfig?.mode,
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
  const now = Date.now();
  const mine = appointments.filter(
    (a) =>
      contact.appointmentIds.includes(a.id) ||
      a.phone.replace(/\D/g, "").endsWith(contact.phone)
  );

  const interactions = await listInteractionsForContact(contactId);

  const mapped = mine.map((a) => ({
    id: a.id,
    startAt: a.startAt,
    status: a.status,
    service: a.service,
    petName: a.petName,
    groomerId: a.groomerId,
  }));

  await markContactRead(contactId);
  const refreshed = (await findContactById(contactId)) ?? contact;

  return {
    ...refreshed,
    fullName: displayNameFromContact(refreshed),
    interactions,
    upcomingAppointments: mapped
      .filter((a) => a.status === "confirmed" && new Date(a.startAt).getTime() >= now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    pastAppointments: mapped
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
    status: "lead",
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
