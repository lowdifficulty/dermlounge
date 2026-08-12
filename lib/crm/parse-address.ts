/** Parse and normalize contact address fields for sorting and spreadsheet columns. */
export type ParsedContactAddress = {
  street: string;
  city: string;
  zipCode: string;
  state: string;
};

function normalizeZip(raw?: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.length >= 5) return digits.slice(0, 5);
  return "";
}

function cleanPart(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/^,+|,+$/g, "");
}

/** Split a combined address into street, city, zip for table columns. */
export function parseContactAddress(contact: {
  address?: string;
  city?: string;
  zipCode?: string;
}): ParsedContactAddress {
  let street = cleanPart(contact.address || "");
  let city = cleanPart(contact.city || "");
  let zipCode = normalizeZip(contact.zipCode);
  let state = "";

  if (street) {
    const zipInStreet = street.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zipInStreet && !zipCode) {
      zipCode = zipInStreet[1];
      street = cleanPart(street.replace(zipInStreet[0], ""));
    }

    const stateZipTail = street.match(/,\s*([A-Za-z]{2})\s*(\d{5})?(?:-\d{4})?\s*$/);
    if (stateZipTail) {
      state = stateZipTail[1].toUpperCase();
      if (stateZipTail[2] && !zipCode) zipCode = stateZipTail[2];
      street = cleanPart(street.slice(0, stateZipTail.index));
    }

    const parts = street
      .split(",")
      .map((p) => cleanPart(p))
      .filter(Boolean);

    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (/^[A-Za-z]{2}$/.test(last)) {
        state = last.toUpperCase();
        parts.pop();
      }
      if (!city && parts.length >= 1) {
        city = parts.pop() || "";
      }
      street = parts.join(", ");
    } else if (!city && parts.length === 1) {
      const tokens = parts[0].split(" ");
      if (tokens.length >= 3) {
        const maybeZip = tokens[tokens.length - 1];
        if (/^\d{5}$/.test(maybeZip)) {
          zipCode = zipCode || maybeZip;
          tokens.pop();
          if (tokens.length >= 2) {
            city = tokens.slice(-2).join(" ");
            street = tokens.slice(0, -2).join(" ");
          }
        }
      }
    }
  }

  return {
    street: cleanPart(street),
    city: cleanPart(city),
    zipCode,
    state,
  };
}

export function formatContactAddressLine(parsed: ParsedContactAddress): string {
  return [parsed.street, parsed.city, parsed.state, parsed.zipCode].filter(Boolean).join(", ");
}
