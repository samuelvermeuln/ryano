// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Tarefa 23.2 — animação das novas seções sob movimento reduzido e
 * não-regressão do drag/resize de `CustomizableCardGrid`.
 *
 * Duas garantias distintas, ambas em renderização real (RTL + jsdom):
 *
 * 1. **Movimento reduzido (Requisitos 11.1, 11.2, 11.3)** — com
 *    `useReducedMotion()` valendo `true`, as novas seções da spec (zonas de FC
 *    *calculadas* e "Análise do treino") não recebem nenhuma animação
 *    contínua: nenhuma repetição infinita, nenhum pulso de brilho e nenhuma
 *    faixa de varredura. A transição de *entrada* da barra (`width: 0 → width`)
 *    permanece, que é justamente o que o Requisito 11.3 pede. Com
 *    `useReducedMotion()` valendo `false`, as mesmas seções voltam a receber o
 *    ciclo contínuo — o que prova que o corte vem da preferência do usuário, e
 *    não do fato de a seção ser nova.
 * 2. **Não-regressão de drag/resize (Requisito 11.4)** — as novas seções
 *    entram em `CustomizableCardGrid` como itens comuns: os itens
 *    pré-existentes chegam ao grid com o mesmo `id`/`label`/`defaultSpan`/
 *    `accentClassName` e na mesma ordem relativa, com ou sem as novas seções;
 *    os controles de arrastar e redimensionar existem para cada card novo; e a
 *    lista de itens é idêntica com movimento reduzido ligado ou desligado.
 *
 * Estratégia de asserção: `motion/react` é substituído por um dublê que renderiza
 * a tag DOM equivalente e **registra as props de animação** de cada elemento.
 * Sem isso, "não animar continuamente" não é observável em jsdom (as animações
 * reais não rodam sem layout/rAF de verdade). `CustomizableCardGrid` é
 * envolvido — não substituído — por um espião que captura suas props e delega
 * para o componente real, de modo que o mesmo teste possa afirmar tanto os
 * itens recebidos quanto a presença efetiva dos botões de drag/resize.
 *
 * _Requisitos: 11.1, 11.2, 11.3, 11.4_
 */

// --- Dublês -----------------------------------------------------------------

/** Estado do dublê de `motion/react`, compartilhado com a factory hoisted. */
const motionMock = vi.hoisted(() => ({
  /** Valor devolvido por `useReducedMotion()` no render corrente. */
  reducedMotion: false as boolean | null,
  /** Props de animação de cada elemento `motion.*`, em ordem de render. */
  captured: [] as Array<{
    tag: string;
    className: string;
    style: Record<string, unknown>;
    initial: unknown;
    animate: unknown;
    variants: unknown;
    transition: Record<string, unknown> | undefined;
    whileHover: unknown;
  }>,
}));

/** Props recebidas por `CustomizableCardGrid` em cada render. */
const gridMock = vi.hoisted(() => ({
  captured: [] as Array<Record<string, unknown>>,
}));

vi.mock("motion/react", () => {
  // Props consumidas pela `motion` (não devem chegar ao DOM).
  const ANIMATION_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "variants",
    "transition",
    "whileHover",
    "whileTap",
    "whileFocus",
    "layout",
    "layoutId",
    "custom",
  ]);

  const componentCache = new Map<string, (props: Record<string, unknown>) => ReactNode>();

  function motionComponent(tag: string) {
    const cached = componentCache.get(tag);
    if (cached) {
      return cached;
    }

    const Component = ({ children, ...rest }: Record<string, unknown> & { children?: ReactNode }) => {
      const domProps: Record<string, unknown> = {};
      const animationProps: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(rest)) {
        if (ANIMATION_PROPS.has(key)) {
          animationProps[key] = value;
        } else {
          domProps[key] = value;
        }
      }

      motionMock.captured.push({
        tag,
        className: typeof domProps.className === "string" ? domProps.className : "",
        style: (domProps.style as Record<string, unknown> | undefined) ?? {},
        initial: animationProps.initial,
        animate: animationProps.animate,
        variants: animationProps.variants,
        transition: animationProps.transition as Record<string, unknown> | undefined,
        whileHover: animationProps.whileHover,
      });

      const Tag = tag as unknown as "div";

      return <Tag {...(domProps as Record<string, never>)}>{children}</Tag>;
    };

    componentCache.set(tag, Component);
    return Component;
  }

  return {
    motion: new Proxy({} as Record<string, unknown>, {
      get: (_target, tag) => (typeof tag === "string" ? motionComponent(tag) : undefined),
    }),
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
    useReducedMotion: () => motionMock.reducedMotion,
  };
});

