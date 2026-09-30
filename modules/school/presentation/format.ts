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

/**
 * Money for display. `null` cents means the product is free — the marketplace
 * uses a null price as the free marker rather than a zero price, so the two
 * must not render the same way.
 */
export function formatMoney(cents: number | null, currency: string | null): string {
  if (cents === null) return "Grátis";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency ?? "BRL",
  }).format(cents / 100);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * SAM-16 — scheduled instants are shown in the school's zone, never the
 * server's or the browser's: the coach who typed "06:00" and the athlete who
 * reads it must see the same clock.
 */
export function formatScheduledDate(value: Date | null | undefined, timeZone: string): string {
  if (!value) return "Sem data";
  return value.toLocaleDateString("pt-BR", { timeZone });
}

export function formatScheduledTime(value: Date | null | undefined, timeZone: string): string {
  if (!value) return "—";
  return value.toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function formatScheduledDateTime(value: Date | null | undefined, timeZone: string): string {
  if (!value) return "Sem data";
  return `${formatScheduledDate(value, timeZone)}, ${formatScheduledTime(value, timeZone)}`;
}

/** "terça-feira, 6 de outubro · 06:00" — the athlete-facing form of the same instant. */
export function formatScheduledLong(value: Date, timeZone: string): string {
  const day = value.toLocaleDateString("pt-BR", { timeZone, weekday: "long", day: "numeric", month: "long" });
  return `${day} · ${formatScheduledTime(value, timeZone)}`;
}
