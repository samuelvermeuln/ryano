/**
 * TM033/TM034 — `GET /api/marketplace/products` and
 * `GET /api/marketplace/products/[idDoTreino]`.
 *
 * Both are explicitly public (no session) and thin adapters — what needs
 * testing at this boundary is: the flag gate (RNF-009), that query-string
 * parsing normalizes bad input instead of ever reaching the use case with
 * it, the `{ items, nextCursor }` envelope, and that the error catalogue's
 * codes/status propagate untouched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listExecute: vi.fn(),
  detailExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/list-marketplace-products", async () => {
  const actual = await vi.importActual<typeof import("@/modules/school/application/list-marketplace-products")>(
    "@/modules/school/application/list-marketplace-products",
  );
  return {
    ...actual,
    ListMarketplaceProducts: class {
      execute = mocks.listExecute;
    },
  };
});
vi.mock("@/modules/school/application/get-marketplace-product-detail", () => ({
  GetMarketplaceProductDetail: class {
    execute = mocks.detailExecute;
  },
}));

import { GET as GET_LIST } from "@/app/api/marketplace/products/route";
import { GET as GET_DETAIL } from "@/app/api/marketplace/products/[idDoTreino]/route";
import { SchoolError } from "@/modules/school/domain/errors";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.listExecute.mockResolvedValue({ items: [], nextCursor: null });
  mocks.detailExecute.mockResolvedValue({ id: "p1" });
});

describe("GET /api/marketplace/products [TM033]", () => {
  it("responde 404 seguro quando a flag do marketplace está desligada (RNF-009)", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    const res = await GET_LIST(new Request("http://localhost/api/marketplace/products"));
    expect(res.status).toBe(404);
    expect(mocks.listExecute).not.toHaveBeenCalled();
  });

  it("não exige sessão — rota explicitamente pública", async () => {
    const res = await GET_LIST(new Request("http://localhost/api/marketplace/products"));
    expect(res.status).toBe(200);
  });

  it("repassa filtros da query string, coagindo tipos", async () => {
    const res = await GET_LIST(new Request(
      "http://localhost/api/marketplace/products?q=corrida&sportType=run&weeksMin=4&weeksMax=12&priceMin=0&priceMax=5000&minRating=4&free=false&limit=10",
    ));
    expect(res.status).toBe(200);
    expect(mocks.listExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "corrida", sportType: ["run"], weeksMin: 4, weeksMax: 12,
        priceMin: 0, priceMax: 5000, minRating: 4, free: false, limit: 10,
      }),
    );
  });

  it("URL inválida é normalizada (400) sem chegar ao caso de uso — nunca expõe rascunho por erro", async () => {
    const res = await GET_LIST(new Request("http://localhost/api/marketplace/products?weeksMin=abc"));
    expect(res.status).toBe(400);
    expect(mocks.listExecute).not.toHaveBeenCalled();
  });

  it("ignora status/visibility mesmo se alguém tentar passá-los na query string", async () => {
    const res = await GET_LIST(new Request("http://localhost/api/marketplace/products?status=DRAFT&visibility=SCHOOL_ONLY"));
    // querySchema.strictObject rejeita chaves desconhecidas -> 400, nunca vaza.
    expect(res.status).toBe(400);
    expect(mocks.listExecute).not.toHaveBeenCalled();
  });

  it("resposta segue o envelope { items, nextCursor }", async () => {
    mocks.listExecute.mockResolvedValue({ items: [{ id: "p1" }], nextCursor: "abc" });
    const res = await GET_LIST(new Request("http://localhost/api/marketplace/products"));
    const body = await res.json();
    expect(body).toEqual({ items: [{ id: "p1" }], nextCursor: "abc" });
  });
});

describe("GET /api/marketplace/products/[idDoTreino] [TM034]", () => {
  const ctx = (idDoTreino: string) => ({ params: Promise.resolve({ idDoTreino }) });

  it("responde 404 seguro quando a flag do marketplace está desligada", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    const res = await GET_DETAIL(new Request("http://localhost/x"), ctx("p1"));
    expect(res.status).toBe(404);
    expect(mocks.detailExecute).not.toHaveBeenCalled();
  });

  it("não exige sessão — rota explicitamente pública", async () => {
    const res = await GET_DETAIL(new Request("http://localhost/x"), ctx("p1"));
    expect(res.status).toBe(200);
    expect(mocks.detailExecute).toHaveBeenCalledWith({ idOrSlug: "p1" });
  });

  it("propaga PRODUCT_VISIBILITY_DENIED do caso de uso como 404, sem vazar detalhes", async () => {
    mocks.detailExecute.mockRejectedValue(new SchoolError("PRODUCT_VISIBILITY_DENIED", "Este treino não está disponível."));
    const res = await GET_DETAIL(new Request("http://localhost/x"), ctx("nao-existe"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "PRODUCT_VISIBILITY_DENIED" });
  });
});