// Espião "transparente": captura as props e renderiza o grid real, para que a
// asserção de não-regressão possa olhar tanto os itens recebidos quanto os
// botões de arrastar/redimensionar efetivamente renderizados.
vi.mock("@/components/layout/customizable-card-grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/layout/customizable-card-grid")>();
  const RealGrid = actual.CustomizableCardGrid;

  return {
    ...actual,
    CustomizableCardGrid: (props: Record<string, unknown>) => {
      gridMock.captured.push(props);
      return <RealGrid {...(props as ComponentProps<typeof RealGrid>)} />;
    },
  };
});

// `saveActivityLayoutOrderAction` é Server Action: importá-la de verdade
// arrastaria auth/prisma para o teste de componente.
vi.mock("@/app/actions/activities", () => ({
  saveActivityLayoutOrderAction: vi.fn(async () => ({ success: true })),
}));

// O ícone real (`simple-icons:*`) só é resolvido via rede em runtime.
vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <svg data-testid="provider-icon" data-icon={icon} />,
}));

import { saveActivityLayoutOrderAction } from "@/app/actions/activities";
import { ActivityVisualDashboard } from "@/components/activities/activity-visual-dashboard";
import type { CustomizableCardGridItem, SavedCardLayoutValue } from "@/components/layout/customizable-card-grid";
import { computeHeartRateZonesFromStream } from "@/modules/shared/activities/heart-rate-zones";
import type {
  ActivityBarSection,
  ActivityMetricSection,
} from "@/modules/shared/activities/presentation/activity-visual-data";

type DashboardProps = ComponentProps<typeof ActivityVisualDashboard>;

// --- Fixtures ---------------------------------------------------------------

const APPROXIMATE_DISCLAIMER = "Zonas estimadas por %FC máx. — podem diferir das configuradas no Strava.";

/**
 * Nova seção 1 — zonas de FC **calculadas**, produzidas pelo próprio cálculo
 * compartilhado (dado real, não inventado): `approximate: true` + disclaimer.
 */
const COMPUTED_ZONES_SECTION: ActivityBarSection = (() => {
  const samples = Array.from({ length: 60 }, (_, index) => ({
    timeSeconds: index * 10,
    bpm: 108 + (index % 5) * 16,
  }));

  const section = computeHeartRateZonesFromStream(samples, 180);

  if (!section) {
    throw new Error("Fixture inválida: o cálculo de zonas de FC devolveu null.");
  }

  return { ...section, disclaimer: APPROXIMATE_DISCLAIMER };
})();

/** Nova seção 2 — "Análise do treino" (`metricSections`, id do módulo Strava). */
const WORKOUT_ANALYSIS_SECTION: ActivityMetricSection = {
  id: "workout-analysis",
  title: "Análise do treino",
  description: "Leitura do esforço da atividade a partir das zonas, dos splits e das séries disponíveis.",
  metrics: [
    { label: "Tempo em zonas leves", value: "32:10 · 54%" },
    { label: "Variação de ritmo entre splits", value: "0:18 /km" },
  ],
};

