/**
 * TM012 — catálogo de erros do marketplace.
 */
import { describe, expect, it } from "vitest";
import { SCHOOL_ERROR_STATUS, SchoolError } from "@/modules/school/domain/errors";

describe("SCHOOL_ERROR_STATUS — códigos do marketplace [TM012]", () => {
  const expected: Record<string, number> = {
    PRODUCT_VISIBILITY_DENIED: 404,
    LICENSE_ALREADY_ACTIVE: 409,
    PURCHASE_IDEMPOTENCY_CONFLICT: 409,
    REVIEW_NOT_ELIGIBLE: 403,
    REVIEW_ALREADY_EXISTS: 409,
    ENGAGEMENT_ALREADY_ACTIVE: 409,
    ADAPTATION_VERSION_CONFLICT: 409,
    INVALID_CALLBACK_URL: 400,
    // TM072-081 (Onda 3 — RF-301-305)
    ENGAGEMENT_SCOPE_CONFLICT: 409,
    ENGAGEMENT_NOT_PENDING: 409,
    ADAPTATION_NOT_PENDING: 409,
    ENGAGEMENT_NOT_FOUND: 404,
    ADAPTATION_NOT_FOUND: 404,
    WORKOUT_ASSIGNMENT_NOT_FOUND: 404,
    ENGAGEMENT_INVALID_TARGET: 422,
    // Já usados ad-hoc por CreateTrainingPurchase/InstantiateLicenseCalendar
    // (T405/T406) com status explícito — agora também no catálogo.
    PRODUCT_NOT_FOUND: 404,
    PRODUCT_NOT_AVAILABLE: 409,
    PRODUCT_NO_VERSION: 409,
    PAYMENT_REF_REQUIRED: 422,
    LICENSE_NOT_FOUND: 404,
    LICENSE_NOT_ACTIVE: 409,
    VERSION_NOT_FOUND: 404,
  };

  it.each(Object.entries(expected))("%s -> %i", (code, status) => {
    expect(SCHOOL_ERROR_STATUS[code]).toBe(status);
  });

  it("SchoolError sem status explícito usa o catálogo", () => {
    const err = new SchoolError("REVIEW_NOT_ELIGIBLE", "not eligible");
    expect(err.status).toBe(403);
  });
});
