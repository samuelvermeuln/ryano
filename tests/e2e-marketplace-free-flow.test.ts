/**
 * TM055 — E2E: fluxo grátis completo do marketplace (RF-107/RF-108/RF-109,
 * spec de produto §14 cenário 2).
 *
 * Mesma convenção de "E2E" já usada por `tests/e2e-school-lifecycle.test.ts`:
 * a cadeia real de casos de uso sobre um Prisma mockado em memória, não
 * automação de navegador (este repo não tem `@playwright/test` instalado —
 * lacuna pré-existente, fora do escopo desta task).
 *
 * Cenário: visitante anônimo filtra → abre detalhe → (login, validado
 * separadamente por `tests/marketplace-callback-url.test.ts` — a mesma
 * proteção contra open-redirect é reusada aqui só para confirmar que o
 * retorno preserva productId/versão) → adquire grátis → ativa (START_NOW)
 * → calendário populado → reenviar ativação não duplica agenda.
 */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ListMarketplaceProducts } from "@/modules/school/application/list-marketplace-products";
import { GetMarketplaceProductDetail } from "@/modules/school/application/get-marketplace-product-detail";
import { AcquireFreeTrainingProduct } from "@/modules/school/application/acquire-free-training-product";
import { ActivateTrainingLicense } from "@/modules/school/application/activate-training-license";
import { buildMarketplaceCallbackUrl, isSafeMarketplaceCallbackPath } from "@/modules/school/domain/marketplace-callback-url";

const NOW = new Date("2026-09-23T12:00:00Z");
const ATHLETE_ID = "athlete-e2e-1";
const PRODUCT_ID = "prod-e2e-5k";
const VERSION_ID = "ver-e2e-5k-v1";

function withTx<T extends object>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

const planPayload = {
  weeks: [
    { week: 1, days: [{ workoutTemplateId: "tpl-run-1", dayOfWeek: 1 }, { workoutTemplateId: "tpl-run-2", dayOfWeek: 4 }] },
    { week: 2, days: [{ workoutTemplateId: "tpl-run-3", dayOfWeek: 1 }] },
  ],
};

