import { expect, it, describe } from "vitest";
import { createTrainingProduct } from "@/modules/school/domain/training-product";
import { createTrainingProductVersion } from "@/modules/school/domain/training-product-version";
import { createTrainingPurchase } from "@/modules/school/domain/training-purchase";
import { createTrainingLicense } from "@/modules/school/domain/training-license";
import { TrainingProductStatus, TrainingProductVisibility, TrainingLicenseStatus } from "@/modules/school/domain/enums";

const now = new Date("2026-09-16T12:00:00Z");
const id = (s: string) => s;

// ── TrainingProduct (T400) ────────────────────────────────────────────────────

describe("TrainingProduct [T400]", () => {
  const base = {
    id: id("prod-1"),
    schoolId: "school-1",
    coachId: null,
    title: "Base Triathlon 12 Weeks",
    description: "Build aerobic base.",
    sportType: "triathlon",
    durationWeeks: 12,
    visibility: TrainingProductVisibility.PUBLIC,
    priceCents: 4990,
    currency: "BRL",
  };

  it("creates with school owner and DRAFT default", () => {
    const p = createTrainingProduct(base, now);
    expect(p.status).toBe(TrainingProductStatus.DRAFT);
    expect(p.currentVersionId).toBeNull();
    expect(p.schoolId).toBe("school-1");
    expect(p.coachId).toBeNull();
  });

  it("creates with coach owner", () => {
    const p = createTrainingProduct({ ...base, schoolId: null, coachId: "coach-1" }, now);
    expect(p.coachId).toBe("coach-1");
    expect(p.schoolId).toBeNull();
  });

  it("rejects when both schoolId and coachId are set", () => {
    expect(() => createTrainingProduct({ ...base, coachId: "coach-1" }, now)).toThrow();
  });

  it("rejects when neither schoolId nor coachId is set", () => {
    expect(() => createTrainingProduct({ ...base, schoolId: null }, now)).toThrow();
  });

  it("allows free product (priceCents null, currency null)", () => {
    const p = createTrainingProduct({ ...base, priceCents: null, currency: null }, now);
    expect(p.priceCents).toBeNull();
    expect(p.currency).toBeNull();
  });

  it("rejects priceCents without currency", () => {
    expect(() => createTrainingProduct({ ...base, currency: null }, now)).toThrow();
  });

  it("rejects currency without priceCents", () => {
    expect(() => createTrainingProduct({ ...base, priceCents: null }, now)).toThrow();
  });

  it("trims title", () => {
    const p = createTrainingProduct({ ...base, title: "  Plan  " }, now);
    expect(p.title).toBe("Plan");
  });
});

// ── TrainingProductVersion (T401) ─────────────────────────────────────────────

describe("TrainingProductVersion [T401]", () => {
  const basePayload = {
    weeks: [
      { week: 1, days: [{ workoutTemplateId: "tpl-1", dayOfWeek: 1 }] },
      { week: 2, days: [{ workoutTemplateId: "tpl-2", dayOfWeek: 3 }] },
    ],
  };

  it("creates a published version", () => {
    const v = createTrainingProductVersion({
      id: "ver-1",
      productId: "prod-1",
      versionNumber: 1,
      planPayload: basePayload,
      changeNote: "Initial version",
      publishedAt: now,
    }, now);
    expect(v.versionNumber).toBe(1);
    expect(v.planPayload.weeks).toHaveLength(2);
    expect(v.publishedAt).toEqual(now);
  });

  it("creates an unpublished (draft) version", () => {
    const v = createTrainingProductVersion({
      id: "ver-2", productId: "prod-1", versionNumber: 2,
      planPayload: basePayload, changeNote: null, publishedAt: null,
    }, now);
    expect(v.publishedAt).toBeNull();
  });

  it("rejects plan with no weeks", () => {
    expect(() => createTrainingProductVersion({
      id: "ver-3", productId: "prod-1", versionNumber: 1,
      planPayload: { weeks: [] }, changeNote: null, publishedAt: null,
    }, now)).toThrow();
  });

  it("rejects a day with invalid dayOfWeek", () => {
    const badPayload = { weeks: [{ week: 1, days: [{ workoutTemplateId: "t", dayOfWeek: 8 }] }] };
    expect(() => createTrainingProductVersion({
      id: "v", productId: "p", versionNumber: 1,
      planPayload: badPayload, changeNote: null, publishedAt: null,
    }, now)).toThrow();
  });
});

// ── TrainingPurchase (T402) ───────────────────────────────────────────────────

describe("TrainingPurchase [T402]", () => {
  const base = {
    id: "pur-1",
    productId: "prod-1",
    athleteId: "user-1",
    paymentRef: "ch_stripe_123",
    pricePaid: 4990,
    currency: "BRL",
  };

  it("creates with PENDING default", () => {
    const p = createTrainingPurchase(base, now);
    expect(p.status).toBe("PENDING");
    expect(p.purchasedAt).toEqual(now);
  });

  it("accepts free purchase (pricePaid null, currency null, paymentRef null)", () => {
    const p = createTrainingPurchase({ ...base, pricePaid: null, currency: null, paymentRef: null }, now);
    expect(p.pricePaid).toBeNull();
  });

  it("rejects mismatched pricePaid/currency", () => {
    expect(() => createTrainingPurchase({ ...base, currency: null }, now)).toThrow();
  });
});

// ── TrainingLicense (T403) ────────────────────────────────────────────────────

describe("TrainingLicense [T403]", () => {
  const base = {
    id: "lic-1",
    productId: "prod-1",
    versionId: "ver-1",
    purchaseId: "pur-1",
    athleteId: "user-1",
    startedAt: now,
    expiresAt: new Date("2026-12-16T12:00:00Z"),
    revokedAt: null,
  };

  it("creates with ACTIVE default and calendarInstantiated=false", () => {
    const l = createTrainingLicense(base, now);
    expect(l.status).toBe(TrainingLicenseStatus.ACTIVE);
    expect(l.calendarInstantiated).toBe(false);
  });

  it("creates a license without a purchase (free product)", () => {
    const l = createTrainingLicense({ ...base, purchaseId: null }, now);
    expect(l.purchaseId).toBeNull();
  });

  it("allows REVOKED status when revokedAt is set", () => {
    const l = createTrainingLicense({
      ...base, status: TrainingLicenseStatus.REVOKED, revokedAt: now,
    }, now);
    expect(l.status).toBe(TrainingLicenseStatus.REVOKED);
    expect(l.revokedAt).toEqual(now);
  });

  it("rejects REVOKED without revokedAt", () => {
    expect(() => createTrainingLicense({ ...base, status: TrainingLicenseStatus.REVOKED }, now)).toThrow();
  });

  it("rejects revokedAt when status is not REVOKED", () => {
    expect(() => createTrainingLicense({ ...base, revokedAt: now }, now)).toThrow();
  });

  it("rejects expiresAt before startedAt", () => {
    expect(() => createTrainingLicense({
      ...base, expiresAt: new Date("2026-09-15T00:00:00Z"),
    }, now)).toThrow();
  });
});
