import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { SchoolError } from "../domain/errors";

const id = z.string().min(1).max(256).refine((value) => value.trim() === value);
const page = z.strictObject({ limit: z.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional() });
const cursorSchema = z.strictObject({ id, enteredLobbyAt: z.iso.datetime() });
export type SchoolLobbyItem = { id: string; athleteId: string; name: string | null; enteredLobbyAt: Date; lastCoachId: string | null };

/** Derived from effective periods; no separately persisted lobby state. */
export class SchoolLobbyQuery {
  constructor(private readonly db: Pick<PrismaClient, "$queryRaw">) {}

  async listBySchool(schoolId: string, options: { limit?: number; cursor?: string } = {}) {
    let parsed: z.infer<typeof page>;
    let after: z.infer<typeof cursorSchema> | null = null;
    try {
      id.parse(schoolId);
      parsed = page.parse(options);
      if (parsed.cursor) after = cursorSchema.parse(JSON.parse(Buffer.from(parsed.cursor, "base64url").toString("utf8")));
    } catch {
      throw new SchoolError("VALIDATION_ERROR", "Parâmetros de paginação inválidos.", 400);
    }
    // SQL keeps derived-date ordering and pagination in the database. An old
    // assignment cannot predate the current membership's lobby entry on rejoin.
    const rows = await this.db.$queryRaw<SchoolLobbyItem[]>(Prisma.sql`
      WITH lobby AS (
        SELECT membership.id, membership."athleteId", athlete.name,
          GREATEST(membership."startedAt", previous."endedAt") AS "enteredLobbyAt",
          previous."coachId" AS "lastCoachId"
        FROM "SchoolAthleteMembership" membership
        JOIN "User" athlete ON athlete.id = membership."athleteId"
        LEFT JOIN LATERAL (
          SELECT assignment."coachId", assignment."endedAt"
          FROM "CoachAthleteAssignment" assignment
          WHERE assignment."schoolId" = membership."schoolId"
            AND assignment."athleteId" = membership."athleteId"
            AND assignment.status IN ('ENDED', 'REVOKED')
          ORDER BY assignment."endedAt" DESC, assignment.id DESC
          LIMIT 1
        ) previous ON TRUE
        WHERE membership."schoolId" = ${schoolId} AND membership.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM "CoachAthleteAssignment" active
            WHERE active."schoolId" = membership."schoolId"
              AND active."athleteId" = membership."athleteId" AND active.status = 'ACTIVE'
          )
      )
      SELECT * FROM lobby
      ${after ? Prisma.sql`WHERE ("enteredLobbyAt", id) > (${new Date(after.enteredLobbyAt)}, ${after.id})` : Prisma.empty}
      ORDER BY "enteredLobbyAt" ASC, id ASC
      LIMIT ${parsed.limit + 1}
    `);
    const items = rows.slice(0, parsed.limit);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > parsed.limit && last
      ? Buffer.from(JSON.stringify({ id: last.id, enteredLobbyAt: last.enteredLobbyAt.toISOString() })).toString("base64url") : null };
  }
}
