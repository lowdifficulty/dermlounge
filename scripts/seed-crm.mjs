/**
 * Seed data/crm.json from leads, appointments, and client accounts.
 * Usage: node scripts/seed-crm.mjs
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

function readJson(rel) {
  const file = path.join(process.cwd(), rel);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function digits(phone = "") {
  const d = String(phone).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d;
}

function e164(phone = "") {
  const d = digits(phone);
  return d.length === 10 ? `+1${d}` : d ? `+${d}` : "";
}

function displayName({ firstName, lastName, fullName, phone }) {
  if (fullName?.trim()) return fullName.trim();
  const joined = [firstName, lastName].filter(Boolean).join(" ").trim();
  return joined || phone || "Unknown contact";
}

function mergePets(existing = [], next = []) {
  const map = new Map();
  for (const pet of [...existing, ...next]) {
    if (!pet.petName?.trim() && !pet.petSize) continue;
    const key = `${(pet.petName || "").trim().toLowerCase()}|${pet.petSize || ""}`;
    const prev = map.get(key) || {};
    map.set(key, {
      petName: pet.petName || prev.petName || "",
      petSize: pet.petSize || prev.petSize,
      petBreed: pet.petBreed || prev.petBreed,
    });
  }
  return [...map.values()];
}

const leads = readJson("data/leads.json")?.leads ?? [];
const appointments = readJson("data/scheduling.json")?.appointments ?? [];
const clients = readJson("data/clients.json")?.clients ?? [];
const now = new Date().toISOString();
const nowMs = Date.now();
const byPhone = new Map();
const interactions = [];

function shell(phone, createdAt) {
  return {
    id: randomUUID(),
    phone,
    phoneE164: e164(phone),
    pets: [],
    appointmentIds: [],
    status: "lead",
    tags: [],
    source: "import",
    unreadCount: 0,
    botEnabled: true,
    createdAt: createdAt || now,
    updatedAt: createdAt || now,
  };
}

for (const lead of leads) {
  const phone = digits(lead.phone);
  if (phone.length < 10) continue;
  let c = byPhone.get(phone);
  if (!c) {
    c = shell(phone, lead.createdAt);
    byPhone.set(phone, c);
  }
  c.leadId = lead.id;
  c.firstName = lead.firstName || c.firstName;
  c.lastName = lead.lastName || c.lastName;
  c.fullName = lead.fullName || displayName(c);
  c.email = lead.email || c.email;
  c.address = lead.address || c.address;
  c.city = lead.city || c.city;
  c.zipCode = lead.zipCode || c.zipCode;
  c.service = lead.service || c.service;
  c.smsOptIn = lead.smsOptIn ?? c.smsOptIn;
  c.groomerId = lead.groomerId || c.groomerId;
  c.groomerName = lead.groomerName || c.groomerName;
  c.source = lead.source || c.source;
  c.pets = mergePets(
    c.pets,
    lead.pets?.length
      ? lead.pets
      : lead.petName || lead.petSize
        ? [{ petName: lead.petName || "", petSize: lead.petSize }]
        : []
  );
  if (lead.appointmentId && !c.appointmentIds.includes(lead.appointmentId)) {
    c.appointmentIds.push(lead.appointmentId);
  }
  if (lead.createdAt && lead.createdAt < c.createdAt) c.createdAt = lead.createdAt;
  if (lead.updatedAt && lead.updatedAt > c.updatedAt) c.updatedAt = lead.updatedAt;
  if (lead.followUpMode === "fu" && !c.tags.includes("follow-up")) c.tags.push("follow-up");
  if (
    lead.funnelStep &&
    !["scheduled", "appointment_completed"].includes(lead.funnelStep) &&
    !c.tags.includes("abandoned-funnel")
  ) {
    c.tags.push("abandoned-funnel");
  }
  if (lead.smsOptIn && !c.tags.includes("sms-opt-in")) c.tags.push("sms-opt-in");
  if (lead.source === "heyflow" && !c.tags.includes("heyflow")) c.tags.push("heyflow");
  for (const note of lead.notes ?? []) {
    interactions.push({
      id: randomUUID(),
      contactId: c.id,
      phone: c.phone,
      channel: "note",
      direction: "internal",
      body: note.text,
      actor: "staff",
      createdAt: note.createdAt,
      metadata: { leadNoteId: note.id },
    });
  }
}

for (const appt of appointments) {
  const phone = digits(appt.phone);
  if (phone.length < 10) continue;
  let c = byPhone.get(phone);
  if (!c) {
    c = shell(phone, appt.createdAt);
    byPhone.set(phone, c);
  }
  if (!c.appointmentIds.includes(appt.id)) c.appointmentIds.push(appt.id);
  c.firstName = appt.firstName || c.firstName;
  c.lastName = appt.lastName || c.lastName;
  c.fullName = displayName(c);
  c.email = appt.email || c.email;
  c.address = appt.address || c.address;
  c.city = appt.city || c.city;
  c.zipCode = appt.zipCode || c.zipCode;
  c.service = appt.service || c.service;
  c.smsOptIn = appt.smsOptIn ?? c.smsOptIn;
  c.groomerId = appt.groomerId || c.groomerId;
  c.pets = mergePets(c.pets, [
    { petName: appt.petName || "", petSize: appt.petSize, petBreed: appt.petBreed },
    ...(appt.additionalPets ?? []),
  ]);
  if (c.source === "import") c.source = "appointment";
  if (appt.smsOptIn && !c.tags.includes("sms-opt-in")) c.tags.push("sms-opt-in");
  if (appt.createdAt && appt.createdAt < c.createdAt) c.createdAt = appt.createdAt;
  if (appt.createdAt && appt.createdAt > c.updatedAt) c.updatedAt = appt.createdAt;

  interactions.push({
    id: randomUUID(),
    contactId: c.id,
    phone: c.phone,
    channel: "system",
    direction: "internal",
    summary: `Appointment ${appt.status}: ${appt.petName || "pet"} — ${appt.service}`,
    body: `${appt.firstName} ${appt.lastName} booked ${appt.service} for ${appt.petName || "their pet"} on ${appt.startAt}.`,
    actor: "system",
    createdAt: appt.createdAt,
    metadata: { appointmentId: appt.id, groomerId: appt.groomerId, startAt: appt.startAt },
  });

  if (appt.smsOptIn) {
    interactions.push({
      id: randomUUID(),
      contactId: c.id,
      phone: c.phone,
      channel: "sms",
      direction: "outbound",
      body: "Booking confirmation SMS (historical — customer opted in at booking).",
      summary: "Booking confirmation SMS",
      messageStatus: "sent",
      actor: "system",
      createdAt: appt.createdAt,
      metadata: { appointmentId: appt.id, kind: "booking_confirmation" },
    });
  }
  for (const [key, label] of [
    ["reminder24hSmsSentAt", "24h reminder SMS"],
    ["reminder1hSmsSentAt", "1h reminder SMS"],
  ]) {
    if (appt[key]) {
      interactions.push({
        id: randomUUID(),
        contactId: c.id,
        phone: c.phone,
        channel: "sms",
        direction: "outbound",
        body: `${label} sent.`,
        summary: label,
        messageStatus: "sent",
        actor: "system",
        createdAt: appt[key],
        metadata: { appointmentId: appt.id, kind: key },
      });
    }
  }
}

for (const client of clients) {
  const phone = digits(client.phone);
  if (phone.length < 10) continue;
  let c = byPhone.get(phone);
  if (!c) {
    c = shell(phone, client.createdAt);
    byPhone.set(phone, c);
  }
  c.clientAccountId = client.id;
  c.firstName = client.firstName || c.firstName;
  c.lastName = client.lastName || c.lastName;
  c.fullName = displayName(c);
  c.email = client.email || c.email;
  if (client.serviceAddress) {
    c.address = client.serviceAddress.address || c.address;
    c.city = client.serviceAddress.city || c.city;
    c.zipCode = client.serviceAddress.zipCode || c.zipCode;
  }
  if (client.petProfile?.pets?.length) {
    c.pets = mergePets(c.pets, client.petProfile.pets);
  }
  for (const id of client.appointmentIds ?? []) {
    if (!c.appointmentIds.includes(id)) c.appointmentIds.push(id);
  }
  if (!c.tags.includes("portal-account")) c.tags.push("portal-account");
  if (c.source === "import" || c.source === "appointment") c.source = "client_portal";
  if (client.createdAt && client.createdAt < c.createdAt) c.createdAt = client.createdAt;
}

for (const c of byPhone.values()) {
  const related = appointments.filter(
    (a) => c.appointmentIds.includes(a.id) || digits(a.phone) === c.phone
  );
  for (const a of related) {
    if (!c.appointmentIds.includes(a.id)) c.appointmentIds.push(a.id);
  }
  const hasUpcoming = related.some(
    (a) => a.status === "confirmed" && new Date(a.startAt).getTime() >= nowMs
  );
  const hasPast = related.some(
    (a) => a.status === "confirmed" && new Date(a.startAt).getTime() < nowMs
  );
  if (c.listStatus === "cold_storage") c.status = "inactive";
  else if (hasUpcoming || hasPast || c.clientAccountId || c.appointmentIds.length) {
    c.status = "customer";
  } else {
    c.status = "lead";
  }
  // Prefer lead cold storage / funnel if lead tagged inactive via list — handled above by tags
  if (hasUpcoming && !c.tags.includes("upcoming")) c.tags.push("upcoming");
  if (hasPast && !c.tags.includes("past-client")) c.tags.push("past-client");
  c.fullName = displayName(c);
  c.tags = [...new Set(c.tags)].sort();
  const last = interactions
    .filter((i) => i.contactId === c.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (last) {
    c.lastInteractionAt = last.createdAt;
    if (last.direction === "inbound") c.lastInboundAt = last.createdAt;
    if (last.direction === "outbound") c.lastOutboundAt = last.createdAt;
  }
}

// Fix inactive from leads cold storage
for (const lead of leads) {
  const phone = digits(lead.phone);
  const c = byPhone.get(phone);
  if (c && lead.listStatus === "cold_storage") c.status = "inactive";
}

const contacts = [...byPhone.values()].sort((a, b) =>
  (b.lastInteractionAt || b.updatedAt).localeCompare(a.lastInteractionAt || a.updatedAt)
);
interactions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const out = {
  contacts,
  interactions,
  seededAt: now,
  version: 1,
};

const outDir = path.join(process.cwd(), "data");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "crm.json");
writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      file: "data/crm.json",
      contacts: contacts.length,
      interactions: interactions.length,
      customers: contacts.filter((c) => c.status === "customer").length,
      leads: contacts.filter((c) => c.status === "lead").length,
      inactive: contacts.filter((c) => c.status === "inactive").length,
      sample: contacts.slice(0, 5).map((c) => ({
        name: c.fullName,
        phone: c.phone,
        status: c.status,
        pets: c.pets.map((p) => p.petName).filter(Boolean),
        appointments: c.appointmentIds.length,
      })),
    },
    null,
    2
  )
);
