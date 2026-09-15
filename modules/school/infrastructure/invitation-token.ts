import { generateRawToken, hashToken } from "@/server/utils/token";

export interface IssuedInvitationToken {
  /** Deliver to the invitee once; never persist or log this bearer credential. */
  token: string;
  /** Only this projection belongs in InvitationLink stored state. */
  persistence: { tokenHash: string };
}

/** Server-side issuance: 256 random bits encoded as URL-safe hexadecimal. */
export function generateInvitationToken(): IssuedInvitationToken {
  const token = generateRawToken(32);
  return { token, persistence: { tokenHash: hashToken(token) } };
}

/** Hash the exact presented credential, without trimming or case normalization. */
export { hashToken as hashInvitationToken } from "@/server/utils/token";
