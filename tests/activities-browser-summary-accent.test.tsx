// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

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

// Os ícones de marca (`simple-icons:*`) só são resolvidos via rede pelo
// `@iconify/react` em runtime — o mock evita depender de rede neste teste,
// que não exercita o Selo de Origem (já cobrto por
// tests/activities-browser-origin-badge.test.tsx).
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
    summaryCards: [
      { key: "activities", icon: "activity", value: "12", label: "Atividades", subtitle: "Últimos 30 dias", comparison: null },
      { key: "distance", icon: "route", value: "120 km", label: "Distância total", subtitle: "Últimos 30 dias", comparison: null },
      { key: "duration", icon: "clock", value: "10h", label: "Tempo em atividade", subtitle: "Últimos 30 dias", comparison: null },
      { key: "active-days", icon: "calendar", value: "8", label: "Dias com treino", subtitle: "Últimos 30 dias", comparison: null },
    ],
    groups: [],
    pagination: {
      page: 1,
      totalPages: 1,
      totalItems: 0,
      pageStart: 0,
      pageEnd: 0,
    },
    emptyState: null,
  };
}

// Requisitos 4.1, 4.2: cada um dos 4 Cartões de Resumo (`getSummaryCardAccentClass`
// em activities-browser.tsx) deve exibir uma combinação de classes de
// fundo/texto não-neutra (diferente de `bg-black/10 text-foreground/84`), e
// as 4 combinações devem ser distintas entre si. A função não é exportada,
// então o teste exercita o resultado via renderização real (RTL), seguindo a
// mesma convenção de tests/activities-browser-origin-badge.test.tsx.
describe("ActivitiesBrowser — cor dos Cartões de Resumo (getSummaryCardAccentClass)", () => {
  it("aplica uma combinação de classes de fundo/texto não-neutra e distinta para cada uma das 4 chaves conhecidas", () => {
    const { container } = render(<ActivitiesBrowser {...buildProps()} />);

    const iconShells = Array.from(container.querySelectorAll<HTMLDivElement>(".h-11.w-11"));
    expect(iconShells).toHaveLength(4);

    const classNames = iconShells.map((el) => el.className);

    for (const className of classNames) {
      expect(className).not.toContain("bg-black/10");
      expect(className).not.toContain("text-foreground/84");
    }

    expect(new Set(classNames).size).toBe(classNames.length);
  });
});
