import { describe, expect, it } from "vitest";

import { normalizePhoneToE164, toWhatsappJid } from "@/server/utils/phone";

describe("phone helpers", () => {
  it("normalizes Brazilian phone to E.164", () => {
    expect(normalizePhoneToE164("(11) 99999-0000")).toBe("+5511999990000");
  });

  it("builds WhatsApp jid", () => {
    expect(toWhatsappJid("+5511999990000")).toBe("5511999990000@s.whatsapp.net");
  });
});
