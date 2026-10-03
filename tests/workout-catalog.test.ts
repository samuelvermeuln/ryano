/**
 * SAM-58 — versioned catalog (§9, AC05, AC08).
 */
import { describe, expect, it, vi } from "vitest";

import {
  blocksWithoutPersonalData,
  normalizeSearch,
  searchTerms,
  summarizeTemplate,
  templateContentSchema,
  templateSearchText,
} from "@/modules/school/domain/workout-template-content";
import { describeTemplateSummary } from "@/modules/school/presentation/template-summary";
import { WorkoutCatalog } from "@/modules/school/application/workout-catalog";

/** §12.5 NAT-PISC-001: 300 + 4×50 + 6×100 (20 s) + 4×50 + 100 = 1.400 m, duration depends on pace. */
const NAT_PISC_001 = templateContentSchema.parse({
  objective: "manter execução e parciais consistentes",
  blocks: [
    { blockType: "WARMUP", title: "Aquecimento", distanceM: 300 },
    { blockType: "DRILL", title: "Técnica", distanceM: 50, repetitions: 4 },
    { blockType: "INTERVAL", title: "Principal", distanceM: 100, repetitions: 6, restDurationS: 20 },
    { blockType: "DRILL", title: "Habilidade", distanceM: 50, repetitions: 4 },
    { blockType: "COOLDOWN", title: "Soltura", distanceM: 100 },
  ],
});

describe("conteúdo e resumo calculado", () => {
  it("NAT-PISC-001 soma 1.400 m e a duração é estimada, com as partes sem duração nomeadas", () => {
    const summary = summarizeTemplate(NAT_PISC_001);
    expect(summary.distanceMeters).toBe(1400);
    expect(summary.distanceIsPartial).toBe(false);
    expect(summary.partsWithoutDuration).toHaveLength(5);
    expect(summary.partsWithoutDuration[0]).toEqual({ position: 1, title: "Aquecimento", reason: "duração depende do ritmo de quem executa" });
    const text = describeTemplateSummary(summary);
    expect(text.distance).toMatch(/1[.,]?4/);
    expect(text.duration).toMatch(/^duração estimada/);
  });

  it("busca sem acento e por termos; corpus inclui instrução, blocos, etiquetas e autor", () => {
    expect(normalizeSearch("Orientação  MAR")).toBe("orientacao mar");
    expect(searchTerms(" orientação  mar ")).toEqual(["orientacao", "mar"]);
    const corpus = templateSearchText(
      { title: "Travessia guiada", code: "AA-01", tags: ["mar"], capabilities: [], sessionType: null, phase: null, description: null },
      { objective: null, instructions: "Treinar orientação com referência visual", blocks: NAT_PISC_001.blocks },
      "Ricardo Souza",
    );
    expect(searchTerms("orientação mar").every((term) => corpus.includes(term))).toBe(true);
    expect(corpus).toContain("ricardo souza");
  });

  it("salvar adaptação como modelo remove FC/ritmo/potência absolutos e mantém zona e RPE", () => {
    const blocks = templateContentSchema.parse({ blocks: [{ blockType: "INTERVAL", distanceM: 400, target: { heartRateMin: 150, heartRateMax: 165, paceSecPerKm: 250, zone: 4, rpe: 8 } }] }).blocks;
    expect(blocksWithoutPersonalData(blocks)[0]!.target).toEqual({ zone: 4, rpe: 8 });
  });
});

