// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// `saveActivityLayoutOrderAction` é uma Server Action: importá-la de verdade
// arrastaria auth/prisma para dentro do teste de componente. O mock preserva a
// assinatura usada por `CustomizableCardGrid` (`onSave`), sem exercitar o
// caminho de persistência — que não é o objeto deste teste.
vi.mock("@/app/actions/activities", () => ({
  saveActivityLayoutOrderAction: vi.fn(async () => ({ success: true })),
}));

// O ícone real (`simple-icons:*`) só é resolvido via rede pelo `@iconify/react`
// em runtime; o mock evita a dependência de rede no selo de provider, mantendo
// intacto o texto renderizado pelo componente (que é o que asseguramos aqui).
vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <svg data-testid="provider-icon" data-icon={icon} />,
}));

import { ActivityVisualDashboard } from "@/components/activities/activity-visual-dashboard";
import type {
  ActivityBarSection,
  ActivityHeroStat,
  ActivityMetricRow,
  ActivityMetricSection,
} from "@/modules/shared/activities/presentation/activity-visual-data";
import type {
  ActivityBarSection as GarminActivityBarSection,
  ActivityHeroStat as GarminActivityHeroStat,
  ActivityMetricRow as GarminActivityMetricRow,
  ActivityMetricSection as GarminActivityMetricSection,
} from "@/modules/garmin/presentation/view-models";

/**
 * Tarefa 21.3 — import path e nota de aproximação em
 * `components/activities/activity-visual-dashboard.tsx`.
 *
 * Duas garantias distintas:
 *
 * 1. **Compatibilidade estrutural do novo import (tarefa 21.1)** — o
 *    componente agora tipa suas props com os tipos do core
 *    (`@/modules/shared/activities/presentation/activity-visual-data`) em vez
 *    dos reexportados por `@/modules/garmin/presentation/view-models`. As
 *    asserções de tipo abaixo fixam que o consumo existente (dados montados
 *    com os tipos do Garmin) continua atribuível às props — verificado no
 *    typecheck (`npm run build`).
 * 2. **Nota de aproximação (tarefa 21.2)** — renderização real (RTL): uma
 *    `barSection` com `approximate: true` + `disclaimer` exibe o aviso; seções
 *    sem esses campos (forma que o Garmin produz) não exibem nota alguma.
 *
 * _Requisitos: 2.5_
 */

type DashboardProps = ComponentProps<typeof ActivityVisualDashboard>;

// --- 1. Compatibilidade estrutural do novo import ---------------------------
// Se o componente voltasse a tipar suas props por um contrato divergente, uma
// destas atribuições deixaria de compilar.
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const heroStatPropIsCoreType: MutuallyAssignable<DashboardProps["heroStats"][number], ActivityHeroStat> = true;
const overviewMetricPropIsCoreType: MutuallyAssignable<
  DashboardProps["overviewMetrics"][number],
  ActivityMetricRow
> = true;
const barSectionPropIsCoreType: MutuallyAssignable<DashboardProps["barSections"][number], ActivityBarSection> = true;
const metricSectionPropIsCoreType: MutuallyAssignable<
  DashboardProps["metricSections"][number],
  ActivityMetricSection
> = true;

// O mesmo dado tipado pelos reexports do Garmin (consumo existente) continua
// sendo aceito pelas props do componente após a troca do import path.
const garminHeroStats: GarminActivityHeroStat[] = [{ label: "Distância", value: "10,0 km", tone: "text-sky-300" }];
const garminOverviewMetrics: GarminActivityMetricRow[] = [{ label: "Duração", value: "50:00" }];
const garminBarSections: GarminActivityBarSection[] = [
  {
    id: "hr-zones",
    title: "Zonas de frequência cardíaca",
    description: "Tempo em cada zona",
    items: [{ label: "Z2", valueText: "30:00", ratio: 0.6, color: "#38bdf8" }],
  },
];
const garminMetricSections: GarminActivityMetricSection[] = [
  { id: "extras", title: "Leituras adicionais", description: "Outros dados", metrics: [{ label: "FC máx", value: "180 bpm" }] },
];

