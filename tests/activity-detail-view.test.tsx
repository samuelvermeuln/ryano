// @vitest-environment jsdom
/**
 * SAM-40 — a tela compartilhada numa página só: KPIs adaptativos, um card por
 * seção (percurso/gráficos, zonas, voltas, estatísticas, autoavaliação) com
 * as alças de arrastar e redimensionar, o gráfico de zonas com quatro
 * visualizações nas mesmas cores, a tabela de voltas com "—" para ausência e
 * o título editável só para o atleta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/app/actions/activities", () => ({
  renameActivityTitleAction: vi.fn(async () => ({ success: true, message: "ok" })),
  saveActivityLayoutOrderAction: vi.fn(async () => ({ success: true, message: "Layout salvo." })),
}));
vi.mock("@iconify/react", () => ({ Icon: ({ icon }: { icon: string }) => <svg data-testid="provider-icon" data-icon={icon} /> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ActivityDetailView, buildActivityCards } from "@/components/activities/activity-detail-view";
import { ActivityLapsTable } from "@/components/activities/activity-laps-table";
import { ActivityZoneChart } from "@/components/activities/activity-zone-chart";
import type { ActivityDetailModel, LapsModel, ZoneSetModel } from "@/modules/shared/activities/presentation/activity-detail-model";

const laps: LapsModel = {
  vocabulary: "split",
  columns: [{ key: "duration", label: "Tempo" }, { key: "distance", label: "Distância" }, { key: "avgHr", label: "FC média" }],
  rows: [
    { number: "1", cells: { duration: "5 min", distance: "1,0 km", avgHr: "145 bpm" } },
    { number: "2", cells: { duration: "5min 10s", distance: "1,0 km", avgHr: "—" } },
  ],
  summary: { number: "Total", cells: { duration: "10min 10s", distance: "2,0 km", avgHr: "145 bpm" } },
  sourceNote: "Voltas: Garmin · nativo",
};

const zones: ZoneSetModel = {
  id: "heart-rate", title: "Zonas de frequência cardíaca", approximate: false, sourceNote: "Zonas nativas · Garmin",
  items: [1, 2, 3, 4, 5].map((n) => ({ label: `Zona ${n}`, seconds: n * 60, ratio: n / 5, shareText: `${Math.round((n / 15) * 100)}%`, valueText: `${n} min` })),
};

const model: ActivityDetailModel = {
  activityId: "act-1",
  header: {
    title: "Morning Run", editorialTitle: null, sportLabel: "Corrida", subSportType: null, providerId: "GARMIN", providerLabel: "Garmin",
    startedAtLabel: "02/10/2026 06:00",
    kpis: [
      { label: "Distância", value: "6,0 km", tone: "text-sky-300" }, { label: "Duração", value: "30 min", tone: "text-emerald-300" },
      { label: "Ritmo", value: "5:00 /km", tone: "text-amber-300" }, { label: "Calorias", value: "420 kcal", tone: "text-foreground" },
    ],
  },
  route: null,
  timeline: {
    time: [0, 60, 120], distance: [0, 200, 400],
    series: [{ key: "heartRate", label: "Frequência cardíaca", format: "bpm", inverted: false, colorVar: "--chart-heart-rate", values: [120, null, 160] }],
    sourceNote: "Séries: Garmin · nativo",
  },
  stats: [{ id: "summary", title: "Resumo do treino", rows: [{ label: "Distância", value: "6,0 km" }] }],
  laps,
  zones: [zones],
  analysis: [],
  feedback: { rpe: 7, mood: 4, energy: null, comment: null },
  sources: ["Voltas: Garmin · nativo"],
};

afterEach(() => cleanup());

describe("ActivityDetailView", () => {
  it("uma página só, sem abas: um card por seção, todos com arrastar e redimensionar", () => {
    render(<ActivityDetailView model={model} athlete={{ name: "Maria Souza", image: null }} viewerKind="coach" />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getAllByTestId("activity-kpi")).toHaveLength(4);
    expect(screen.getByText("Atividade de Maria Souza")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar título da atividade" })).toBeNull();

    const cards = screen.getByTestId("activity-cards").querySelectorAll("[data-layout-card-id]");
    expect([...cards].map((card) => card.getAttribute("data-layout-card-id"))).toEqual([
      "route-series", "zones:heart-rate", "laps", "stats:summary", "feedback",
    ]);
    expect(screen.getAllByRole("button", { name: /^Arrastar / })).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /^Redimensionar / })).toHaveLength(5);

    // Tudo visível de uma vez.
    expect(screen.getByTestId("activity-zones-heart-rate").textContent).toContain("Zonas nativas · Garmin");
    expect(screen.getByTestId("activity-laps-table")).toBeTruthy();
    expect(screen.getByTestId("activity-stats-summary").textContent).toContain("Resumo do treino");
    expect(screen.getByTestId("activity-feedback").textContent).toContain("7/10");
    expect(screen.getByTestId("activity-series-heartRate").textContent).toContain("méd.");
    expect(screen.getByTestId("activity-sources").textContent).toContain("Voltas: Garmin");
  });

  it("atleta: título editável; dado ausente não vira zero na tabela de voltas", () => {
    render(<ActivityDetailView model={model} athlete={{ name: "Maria", image: null }} viewerKind="athlete" />);
    expect(screen.getByRole("button", { name: "Editar título da atividade" })).toBeTruthy();
    const table = screen.getByTestId("activity-laps-table");
    const rows = within(table).getAllByTestId("activity-lap-row");
    expect(rows).toHaveLength(2);
    expect(rows[1]!.textContent).toContain("—");
    expect(within(table).getByTestId("activity-lap-summary").textContent).toContain("2,0 km");
  });

  it("o layout salvo do leitor reordena e redimensiona; card que a atividade não tem é ignorado", () => {
    render(
      <ActivityDetailView
        model={model}
        athlete={{ name: "Maria", image: null }}
        viewerKind="athlete"
        savedLayout={[{ id: "stats:summary", span: 2 }, { id: "zones:power", span: 1 }, { id: "laps", span: 1 }]}
      />,
    );
    const ids = [...screen.getByTestId("activity-cards").querySelectorAll("[data-layout-card-id]")].map((card) => card.getAttribute("data-layout-card-id"));
    expect(ids.slice(0, 2)).toEqual(["stats:summary", "laps"]);
    expect(ids).toHaveLength(5);
  });

  it("sem zonas: o card de zonas diz que não há dado, sem inventar", () => {
    const cards = buildActivityCards({ ...model, zones: [] });
    expect(cards.map((card) => card.id)).toContain("zones:empty");
  });
});

describe("ActivityZoneChart", () => {
  it("barras por padrão; pizza, colunas e empilhada usam as mesmas cores por zona", () => {
    render(<ActivityZoneChart set={zones} />);
    const chart = screen.getByTestId("activity-zones-heart-rate");
    expect(chart.getAttribute("data-view")).toBe("barras");
    expect(within(chart).getAllByTestId("activity-zone")).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Pizza" }));
    expect(chart.getAttribute("data-view")).toBe("pizza");
    const slices = within(chart).getAllByTestId("activity-zone-slice");
    expect(slices.map((slice) => slice.getAttribute("fill"))).toEqual(["var(--zone-1)", "var(--zone-2)", "var(--zone-3)", "var(--zone-4)", "var(--zone-5)"]);
    expect(screen.getByRole("button", { name: "Pizza" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Colunas" }));
    expect(within(chart).getAllByTestId("activity-zone-column")[2]!.getAttribute("fill")).toBe("var(--zone-3)");

    fireEvent.click(screen.getByRole("button", { name: "Empilhada" }));
    expect(within(chart).getAllByTestId("activity-zone-segment")).toHaveLength(5);
  });
});

describe("ActivityLapsTable", () => {
  it("só as colunas do modelo", () => {
    render(<ActivityLapsTable laps={laps} />);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Split", "Tempo", "Distância", "FC média"]);
  });
});
