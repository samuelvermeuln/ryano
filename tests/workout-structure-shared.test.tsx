// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  ComplianceBreakdown,
  formatComplianceScore,
  PrescribedVsExecuted,
  WorkoutStructureSection,
  type WorkoutStructureBlock,
} from "@/components/school/workout-structure";

/**
 * SAM-11 — the prescription renderers shared by the school's administration sheet
 * and the coach's athlete hub.
 *
 * These exist so the two screens cannot disagree about what a block or an
 * adherence score means, so the tests pin the shared meaning: units, the
 * distinction between "no structure" and "a plan session not yet instantiated",
 * and the fact that a dimension nobody prescribed is not presented as if it had
 * been.
 */
function block(overrides: Partial<WorkoutStructureBlock> = {}): WorkoutStructureBlock {
  return {
    id: "block-1",
    blockType: "INTERVAL",
    title: null,
    durationS: 600,
    distanceM: null,
    repetitions: null,
    targets: [],
    restTargets: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("formatComplianceScore", () => {
  it("reads a 0–100 score as x/10, the way the whole product shows it", () => {
    expect(formatComplianceScore(90)).toBe("9.0/10");
    expect(formatComplianceScore(0)).toBe("0.0/10");
    expect(formatComplianceScore(100)).toBe("10.0/10");
  });
});

describe("WorkoutStructureSection", () => {
  it("numbers the blocks and shows the prescribed repetitions", () => {
    render(
      <WorkoutStructureSection
        blocks={[
          block({ id: "a", blockType: "WARMUP", durationS: 600 }),
          block({ id: "b", repetitions: 8, distanceM: 400, durationS: null }),
        ]}
        sourceLabel={null}
      />,
    );

    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText(/8×/)).toBeTruthy();
  });

  it("shows the intensity targets and the rest separately", () => {
    render(
      <WorkoutStructureSection
        blocks={[block({ targets: ["160–175 bpm"], restTargets: ["Zona 1"] })]}
        sourceLabel={null}
      />,
    );

    expect(screen.getByText("160–175 bpm")).toBeTruthy();
    expect(screen.getByText("Descanso:")).toBeTruthy();
    expect(screen.getByText("Zona 1")).toBeTruthy();
  });

  it("distinguishes a plan session not yet instantiated from a workout with no structure", () => {
    render(<WorkoutStructureSection blocks={null} sourceLabel="Marketplace: Corrida 5km" />);
    expect(screen.getByText(/Sessão do plano “Marketplace: Corrida 5km”/)).toBeTruthy();

    cleanup();
    render(<WorkoutStructureSection blocks={null} sourceLabel={null} />);
    expect(screen.getByText("Este treino não tem estrutura detalhada.")).toBeTruthy();
  });

  it("treats an empty block list as no structure at all", () => {
    render(<WorkoutStructureSection blocks={[]} sourceLabel={null} />);

    expect(screen.getByText("Este treino não tem estrutura detalhada.")).toBeTruthy();
  });
});

describe("PrescribedVsExecuted", () => {
  const execution = {
    source: "garmin",
    startedLabel: "30/09/2026 09:00",
    durationSeconds: 1800,
    distanceMeters: 5000,
    averageHeartRate: 150,
    averagePower: null,
    complianceScore: 90,
  };

  it("compares both sides of each dimension and states the origin", () => {
    render(
      <PrescribedVsExecuted
        targetDurationSeconds={1800}
        targetDistanceMeters={5000}
        execution={execution}
      />,
    );

    expect(screen.getByText("Prescrito × Realizado")).toBeTruthy();
    expect(screen.getByText(/origem garmin/)).toBeTruthy();
    expect(screen.getByText("9.0/10")).toBeTruthy();
  });

  it("omits a dimension neither side has, instead of showing an empty row", () => {
    render(
      <PrescribedVsExecuted
        targetDurationSeconds={1800}
        targetDistanceMeters={null}
        execution={{ ...execution, distanceMeters: null }}
      />,
    );

    expect(screen.queryByText("Distância")).toBeNull();
    expect(screen.getByText("Duração")).toBeTruthy();
  });

  it("shows a dash on the prescribed side of a measured-only dimension", () => {
    render(
      <PrescribedVsExecuted targetDurationSeconds={null} targetDistanceMeters={null} execution={execution} />,
    );

    // Heart rate has no single comparable prescribed number — the block targets
    // are ranges, shown in the structure above.
    const row = screen.getByText("FC média").closest("tr");
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText("—")).toBeTruthy();
    expect(within(row as HTMLElement).getByText(/150/)).toBeTruthy();
  });

  it("shows a dash for adherence that was never calculated", () => {
    render(
      <PrescribedVsExecuted
        targetDurationSeconds={1800}
        targetDistanceMeters={null}
        execution={{ ...execution, complianceScore: null }}
      />,
    );

    const row = screen.getByText("Aderência").closest("tr");
    expect(within(row as HTMLElement).queryByText(/\/10/)).toBeNull();
  });
});

describe("ComplianceBreakdown", () => {
  it("labels the known dimensions and keeps the overall score", () => {
    render(<ComplianceBreakdown overallScore={85} breakdown={{ distance: 90, duration: 80 }} />);

    expect(screen.getByText("8.5/10")).toBeTruthy();
    expect(screen.getByText("Distância")).toBeTruthy();
    expect(screen.getByText("Duração")).toBeTruthy();
    expect(screen.getByText("9.0")).toBeTruthy();
  });

  it("shows an unknown dimension under its raw name rather than dropping it", () => {
    // A dimension added to the calculator must be visible the day it is stored,
    // not the day someone remembers to add a label for it.
    render(<ComplianceBreakdown overallScore={70} breakdown={{ novaDimensao: 70 }} />);

    expect(screen.getByText("novaDimensao")).toBeTruthy();
  });

  it("still shows the overall score when the breakdown is empty", () => {
    render(<ComplianceBreakdown overallScore={60} breakdown={{}} />);

    expect(screen.getByText("6.0/10")).toBeTruthy();
  });
});
