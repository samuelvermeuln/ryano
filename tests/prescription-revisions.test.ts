/**
 * SAM-59 — drafts, revisions, amendments and concurrency (§6.1, §9.4, §21.5, AC19).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { diffPrescription } from "@/modules/school/presentation/prescription-diff";
import { PrescriptionDrafts, prescriptionVersionsOf, ReviseWorkoutAssignment } from "@/modules/school/application/prescription-revisions";

vi.mock("@/modules/school/application/resolve-coach-athlete-context", () => ({
  ResolveCoachAthleteContext: class {
    async execute(actor: string) {
      if (actor !== "ricardo") throw Object.assign(new Error("not found"), { status: 404 });
      return { coachId: "coach-r", schoolId: null, timeZone: "America/Sao_Paulo", isResponsibleCoach: true };
    }
  },
}));

const base = {
  title: "Piscina", description: null, sportType: "swim", scheduledAtLocal: "2026-10-10T06:00",
  blocks: [
    { blockType: "WARMUP" as const, title: "Aquecimento", durationS: null, distanceM: 300, repetitions: null, restDurationS: null },
    { blockType: "INTERVAL" as const, title: "Principal", durationS: null, distanceM: 100, repetitions: 6, restDurationS: 20, target: { zone: 3 } },
  ],
};

describe("diff legível", () => {
  it("mostra campos e blocos adicionados, removidos e alterados (com alvos)", () => {
    const diff = diffPrescription(base, {
      ...base,
      title: "Piscina — ajuste",
      blocks: [base.blocks[0]!, { ...base.blocks[1]!, repetitions: 8, target: { zone: 4 } }, { blockType: "COOLDOWN", title: "Soltura", durationS: null, distanceM: 100, repetitions: null, restDurationS: null }],
    });
    expect(diff.changed).toBe(true);
    expect(diff.fields).toEqual([{ field: "title", label: "Título", from: "Piscina", to: "Piscina — ajuste" }]);
    expect(diff.blocks[0]).toMatchObject({ kind: "changed", position: 2 });
    expect((diff.blocks[0] as { changes: Array<{ label: string }> }).changes.map((change) => change.label)).toEqual(["Repetições", "Alvos"]);
    expect(diff.blocks[1]).toMatchObject({ kind: "added", position: 3 });
    expect(diffPrescription(base, base).changed).toBe(false);
  });
});

/** Like Prisma reading a row back: the JsonNull/DbNull sentinels come back as null. */
function asStored(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value && typeof value === "object" && /Null/.test(value.constructor?.name ?? "") ? null : value]));
}

function reviseDb({ executed, conflict = false }: { executed: boolean; conflict?: boolean }) {
  const tx = {
    coachAthleteAssignment: { findFirst: vi.fn().mockResolvedValue({ id: "link" }) },
    coachSchoolMembership: { findFirst: vi.fn() },
    workout: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(asStored(data))),
      update: vi.fn().mockResolvedValue({}),
    },
    workoutBlock: { create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(asStored(data))) },
    workoutAssignment: { updateMany: vi.fn().mockResolvedValue({ count: conflict ? 0 : 1 }) },
    workoutAssignmentHistory: { create: vi.fn().mockResolvedValue({}) },
  };
  const db = {
    tx,
    workoutAssignment: {
      findFirst: vi.fn().mockResolvedValue({
        id: "a1", workoutId: "w1", amendmentWorkoutId: null, status: executed ? "COMPLETED" : "SCHEDULED", prescriptionVersion: 3,
        executions: executed ? [{ id: "e1" }] : [],
      }),
    },
    $transaction: vi.fn().mockImplementation((fn: (client: unknown) => unknown) => fn(tx)),
  };
  return db;
}

const revisionInput = (overrides: Record<string, unknown> = {}) => ({
  expectedVersion: 3,
  prescription: { title: "Piscina v2", sportType: "swim", scheduledAtLocal: "2026-10-10T06:00", blocks: [{ blockType: "STEADY", distanceM: 1200 }] },
  ...overrides,
});

