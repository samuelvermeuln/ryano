/**
 * TM084 — server actions on /app/planos/[licenseId] (accept/decline
 * adaptations, revoke engagement, invite coach). Each is a thin wrapper over
 * its Onda 3 use case — this test verifies the wiring (right actor, right
 * args) and that a thrown SchoolError redirects with an error message
 * instead of crashing the request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOnboardedSession: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  revalidatePath: vi.fn(),
  inviteExecute: vi.fn(),
  decideExecute: vi.fn(),
  revokeExecute: vi.fn(),
  activateExecute: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth-guards", () => ({ requireOnboardedSession: mocks.requireOnboardedSession }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/modules/school/application/activate-training-license", () => ({
  ActivateTrainingLicense: class { execute = mocks.activateExecute; },
}));
vi.mock("@/modules/school/application/invite-coach-to-license", () => ({
  InviteCoachToLicense: class { execute = mocks.inviteExecute; },
}));
vi.mock("@/modules/school/application/decide-plan-adaptation", () => ({
  DecidePlanAdaptation: class { execute = mocks.decideExecute; },
}));
vi.mock("@/modules/school/application/revoke-coach-engagement", () => ({
  RevokeCoachEngagement: class { execute = mocks.revokeExecute; },
}));

import { decideAdaptationAction, inviteCoachAction, revokeCoachEngagementAction } from "@/app/app/planos/[licenseId]/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOnboardedSession.mockResolvedValue({ user: { id: "athlete-1" } });
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
});

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

describe("inviteCoachAction [TM084]", () => {
  it("escopo completo — envia scope:{full:true}", async () => {
    mocks.inviteExecute.mockResolvedValue({ id: "eng-1" });
    await expect(inviteCoachAction("lic-1", formData({ coachId: "coach-1", scopeMode: "full" })))
      .rejects.toThrow("REDIRECT:/app/planos/lic-1");
    expect(mocks.inviteExecute).toHaveBeenCalledWith("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { full: true } });
  });

  it("escopo parcial — filtra sportTypes não canônicos", async () => {
    mocks.inviteExecute.mockResolvedValue({ id: "eng-1" });
    await expect(inviteCoachAction("lic-1", formData({ coachId: "coach-1", scopeMode: "partial", sportTypes: "run, not-a-sport, swim" })))
      .rejects.toThrow("REDIRECT:/app/planos/lic-1");
    expect(mocks.inviteExecute).toHaveBeenCalledWith("athlete-1", { licenseId: "lic-1", coachId: "coach-1", scope: { sportTypes: ["run", "swim"] } });
  });

  it("erro do caso de uso redireciona com mensagem, não propaga exceção crua", async () => {
    mocks.inviteExecute.mockRejectedValue(new Error("Já existe um professor acompanhante com escopo conflitante nesta licença."));
    await expect(inviteCoachAction("lic-1", formData({ coachId: "coach-1", scopeMode: "full" })))
      .rejects.toThrow(/^REDIRECT:\/app\/planos\/lic-1\?error=/);
  });
});

describe("revokeCoachEngagementAction [TM084]", () => {
  it("chama RevokeCoachEngagement com licenseId e coachId", async () => {
    mocks.revokeExecute.mockResolvedValue({ revokedEngagementIds: ["eng-1"] });
    await expect(revokeCoachEngagementAction("lic-1", "coach-1")).rejects.toThrow("REDIRECT:/app/planos/lic-1");
    expect(mocks.revokeExecute).toHaveBeenCalledWith("athlete-1", { licenseId: "lic-1", coachId: "coach-1" });
  });
});

describe("decideAdaptationAction [TM084]", () => {
  it("ACCEPT delega para DecidePlanAdaptation com a decisão correta", async () => {
    mocks.decideExecute.mockResolvedValue({ adaptation: { status: "ACCEPTED" }, assignment: {} });
    await expect(decideAdaptationAction("lic-1", "adapt-1", "ACCEPT")).rejects.toThrow("REDIRECT:/app/planos/lic-1");
    expect(mocks.decideExecute).toHaveBeenCalledWith("athlete-1", { licenseId: "lic-1", adaptationId: "adapt-1", decision: "ACCEPT" });
  });

  it("DECLINE delega para DecidePlanAdaptation com a decisão correta", async () => {
    mocks.decideExecute.mockResolvedValue({ adaptation: { status: "DECLINED" }, assignment: null });
    await expect(decideAdaptationAction("lic-1", "adapt-1", "DECLINE")).rejects.toThrow("REDIRECT:/app/planos/lic-1");
    expect(mocks.decideExecute).toHaveBeenCalledWith("athlete-1", { licenseId: "lic-1", adaptationId: "adapt-1", decision: "DECLINE" });
  });
});
