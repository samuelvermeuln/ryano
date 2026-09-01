import { describe, expect, it } from "vitest";

import type {
  ActivityBarSection,
  ActivityVisualData,
} from "@/modules/shared/activities/presentation/activity-visual-data";
import type { ActivityBarSection as GarminActivityBarSection } from "@/modules/garmin/presentation/view-models";

/**
 * Testes de tipo/exemplo da extensão de `ActivityBarSection` (Tarefa 8.2).
 *
 * A Tarefa 8.1 adicionou os campos opcionais `approximate?: boolean` e
 * `disclaimer?: string` ao tipo de apresentação canônico
 * (`modules/shared/activities/presentation/activity-visual-data.ts`). Este
 * arquivo fixa duas garantias:
 *
 * 1. **Compatibilidade retroativa** — uma seção sem `approximate`/`disclaimer`
 *    continua sendo um `ActivityBarSection` válido (é o que o Garmin produz).
 * 2. **Nova forma aceita** — uma seção com `approximate: true` + `disclaimer`
 *    também é aceita pelo tipo (é o que o Strava produzirá para zonas de FC
 *    calculadas por %FCmáx).
 *
 * As asserções de tipo (anotações explícitas, `satisfies` e `@ts-expect-error`)
 * são verificadas pelo typecheck (`npm run build`); as asserções de runtime
 * garantem que os campos opcionais realmente ficam ausentes quando não
 * preenchidos, sem valores enganosos.
 *
 * _Requisitos: 2.5_
 */

// --- Helpers de identidade de tipo -----------------------------------------
// `MutuallyAssignable` só resolve para `true` quando os dois tipos são
// mutuamente atribuíveis, provando que o reexport do Garmin é o MESMO tipo do
// core (fonte única de verdade) e não uma cópia divergente.
type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

// Só compila com `= true` quando os tipos são mutuamente atribuíveis; caso
// divirjam, o tipo resolve para `false` e o typecheck falha aqui.
const sharedAndGarminBarSectionAreTheSameType: MutuallyAssignable<
  ActivityBarSection,
  GarminActivityBarSection
> = true;

// --- Fixtures --------------------------------------------------------------
// Seção "legada": exatamente a forma que `getGarminActivityVisualData` monta
// (zonas nativas), sem nenhum dos campos novos.
const nativeSection = {
  id: "hr-zones",
  title: "Zonas de frequência cardíaca",
  description: "Tempo em cada zona",
  items: [
    { label: "Z1", valueText: "10:00", ratio: 0.2, color: "#94a3b8" },
    { label: "Z2", valueText: "20:00", ratio: 0.8, color: "#38bdf8" },
  ],
} satisfies ActivityBarSection;

// Seção calculada/aproximada: a forma que o enriquecimento do Strava usará.
const approximateSection = {
  id: "hr-zones-computed",
  title: "Zonas de frequência cardíaca",
  description: "Tempo em cada zona",
  approximate: true,
  disclaimer:
    "Zonas estimadas por %FC máx. — podem diferir das configuradas no Strava.",
  items: [
    { label: "Z1", valueText: "05:00", ratio: 0.5, color: "#94a3b8" },
    { label: "Z2", valueText: "05:00", ratio: 0.5, color: "#38bdf8" },
  ],
} satisfies ActivityBarSection;

describe("ActivityBarSection — campos approximate/disclaimer (Tarefa 8.2)", () => {
  it("aceita uma seção sem approximate/disclaimer (compatibilidade retroativa)", () => {
    const section: ActivityBarSection = nativeSection;

    expect(section.approximate).toBeUndefined();
    expect(section.disclaimer).toBeUndefined();
    expect(Object.hasOwn(section, "approximate")).toBe(false);
    expect(Object.hasOwn(section, "disclaimer")).toBe(false);
    expect(section.items).toHaveLength(2);
  });

  it("aceita uma seção com approximate: true e disclaimer", () => {
    const section: ActivityBarSection = approximateSection;

    expect(section.approximate).toBe(true);
    expect(section.disclaimer).toContain("%FC máx.");
  });

  it("aceita approximate: false explícito (seção nativa marcada)", () => {
    const section: ActivityBarSection = { ...nativeSection, approximate: false };

    expect(section.approximate).toBe(false);
  });

  it("aceita as duas formas no mesmo array de barSections de ActivityVisualData", () => {
    const visualData: ActivityVisualData = {
      sportLabel: "Corrida",
      sportKey: "run",
      provider: "STRAVA",
      startedAtLabel: "10/01/2026 10:00",
      heroStats: [{ label: "Distância", value: "5,0 km", tone: "primary" }],
      overviewMetrics: [{ label: "Duração", value: "30:00" }],
      barSections: [nativeSection, approximateSection],
      metricSections: [],
    };

    expect(visualData.barSections.map((s) => s.approximate)).toEqual([
      undefined,
      true,
    ]);
  });

  it("aceita as duas formas pelo tipo reexportado do Garmin (mesmo tipo do core)", () => {
    const garminNative: GarminActivityBarSection = nativeSection;
    const garminApproximate: GarminActivityBarSection = approximateSection;
    // Ida e volta: o tipo do core aceita o valor tipado como Garmin e vice-versa.
    const backToCore: ActivityBarSection = garminApproximate;

    expect(sharedAndGarminBarSectionAreTheSameType).toBe(true);
    expect(garminNative.approximate).toBeUndefined();
    expect(garminApproximate.approximate).toBe(true);
    expect(backToCore.disclaimer).toBe(approximateSection.disclaimer);
  });

  it("rejeita tipos incorretos nos campos novos (verificado no typecheck)", () => {
    const invalidApproximate: ActivityBarSection = {
      ...nativeSection,
      // @ts-expect-error `approximate` é boolean opcional, não string.
      approximate: "sim",
    };
    const invalidDisclaimer: ActivityBarSection = {
      ...nativeSection,
      // @ts-expect-error `disclaimer` é string opcional, não number.
      disclaimer: 42,
    };

    expect(invalidApproximate.id).toBe(nativeSection.id);
    expect(invalidDisclaimer.id).toBe(nativeSection.id);
  });
});
