import { z } from "zod";

const opaqueId = z.string().min(1).refine((value) => value.trim() === value);
const payloadSchema = z.strictObject({
  schoolId: opaqueId,
  athleteId: opaqueId,
  previousCoachId: opaqueId.nullable(),
  enteredAt: z.date().transform((value) => new Date(value)),
});

/** Internal domain contract; adapters serialize enteredAt as UTC ISO 8601. */
export const athleteEnteredLobbySchema = payloadSchema.extend({
  type: z.literal("AthleteEnteredLobby"),
});

export type AthleteEnteredLobby = z.infer<typeof athleteEnteredLobbySchema>;
export type CreateAthleteEnteredLobbyInput = z.input<typeof payloadSchema>;

/** Call after confirming active school membership and no active assignments. */
export function createAthleteEnteredLobby(raw: CreateAthleteEnteredLobbyInput): AthleteEnteredLobby {
  return athleteEnteredLobbySchema.parse({
    ...payloadSchema.parse(raw),
    type: "AthleteEnteredLobby",
  });
}