/** Seção de barras pré-existente (padrão Garmin: sem `approximate`/`disclaimer`). */
const EXISTING_BAR_SECTION: ActivityBarSection = {
  id: "splits",
  title: "Splits por quilômetro",
  description: "Ritmo de cada quilômetro completo.",
  items: [
    { label: "km 1", valueText: "5:12 /km", ratio: 0.82, color: "#0ea5e9" },
    { label: "km 2", valueText: "5:01 /km", ratio: 1, color: "#22d3ee" },
  ],
};

/** Seção de métricas pré-existente. */
const EXISTING_METRIC_SECTION: ActivityMetricSection = {
  id: "extras",
  title: "Leituras adicionais",
  description: "Outros dados enviados pelo dispositivo.",
  metrics: [{ label: "FC máx", value: "182 bpm" }],
};

const SAVED_LAYOUT: SavedCardLayoutValue = [{ id: "overview", span: 2 }, { id: "bar:splits", span: 1 }];

function buildProps(overrides: Partial<DashboardProps> = {}): DashboardProps {
  return {
    userName: "Usuária de Teste",
    userImage: null,
    title: "Corrida matinal",
    sportLabel: "Corrida",
    provider: "Strava",
    providerId: "STRAVA",
    startedAtLabel: "10/01/2026 07:00",
    heroStats: [{ label: "Distância", value: "10,0 km", tone: "text-sky-300" }],
    overviewMetrics: [{ label: "Duração", value: "50:00" }],
    barSections: [EXISTING_BAR_SECTION],
    metricSections: [EXISTING_METRIC_SECTION],
    savedLayout: SAVED_LAYOUT,
    ...overrides,
  };
}

/** Props com as duas novas seções da spec somadas às pré-existentes. */
function propsWithNewSections(): DashboardProps {
  return buildProps({
    barSections: [EXISTING_BAR_SECTION, COMPUTED_ZONES_SECTION],
    metricSections: [EXISTING_METRIC_SECTION, WORKOUT_ANALYSIS_SECTION],
  });
}

// --- Leitura do que foi capturado -------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Barras preenchidas (`AnimatedBarList`): únicos elementos com `initial.width === 0`. */
function barFills() {
  return motionMock.captured.filter((entry) => isRecord(entry.initial) && entry.initial.width === 0);
}

/** Barras de uma seção específica, identificadas pela cor de fundo dos itens. */
function barFillsOf(section: ActivityBarSection) {
  const colors = new Set(section.items.map((item) => item.color));
  return barFills().filter((entry) => colors.has(String(entry.style.background)));
}

/** Faixa de varredura: único elemento animado por uma sequência de `x`. */
function sweepOverlays() {
  return motionMock.captured.filter((entry) => isRecord(entry.animate) && Array.isArray(entry.animate.x));
}

/** Qualquer elemento com animação em loop infinito. */
function infiniteLoops() {
  return motionMock.captured.filter((entry) => entry.transition?.repeat === Infinity);
}

function rootContainer() {
  const root = motionMock.captured.find((entry) => entry.tag === "div" && entry.className.includes("space-y-5"));
  if (!root) {
    throw new Error("Container raiz animado não encontrado no render.");
  }
  return root;
}

function animatedSections() {
  return motionMock.captured.filter((entry) => entry.tag === "section");
}

/** Células de métrica (`MetricCell`), identificadas pelo raio do card. */
function metricCells() {
  return motionMock.captured.filter((entry) => entry.className.includes("rounded-[18px]"));
}

function lastGridItems(): CustomizableCardGridItem[] {
  const props = gridMock.captured.at(-1);
  if (!props) {
    throw new Error("CustomizableCardGrid não recebeu props neste render.");
  }
  return props.items as CustomizableCardGridItem[];
}

/** Identidade de drag/resize de um card: tudo que o grid usa para ordenar/dimensionar. */
function dragResizeIdentity(items: CustomizableCardGridItem[]) {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    defaultSpan: item.defaultSpan,
    accentClassName: item.accentClassName,
  }));
}

