/**
 * SAM-60 — relative targets and batch assignment (§10, §18.2, §22.2; AC06, AC07, AC09, AC14).
 */
import { describe, expect, it, vi } from "vitest";

import { resolveRelativeTarget, resolveTargets, type SheetReferences } from "@/modules/school/domain/relative-targets";
import { AssignmentBatches } from "@/modules/school/application/assignment-batches";

const sheet = (overrides: Partial<SheetReferences> = {}): SheetReferences => ({
  sheetRevisionId: "rev-1", ftpWatts: null, cssSecPer100m: null, thresholdPaceSecPerKm: null, thresholdHeartRate: null, maxHeartRate: null, restingHeartRate: null, ...overrides,
});
const ftp70to75 = { reference: "FTP" as const, minPct: 70, maxPct: 75 };

describe("alvos relativos (§10.2)", () => {
  it("70–75% de FTP: 200 W → 140–150 W; 260 W → 182–195 W; ausente → bloqueado sem inventar (AC07)", () => {
    expect(resolveRelativeTarget(ftp70to75, sheet({ ftpWatts: 200 }))).toMatchObject({ ok: true, target: { powerMin: 140, powerMax: 150 }, resolvedFrom: { reference: "FTP", value: 200, sheetRevisionId: "rev-1" } });
    expect(resolveRelativeTarget(ftp70to75, sheet({ ftpWatts: 260 }))).toMatchObject({ ok: true, target: { powerMin: 182, powerMax: 195 } });
    const missing = resolveRelativeTarget(ftp70to75, sheet({ maxHeartRate: 190 }));
    expect(missing).toEqual({ ok: false, reason: "Sem FTP na ficha técnica: cadastre a referência ou oriente de outra forma." });
  });

  it("FC de reserva (Karvonen), CSS e ritmo de limiar", () => {
    expect(resolveRelativeTarget({ reference: "HRR", minPct: 60, maxPct: 70 }, sheet({ maxHeartRate: 190, restingHeartRate: 50 }))).toMatchObject({ target: { heartRateMin: 134, heartRateMax: 148 } });
    expect(resolveRelativeTarget({ reference: "CSS", minPct: 95, maxPct: 100 }, sheet({ cssSecPer100m: 95 }))).toMatchObject({ target: { paceSec100mMin: 95, paceSec100mMax: 100 } });
    expect(resolveRelativeTarget({ reference: "THRESHOLD_PACE", minPct: 90, maxPct: 95 }, sheet({ thresholdPaceSecPerKm: 300 }))).toMatchObject({ target: { paceSecPerKmMin: 316, paceSecPerKmMax: 333 } });
  });

  it("valores congelados: reavaliar o FTP depois não muda o que foi resolvido (AC14)", () => {
    const blocks = [{ blockType: "INTERVAL", target: { relative: ftp70to75 } }];
    const published = resolveTargets(blocks, sheet({ ftpWatts: 200 }));
    resolveTargets(blocks, sheet({ ftpWatts: 260, sheetRevisionId: "rev-2" }));
    expect(published).toMatchObject({ ok: true, blocks: [{ target: { powerMin: 140, powerMax: 150, resolvedFrom: { value: 200, sheetRevisionId: "rev-1" } } }] });
    expect((published as { blocks: Array<{ target: Record<string, unknown> }> }).blocks[0]!.target.relative).toBeUndefined();
  });
});

const prescription = {
  title: "CIC-001", sportType: "bike", scheduledAtLocal: "2026-10-20T07:00",
  blocks: [{ blockType: "INTERVAL", durationS: 600, target: { relative: ftp70to75 } }],
};

function batchDb() {
  const batches: Array<Record<string, unknown>> = [];
  const recipients: Array<Record<string, unknown>> = [];
  const db = {
    batches, recipients,
    assignmentBatch: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { idempotencyKey?: string; id?: string } }) => {
        const batch = batches.find((row) => (where.id ? row.id === where.id : row.idempotencyKey === where.idempotencyKey));
        if (!batch) return Promise.resolve(null);
        return Promise.resolve({ ...batch, recipients: recipients.filter((row) => row.batchId === batch.id).map((row) => ({ ...row, athlete: { name: `Atleta ${row.athleteId}` } })) });
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(({ where, include }: { where: { id: string }; include: { recipients: { where: { status: { in: string[] } } } } }) => {
        const batch = batches.find((row) => row.id === where.id)!;
        return Promise.resolve({ ...batch, recipients: recipients.filter((row) => row.batchId === batch.id && include.recipients.where.status.in.includes(row.status as string)) });
      }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> & { recipients: { create: Array<Record<string, unknown>> } } }) => {
        const { recipients: nested, ...rest } = data;
        batches.push({ ...rest, createdAt: new Date() });
        for (const recipient of nested.create) recipients.push({ ...recipient, batchId: rest.id, status: "PENDING", attempts: 0, reason: null, assignmentId: null });
        return Promise.resolve(rest);
      }),
    },
    assignmentBatchRecipient: {
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = recipients.find((item) => item.id === where.id)!;
        for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? (row[key] as number) + 1 : value;
        return Promise.resolve(row);
      }),
    },
    coachProfile: { findUnique: vi.fn().mockResolvedValue({ id: "coach-c" }) },
  };
  return db;
}

