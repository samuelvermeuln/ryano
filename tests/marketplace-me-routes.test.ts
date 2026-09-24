/**
 * TM039/TM040/TM042 — route-boundary tests for the free-acquisition/
 * activation flow: authentication, the error envelope, MARKETPLACE_ENABLED
 * gating, and — most importantly — that `licenseId` always comes from the
 * URL (never the body), so a caller cannot activate/read another athlete's
 * resource by stuffing an id into the JSON payload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkoutExecute: vi.fn(),
  listExecute: vi.fn(),
  activateExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: undefined as string | undefined },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/create-marketplace-checkout", () => ({
  CreateMarketplaceCheckout: class { execute = mocks.checkoutExecute; },
}));
vi.mock("@/modules/school/application/list-my-training-licenses", () => ({
  ListMyTrainingLicenses: class { execute = mocks.listExecute; },
}));
vi.mock("@/modules/school/application/activate-training-license", () => ({
  ActivateTrainingLicense: class { execute = mocks.activateExecute; },
}));

import { POST as CHECKOUT } from "@/app/api/marketplace/checkout/route";
import { GET as LIST_LICENSES } from "@/app/api/me/training-licenses/route";
import { POST as ACTIVATE } from "@/app/api/me/training-licenses/[id]/activate/route";

const activateCtx = (id = "lic-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = undefined;
  mocks.auth.mockResolvedValue({ user: { id: "athlete-1" } });
  mocks.checkoutExecute.mockResolvedValue({ kind: "free", license: { id: "lic-1" } });
  mocks.listExecute.mockResolvedValue({ licenses: [], pendingPurchases: [], nextCursor: null });
  mocks.activateExecute.mockResolvedValue({ preview: false, licenseId: "lic-1", created: 3, alreadyInstantiated: false });
});

describe("POST /api/marketplace/checkout [TM039]", () => {
  it("exige autenticação", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await CHECKOUT(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ productId: "p1", idempotencyKey: "k1" }) }));
    expect(res.status).toBe(401);
    expect(mocks.checkoutExecute).not.toHaveBeenCalled();
  });

  it("responde 404 seguro quando MARKETPLACE_ENABLED=false", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    const res = await CHECKOUT(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ productId: "p1", idempotencyKey: "k1" }) }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "MARKETPLACE_DISABLED" });
    expect(mocks.checkoutExecute).not.toHaveBeenCalled();
  });

  it("cria checkout e responde 201", async () => {
    const res = await CHECKOUT(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ productId: "p1", idempotencyKey: "k1" }) }));
    expect(res.status).toBe(201);
    expect(mocks.checkoutExecute).toHaveBeenCalledWith("athlete-1", { productId: "p1", idempotencyKey: "k1" });
  });
});

describe("GET /api/me/training-licenses [TM040]", () => {
  it("exige autenticação", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await LIST_LICENSES(new Request("http://localhost/x"));
    expect(res.status).toBe(401);
    expect(mocks.listExecute).not.toHaveBeenCalled();
  });

  it("passa o ator da sessão, nunca um athleteId de query string", async () => {
    const res = await LIST_LICENSES(new Request("http://localhost/x?athleteId=outro-atleta&limit=5"));
    expect(res.status).toBe(200);
    // execute()'s first argument is always the session's actor id — a
    // query-string athleteId cannot override who the "own licenses" belong to.
    expect(mocks.listExecute).toHaveBeenCalledWith("athlete-1", expect.anything());
  });
});

describe("POST /api/me/training-licenses/[id]/activate [TM042]", () => {
  it("exige autenticação", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await ACTIVATE(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ mode: "START_NOW", timezone: "America/Sao_Paulo" }) }), activateCtx());
    expect(res.status).toBe(401);
    expect(mocks.activateExecute).not.toHaveBeenCalled();
  });

  it("licenseId vem da URL, não do corpo (mesmo se o corpo tentar sobrescrever)", async () => {
    await ACTIVATE(new Request("http://localhost/x", {
      method: "POST", body: JSON.stringify({ mode: "START_NOW", timezone: "America/Sao_Paulo", licenseId: "licenca-alheia" }),
    }), activateCtx("lic-1"));
    expect(mocks.activateExecute).toHaveBeenCalledWith("athlete-1", expect.objectContaining({ licenseId: "lic-1" }));
  });

  it("ativação de licença de outro dono propaga 404 do caso de uso (RNF-001, nunca vaza existência)", async () => {
    const { SchoolError } = await import("@/modules/school/domain/errors");
    mocks.activateExecute.mockRejectedValue(new SchoolError("LICENSE_NOT_FOUND", "Licença não encontrada.", 404));
    const res = await ACTIVATE(new Request("http://localhost/x", {
      method: "POST", body: JSON.stringify({ mode: "START_NOW", timezone: "America/Sao_Paulo" }),
    }), activateCtx("licenca-de-outro-atleta"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "LICENSE_NOT_FOUND" });
  });

  it("conflito de ativação (já ativada com outra escolha) responde 409", async () => {
    const { SchoolError } = await import("@/modules/school/domain/errors");
    mocks.activateExecute.mockRejectedValue(new SchoolError("LICENSE_ALREADY_ACTIVE", "Já ativada.", 409));
    const res = await ACTIVATE(new Request("http://localhost/x", {
      method: "POST", body: JSON.stringify({ mode: "START_NOW", timezone: "America/Sao_Paulo" }),
    }), activateCtx());
    expect(res.status).toBe(409);
  });

  it("repassa expectedVersion e demais campos do corpo", async () => {
    await ACTIVATE(new Request("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ mode: "START_ON_DATE", timezone: "America/Sao_Paulo", startLocalDate: "2026-10-01", expectedVersion: "2026-09-20T00:00:00.000Z" }),
    }), activateCtx());
    expect(mocks.activateExecute).toHaveBeenCalledWith("athlete-1", expect.objectContaining({
      mode: "START_ON_DATE", timezone: "America/Sao_Paulo", startLocalDate: "2026-10-01", expectedVersion: "2026-09-20T00:00:00.000Z", licenseId: "lic-1",
    }));
  });
});