describe("ReviseWorkoutAssignment", () => {
  it("antes da execução: nova versão vigente, a anterior fica substituída (ARCHIVED) e consultável", async () => {
    const db = reviseDb({ executed: false });
    const result = await new ReviseWorkoutAssignment(db as never).execute("ricardo", { kind: "independent" }, "maria", "a1", revisionInput());
    expect(result).toMatchObject({ amendment: false, prescriptionVersion: 4 });
    const update = db.tx.workoutAssignment.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: "a1", prescriptionVersion: 3 });
    expect(update.data.workoutId).toBe(result.workoutId);
    expect(db.tx.workout.update).toHaveBeenCalledWith({ where: { id: "w1" }, data: { status: "ARCHIVED" } });
    expect(db.tx.workout.update.mock.calls[0][0].data).toMatchObject({ supersedesWorkoutId: "w1", amendment: false });
  });

  it("depois da execução: emenda exige motivo e a comparação continua na versão recebida", async () => {
    const db = reviseDb({ executed: true });
    await expect(new ReviseWorkoutAssignment(db as never).execute("ricardo", { kind: "independent" }, "maria", "a1", revisionInput())).rejects.toThrow(/motivo da emenda/);
    const result = await new ReviseWorkoutAssignment(db as never).execute("ricardo", { kind: "independent" }, "maria", "a1", revisionInput({ reason: "corrigir distância" }));
    expect(result.amendment).toBe(true);
    const data = db.tx.workoutAssignment.updateMany.mock.calls[0][0].data;
    expect(data.workoutId).toBeUndefined();
    expect(data.amendmentWorkoutId).toBe(result.workoutId);
    expect(db.tx.workout.update).not.toHaveBeenCalledWith({ where: { id: "w1" }, data: { status: "ARCHIVED" } });
  });

  it("duas edições concorrentes: a segunda recebe conflito", async () => {
    const db = reviseDb({ executed: false, conflict: true });
    await expect(new ReviseWorkoutAssignment(db as never).execute("ricardo", { kind: "independent" }, "maria", "a1", revisionInput()))
      .rejects.toMatchObject({ code: "PRESCRIPTION_CONFLICT", status: 409 });
  });
});

describe("rascunho", () => {
  it("salvar não cria atribuição; versão antiga do rascunho dá conflito", async () => {
    const db = {
      prescriptionDraft: {
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...data, version: 1 })),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      workoutAssignment: { create: vi.fn() },
    };
    const drafts = new PrescriptionDrafts(db as never);
    const saved = await drafts.save("ricardo", { kind: "independent" }, "maria", { payload: { title: "Rascunho", blocks: [] } });
    expect(saved).toMatchObject({ coachId: "coach-r", athleteId: "maria", title: "Rascunho" });
    expect(db.workoutAssignment.create).not.toHaveBeenCalled();
    await expect(drafts.save("ricardo", { kind: "independent" }, "maria", { draftId: "d1", expectedVersion: 1, payload: { title: "x" } }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("nenhum leitor do atleta consulta rascunhos (o atleta não vê rascunho por construção)", () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? files(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    });
    const athleteReaders = [...files(join(process.cwd(), "app", "app")), ...files(join(process.cwd(), "app", "atleta"))];
    expect(athleteReaders.filter((file) => /prescriptionDraft/.test(readFileSync(file, "utf8")))).toEqual([]);
  });
});

describe("versões", () => {
  it("cadeia da mais nova à original, marcando a recebida e a vigente", async () => {
    const rows: Record<string, Record<string, unknown>> = {
      w3: { id: "w3", title: "v3", createdAt: new Date(3), amendment: true, revisionReason: "corrigir", revisedByUserId: null, supersedesWorkoutId: "w2" },
      w2: { id: "w2", title: "v2", createdAt: new Date(2), amendment: false, revisionReason: null, revisedByUserId: null, supersedesWorkoutId: "w1" },
      w1: { id: "w1", title: "v1", createdAt: new Date(1), amendment: false, revisionReason: null, revisedByUserId: null, supersedesWorkoutId: null },
    };
    const db = { workout: { findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(rows[where.id] ?? null)) } };
    const versions = await prescriptionVersionsOf(db as never, { workoutId: "w2", amendmentWorkoutId: "w3" });
    expect(versions.map((version) => [version.workoutId, version.current, version.received, version.amendment])).toEqual([
      ["w3", true, false, true], ["w2", false, true, false], ["w1", false, false, false],
    ]);
  });
});