describe("lote (§10.3, §22.2)", () => {
  it("18 destinatários com 1 falha: 17 publicados, 1 com erro; repetir falhas publica só ele (AC06); mesma chave não duplica", async () => {
    const db = batchDb();
    let failOnce = true;
    const prescribe = { execute: vi.fn().mockImplementation((_actor: string, _scope: unknown, athleteId: string) => {
      if (athleteId === "a-07" && failOnce) {
        failOnce = false;
        return Promise.reject(new Error("timeout de conexão"));
      }
      return Promise.resolve({ assignment: { id: `as-${athleteId}` } });
    }) };
    const service = new AssignmentBatches(db as never, () => new Date(), prescribe as never);
    const recipients = Array.from({ length: 18 }, (_, index) => ({ athleteId: `a-${String(index + 1).padStart(2, "0")}` }));
    const result = await service.publish("carlos", { scope: { kind: "school", schoolId: "alpha" }, idempotencyKey: "lote-cic-001-2026-10-20", prescription, recipients });
    expect(result.counts).toMatchObject({ ok: 17, failed: 1 });
    expect(result.complete).toBe(false);
    expect(result.recipients.find((row) => row.athleteId === "a-07")).toMatchObject({ status: "FAILED", reason: "timeout de conexão" });
    expect(prescribe.execute).toHaveBeenCalledTimes(18);

    const retried = await service.retryFailed("carlos", result.id);
    expect(retried.counts).toMatchObject({ ok: 18, failed: 0 });
    expect(prescribe.execute).toHaveBeenCalledTimes(19);

    const again = await service.publish("carlos", { scope: { kind: "school", schoolId: "alpha" }, idempotencyKey: "lote-cic-001-2026-10-20", prescription, recipients });
    expect(again.id).toBe(result.id);
    expect(prescribe.execute).toHaveBeenCalledTimes(19);
  });

  it("referência ausente bloqueia o destinatário (não é falha a repetir) e cada um recebe a própria prescrição (AC09)", async () => {
    const db = batchDb();
    const { SchoolError } = await import("@/modules/school/domain/errors");
    const prescribe = { execute: vi.fn() };
    prescribe.execute.mockImplementation((_actor: string, _scope: unknown, athleteId: string) => athleteId === "sem-ftp"
      ? Promise.reject(new SchoolError("RELATIVE_REFERENCE_MISSING", "Bloco 1: Sem FTP na ficha técnica", 409))
      : Promise.resolve({ assignment: { id: `as-${athleteId}` } }));
    const service = new AssignmentBatches(db as never, () => new Date(), prescribe as never);
    const result = await service.publish("ricardo", { scope: { kind: "independent" }, idempotencyKey: "lote-ftp-1234", prescription, recipients: [{ athleteId: "ftp-200" }, { athleteId: "sem-ftp" }, { athleteId: "ftp-260", overrides: { scheduledAtLocal: "2026-10-21T07:00" } }] });
    expect(result.counts).toMatchObject({ ok: 2, blocked: 1, failed: 0 });
    // Each recipient was published separately, with its own overrides.
    expect(prescribe.execute.mock.calls.find((call) => call[2] === "ftp-260")![3]).toMatchObject({ scheduledAtLocal: "2026-10-21T07:00" });
    expect(prescribe.execute.mock.calls.find((call) => call[2] === "ftp-200")![3]).toMatchObject({ scheduledAtLocal: "2026-10-20T07:00" });
  });

  it("outro professor não vê o lote", async () => {
    const db = batchDb();
    const service = new AssignmentBatches(db as never, () => new Date(), { execute: vi.fn().mockResolvedValue({ assignment: { id: "x" } }) } as never);
    const result = await service.publish("carlos", { scope: { kind: "independent" }, idempotencyKey: "lote-privado-1", prescription, recipients: [{ athleteId: "a" }] });
    await expect(service.get("ricardo", result.id)).rejects.toMatchObject({ status: 404 });
  });
});