const APPROXIMATE_DISCLAIMER = "Zonas estimadas por %FC máx. — podem diferir das configuradas no Strava.";

function buildProps(overrides: Partial<DashboardProps> = {}): DashboardProps {
  return {
    userName: "Usuária de Teste",
    userImage: null,
    title: "Corrida matinal",
    sportLabel: "Corrida",
    provider: "Strava",
    providerId: "STRAVA",
    startedAtLabel: "10/01/2026 07:00",
    heroStats: garminHeroStats,
    overviewMetrics: garminOverviewMetrics,
    barSections: garminBarSections,
    metricSections: garminMetricSections,
    ...overrides,
  };
}

function barSection(overrides: Partial<ActivityBarSection> = {}): ActivityBarSection {
  return {
    id: "hr-zones",
    title: "Zonas de frequência cardíaca",
    description: "Tempo em cada zona",
    items: [
      { label: "Z1", valueText: "10:00", ratio: 0.25, color: "#94a3b8" },
      { label: "Z2", valueText: "30:00", ratio: 0.75, color: "#38bdf8" },
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityVisualDashboard — import path do contrato de apresentação", () => {
  it("aceita dados tipados pelos reexports do Garmin (compatibilidade estrutural)", () => {
    expect(heroStatPropIsCoreType).toBe(true);
    expect(overviewMetricPropIsCoreType).toBe(true);
    expect(barSectionPropIsCoreType).toBe(true);
    expect(metricSectionPropIsCoreType).toBe(true);

    render(<ActivityVisualDashboard {...buildProps()} />);

    expect(screen.getByText("Corrida matinal")).toBeDefined();
    expect(screen.getByText("Zonas de frequência cardíaca")).toBeDefined();
    expect(screen.getByText("Leituras adicionais")).toBeDefined();
  });
});

describe("ActivityVisualDashboard — nota de aproximação da seção de barras", () => {
  it("exibe o disclaimer quando a seção é approximate: true", () => {
    render(
      <ActivityVisualDashboard
        {...buildProps({
          barSections: [barSection({ approximate: true, disclaimer: APPROXIMATE_DISCLAIMER })],
        })}
      />,
    );

    const note = screen.getByRole("note");

    expect(note.textContent).toBe(APPROXIMATE_DISCLAIMER);
    // A nota fica abaixo da descrição da seção, dentro do mesmo cabeçalho.
    expect(screen.getByText("Tempo em cada zona")).toBeDefined();
  });

  it("não exibe nota alguma para uma seção sem approximate/disclaimer (não-regressão do Garmin)", () => {
    render(<ActivityVisualDashboard {...buildProps({ barSections: [barSection()] })} />);

    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByText("Zonas de frequência cardíaca")).toBeDefined();
  });

  it("não exibe nota quando approximate: true não vem acompanhado de disclaimer", () => {
    render(<ActivityVisualDashboard {...buildProps({ barSections: [barSection({ approximate: true })] })} />);

    expect(screen.queryByRole("note")).toBeNull();
  });

  it("não exibe nota quando approximate: false, mesmo havendo disclaimer", () => {
    render(
      <ActivityVisualDashboard
        {...buildProps({
          barSections: [barSection({ approximate: false, disclaimer: APPROXIMATE_DISCLAIMER })],
        })}
      />,
    );

    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(APPROXIMATE_DISCLAIMER)).toBeNull();
  });

  it("exibe a nota apenas na seção aproximada quando há seções nativas e aproximadas juntas", () => {
    render(
      <ActivityVisualDashboard
        {...buildProps({
          barSections: [
            barSection({ id: "hr-zones-native", title: "Zonas nativas" }),
            barSection({
              id: "hr-zones-computed",
              title: "Zonas calculadas",
              approximate: true,
              disclaimer: APPROXIMATE_DISCLAIMER,
            }),
          ],
        })}
      />,
    );

    const notes = screen.getAllByRole("note");

    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(APPROXIMATE_DISCLAIMER);
  });
});
