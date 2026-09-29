// @vitest-environment jsdom
/**
 * The school's athlete sheet opens a workout in a modal (architecture/rules/ui.md)
 * and is where administration asks a coach to revise a prescription. This covers
 * what the E2E spec cannot prove without a database: the modal contract and the
 * three states of the revision request.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// coach-actions.tsx imports the "use server" module; the panel test only cares
// that the forms render, not what the actions do.
vi.mock("@/app/escola/[schoolId]/professores/actions", () => ({
  cancelWorkoutChangeAction: vi.fn(),
  deactivateCoachAction: vi.fn(),
  inviteCoachAction: vi.fn(),
  requestWorkoutChangeAction: vi.fn(),
  assignAthleteToCoachAction: vi.fn(),
}));

import {
  AthleteTrainingPanel,
  type TrainingItem,
} from "@/app/escola/[schoolId]/atletas/[athleteId]/athlete-training-panel";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function item(over: Partial<TrainingItem> = {}): TrainingItem {
  return {
    id: "assignment-1",
    dateLabel: "seg., 28/09/26",
    title: "Longo de domingo",
    sportLabel: "Corrida",
    status: "SCHEDULED",
    overdue: false,
    team: "Turma A",
    coach: { id: "coach-1", name: "Prof. Carlos" },
    description: "Rodagem leve, sem forçar.",
    blocks: [
      {
        id: "block-1", blockType: "WARMUP", title: null, durationS: 600, distanceM: null,
        repetitions: null, targets: ["FC: 120–140 bpm"], restTargets: [],
      },
      {
        id: "block-2", blockType: "INTERVAL", title: "Tiros de 400 m", durationS: 120, distanceM: 400,
        repetitions: 6, targets: ["Pace: 4:30 /km"], restTargets: ["Zona 1"],
      },
    ],
    sourceLabel: null,
    targetDurationSeconds: 720,
    targetDistanceMeters: 400,
    execution: null,
    changeRequests: [],
    ...over,
  };
}

const openRequest = {
  id: "request-1", status: "PENDING", reason: "Reduzir o volume", resolutionNote: null,
  requesterName: "Dono da escola", createdLabel: "28/09/2026",
};

function renderPanel(items: TrainingItem[]) {
  return render(<AthleteTrainingPanel schoolId="school-1" items={items} />);
}

function openDetail(title: string) {
  fireEvent.click(screen.getByRole("button", { name: `Ver treino ${title}` }));
  return screen.getByRole("dialog");
}

describe("AthleteTrainingPanel — list", () => {
  it("shows overdue work as such and surfaces an open revision request on the row", () => {
    renderPanel([
      item({ id: "late", title: "Treino vencido", overdue: true }),
      item({ id: "asked", title: "Com pedido", changeRequests: [openRequest] }),
    ]);

    const lateRow = screen.getByRole("row", { name: /Treino vencido/ });
    expect(within(lateRow).getByText("Atrasado")).toBeTruthy();
    expect(within(lateRow).queryByText("Agendado")).toBeNull();
    expect(screen.getByText("Alteração: Aguardando professor")).toBeTruthy();
  });

  it("summarises what was executed on the row", () => {
    renderPanel([
      item({
        status: "COMPLETED",
        execution: {
          source: "strava", startedLabel: "20/09/2026 09:00", durationSeconds: 1750,
          distanceMeters: 5100, averageHeartRate: 150, averagePower: null, complianceScore: 87,
        },
      }),
    ]);

    const row = screen.getByRole("row", { name: /Longo de domingo/ });
    expect(within(row).getByText(/8\.7\/10/)).toBeTruthy();
    expect(within(row).getByText("Concluído")).toBeTruthy();
  });

  it("shows a dash instead of an execution for work not done yet", () => {
    renderPanel([item()]);
    const row = screen.getByRole("row", { name: /Longo de domingo/ });
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("AthleteTrainingPanel — modal contract (rules/ui.md)", () => {
  it("opens a labelled, modal dialog with the full workout structure", () => {
    renderPanel([item()]);
    const dialog = openDetail("Longo de domingo");

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Longo de domingo");
    expect(within(dialog).getByText("Estrutura do treino")).toBeTruthy();
    expect(within(dialog).getByText("Aquecimento")).toBeTruthy();
    expect(within(dialog).getByText("6× Tiros de 400 m")).toBeTruthy();
    expect(within(dialog).getByText("FC: 120–140 bpm")).toBeTruthy();
    expect(within(dialog).getByText("Pace: 4:30 /km")).toBeTruthy();
    expect(within(dialog).getByText("Zona 1")).toBeTruthy();
    expect(within(dialog).getByText("Rodagem leve, sem forçar.")).toBeTruthy();
  });

  it("renders through a portal on document.body, outside the list's container", () => {
    const { container } = renderPanel([item()]);
    const dialog = openDetail("Longo de domingo");

    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("closes on Escape", () => {
    renderPanel([item()]);
    openDetail("Longo de domingo");

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the backdrop is clicked, but not when the dialog itself is", () => {
    renderPanel([item()]);
    const dialog = openDetail("Longo de domingo");

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeNull();

    // Two "Fechar" controls exist: the backdrop (first, in DOM order) and the ✕.
    const [backdrop] = screen.getAllByRole("button", { name: "Fechar", hidden: true });
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("locks page scroll while open and restores the previous value", () => {
    document.body.style.overflow = "scroll";
    renderPanel([item()]);

    openDetail("Longo de domingo");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("explains a prescription that has no structured workout", () => {
    renderPanel([item({ blocks: null, sourceLabel: "Marketplace: Corrida 5km", description: null })]);
    const dialog = openDetail("Longo de domingo");

    expect(within(dialog).getByText(/Sessão do plano “Marketplace: Corrida 5km”/)).toBeTruthy();
  });

  it("compares prescribed and executed work when there is an execution", () => {
    renderPanel([
      item({
        status: "COMPLETED",
        execution: {
          source: "garmin", startedLabel: "20/09/2026 09:00", durationSeconds: 780,
          distanceMeters: 450, averageHeartRate: 150, averagePower: null, complianceScore: 90,
        },
      }),
    ]);
    const dialog = openDetail("Longo de domingo");

    expect(within(dialog).getByText("Prescrito × Realizado")).toBeTruthy();
    expect(within(dialog).getByText(/origem garmin/)).toBeTruthy();
    expect(within(dialog).getByText("9.0/10")).toBeTruthy();
  });
});

describe("AthleteTrainingPanel — asking the coach for a change", () => {
  it("offers the request when the prescription has a coach and no open request", () => {
    renderPanel([item()]);
    const dialog = openDetail("Longo de domingo");

    expect(within(dialog).getByRole("button", { name: "Solicitar alteração" })).toBeTruthy();
  });

  it("sends no coach membership id from here — only school and assignment", () => {
    renderPanel([item()]);
    const dialog = openDetail("Longo de domingo");
    fireEvent.click(within(dialog).getByRole("button", { name: "Solicitar alteração" }));

    const form = dialog.querySelector("form") as HTMLFormElement;
    expect((form.querySelector('input[name="schoolId"]') as HTMLInputElement).value).toBe("school-1");
    expect((form.querySelector('input[name="workoutAssignmentId"]') as HTMLInputElement).value).toBe("assignment-1");
    expect(form.querySelector('input[name="membershipId"]')).toBeNull();
    expect(within(dialog).getByPlaceholderText("O que precisa ser alterado?")).toBeTruthy();
  });

  it("does not offer a second request while one is open, and lets it be withdrawn", () => {
    renderPanel([item({ changeRequests: [openRequest] })]);
    const dialog = openDetail("Longo de domingo");

    expect(within(dialog).queryByRole("button", { name: "Solicitar alteração" })).toBeNull();
    expect(within(dialog).getByText("Alteração solicitada")).toBeTruthy();
    expect(within(dialog).getByText("Reduzir o volume")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Retirar solicitação" })).toBeTruthy();
  });

  it("shows the coach's answer on a closed request and offers a new one", () => {
    renderPanel([
      item({
        changeRequests: [{
          ...openRequest, status: "RESOLVED", resolutionNote: "Volume ajustado para 8 km.",
        }],
      }),
    ]);
    const dialog = openDetail("Longo de domingo");

    expect(within(dialog).getByText("Resolvida")).toBeTruthy();
    expect(within(dialog).getByText("Resposta: Volume ajustado para 8 km.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Retirar solicitação" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Solicitar alteração" })).toBeTruthy();
  });

  it("does not offer a request when nobody is responsible for the prescription", () => {
    renderPanel([item({ coach: null })]);
    const dialog = openDetail("Longo de domingo");

    expect(within(dialog).queryByRole("button", { name: "Solicitar alteração" })).toBeNull();
    expect(within(dialog).getByText(/não tem professor responsável/)).toBeTruthy();
  });
});
