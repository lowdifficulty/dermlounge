import "server-only";

import { normalizePhone } from "./normalize";
import {
  addLeadNote,
  getLeadByAppointmentId,
  readLeadsData,
  upsertLead,
} from "./store";
import { patchLeadDetails, type LeadDetailsPatch } from "./patch-lead";
import { readSchedulingData } from "@/lib/scheduling/store";
import type { Appointment, GroomerId } from "@/lib/scheduling/types";
import type { Lead } from "./types";

export interface LeadFormLookup {
  leadId: string | null;
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
  petName: string;
  petSize: string;
  service: string;
  address: string;
  city: string;
  zipCode: string;
}

export function appointmentToFormFields(appointment: Appointment): Omit<LeadFormLookup, "leadId"> {
  return {
    phone: appointment.phone ?? "",
    firstName: appointment.firstName ?? "",
    lastName: appointment.lastName ?? "",
    email: appointment.email ?? "",
    petName: appointment.petName ?? "",
    petSize: appointment.petSize ?? "medium",
    service: appointment.service ?? "full-groom",
    address: appointment.address ?? "",
    city: appointment.city ?? "",
    zipCode: appointment.zipCode ?? "",
  };
}

function leadToFormFields(lead: Lead): Omit<LeadFormLookup, "leadId"> {
  return {
    phone: lead.phone ?? "",
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    email: lead.email ?? "",
    petName: lead.petName ?? "",
    petSize: lead.petSize ?? "medium",
    service: lead.service ?? "full-groom",
    address: lead.address ?? "",
    city: lead.city ?? "",
    zipCode: lead.zipCode ?? "",
  };
}

export async function findLeadForAppointment(
  appointment: Appointment
): Promise<Lead | null> {
  const byId = await getLeadByAppointmentId(appointment.id);
  if (byId) return byId;

  const phone = normalizePhone(appointment.phone);
  if (phone.length < 10) return null;

  const data = await readLeadsData();
  return (
    data.leads.find((lead) => normalizePhone(lead.phone) === phone) ?? null
  );
}

export async function getLeadFormForAppointment(
  appointmentId: string
): Promise<
  { ok: true; form: LeadFormLookup } | { ok: false; error: string; status: number }
> {
  const scheduling = await readSchedulingData();
  const appointment = scheduling.appointments.find((a) => a.id === appointmentId);
  if (!appointment) {
    return { ok: false, error: "Appointment not found", status: 404 };
  }

  const lead = await findLeadForAppointment(appointment);
  if (lead) {
    return {
      ok: true,
      form: { leadId: lead.id, ...leadToFormFields(lead) },
    };
  }

  return {
    ok: true,
    form: { leadId: null, ...appointmentToFormFields(appointment) },
  };
}

export async function patchLeadForAppointment(
  appointmentId: string,
  patch: LeadDetailsPatch,
  actor: string
): Promise<{ ok: true; lead: Lead } | { ok: false; error: string; status: number }> {
  const scheduling = await readSchedulingData();
  const appointment = scheduling.appointments.find((a) => a.id === appointmentId);
  if (!appointment) {
    return { ok: false, error: "Appointment not found", status: 404 };
  }

  let lead = await findLeadForAppointment(appointment);

  if (!lead) {
    const fields = appointmentToFormFields(appointment);
    lead = await upsertLead({
      funnelStep: "scheduled",
      source: "booking",
      appointmentId: appointment.id,
      appointmentStartAt: appointment.startAt,
      groomerId: appointment.groomerId,
      scheduledAt: appointment.createdAt,
      phone: patch.phone ?? fields.phone,
      firstName: patch.firstName ?? fields.firstName,
      lastName: patch.lastName ?? fields.lastName,
      email: patch.email ?? fields.email,
      petName: patch.petName ?? fields.petName,
      petSize: patch.petSize ?? fields.petSize,
      service: patch.service ?? fields.service,
      address: patch.address ?? fields.address,
      city: patch.city ?? fields.city,
      zipCode: patch.zipCode ?? fields.zipCode,
    });
  }

  return patchLeadDetails(lead.id, patch, actor);
}

export async function addNoteForAppointment(
  appointmentId: string,
  text: string,
  groomerId: string
): Promise<{ ok: true; lead: Lead } | { ok: false; error: string; status: number }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Note text required", status: 400 };
  }

  const scheduling = await readSchedulingData();
  const appointment = scheduling.appointments.find((a) => a.id === appointmentId);
  if (!appointment) {
    return { ok: false, error: "Appointment not found", status: 404 };
  }
  if (appointment.groomerId !== groomerId) {
    return { ok: false, error: "Not your client", status: 403 };
  }

  let lead = await findLeadForAppointment(appointment);
  if (!lead) {
    const fields = appointmentToFormFields(appointment);
    lead = await upsertLead({
      funnelStep: "scheduled",
      source: "booking",
      appointmentId: appointment.id,
      appointmentStartAt: appointment.startAt,
      groomerId: appointment.groomerId,
      scheduledAt: appointment.createdAt,
      phone: fields.phone,
      firstName: fields.firstName,
      lastName: fields.lastName,
      email: fields.email,
      petName: fields.petName,
      petSize: fields.petSize,
      service: fields.service,
      address: fields.address,
      city: fields.city,
      zipCode: fields.zipCode,
    });
  }

  const updated = await addLeadNote(lead.id, trimmed);
  if (!updated) {
    return { ok: false, error: "Lead not found", status: 404 };
  }

  return { ok: true, lead: updated };
}

export async function patchLeadForAppointmentByGroomer(
  appointmentId: string,
  patch: LeadDetailsPatch,
  groomerId: GroomerId,
  actor: string
): Promise<{ ok: true; lead: Lead } | { ok: false; error: string; status: number }> {
  const scheduling = await readSchedulingData();
  const appointment = scheduling.appointments.find((a) => a.id === appointmentId);
  if (!appointment) {
    return { ok: false, error: "Appointment not found", status: 404 };
  }
  if (appointment.groomerId !== groomerId) {
    return { ok: false, error: "Not your client", status: 403 };
  }

  return patchLeadForAppointment(appointmentId, patch, actor);
}

export async function ensureLeadForGroomerAppointment(
  appointmentId: string,
  groomerId: GroomerId
): Promise<
  { ok: true; leadId: string } | { ok: false; error: string; status: number }
> {
  const scheduling = await readSchedulingData();
  const appointment = scheduling.appointments.find((a) => a.id === appointmentId);
  if (!appointment) {
    return { ok: false, error: "Appointment not found", status: 404 };
  }
  if (appointment.groomerId !== groomerId) {
    return { ok: false, error: "Not your client", status: 403 };
  }

  let lead = await findLeadForAppointment(appointment);
  if (!lead) {
    const fields = appointmentToFormFields(appointment);
    lead = await upsertLead({
      funnelStep: "scheduled",
      source: "booking",
      appointmentId: appointment.id,
      appointmentStartAt: appointment.startAt,
      groomerId: appointment.groomerId,
      scheduledAt: appointment.createdAt,
      phone: fields.phone,
      firstName: fields.firstName,
      lastName: fields.lastName,
      email: fields.email,
      petName: fields.petName,
      petSize: fields.petSize,
      service: fields.service,
      address: fields.address,
      city: fields.city,
      zipCode: fields.zipCode,
    });
  }

  return { ok: true, leadId: lead.id };
}
