import { describe, expect, it } from "vitest";

import {
  RYVANO_SPORT_TYPES,
  type RyvanoSportType,
  getRyvanoSportLabel,
  isRyvanoSportType,
  mapRyvanoSportToLegacy,
  mapRyvanoSportToReportTheme,
} from "@/modules/shared/activities/sport-types";
import { getSportTheme } from "@/lib/reports/sport-themes";
import type { ReportThemeSport } from "@/lib/reports/types";
import type { SportIconName } from "@/lib/sports";

/**
 * Testes de exemplo da extensão da taxonomia canônica (Tarefa 1.3).
 *
 * Cobre os 23 novos `RyvanoSportType` exigidos pelo Apêndice A, garantindo que
 * eles sejam reconhecidos pela taxonomia, tenham rótulo pt-BR, produzam um
 * valor legado/tema de relatório válido e um tema de relatório dedicado (sem
 * cair silenciosamente no `default`).
 *
 * _Requisitos: 12.4, 12.6_
 */

/** Os 23 valores canônicos adicionados por esta spec (Apêndice A). */
const NEW_SPORT_TYPES: readonly RyvanoSportType[] = [
  "wheelchair",
  "handcycle",
  "kitesurf",
  "sail",
  "windsurf",
  "pickleball",
  "badminton",
  "squash",
  "table-tennis",
  "racquetball",
  "golf",
  "cricket",
  "dance",
  "alpine-ski",
  "backcountry-ski",
  "nordic-ski",
  "snowboard",
  "snowshoe",
  "ice-skate",
  "inline-skate",
  "roller-ski",
  "skateboard",
  "rock-climbing",
];

/** Taxonomia legada de `lib/sports.ts` (ícones/cores). */
const VALID_LEGACY_SPORTS: readonly SportIconName[] = [
  "swim",
  "bike",
  "run",
  "triathlon",
  "multisport",
  "walking",
  "strength",
  "default",
];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Tema de fallback, usado para detectar entradas ausentes em `themes`. */
const DEFAULT_THEME = getSportTheme("default");

describe("extensão da taxonomia canônica — reconhecimento (Requisito 12.4)", () => {
  it("adiciona exatamente os 23 novos valores a RYVANO_SPORT_TYPES", () => {
    expect(NEW_SPORT_TYPES).toHaveLength(23);
    expect(new Set(NEW_SPORT_TYPES).size).toBe(NEW_SPORT_TYPES.length);

    for (const sport of NEW_SPORT_TYPES) {
      expect(RYVANO_SPORT_TYPES).toContain(sport);
    }
  });

  it("isRyvanoSportType reconhece cada novo valor", () => {
    for (const sport of NEW_SPORT_TYPES) {
      expect(isRyvanoSportType(sport)).toBe(true);
    }
  });

  it("getRyvanoSportLabel devolve um rótulo dedicado para cada novo valor", () => {
    for (const sport of NEW_SPORT_TYPES) {
      const label = getRyvanoSportLabel(sport);
      expect(typeof label).toBe("string");
      expect(label.trim().length).toBeGreaterThan(0);
      // Não pode reaproveitar o rótulo genérico de fallback.
      expect(label).not.toBe(getRyvanoSportLabel("default"));
    }
  });

  it("mantém os rótulos únicos em toda a taxonomia", () => {
    const labels = RYVANO_SPORT_TYPES.map(getRyvanoSportLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("spot-check dos rótulos pt-BR de novos valores", () => {
    expect(getRyvanoSportLabel("wheelchair")).toBe("Cadeira de Rodas");
    expect(getRyvanoSportLabel("handcycle")).toBe("Handbike");
    expect(getRyvanoSportLabel("table-tennis")).toBe("Tênis de Mesa");
    expect(getRyvanoSportLabel("rock-climbing")).toBe("Escalada em Rocha");
  });
});

describe("extensão da taxonomia canônica — mapeamentos (Requisitos 12.4, 12.6)", () => {
  it("mapRyvanoSportToLegacy nunca lança e devolve um SportIconName válido", () => {
    for (const sport of NEW_SPORT_TYPES) {
      expect(() => mapRyvanoSportToLegacy(sport)).not.toThrow();
      expect(VALID_LEGACY_SPORTS).toContain(mapRyvanoSportToLegacy(sport));
    }
  });

  it("agrupa no legado mais próximo quando existe equivalência", () => {
    // Resistência com ritmo / ciclismo têm agrupamento legado equivalente.
    expect(mapRyvanoSportToLegacy("wheelchair")).toBe("walking");
    expect(mapRyvanoSportToLegacy("handcycle")).toBe("bike");
    // Modalidades sem agrupamento legado caem em "default".
    expect(mapRyvanoSportToLegacy("kitesurf")).toBe("default");
    expect(mapRyvanoSportToLegacy("alpine-ski")).toBe("default");
  });

  it("mapRyvanoSportToReportTheme nunca lança e é identidade para os novos valores", () => {
    for (const sport of NEW_SPORT_TYPES) {
      expect(() => mapRyvanoSportToReportTheme(sport)).not.toThrow();
      expect(mapRyvanoSportToReportTheme(sport)).toBe(sport);
    }
  });
});

describe("temas de relatório — getSportTheme (Requisito 12.6)", () => {
  it("devolve um tema válido para todo ReportThemeSport da taxonomia", () => {
    for (const sport of RYVANO_SPORT_TYPES) {
      const themeSport: ReportThemeSport = mapRyvanoSportToReportTheme(sport);

      expect(() => getSportTheme(themeSport)).not.toThrow();
      const theme = getSportTheme(themeSport);

      expect(theme.reportLabel.trim().length).toBeGreaterThan(0);
      expect(theme.badgeEmoji.trim().length).toBeGreaterThan(0);
      expect(theme.colorFrom).toMatch(HEX_COLOR);
      expect(theme.colorTo).toMatch(HEX_COLOR);
      expect(theme.colorAccent).toMatch(HEX_COLOR);
      expect(theme.colorSoft).toMatch(HEX_COLOR);
      expect(theme.colorSoftText).toMatch(HEX_COLOR);
    }
  });

  it("tem entrada dedicada (não fallback) para cada novo valor", () => {
    for (const sport of NEW_SPORT_TYPES) {
      const theme = getSportTheme(mapRyvanoSportToReportTheme(sport));
      // Uma chave ausente em `themes` cairia no tema `default`.
      expect(theme.reportLabel).not.toBe(DEFAULT_THEME.reportLabel);
    }
  });

  it("cai no tema default para valores desconhecidos, sem lançar", () => {
    expect(getSportTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(getSportTheme("not-a-sport")).toEqual(DEFAULT_THEME);
    expect(getSportTheme("")).toEqual(DEFAULT_THEME);
  });
});
