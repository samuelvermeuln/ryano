/**
 * TM085 — RF-305 precedence: scope schema + conflict detection used by
 * InviteCoachToLicense (TM072, invite-time rejection) and
 * ProposePlanAdaptation (TM074, per-assignment enforcement).
 */
import { describe, expect, it } from "vitest";
import {
  licenseCoachEngagementScopeSchema, scopesConflict, scopeIncludesSportType, isFullScope,
} from "@/modules/school/domain/license-coach-scope";

describe("licenseCoachEngagementScopeSchema [TM085]", () => {
  it("aceita escopo completo", () => {
    expect(licenseCoachEngagementScopeSchema.parse({ full: true })).toEqual({ full: true });
  });

  it("aceita escopo parcial por modalidades canônicas", () => {
    expect(licenseCoachEngagementScopeSchema.parse({ sportTypes: ["run", "swim"] })).toEqual({ sportTypes: ["run", "swim"] });
  });

  it("rejeita modalidade não canônica", () => {
    expect(() => licenseCoachEngagementScopeSchema.parse({ sportTypes: ["futebol-de-salao-livre"] })).toThrow();
  });

  it("rejeita sportTypes vazio", () => {
    expect(() => licenseCoachEngagementScopeSchema.parse({ sportTypes: [] })).toThrow();
  });

  it("rejeita mistura de full e sportTypes na mesma forma (strictObject)", () => {
    expect(() => licenseCoachEngagementScopeSchema.parse({ full: true, sportTypes: ["run"] })).toThrow();
  });
});

describe("isFullScope", () => {
  it("true só para { full: true }", () => {
    expect(isFullScope({ full: true })).toBe(true);
    expect(isFullScope({ sportTypes: ["run"] })).toBe(false);
  });
});

describe("scopesConflict [RF-305]", () => {
  it("full sempre conflita com qualquer outro escopo", () => {
    expect(scopesConflict({ full: true }, { full: true })).toBe(true);
    expect(scopesConflict({ full: true }, { sportTypes: ["run"] })).toBe(true);
    expect(scopesConflict({ sportTypes: ["run"] }, { full: true })).toBe(true);
  });

  it("dois escopos parciais com modalidades disjuntas NÃO conflitam (coach de natação convive com coach de corrida)", () => {
    expect(scopesConflict({ sportTypes: ["swim"] }, { sportTypes: ["run"] })).toBe(false);
  });

  it("dois escopos parciais com modalidade em comum conflitam", () => {
    expect(scopesConflict({ sportTypes: ["run", "bike"] }, { sportTypes: ["bike"] })).toBe(true);
  });
});

describe("scopeIncludesSportType", () => {
  it("full inclui qualquer modalidade", () => {
    expect(scopeIncludesSportType({ full: true }, "run")).toBe(true);
    expect(scopeIncludesSportType({ full: true }, "swim")).toBe(true);
  });

  it("parcial só inclui as modalidades concedidas", () => {
    expect(scopeIncludesSportType({ sportTypes: ["swim"] }, "swim")).toBe(true);
    expect(scopeIncludesSportType({ sportTypes: ["swim"] }, "run")).toBe(false);
  });
});
