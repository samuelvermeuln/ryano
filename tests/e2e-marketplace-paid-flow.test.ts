/**
 * TM071 — E2E: checkout pago completo (RF-202/RF-203, spec de produto §14
 * cenário 6). Mesma convenção de `tests/e2e-marketplace-free-flow.test.ts`
 * (TM055): cadeia de classes REAIS sobre Prisma mockado em memória — aqui
 * estendida para passar pela rota HTTP real do webhook (não só pelo caso de
 * uso isolado), com a verificação de assinatura da Stripe genuinamente
 * simulada (mock só do pacote `stripe`, não da nossa própria classe).
 *
 * Cenário: checkout criado -> retorno do navegador ANTES do webhook
 * permanece PENDING -> tentativa de forjar a confirmação (POST direto no
 * webhook sem assinatura válida) é rejeitada, nada muda -> webhook assinado
 * de verdade confirma, cria licença e agenda -> reenvio do MESMO webhook
 * assinado não duplica licença nem agenda.
 *
 * Achado confirmado nesta task (não corrigido, fora do escopo — documentado
 * em STATUS.md): `CreateTrainingPurchase` (o caso de uso pré-D-02 que aceita
 * `paymentRef` livre do cliente) não é instanciado por nenhuma rota viva —
 * confirmado por busca textual (`grep "new CreateTrainingPurchase("`), só
 * usado pelo seu próprio teste unitário legado (TM002). A única superfície
 * real de confirmação hoje é o webhook assinado, exercida abaixo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const NOW = new Date("2026-09-24T12:00:00Z");
const ATHLETE_ID = "athlete-paid-e2e-1";
const PRODUCT_ID = "prod-paid-e2e-1";
const VERSION_ID = "ver-paid-e2e-1";
const GOOD_SIGNATURE = "t=1,v1=genuine-signature";

const planPayload = {
  weeks: [
    { week: 1, days: [{ workoutTemplateId: "tpl-paid-1", dayOfWeek: 1 }, { workoutTemplateId: "tpl-paid-2", dayOfWeek: 4 }] },
    { week: 2, days: [{ workoutTemplateId: "tpl-paid-3", dayOfWeek: 1 }] },
  ],
};

const mocks = vi.hoisted(() => ({
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_e2e", STRIPE_WEBHOOK_SECRET: "whsec_e2e" },
}));
vi.mock("@/server/env", () => ({ env: mocks.env, getPublicAppUrl: () => "https://app.test" }));

// Mock só o pacote `stripe` (não a nossa StripePaymentProvider): a
// verificação de assinatura é genuinamente exercida — uma assinatura
// diferente de GOOD_SIGNATURE lança, exatamente como stripe.webhooks.constructEvent faz.
let checkoutIdRef: string | null = null;
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        create: vi.fn().mockImplementation((params: { client_reference_id: string }) => {
          checkoutIdRef = params.client_reference_id;
          return Promise.resolve({ id: "cs_paid_e2e_1", url: "https://checkout.stripe.com/paid-e2e" });
        }),
      },
    };
    webhooks = {
      constructEvent: vi.fn().mockImplementation((rawBody: string, signature: string) => {
        if (signature !== GOOD_SIGNATURE) {
          throw new Error("No signatures found matching the expected signature for payload");
        }
        return JSON.parse(rawBody);
      }),
    };
  },
}));

function withTx<T extends object>(db: T) {
  return Object.assign(db, {
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  });
}

function makeSharedDb() {
  const productRow = {
    id: PRODUCT_ID, schoolId: null, coachId: "coach-paid-e2e-1", title: "Corrida 5km — pago",
    status: "PUBLISHED", visibility: "PUBLIC", priceCents: 4990, currency: "BRL",
    currentVersionId: VERSION_ID,
  };

  let purchaseRow: Record<string, unknown> | null = null;
  let licenseRow: Record<string, unknown> | null = null;
  const assignmentRows: Array<Record<string, unknown>> = [];

  const db = {
    trainingProduct: { findUnique: vi.fn().mockResolvedValue(productRow) },
    schoolAthleteMembership: { findFirst: vi.fn().mockResolvedValue(null) },
    trainingProductVersion: {
      findUnique: vi.fn().mockResolvedValue({ id: VERSION_ID, productId: PRODUCT_ID, planPayload, schemaVersion: 1, publishedAt: NOW }),
    },
    workoutTemplate: {
      findMany: vi.fn().mockResolvedValue([
        { id: "tpl-paid-1", title: "Corrida leve", description: null, sportType: "run" },
        { id: "tpl-paid-2", title: "Corrida intervalada", description: null, sportType: "run" },
        { id: "tpl-paid-3", title: "Corrida longa", description: null, sportType: "run" },
      ]),
    },
    trainingPurchase: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(purchaseRow)),
      findFirst: vi.fn().mockImplementation(() => Promise.resolve(purchaseRow)),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        purchaseRow = { id: "pur-paid-e2e-1", ...data };
        return Promise.resolve(purchaseRow);
      }),
      update: vi.fn().mockImplementation(({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => {
        if (!purchaseRow || purchaseRow.id !== where.id) return Promise.resolve(null);
        if (where.status && purchaseRow.status !== where.status) return Promise.resolve(null);
        purchaseRow = { ...purchaseRow, ...data };
        return Promise.resolve(purchaseRow);
      }),
    },
    trainingLicense: {
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(licenseRow)),
      findFirst: vi.fn().mockImplementation(() => Promise.resolve(licenseRow)),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        licenseRow = { calendarInstantiated: false, activationStatus: "PENDING", ...data };
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
    sellerAccount: { upsert: vi.fn().mockResolvedValue({ id: "seller-acc-paid-e2e-1" }) },
    sellerLedgerEntry: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    _getAssignments: () => assignmentRows,
    _getLicense: () => licenseRow,
    _getPurchase: () => purchaseRow,
  };

  return withTx(db);
}

let sharedDb: ReturnType<typeof makeSharedDb>;
vi.mock("@/server/db", () => ({ get prisma() { return sharedDb; } }));

beforeEach(() => {
  checkoutIdRef = null;
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.env.STRIPE_SECRET_KEY = "sk_test_e2e";
  mocks.env.STRIPE_WEBHOOK_SECRET = "whsec_e2e";
  sharedDb = makeSharedDb();
});

describe("E2E — checkout pago completo [TM071]", () => {
  it("checkout -> forjar confirmação sem assinatura falha -> webhook real confirma -> reenvio não duplica -> calendário populado uma única vez", async () => {
    const { CreateMarketplaceCheckout } = await import("@/modules/school/application/create-marketplace-checkout");
    const { ActivateTrainingLicense } = await import("@/modules/school/application/activate-training-license");
    const { POST } = await import("@/app/api/marketplace/payment-webhook/route");

    // 1. Checkout pago: PENDING, sem licença.
    const checkout = new CreateMarketplaceCheckout(sharedDb as unknown as PrismaClient, () => NOW);
    const out = await checkout.execute(ATHLETE_ID, { productId: PRODUCT_ID, idempotencyKey: "idem-paid-e2e-1" });
    if (!("purchase" in out)) throw new Error("expected paid checkout");
    expect(out.purchase.status).toBe("PENDING");
    expect(checkoutIdRef).toBe(`checkout:${ATHLETE_ID}:idem-paid-e2e-1`);

    // 2. Retorno do navegador ANTES do webhook: nada muda por conta própria.
    expect(sharedDb._getPurchase()?.status).toBe("PENDING");
    expect(sharedDb._getLicense()).toBeNull();

    // 3. Tentativa de forjar a confirmação: POST no webhook com um corpo
    //    "válido" na forma mas SEM assinatura genuína — cenário 6, "paymentRef
    //    arbitrário do navegador não ativa nada". Rejeitado antes de tocar o
    //    banco; a compra continua exatamente como estava.
    const forgedEvent = {
      id: "evt_forged", type: "checkout.session.completed",
      data: { object: {
        client_reference_id: checkoutIdRef, amount_total: 1, currency: "brl", // valor forjado, muito menor que o real
        payment_status: "paid", payment_intent: "pi_forged", metadata: {},
      } },
    };
    const forgedRes = await POST(new Request("http://test/api/marketplace/payment-webhook", {
      method: "POST", body: JSON.stringify(forgedEvent), headers: new Headers({ "stripe-signature": "t=1,v1=attacker-guess" }),
    }));
    expect(forgedRes.status).toBe(400);
    expect(sharedDb._getPurchase()?.status).toBe("PENDING");
    expect(sharedDb._getLicense()).toBeNull();

    // 4. Webhook assinado de verdade (mesmo checkoutId, valor/produto/versão
    //    conferindo com o offerSnapshot congelado) confirma a compra.
    const realEvent = {
      id: "evt_real_1", type: "checkout.session.completed",
      data: { object: {
        client_reference_id: checkoutIdRef, amount_total: 4990, currency: "brl",
        payment_status: "paid", payment_intent: "pi_real_1",
        metadata: { productId: PRODUCT_ID, versionId: VERSION_ID, athleteId: ATHLETE_ID },
      } },
    };
    const confirmRes = await POST(new Request("http://test/api/marketplace/payment-webhook", {
      method: "POST", body: JSON.stringify(realEvent), headers: new Headers({ "stripe-signature": GOOD_SIGNATURE }),
    }));
    expect(confirmRes.status).toBe(200);
    expect(sharedDb._getPurchase()?.status).toBe("COMPLETED");
    const license = sharedDb._getLicense();
    expect(license).not.toBeNull();

    // 5. Ativa (escolhe início) -> calendário populado (3 sessões, mesmo plano do fluxo grátis).
    const activation = await new ActivateTrainingLicense(sharedDb as unknown as PrismaClient, () => NOW).execute(ATHLETE_ID, {
      licenseId: (license as { id: string }).id, mode: "START_NOW", timezone: "America/Sao_Paulo",
    });
    expect("created" in activation && activation.created).toBeGreaterThan(0);
    expect(sharedDb._getAssignments()).toHaveLength(3);

    // 6. Reenvio do MESMO webhook assinado (Stripe é at-least-once) não
    //    cria uma segunda licença nem duplica a agenda.
    const replayRes = await POST(new Request("http://test/api/marketplace/payment-webhook", {
      method: "POST", body: JSON.stringify(realEvent), headers: new Headers({ "stripe-signature": GOOD_SIGNATURE }),
    }));
    expect(replayRes.status).toBe(200);
    expect(sharedDb._getAssignments()).toHaveLength(3); // ainda 3, não 6
  });
});
