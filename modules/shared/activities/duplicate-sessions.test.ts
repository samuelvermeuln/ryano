/**
 * SAM-39 — a mesma sessão por duas conexões vira UMA: a cópia é marcada
 * `duplicateOfActivityId`, nunca mesclada nem apagada; nunca lança.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/shared/integrations/observability/log", () => ({ logIntegrationEvent: vi.fn() }));

import { markDuplicateSession } from "@/modules/shared/activities/duplicate-sessions";

const START = new Date("2026-10-02T09:00:00.000Z");
const base = {
  userId: "u", wearableConnectionId: "c", sportType: "open-water", startedAt: START,
  durationSeconds: 1477, distanceMeters: 672, duplicateOfActivityId: null,
};

function makeDb(rows: Array<Record<string, unknown>>) {
  return { activity: { findMany: vi.fn().mockResolvedValue(rows), update: vi.fn().mockResolvedValue({}) } };
}

describe("markDuplicateSession", () => {
  it("espelho Garmin → Strava: a cópia do Strava aponta para a do Garmin (ordem do catálogo)", async () => {
    const db = makeDb([{ ...base, id: "g1", provider: "GARMIN", startedAt: new Date(START.getTime() + 30_000), durationSeconds: 1480 }]);

    const result = await markDuplicateSession(db as never, { ...base, id: "s1", provider: "STRAVA" });

    expect(result).toEqual({ status: "marked", duplicateId: "s1", keepId: "g1" });
    expect(db.activity.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { duplicateOfActivityId: "g1" } });
    const where = db.activity.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: "u", id: { not: "s1" }, provider: { not: "STRAVA" } });
  });

  it("quando o Garmin chega depois, é a cópia do Strava já persistida que fica marcada", async () => {
    const db = makeDb([{ ...base, id: "s1", provider: "STRAVA" }]);
    const result = await markDuplicateSession(db as never, { ...base, id: "g1", provider: "GARMIN" });
    expect(result).toEqual({ status: "marked", duplicateId: "s1", keepId: "g1" });
  });

  it("modalidade fora da taxonomia canônica não é comparada (nada é inventado)", async () => {
    const db = makeDb([{ ...base, id: "g1", provider: "GARMIN" }]);
    expect(await markDuplicateSession(db as never, { ...base, id: "s1", provider: "STRAVA", sportType: "Swimming" })).toEqual({ status: "unchanged" });
    expect(db.activity.findMany).not.toHaveBeenCalled();
  });

  it("modalidade diferente, duração incompatível, já marcada ou sem vizinhos → nada muda", async () => {
    const other = makeDb([{ ...base, id: "g1", provider: "GARMIN", sportType: "run" }]);
    expect(await markDuplicateSession(other as never, { ...base, id: "s1", provider: "STRAVA" })).toEqual({ status: "unchanged" });

    const far = makeDb([{ ...base, id: "g1", provider: "GARMIN", durationSeconds: 3000 }]);
    expect(await markDuplicateSession(far as never, { ...base, id: "s1", provider: "STRAVA" })).toEqual({ status: "unchanged" });

    const already = makeDb([{ ...base, id: "g1", provider: "GARMIN" }]);
    expect(await markDuplicateSession(already as never, { ...base, id: "s1", provider: "STRAVA", duplicateOfActivityId: "x" })).toEqual({ status: "unchanged" });
    expect(already.activity.findMany).not.toHaveBeenCalled();

    const none = makeDb([]);
    expect(await markDuplicateSession(none as never, { ...base, id: "s1", provider: "STRAVA" })).toEqual({ status: "unchanged" });
    expect(none.activity.update).not.toHaveBeenCalled();
  });

  it("nunca lança", async () => {
    const db = { activity: { findMany: vi.fn().mockRejectedValue(new Error("db down")), update: vi.fn() } };
    expect(await markDuplicateSession(db as never, { ...base, id: "s1", provider: "STRAVA" })).toEqual({ status: "failed", errorName: "Error" });
  });
});