function makeDb() {
  const templates: Array<Record<string, unknown>> = [];
  const versions: Array<Record<string, unknown>> = [];
  const db = {
    templates, versions,
    coachProfile: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { userId: string } }) => Promise.resolve(
        where.userId === "ricardo" ? { id: "coach-r", status: "ACTIVE", displayName: "Ricardo Souza", schoolMemberships: [] }
          : where.userId === "carlos" ? { id: "coach-c", status: "ACTIVE", displayName: "Carlos", schoolMemberships: [] } : null,
      )),
    },
    schoolMembership: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    schoolMembershipRole: { findMany: vi.fn().mockResolvedValue([]) },
    workoutTemplate: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { templates.push({ ...data }); return Promise.resolve(data); }),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(templates.find((row) => row.id === where.id) ?? null)),
      updateMany: vi.fn().mockImplementation(({ where, data }: { where: { id: string; version: number }; data: Record<string, unknown> }) => {
        const row = templates.find((item) => item.id === where.id && item.version === where.version);
        if (!row) return Promise.resolve({ count: 0 });
        Object.assign(row, data);
        return Promise.resolve({ count: 1 });
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Promise.resolve(Object.assign(templates.find((row) => row.id === where.id)!, data))),
    },
    workoutTemplateVersion: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { versions.push({ ...data }); return Promise.resolve(data); }),
      findMany: vi.fn().mockImplementation(({ where }: { where: { templateId: string } }) => Promise.resolve(versions.filter((row) => row.templateId === where.templateId).map((row) => ({ ...row, author: { name: "Ricardo" } } as Record<string, unknown>)).sort((a, b) => (b.number as number) - (a.number as number)))),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { templateId_number: { templateId: string; number: number } } }) => Promise.resolve(versions.find((row) => row.templateId === where.templateId_number.templateId && row.number === where.templateId_number.number) ?? null)),
    },
    workoutTemplateFavorite: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  return db;
}

const meta = { title: "Piscina 1.400 m", code: "NAT-PISC-001", sportType: "swim", tags: ["piscina"] };

describe("WorkoutCatalog", () => {
  it("criar = v1; editar = v2 e a v1 continua consultável; versão antiga dá conflito", async () => {
    const db = makeDb();
    const catalog = new WorkoutCatalog(db as never);
    const created = await catalog.create("ricardo", { scope: { kind: "coach" }, meta, content: NAT_PISC_001 });
    expect(created.version.number).toBe(1);
    expect(created.version.summary.distanceMeters).toBe(1400);
    const id = created.template.id;
    const edited = await catalog.saveVersion("ricardo", id, { meta: { ...meta, title: "Piscina 1.400 m (ajustado)" }, content: { ...NAT_PISC_001, blocks: NAT_PISC_001.blocks.slice(0, 4) }, expectedVersion: 1 });
    expect(edited.version.number).toBe(2);
    expect(edited.version.summary.distanceMeters).toBe(1300);
    const v1 = await catalog.get("ricardo", id, 1);
    expect(v1.version.summary.distanceMeters).toBe(1400);
    expect(v1.versions.map((row) => row.number)).toEqual([2, 1]);
    await expect(catalog.saveVersion("ricardo", id, { meta, content: NAT_PISC_001, expectedVersion: 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("catálogo pessoal só do dono: outro professor recebe 404", async () => {
    const db = makeDb();
    const catalog = new WorkoutCatalog(db as never);
    const created = await catalog.create("ricardo", { scope: { kind: "coach" }, meta, content: NAT_PISC_001 });
    await expect(catalog.get("carlos", created.template.id)).rejects.toMatchObject({ status: 404 });
    await expect(catalog.create("aluno", { scope: { kind: "coach" }, meta, content: {} })).rejects.toMatchObject({ status: 403 });
  });

  it("variante aponta o original e não o altera; arquivar mantém consultável e bloqueia edição", async () => {
    const db = makeDb();
    const catalog = new WorkoutCatalog(db as never);
    const original = await catalog.create("ricardo", { scope: { kind: "coach" }, meta, content: NAT_PISC_001 });
    const variant = await catalog.duplicate("ricardo", original.template.id, { variant: true, title: "Adaptação para piscina de 25 m" });
    expect(variant.template).toMatchObject({ parentTemplateId: original.template.id, title: "Adaptação para piscina de 25 m", version: 1 });
    expect(db.templates.find((row) => row.id === original.template.id)).toMatchObject({ version: 1, title: meta.title });
    await catalog.archive("ricardo", original.template.id);
    await expect(catalog.get("ricardo", original.template.id)).resolves.toMatchObject({ template: { status: "ARCHIVED" } });
    await expect(catalog.saveVersion("ricardo", original.template.id, { meta, content: NAT_PISC_001, expectedVersion: 1 })).rejects.toMatchObject({ status: 409 });
  });
});
