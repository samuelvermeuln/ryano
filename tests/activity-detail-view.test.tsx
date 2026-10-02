// @vitest-environment jsdom
/**
 * SAM-40 — a tela compartilhada renderiza KPIs adaptativos, as três abas, a
 * tabela de voltas com "—" para ausência e o título editável só para o atleta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/app/actions/activities", () => ({ renameActivityTitleAction: vi.fn(async () => ({ success: true, message: "ok" })) }));
vi.mock("@iconify/react", () => ({ Icon: ({ icon }: { icon: string }) => <svg data-testid="provider-icon" data-icon={icon} /> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ActivityDetailView } from "@/components/activities/activity-detail-view";
import { ActivityLapsTable } from "@/components/activities/activity-laps-table";
import type { ActivityDetailModel, LapsModel } from "@/modules/shared/activities/presentation/activity-detail-model";

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
  stats: [{ id: "summary", title: "Resumo", rows: [{ label: "Distância", value: "6,0 km" }] }],
  laps,
  zones: [{ id: "heart-rate", title: "Zonas de frequência cardíaca", approximate: false, sourceNote: "Zonas nativas · Garmin", items: [{ label: "Zona 1", seconds: 60, ratio: 1, shareText: "100%", valueText: "1 min" }] }],
  analysis: [],
  feedback: { rpe: 7, mood: 4, energy: null, comment: null },
  sources: ["Voltas: Garmin · nativo"],
};

afterEach(() => cleanup());

describe("ActivityDetailView", () => {
  it("professor: 4 KPIs, cabeçalho com o atleta, título sem edição, abas e autoavaliação", () => {
    render(<ActivityDetailView model={model} athlete={{ name: "Maria Souza", image: null }} viewerKind="coach" />);
    expect(screen.getAllByTestId("activity-kpi")).toHaveLength(4);
    expect(screen.getByText("Atividade de Maria Souza")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar título da atividade" })).toBeNull();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Estatísticas", "Voltas (2)", "Tempo em zonas"]);
    expect(screen.getByTestId("activity-feedback").textContent).toContain("7/10");
    fireEvent.click(tabs[2]!);
    expect(screen.getByTestId("activity-zones-heart-rate").textContent).toContain("Zonas nativas · Garmin");
    expect(screen.getByTestId("activity-series-heartRate").textContent).toContain("méd.");
  });

  it("atleta: título editável; dado ausente não vira zero na tabela de voltas", () => {
    render(<ActivityDetailView model={model} athlete={{ name: "Maria", image: null }} viewerKind="athlete" />);
    expect(screen.getByRole("button", { name: "Editar título da atividade" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Voltas (2)" }));
    const table = screen.getByTestId("activity-laps-table");
    const rows = within(table).getAllByTestId("activity-lap-row");
    expect(rows).toHaveLength(2);
    expect(rows[1]!.textContent).toContain("—");
    expect(within(table).getByTestId("activity-lap-summary").textContent).toContain("2,0 km");
  });
});

describe("ActivityLapsTable", () => {
  it("só as colunas do modelo", () => {
    render(<ActivityLapsTable laps={laps} />);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Split", "Tempo", "Distância", "FC média"]);
  });
});
