/**
 * TM048 — `POST /api/marketplace/products/[idDoTreino]/reviews`.
 * Authenticated (schoolResponse), thin adapter over CreateMarketplaceReview.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  reviewExecute: vi.fn(),
  env: { SCHOOL_MODULE_ENABLED: "true", MARKETPLACE_ENABLED: "true" },
}));

vi.mock("@/server/env", () => ({ env: mocks.env }));
vi.mock("@/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/create-marketplace-review", () => ({
  CreateMarketplaceReview: class {
    execute = mocks.reviewExecute;
  },
}));

import { POST } from "@/app/api/marketplace/products/[idDoTreino]/reviews/route";
import { SchoolError } from "@/modules/school/domain/errors";

const ctx = () => ({ params: Promise.resolve({ idDoTreino: "prod-1" }) });
const req = (body: unknown) => new Request("http://test/api/marketplace/products/prod-1/reviews", {
  method: "POST", body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SCHOOL_MODULE_ENABLED = "true";
  mocks.env.MARKETPLACE_ENABLED = "true";
  mocks.auth.mockResolvedValue({ user: { id: "athlete-1" } });
  mocks.reviewExecute.mockResolvedValue({ id: "review-1", stars: 5 });
});

describe("POST /api/marketplace/products/[idDoTreino]/reviews [TM048]", () => {
  it("exige sessão (401 sem auth)", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(req({ purchaseId: "pur-1", stars: 5 }), ctx());
    expect(res.status).toBe(401);
    expect(mocks.reviewExecute).not.toHaveBeenCalled();
  });

  it("404 quando o marketplace está desligado", async () => {
    mocks.env.MARKETPLACE_ENABLED = "false";
    mocks.env.SCHOOL_MODULE_ENABLED = "false";
    const res = await POST(req({ purchaseId: "pur-1", stars: 5 }), ctx());
    expect(res.status).toBe(404);
  });

  it("delega ao caso de uso com productId da URL, não do corpo", async () => {
    await POST(req({ purchaseId: "pur-1", stars: 5, productId: "outro-produto" }), ctx());
    expect(mocks.reviewExecute).toHaveBeenCalledWith("athlete-1", expect.objectContaining({ productId: "prod-1" }));
  });

  it("propaga REVIEW_NOT_ELIGIBLE do caso de uso sem modificar o código", async () => {
    mocks.reviewExecute.mockRejectedValue(new SchoolError("REVIEW_NOT_ELIGIBLE", "not eligible"));
    const res = await POST(req({ purchaseId: "pur-1", stars: 5 }), ctx());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("REVIEW_NOT_ELIGIBLE");
  });

  it("201 em sucesso", async () => {
    const res = await POST(req({ purchaseId: "pur-1", stars: 5 }), ctx());
    expect(res.status).toBe(201);
  });
});
