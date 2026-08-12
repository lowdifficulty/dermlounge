import { PET_SIZES } from "@/lib/constants";

export interface BookingPet {
  petName: string;
  petSize: string;
}

export interface DraftPet {
  size: string;
}

export function draftToBookingPet(pet: DraftPet): BookingPet {
  return { petName: "", petSize: pet.size };
}

export function getPetSizeLabel(size: string): string {
  if (size === "cat") return "Cat";
  return PET_SIZES.find((entry) => entry.value === size)?.title ?? size;
}

export function formatPetEntry(pet: BookingPet): string {
  const sizeLabel = pet.petSize ? getPetSizeLabel(pet.petSize) : "";
  if (pet.petName?.trim()) {
    return sizeLabel ? `${pet.petName} (${sizeLabel})` : pet.petName;
  }
  return sizeLabel;
}

export function formatPetsList(pets: BookingPet[]): string {
  return pets.map(formatPetEntry).filter(Boolean).join(", ");
}

export function formatPetNames(pets: BookingPet[]): string {
  const entries = pets.map(formatPetEntry).filter(Boolean);
  if (entries.length === 0) return "your pet";
  if (entries.length <= 1) return entries[0];
  if (entries.length === 2) return `${entries[0]} and ${entries[1]}`;
  return `${entries.slice(0, -1).join(", ")}, and ${entries[entries.length - 1]}`;
}

export function getAppointmentPets(appointment: {
  petName: string;
  petSize: string;
  additionalPets?: BookingPet[];
}): BookingPet[] {
  const pets: BookingPet[] = [
    { petName: appointment.petName ?? "", petSize: appointment.petSize },
  ];
  if (appointment.additionalPets?.length) {
    pets.push(...appointment.additionalPets);
  }
  return pets.filter((pet) => pet.petSize);
}

export function getAppointmentPetLabel(appointment: {
  petName: string;
  petSize: string;
  additionalPets?: BookingPet[];
}): string {
  return formatPetNames(getAppointmentPets(appointment));
}

export function buildBookingNotes(
  discountActive: boolean,
  additionalPets: BookingPet[]
): string {
  const parts: string[] = [];
  if (discountActive) parts.push("Discount applied");
  if (additionalPets.length) {
    parts.push(`Additional pets: ${formatPetsList(additionalPets)}`);
  }
  return parts.join(". ");
}

export function formatLeadPets(lead: {
  petName?: string;
  petSize?: string;
  pets?: BookingPet[];
}): string {
  if (lead.pets?.length) return formatPetsList(lead.pets);
  if (lead.petSize) {
    return formatPetEntry({ petName: lead.petName ?? "", petSize: lead.petSize });
  }
  if (lead.petName) {
    return formatPetEntry({ petName: lead.petName, petSize: lead.petSize ?? "" });
  }
  return "—";
}
