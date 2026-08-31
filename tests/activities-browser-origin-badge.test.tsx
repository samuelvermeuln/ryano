// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/app/atividades",
  useSearchParams: () => new URLSearchParams(),
}));

// O ícone real (`simple-icons:*`) só é resolvido via rede pelo `@iconify/react`
// em runtime (nenhum icon set é pré-carregado neste teste) — o mock preserva
// o `icon` recebido como atributo `data-icon`, permitindo verificar, sem
// depender de rede, que dois providers diferentes recebem `icon`s diferentes
// (Requisito 1.4), exatamente como `ActivitiesBrowser` os passa hoje.
vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <svg data-testid="provider-icon" data-icon={icon} />,
}));

import { ActivitiesBrowser, type ActivitiesBrowserProps } from "@/components/activities/activities-browser";

afterEach(() => {
  cleanup();
});

function buildProps(): ActivitiesBrowserProps {
  return {
    header: {
      eyebrow: "Atividades",
      title: "Suas atividades",
      description: "Histórico de treinos",
      resultLabel: null,
      userName: "Usuária de Teste",
      userImage: null,
    },
    filters: {
      days: 30,
      provider: "",
      sportType: "",
      query: "",
      sort: "recent",
    },
    options: {
      periods: [{ value: 30, shortLabel: "30d", fullLabel: "30 dias" }],
      providers: [],
      sports: [],
      sorts: [{ value: "recent", label: "Mais recentes" }],
    },
    summaryCards: [],
    groups: [
      {
        label: "Esta semana",
        items: [
          {
            id: "activity-garmin",
            href: "/app/atividades/activity-garmin",
            title: "Corrida matinal",
            meta: "Hoje às 07:00",
            origin: { label: "Garmin", providerId: "GARMIN" },
            sportTone: "run",
            metrics: [],
            badges: [],
            facts: [],
          },
          {
            id: "activity-strava",
            href: "/app/atividades/activity-strava",
            title: "Pedal no parque",
            meta: "Ontem às 18:00",
            origin: { label: "Strava", providerId: "STRAVA" },
            sportTone: "bike",
            metrics: [],
            badges: [],
            facts: [],
          },
        ],
      },
    ],
    pagination: {
      page: 1,
      totalPages: 1,
      totalItems: 2,
      pageStart: 1,
      pageEnd: 2,
    },
    emptyState: null,
  };
}

// Requisito 1.4: dois Cartões de Atividade pertencentes a Providers
// diferentes (GARMIN vs STRAVA) devem renderizar Selos de Origem com ícone e
// cor diferentes entre si. Este teste monta `ActivitiesBrowser` de fato
// (RTL), exercitando a integração real introduzida na tarefa 5.2 — não é uma
// repetição do teste de `getProviderVisual` em
// modules/shared/integrations/catalog/visual.test.ts (tarefa 1.2).
describe("ActivitiesBrowser — Selo de Origem por Provider", () => {
  it("renderiza ícone e classes de cor diferentes para GARMIN e STRAVA", () => {
    render(<ActivitiesBrowser {...buildProps()} />);

    const icons = screen.getAllByTestId("provider-icon");
    expect(icons).toHaveLength(2);

    const [garminIcon, stravaIcon] = icons;
    expect(garminIcon.getAttribute("data-icon")).not.toBe(stravaIcon.getAttribute("data-icon"));

    const garminBadge = screen.getByText("Garmin").parentElement;
    const stravaBadge = screen.getByText("Strava").parentElement;

    expect(garminBadge).not.toBeNull();
    expect(stravaBadge).not.toBeNull();
    expect(garminBadge?.className).not.toBe(stravaBadge?.className);
  });
});