function renderDashboard(props: DashboardProps, reducedMotion: boolean) {
  motionMock.reducedMotion = reducedMotion;
  motionMock.captured.length = 0;
  gridMock.captured.length = 0;
  return render(<ActivityVisualDashboard {...props} />);
}

afterEach(() => {
  cleanup();
  motionMock.captured.length = 0;
  motionMock.reducedMotion = false;
  gridMock.captured.length = 0;
  vi.clearAllMocks();
});

// --- 1. Movimento reduzido --------------------------------------------------

describe("ActivityVisualDashboard — novas seções com movimento reduzido ativado", () => {
  it("não aplica nenhuma animação contínua quando useReducedMotion() é true", () => {
    renderDashboard(propsWithNewSections(), true);

    // As duas novas seções realmente renderizaram (senão o teste seria vácuo).
    expect(screen.getByText("Zonas de frequência cardíaca")).toBeDefined();
    expect(screen.getByText("Análise do treino")).toBeDefined();
    expect(screen.getByRole("note").textContent).toBe(APPROXIMATE_DISCLAIMER);

    // Nada em loop infinito e nenhuma faixa de varredura em todo o render.
    expect(infiniteLoops()).toHaveLength(0);
    expect(sweepOverlays()).toHaveLength(0);

    // Variantes de entrada em cascata desligadas no container e nas duas seções.
    expect(rootContainer().variants).toBeUndefined();
    const sections = animatedSections();
    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section.variants).toBeUndefined();
    }
  });

  it("mantém a transição de entrada das barras das zonas calculadas, sem pulso de brilho", () => {
    renderDashboard(propsWithNewSections(), true);

    const fills = barFillsOf(COMPUTED_ZONES_SECTION);
    expect(fills).toHaveLength(COMPUTED_ZONES_SECTION.items.length);

    for (const fill of fills) {
      // Requisito 11.3: o preenchimento progressivo continua existindo.
      expect(fill.initial).toEqual({ width: 0 });
      const animate = fill.animate as Record<string, unknown>;
      expect(typeof animate.width).toBe("string");
      expect(String(animate.width)).toMatch(/^\d+(\.\d+)?%$/);

      // Requisito 11.2: nada de ciclo de brilho nem de repetição.
      expect("filter" in animate).toBe(false);
      expect(fill.transition?.repeat).toBe(0);
    }
  });

  it("trata as barras das zonas calculadas exatamente como as das seções pré-existentes", () => {
    renderDashboard(propsWithNewSections(), true);

    const existingFill = barFillsOf(EXISTING_BAR_SECTION)[0];
    const newFill = barFillsOf(COMPUTED_ZONES_SECTION)[0];

    expect(existingFill).toBeDefined();
    expect(newFill).toBeDefined();
    // Mesma forma de animação: só o `width` alvo e o `delay` por índice variam.
    expect(Object.keys(newFill.animate as Record<string, unknown>)).toEqual(
      Object.keys(existingFill.animate as Record<string, unknown>),
    );
    expect(newFill.transition?.repeat).toBe(existingFill.transition?.repeat);
    expect(newFill.transition?.duration).toBe(existingFill.transition?.duration);
  });

  it("aplica às células da análise do treino o mesmo tratamento das seções pré-existentes", () => {
    renderDashboard(propsWithNewSections(), true);

    const cells = metricCells();
    const expectedCells =
      1 /* overviewMetrics */ + EXISTING_METRIC_SECTION.metrics.length + WORKOUT_ANALYSIS_SECTION.metrics.length;

    expect(cells).toHaveLength(expectedCells);
    // `MetricCell` hoje aplica o mesmo `whileHover` a TODAS as células — inclusive
    // as das seções pré-existentes e as do resumo. É um gesto pontual disparado
    // pelo usuário (não uma animação contínua), e o Requisito 11.2 pede que as
    // novas seções sigam o mesmo tratamento das existentes: é o que se fixa aqui.
    const hoverVariants = new Set(cells.map((cell) => JSON.stringify(cell.whileHover)));
    expect(hoverVariants.size).toBe(1);
    expect(cells.every((cell) => cell.transition?.repeat === undefined)).toBe(true);
  });

  it("volta a animar continuamente as novas seções quando a preferência está desligada", () => {
    renderDashboard(propsWithNewSections(), false);

    const fills = barFillsOf(COMPUTED_ZONES_SECTION);
    expect(fills).toHaveLength(COMPUTED_ZONES_SECTION.items.length);

    for (const fill of fills) {
      const animate = fill.animate as Record<string, unknown>;
      expect(Array.isArray(animate.filter)).toBe(true);
      expect(fill.transition?.repeat).toBe(Infinity);
    }

    // Uma faixa de varredura por barra (novas seções incluídas) e as variantes
    // de entrada em cascata de volta no container e nas seções.
    const totalBars = EXISTING_BAR_SECTION.items.length + COMPUTED_ZONES_SECTION.items.length;
    expect(sweepOverlays()).toHaveLength(totalBars);
    expect(rootContainer().variants).toBeDefined();
    expect(animatedSections().every((section) => section.variants !== undefined)).toBe(true);
  });
});

