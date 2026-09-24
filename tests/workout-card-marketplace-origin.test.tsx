// @vitest-environment jsdom
/**
 * TM045 (RF-110) — WorkoutCard must show marketplace origin/plan/authorship
 * and link back to /app/planos/[licenseId] for sessions with workoutId=null
 * + trainingLicenseId set — never the generic "Treino agendado" label when a
 * title (template or plan) is known, and never the dead "#" link the school
 * path fell back to before this task for marketplace-sourced rows.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { WorkoutCard } from "@/app/app/treinos/workout-card";
import type { AssignmentWithDetails } from "@/app/app/treinos/queries";

afterEach(() => {
  cleanup();
});

function baseAssignment(over: Partial<AssignmentWithDetails> = {}): AssignmentWithDetails {
  return {
    id: "assignment-1",
    workoutId: null,
    workoutTemplateId: "tpl-1",
    athleteId: "athlete-1",
    assignedBy: null,
    schoolId: null,
    coachId: null,
    teamId: null,
    scheduledAt: new Date("2026-09-23T12:00:00Z"),
    dueAt: new Date("2026-09-24T00:00:00Z"),
    status: "SCHEDULED",
    matchStatus: null,
    matchedActivityId: null,
    matchedAt: null,
    matchScore: null,
    trainingLicenseId: null,
    planSessionId: null,
    originalSnapshot: null,
    effectiveRevisionId: null,
    adjustedByCoachId: null,
    sourceLabel: null,
    adaptationVersion: 0,
    garminWorkoutId: null,
    garminPushStatus: null,
    garminPushedAt: null,
    garminPushError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    workout: null,
    workoutTemplate: { title: "Treino de base", sportType: "running" },
    school: null,
    coach: null,
    trainingLicense: null,
    executions: [],
    ...over,
  } as unknown as AssignmentWithDetails;
}

describe("WorkoutCard — origem do marketplace [TM045]", () => {
  it("sessão do marketplace mostra o selo 'Marketplace', a autoria e linka para /app/planos/[licenseId]", () => {
    render(<WorkoutCard assignment={baseAssignment({
      trainingLicenseId: "lic-1",
      trainingLicense: { id: "lic-1", product: { title: "Plano 5k", coach: { displayName: "Coach A" }, school: null } },
    } as never)} />);

    expect(screen.getByText("Marketplace")).not.toBeNull();
    expect(screen.getByText("Coach A")).not.toBeNull();
    expect(screen.getByText("Treino de base")).not.toBeNull(); // template title still wins over "Treino agendado"

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/app/planos/lic-1");
  });

  it("sessão do marketplace sem título de template cai no título do plano, nunca em '#' nem em rótulo genérico", () => {
    render(<WorkoutCard assignment={baseAssignment({
      workoutTemplate: null,
      trainingLicenseId: "lic-2",
      trainingLicense: { id: "lic-2", product: { title: "Plano 10k", coach: null, school: { name: "Escola X" } } },
    } as never)} />);

    expect(screen.getByText("Plano 10k")).not.toBeNull();
    expect(screen.getByText("Escola X")).not.toBeNull();
    expect(screen.queryByText("Treino agendado")).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/app/planos/lic-2");
  });

  it("sessão de escola (comportamento existente) não mostra o selo 'Marketplace' e mantém o link para /atleta/.../treinos/...", () => {
    render(<WorkoutCard assignment={baseAssignment({
      school: { id: "school-1", name: "Escola Y", slug: "escola-y" },
    } as never)} />);

    expect(screen.queryByText("Marketplace")).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/atleta/school-1/treinos/assignment-1");
  });

  it("sessão sem escola e sem licença (caso hoje inexistente, mas defensivo) cai em '#'", () => {
    render(<WorkoutCard assignment={baseAssignment()} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("#");
  });
});
