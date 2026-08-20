import type { MedicalServiceId } from "@/lib/medical-services";

export type CrmContactStatus =
  | "lead"
  | "contact"
  | "appointment"
  | "patient"
  | "follow_up"
  | "cold";

export type CrmContactSource =
  | "booking"
  | "booking-hb"
  | "booking-oc"
  | "booking-jessica"
  | "booking-melanie"
  | "contact"
  | "contact_form"
  | "meta"
  | "franchise"
  | "client_portal"
  | "appointment"
  | "import"
  | "heyflow"
  | "manual";

export type CrmInteractionChannel = "sms" | "call" | "note" | "email" | "system" | "meta";

export type MetaPlatform = "facebook" | "instagram";

export type CrmInteractionDirection = "inbound" | "outbound" | "internal";

export type CrmInteractionActor = "system" | "bot" | "staff" | "customer";

export type CrmMessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "received";

export type CrmCallStatus =
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "no-answer"
  | "canceled"
  | "failed";

export interface CrmPet {
  petName: string;
  petSize?: string;
  petBreed?: string;
}

export interface CrmContact {
  id: string;
  /** Digits-only US phone (10 digits). */
  phone: string;
  /** E.164 when available. */
  phoneE164: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  pets: CrmPet[];
  service?: string;
  /** Service line slug — defaults to wound_care for wound-care leads. */
  medicalService?: string;
  smsOptIn?: boolean;
  leadId?: string;
  clientAccountId?: string;
  appointmentIds: string[];
  groomerId?: string;
  groomerName?: string;
  status: CrmContactStatus;
  tags: string[];
  source: CrmContactSource;
  lastInteractionAt?: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  unreadCount: number;
  botEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Multi-turn SMS bot state (book / cancel / reschedule). */
  smsBotSession?: SmsBotSession | null;
  /** Meta Messenger / Instagram PSID when linked. */
  metaPsid?: string;
  metaPlatform?: MetaPlatform;
  metaUsername?: string;
}

export type SmsBotSessionFlow =
  | "confirm_cancel"
  | "pick_reschedule"
  | "confirm_reschedule"
  | "pick_book"
  | "confirm_book"
  | "confirm_consultation";

export type SmsBotSessionSlot = {
  index: number;
  slotKey: string;
  label: string;
};

export type SmsBotSession = {
  flow: SmsBotSessionFlow;
  appointmentId?: string;
  slotKey?: string;
  service?: string;
  slots?: SmsBotSessionSlot[];
  expiresAt: string;
};


export type CrmConversationView = "all" | MedicalServiceId;

/** Sort metadata attached to contacts in list responses. */
export type CrmContactSortField =
  | "lastInteraction"
  | "areaCode"
  | "address"
  | "street"
  | "city"
  | "zipCode"
  | "name"
  | "phone"
  | "email"
  | "status"
  | "booked"
  | "lastAppointment"
  | "daysSinceLastAppointment"
  | "zone"
  | "medicalService"
  | "pets";

export type CrmContactSortMeta = {
  areaCode: string | null;
  hasBookedAppointment: boolean;
  lastAppointmentAt: string | null;
  lastPastAppointmentAt: string | null;
  daysSinceLastAppointment: number | null;
  hasUpcomingAppointment: boolean;
  isFollowUp: boolean;
  primaryMedicalService: MedicalServiceId;
  serviceZone: 1 | 2 | null;
  street: string;
  parsedCity: string;
  parsedZip: string;
};

export type CrmContactListItem = CrmContact & CrmContactSortMeta;

export interface CrmInteraction {
  id: string;
  contactId: string;
  phone: string;
  channel: CrmInteractionChannel;
  direction: CrmInteractionDirection;
  body?: string;
  summary?: string;
  messageStatus?: CrmMessageStatus;
  callStatus?: CrmCallStatus;
  twilioSid?: string;
  durationSeconds?: number;
  recordingSid?: string;
  recordingUrl?: string;
  recordingChannels?: string;
  transcript?: string;
  transcriptionSid?: string;
  actor: CrmInteractionActor;
  staffUserId?: string;
  staffName?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface CrmData {
  contacts: CrmContact[];
  interactions: CrmInteraction[];
  seededAt?: string;
  version: number;
}

export interface CrmContactDetail extends CrmContact {
  interactions: CrmInteraction[];
  upcomingAppointments: {
    id: string;
    startAt: string;
    status: string;
    service: string;
    petName: string;
    groomerId: string;
  }[];
  pastAppointments: {
    id: string;
    startAt: string;
    status: string;
    service: string;
    petName: string;
    groomerId: string;
  }[];
}