// --- 2. Não-regressão de drag/resize ---------------------------------------

describe("ActivityVisualDashboard — não-regressão de drag/resize com as novas seções", () => {
  it("entrega ao grid os mesmos itens pré-existentes, na mesma ordem relativa", () => {
    renderDashboard(buildProps(), true);
    const baseline = dragResizeIdentity(lastGridItems());
    cleanup();

    renderDashboard(propsWithNewSections(), true);
    const withNewSections = dragResizeIdentity(lastGridItems());

    const baselineIds = new Set(baseline.map((item) => item.id));

    // Cada card pré-existente sobrevive idêntico (id, rótulo, span padrão e
    // faixa de destaque) e na mesma ordem relativa.
    expect(withNewSections.filter((item) => baselineIds.has(item.id))).toEqual(baseline);

    // As novas seções apenas se somam, como itens comuns de span 1.
    const added = withNewSections.filter((item) => !baselineIds.has(item.id));
    expect(added.map((item) => item.id)).toEqual(["bar:heart-rate-zones", "metric:workout-analysis"]);
    expect(added.every((item) => item.defaultSpan === 1)).toBe(true);
  });

  it("preserva savedLayout e a ação de persistência do layout", () => {
    renderDashboard(propsWithNewSections(), true);

    const props = gridMock.captured.at(-1);
    expect(props?.savedLayout).toBe(SAVED_LAYOUT);
    expect(props?.onSave).toBe(saveActivityLayoutOrderAction);
  });

  it("renderiza os controles de arrastar e redimensionar para cada card, novos inclusive", () => {
    renderDashboard(propsWithNewSections(), true);

    const items = lastGridItems();
    expect(screen.getAllByLabelText(/^Arrastar /)).toHaveLength(items.length);
    expect(screen.getAllByLabelText(/^Redimensionar /)).toHaveLength(items.length);

    for (const label of ["Zonas de frequência cardíaca", "Análise do treino", "Splits por quilômetro"]) {
      expect(screen.getByLabelText(`Arrastar ${label}`)).toBeDefined();
      expect(screen.getByLabelText(`Redimensionar ${label}`)).toBeDefined();
    }
  });

  it("mantém a lista de itens idêntica com movimento reduzido ligado ou desligado", () => {
    renderDashboard(propsWithNewSections(), true);
    const reduced = dragResizeIdentity(lastGridItems());
    cleanup();

    renderDashboard(propsWithNewSections(), false);
    const full = dragResizeIdentity(lastGridItems());

    expect(full).toEqual(reduced);
  });
});
