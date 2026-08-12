import type { GroomerId } from "@/lib/scheduling/types";

export type StaffTransferType = "lead" | "appointment";
export type StaffTransferStatus = "pending" | "accepted" | "declined";

export interface StaffTransfer {
  id: string;
  type: StaffTransferType;
  leadId?: string;
  appointmentId?: string;
  fromName: string;
  fromGroomerId?: GroomerId;
  toGroomerId: GroomerId;
  status: StaffTransferStatus;
  createdAt: string;
  resolvedAt?: string;
}