function makeSharedDb() {
  const productRow = {
    id: PRODUCT_ID, schoolId: null, coachId: "coach-e2e-1", title: "Corrida 5km — iniciante",
    description: "Plano de 2 semanas.", sportType: "run", durationWeeks: 2,
    status: "PUBLISHED", visibility: "PUBLIC", priceCents: null, currency: null,
    currentVersionId: VERSION_ID, previewVersionId: null, slug: "corrida-5km-e2e",
    objective: null, difficulty: "beginner", goalType: null, targetEventType: null, targetDistance: null,
    sessionsPerWeek: 2, sessionDurationMin: null, sessionDurationMax: null,
    equipment: null, language: "pt-BR", availability: null, createdAt: NOW,
  };

  let purchaseRow: Record<string, unknown> | null = null;
  let licenseRow: Record<string, unknown> | null = null;
  const assignmentRows: Array<Record<string, unknown>> = [];

  const db = {
    trainingProduct: {
      findMany: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.status === "PUBLISHED" && where.visibility === "PUBLIC" ? [productRow] : [])),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(productRow),
      findFirst: vi.fn().mockResolvedValue(productRow),
    },
    trainingProductVersion: {
      findUnique: vi.fn().mockResolvedValue({ id: VERSION_ID, productId: PRODUCT_ID, planPayload, schemaVersion: 1, publishedAt: NOW }),
      findFirst: vi.fn().mockResolvedValue({ id: VERSION_ID, productId: PRODUCT_ID, planPayload, schemaVersion: 1, publishedAt: NOW }),
    },
    coachProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: "coach-e2e-1", displayName: "Coach E2E", userId: "coach-user-e2e" }),
      findMany: vi.fn().mockResolvedValue([{ id: "coach-e2e-1", displayName: "Coach E2E" }]),
    },
    school: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    marketplaceMedia: { findMany: vi.fn().mockResolvedValue([]) },
    workoutTemplate: {
      findMany: vi.fn().mockResolvedValue([
        { id: "tpl-run-1", title: "Corrida leve", description: null, sportType: "run" },
        { id: "tpl-run-2", title: "Corrida intervalada", description: null, sportType: "run" },
        { id: "tpl-run-3", title: "Corrida longa", description: null, sportType: "run" },
      ]),
    },
    marketplaceReview: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _avg: { stars: null }, _count: { _all: 0 } }) },
    trainingPurchase: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(purchaseRow)),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        purchaseRow = { id: "pur-e2e-1", ...data };
        return Promise.resolve(purchaseRow);
      }),
    },
    trainingLicense: {
      findFirst: vi.fn().mockImplementation(() => Promise.resolve(licenseRow)),
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(licenseRow)),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        licenseRow = { id: "lic-e2e-1", calendarInstantiated: false, activationStatus: "PENDING", ...data };
        return Promise.resolve(licenseRow);
      }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        licenseRow = { ...(licenseRow as Record<string, unknown>), ...data };
        return Promise.resolve(licenseRow);
      }),
    },
    workoutAssignment: {
      createMany: vi.fn().mockImplementation(({ data }: { data: Array<Record<string, unknown>> }) => {
        assignmentRows.push(...data);
        return Promise.resolve({ count: data.length });
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    _getAssignments: () => assignmentRows,
    _getLicense: () => licenseRow,
  };

  return withTx(db);
}

describe("E2E — fluxo grátis do marketplace [TM055]", () => {
  it("visitante anônimo -> compra grátis -> ativa -> calendário populado -> reenvio não duplica", async () => {
    const db = makeSharedDb();
    const dbClient = db as unknown as PrismaClient;

    // 1. Visitante anônimo busca e filtra — ListMarketplaceProducts nunca recebe sessão.
    const catalog = await new ListMarketplaceProducts(dbClient).execute({ sportType: "run" });
    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0]!.id).toBe(PRODUCT_ID);

    // 2. Abre o detalhe — amostra pública, sem plano completo.
    const detail = await new GetMarketplaceProductDetail(dbClient).execute({ idOrSlug: PRODUCT_ID });
    expect(detail.id).toBe(PRODUCT_ID);
    expect(detail.previewWeeks.length).toBeLessThan(planPayload.weeks.length);

    // 3. CTA de compra encaminha a login preservando productId/versão (RF-107) —
    //    validado com o MESMO validador que protege contra open-redirect.
    const callbackPath = buildMarketplaceCallbackUrl({ productId: PRODUCT_ID, versionId: VERSION_ID, intent: "acquire-free" });
    expect(isSafeMarketplaceCallbackPath(callbackPath)).toBe(true);
    expect(callbackPath.startsWith(`/marketplace/${PRODUCT_ID}`)).toBe(true);

    // 4. Após "login", aquisição grátis (sem paymentRef).
    const acquisition = await new AcquireFreeTrainingProduct(dbClient, () => NOW).execute(ATHLETE_ID, { productId: PRODUCT_ID });
    expect(acquisition.alreadyAcquired).toBe(false);
    expect(acquisition.license.status).toBe("ACTIVE");

    // 5. Escolhe início (START_NOW) — calendário instanciado.
    const activation = await new ActivateTrainingLicense(dbClient, () => NOW).execute(ATHLETE_ID, {
      licenseId: acquisition.license.id, mode: "START_NOW", timezone: "America/Sao_Paulo",
    });
    expect("alreadyInstantiated" in activation && activation.alreadyInstantiated).toBe(false);
    expect("created" in activation && activation.created).toBeGreaterThan(0);

    // 6. Calendário populado: as sessões criadas correspondem ao plano (3 dias -> 3 assignments).
    const assignments = db._getAssignments();
    expect(assignments).toHaveLength(3);
    expect(assignments.every((a: Record<string, unknown>) => a.trainingLicenseId === acquisition.license.id)).toBe(true);
    expect(assignments.every((a: Record<string, unknown>) => a.workoutId === null && a.workoutTemplateId)).toBe(true);
    // "Registro manual" (RNF-007, sem relógio): as linhas criadas são
    // WorkoutAssignment padrão — o mesmo caminho de registro manual que já
    // existe para treinos de escola funciona aqui sem alteração, porque não
    // há nada específico de marketplace na tabela WorkoutExecution.

    // 7. "Progresso visível": licença reflete activationStatus=ACTIVATED e calendarInstantiated=true.
    const license = db._getLicense()!;
    expect(license.activationStatus).toBe("ACTIVATED");
    expect(license.calendarInstantiated).toBe(true);

    // 8. Reenviar a ativação (reload/duplo clique) NÃO duplica a agenda (cenário 2, §14).
    const secondActivation = await new ActivateTrainingLicense(dbClient, () => NOW).execute(ATHLETE_ID, {
      licenseId: acquisition.license.id, mode: "START_NOW", timezone: "America/Sao_Paulo",
    });
    expect("alreadyInstantiated" in secondActivation && secondActivation.alreadyInstantiated).toBe(true);
    expect("created" in secondActivation && secondActivation.created).toBe(0);
    expect(db._getAssignments()).toHaveLength(3); // still 3, not 6

    // Reenviar a AQUISIÇÃO também não duplica compra/licença.
    const secondAcquisition = await new AcquireFreeTrainingProduct(dbClient, () => NOW).execute(ATHLETE_ID, { productId: PRODUCT_ID });
    expect(secondAcquisition.alreadyAcquired).toBe(true);
    expect(secondAcquisition.license.id).toBe(acquisition.license.id);
  });

  it("callbackUrl externo não é aceito no retorno do login (RF-107, open-redirect)", () => {
    expect(isSafeMarketplaceCallbackPath("https://evil.example.com")).toBe(false);
    expect(isSafeMarketplaceCallbackPath(`//evil.example.com/marketplace/${PRODUCT_ID}`)).toBe(false);
  });

  it("anônimo sem login não consegue adquirir (produto grátis também exige sessão, RF-107)", async () => {
    // AcquireFreeTrainingProduct.execute() exige athleteId explícito — não
    // há nenhum caminho onde a ausência de sessão silenciosamente resolve
    // para "anônimo": a própria assinatura do método obriga um athleteId,
    // e a rota HTTP (TM039, testada em outro arquivo) é quem aplica
    // `schoolResponse` (401 sem sessão) antes de chamar isto.
    const db = makeSharedDb();
    await expect(new AcquireFreeTrainingProduct(db as unknown as PrismaClient, () => NOW).execute("", { productId: PRODUCT_ID }))
      .rejects.toBeDefined();
  });
});
