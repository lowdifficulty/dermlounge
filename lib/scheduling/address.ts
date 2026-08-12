type AddressFields = {
  address: string;
  city: string;
  zipCode?: string;
};

export function formatAppointmentAddress({
  address,
  city,
  zipCode,
}: AddressFields): string {
  const zip = zipCode?.trim();
  return zip ? `${address}, ${city}, ${zip}` : `${address}, ${city}`;
}

export function isValidZipCode(zipCode: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zipCode.trim());
}

/** Parse a single address line like "123 Main St, Irvine, CA 92618". */
export function parseFullAddress(full: string): {
  address: string;
  city: string;
  zipCode: string;
} {
  const trimmed = full.trim();
  const zipMatch = trimmed.match(/\b(\d{5}(?:-\d{4})?)\b/);
  const zipCode = zipMatch?.[1] ?? "";
  const withoutZip = zipMatch
    ? trimmed.replace(zipMatch[0], "").replace(/,\s*$/, "").trim()
    : trimmed;
  const parts = withoutZip.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      address: parts.slice(0, -1).join(", "),
      city: parts[parts.length - 1],
      zipCode,
    };
  }

  return { address: withoutZip, city: "", zipCode };
}

export function isValidBookingAddress(full: string): boolean {
  const trimmed = full.trim();
  if (trimmed.length < 8) return false;
  return isValidZipCode(parseFullAddress(trimmed).zipCode);
}

export function isValidBookingContact(
  address: string,
  city: string,
  zipCode: string
): boolean {
  return (
    address.trim().length >= 3 &&
    city.trim().length >= 2 &&
    isValidZipCode(zipCode)
  );
}

export function isValidBookingContactInfo(fullName: string, phone: string): boolean {
  return fullName.trim().length > 0 && phone.trim().replace(/\D/g, "").length >= 10;
}
