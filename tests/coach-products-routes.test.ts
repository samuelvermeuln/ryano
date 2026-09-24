/**
 * TM024–TM027 — Rotas HTTP do estúdio do professor (`/api/coach/products/**`).
 *
 * As rotas são adaptadores finos — o que precisa de teste aqui é a
 * fronteira: autenticação, a flag `MARKETPLACE_ENABLED`, o envelope de erro,
 * e a precedência do `id` da URL sobre qualquer valor vindo do corpo/query.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createDraftExecute: vi.fn(),
  updateDraftExecute: vi.fn(),
  saveVersionDraftExecute: vi.fn(),
  publishExecute: vi.fn(),
  salesExecute: vi.fn(),
  listOwnExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/create-training-product-draft", () => ({
  CreateTrainingProductDraft: class { execute = mocks.createDraftExecute; },
}));
vi.mock("@/modules/school/application/update-training-product-draft", () => ({
  UpdateTrainingProductDraft: class { execute = mocks.updateDraftExecute; },
}));
vi.mock("@/modules/school/application/save-product-version-draft", () => ({
  SaveProductVersionDraft: class { execute = mocks.saveVersionDraftExecute; },
}));
vi.mock("@/modules/school/application/publish-training-product-version", () => ({
  PublishTrainingProductVersion: class { execute = mocks.publishExecute; },
}));
vi.mock("@/modules/school/application/get-product-sales-summary", () => ({
  GetProductSalesSummary: class { execute = mocks.salesExecute; },
}));
vi.mock("@/modules/school/application/list-own-training-products", async () => {
  const actual = await vi.importActual("@/modules/school/application/list-own-training-products");
  return { ...actual, ListOwnTrainingProducts: class { execute = mocks.listOwnExecute; } };
});

import { GET as GET_LIST, POST as POST_CREATE } from "@/app/api/coach/products/route";
import { PUT as PUT_DRAFT } from "@/app/api/coach/products/[id]/draft/route";
import { POST as POST_PUBLISH } from "@/app/api/coach/products/[id]/publish/route";
import { GET as GET_SALES } from "@/app/api/coach/products/[id]/sales/route";

const productCtx = { params: Promise.resolve({ id: "prod-1" }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.createDraftExecute.mockResolvedValue({ id: "prod-1" });
  mocks.updateDraftExecute.mockResolvedValue({ id: "prod-1", title: "Novo título" });
  mocks.saveVersionDraftExecute.mockResolvedValue({ id: "ver-1" });
  mocks.publishExecute.mockResolvedValue({ id: "ver-1", publishedAt: new Date().toISOString() });
  mocks.salesExecute.mockResolvedValue({ productId: "prod-1", totalPurchases: 0 });
  mocks.listOwnExecute.mockResolvedValue({ items: [], nextCursor: null });
});

describe("POST /api/coach/products [TM024]", () => {
  it("exige autenticação", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST_CREATE(new Request("http://localhost/api/coach/products", {
      method: "POST", body: JSON.stringify({ title: "X" }),
    }));
    expect(res.status).toBe(401);
    expect(mocks.createDraftExecute).not.toHaveBeenCalled();
  });

  it("cria e responde 201", async () => {
    const res = await POST_CREATE(new Request("http://localhost/api/coach/products", {
      method: "POST", body: JSON.stringify({ title: "Base 12 semanas" }),
    }));
    expect(res.status).toBe(201);
    expect(mocks.createDraftExecute).toHaveBeenCalledWith("user-1", { title: "Base 12 semanas" });
  });

  it("responde 404 seguro quando MARKETPLACE_ENABLED=false", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    const res = await POST_CREATE(new Request("http://localhost/api/coach/products", {
      method: "POST", body: JSON.stringify({ title: "X" }),
    }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "MARKETPLACE_DISABLED" });
    expect(mocks.createDraftExecute).not.toHaveBeenCalled();
  });

  it("propaga FORBIDDEN do caso de uso como 403", async () => {
    const { SchoolError } = await import("@/modules/school/domain/errors");
    mocks.createDraftExecute.mockRejectedValue(new SchoolError("FORBIDDEN", "Você não pode gerenciar esta escola.", 403));
    const res = await POST_CREATE(new Request("http://localhost/api/coach/products", {
      method: "POST", body: JSON.stringify({ schoolId: "school-1", title: "X" }),
    }));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/coach/products [TM027]", () => {
  it("exige autenticação", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET_LIST(new Request("http://localhost/api/coach/products"));
    expect(res.status).toBe(401);
    expect(mocks.listOwnExecute).not.toHaveBeenCalled();
  });

  it("lista com sessão e repassa/coage limit da query string", async () => {
    const res = await GET_LIST(new Request("http://localhost/api/coach/products?limit=5"));
    expect(res.status).toBe(200);
    expect(mocks.listOwnExecute).toHaveBeenCalledWith("user-1", expect.objectContaining({ limit: 5 }));
  });
});

describe("PUT /api/coach/products/[id]/draft [TM025]", () => {
  it("ignora productId do corpo e usa o id da URL para o produto", async () => {
    await PUT_DRAFT(new Request("http://localhost/x", {
      method: "PUT", body: JSON.stringify({ product: { productId: "injetado", expectedVersion: "2026-09-23T12:00:00.000Z", title: "Novo título" } }),
    }), productCtx);
    expect(mocks.updateDraftExecute).toHaveBeenCalledWith("user-1",
      expect.objectContaining({ productId: "prod-1", title: "Novo título" }));
  });

  it("salva o rascunho de versão quando o corpo traz `version`", async () => {
    await PUT_DRAFT(new Request("http://localhost/x", {
      method: "PUT", body: JSON.stringify({ version: { planPayload: { weeks: [] } } }),
    }), productCtx);
    expect(mocks.saveVersionDraftExecute).toHaveBeenCalledWith("user-1",
      expect.objectContaining({ productId: "prod-1", planPayload: { weeks: [] } }));
    expect(mocks.updateDraftExecute).not.toHaveBeenCalled();
  });

  it("expectedVersion obsoleto (409) é propagado", async () => {
    const { SchoolError } = await import("@/modules/school/domain/errors");
    mocks.updateDraftExecute.mockRejectedValue(new SchoolError("PRODUCT_UPDATE_CONFLICT", "O produto foi alterado.", 409));
    const res = await PUT_DRAFT(new Request("http://localhost/x", {
      method: "PUT", body: JSON.stringify({ product: { expectedVersion: "stale", title: "X" } }),
    }), productCtx);
    expect(res.status).toBe(409);
  });

  it("edição de produto de outro autor retorna 403", async () => {
    const { SchoolError } = await import("@/modules/school/domain/errors");
    mocks.updateDraftExecute.mockRejectedValue(new SchoolError("FORBIDDEN", "Você não pode alterar este produto.", 403));
    const res = await PUT_DRAFT(new Request("http://localhost/x", {
      method: "PUT", body: JSON.stringify({ product: { expectedVersion: "x", title: "X" } }),
    }), productCtx);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/coach/products/[id]/publish [TM026]", () => {
  it("publica usando o id da URL", async () => {
    const res = await POST_PUBLISH(new Request("http://localhost/x", { method: "POST" }), productCtx);
    expect(res.status).toBe(200);
    expect(mocks.publishExecute).toHaveBeenCalledWith("user-1", { productId: "prod-1" });
  });

  it("template inacessível vira erro do catálogo, não 500", async () => {
    const { SchoolError } = await import("@/modules/school/domain/errors");
    mocks.publishExecute.mockRejectedValue(new SchoolError("WORKOUT_TEMPLATE_NOT_ACCESSIBLE", "Template inacessível.", 403));
    const res = await POST_PUBLISH(new Request("http://localhost/x", { method: "POST" }), productCtx);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "WORKOUT_TEMPLATE_NOT_ACCESSIBLE" });
  });

  it("exige autenticação", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST_PUBLISH(new Request("http://localhost/x", { method: "POST" }), productCtx);
    expect(res.status).toBe(401);
    expect(mocks.publishExecute).not.toHaveBeenCalled();
  });
});

describe("GET /api/coach/products/[id]/sales [TM027]", () => {
  it("retorna o resumo agregado usando o id da URL", async () => {
    const res = await GET_SALES(new Request("http://localhost/x"), productCtx);
    expect(res.status).toBe(200);
    expect(mocks.salesExecute).toHaveBeenCalledWith("user-1", { productId: "prod-1" });
  });

  it("exige autenticação", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET_SALES(new Request("http://localhost/x"), productCtx);
    expect(res.status).toBe(401);
    expect(mocks.salesExecute).not.toHaveBeenCalled();
  });
});
