export type WoundSize =
  | "0-1-inches"
  | "1-2-inches"
  | "2-3-inches"
  | "3-plus-inches";

export type WoundDuration =
  | "less-than-30-days"
  | "1-3-months"
  | "3-6-months"
  | "more-than-6-months";

export type WoundInsurance =
  | "medicare"
  | "private"
  | "none"
  | "other";

export interface WoundCareConsultation {
  id: string;
  startAt: string;
  slotKey: string;
  status: "confirmed" | "cancelled";
  firstName: string;
  lastName: string;
  phone: string;
  smsOptIn: boolean;
  woundSize?: WoundSize;
  woundDuration?: WoundDuration;
  priorTreatment?: "yes" | "no";
  insurance?: WoundInsurance;
  createdAt: string;
  source: "woundcare-intake";
}

export interface WoundCareSlot {
  slotKey: string;
  date: string;
  time: string;
  displayDate: string;
  displayTime: string;
  startAt: string;
}

export interface WoundCareBookInput {
  firstName: string;
  lastName: string;
  phone: string;
  smsOptIn?: boolean;
  woundSize?: WoundSize;
  woundDuration?: WoundDuration;
  priorTreatment?: "yes" | "no";
  insurance?: WoundInsurance;
  slotKey: string;
}
