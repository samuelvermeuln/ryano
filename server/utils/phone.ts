export function normalizePhoneToE164(input: string) {
  const digits = input.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export function toWhatsappJid(phoneE164: string) {
  return `${phoneE164.replace(/\D/g, "")}@s.whatsapp.net`;
}
