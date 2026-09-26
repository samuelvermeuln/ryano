export type AddressFields = {
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

/**
 * Single-line address, skipping the parts the person never filled in.
 *
 * Returns null rather than an empty string when nothing is known, so callers
 * can show "não informado" instead of rendering a blank row that looks broken.
 */
export function formatAddress(address: AddressFields | null | undefined): string | null {
  if (!address) return null;
  const street = [address.street, address.number].filter(Boolean).join(", ");
  const line = [street, address.complement, address.district].filter(Boolean).join(" — ");
  const region = [address.city, address.state].filter(Boolean).join("/");
  const parts = [line, region, address.postalCode, address.country].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** +5511987654321 → +55 (11) 98765-4321; anything unexpected is returned as-is. */
export function formatPhoneBR(phoneE164: string | null | undefined): string | null {
  if (!phoneE164) return null;
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(phoneE164);
  return match ? `+55 (${match[1]}) ${match[2]}-${match[3]}` : phoneE164;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
