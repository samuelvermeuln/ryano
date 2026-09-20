import { describe, expect, it } from "vitest";

import {
  addMonthsUTC,
  addYearsUTC,
  getMonthGridDays,
  getMonthRange,
  getYearRange,
  monthParam,
  parseDayParam,
  parseMonthParam,
  parseViewParam,
  parseYearParam,
  toISODate,
} from "@/app/app/treinos/date-helpers";
import { buildViewHref } from "@/app/app/treinos/view-switcher";

// UTC date, one call site — avoids re-deriving `new Date(Date.UTC(...))` in every test.
function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

describe("parseViewParam", () => {
  it("aceita os 5 valores válidos", () => {
    expect(parseViewParam("day")).toBe("day");
    expect(parseViewParam("week")).toBe("week");
    expect(parseViewParam("month")).toBe("month");
    expect(parseViewParam("year")).toBe("year");
    expect(parseViewParam("list")).toBe("list");
  });

  it("cai em 'week' para valor inválido ou ausente", () => {
    expect(parseViewParam("xyz")).toBe("week");
    expect(parseViewParam(undefined)).toBe("week");
    expect(parseViewParam("")).toBe("week");
  });
});

describe("parseDayParam / parseMonthParam / parseYearParam", () => {
  it("faz o parse de valores válidos", () => {
    expect(toISODate(parseDayParam("2026-03-15"))).toBe("2026-03-15");
    expect(monthParam(parseMonthParam("2026-03"))).toBe("2026-03");
    expect(parseYearParam("2026").getUTCFullYear()).toBe(2026);
  });

  it("cai no valor atual para entrada ausente ou malformada, sem lançar", () => {
    expect(() => parseDayParam("lixo")).not.toThrow();
    expect(() => parseMonthParam("2026-13")).not.toThrow();
    expect(() => parseMonthParam("2026-2")).not.toThrow(); // sem zero à esquerda: inválido
    expect(() => parseYearParam("abc")).not.toThrow();

    const now = new Date();
    expect(parseDayParam(undefined).getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(parseMonthParam("2026-13").getUTCMonth()).toBe(now.getUTCMonth());
    expect(parseYearParam(undefined).getUTCFullYear()).toBe(now.getUTCFullYear());
  });
});

describe("getMonthRange", () => {
  it("cobre do dia 1 00:00 ao último dia 23:59:59.999, em UTC", () => {
    const { start, end } = getMonthRange(utc(2026, 9, 1));
    expect(toISODate(start)).toBe("2026-09-01");
    expect(toISODate(end)).toBe("2026-09-30");
    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
  });

  it("lida com fevereiro bissexto", () => {
    const { end } = getMonthRange(utc(2024, 2, 1));
    expect(toISODate(end)).toBe("2024-02-29");
  });

  it("lida com fevereiro não-bissexto", () => {
    const { end } = getMonthRange(utc(2026, 2, 1));
    expect(toISODate(end)).toBe("2026-02-28");
  });
});

describe("getYearRange", () => {
  it("cobre de 1º de janeiro a 31 de dezembro do mesmo ano", () => {
    const { start, end } = getYearRange(utc(2026, 1, 1));
    expect(toISODate(start)).toBe("2026-01-01");
    expect(toISODate(end)).toBe("2026-12-31");
  });
});

describe("getMonthGridDays", () => {
  it("retorna sempre um múltiplo de 7 dias", () => {
    for (let month = 1; month <= 12; month++) {
      expect(getMonthGridDays(utc(2026, month, 1)).length % 7).toBe(0);
    }
  });

  it("inclui o mês inteiro e começa numa segunda-feira / termina num domingo", () => {
    const days = getMonthGridDays(utc(2026, 9, 1)); // setembro/2026 começa numa terça
    expect(days[0]!.getUTCDay()).toBe(1); // segunda
    expect(days.at(-1)!.getUTCDay()).toBe(0); // domingo
    expect(days.some((d) => toISODate(d) === "2026-09-01")).toBe(true);
    expect(days.some((d) => toISODate(d) === "2026-09-30")).toBe(true);
  });

  it("cobre corretamente um mês que termina num domingo (dezembro/2026)", () => {
    const days = getMonthGridDays(utc(2026, 12, 1));
    expect(days.some((d) => toISODate(d) === "2026-12-31")).toBe(true);
    expect(days.at(-1)!.getUTCDay()).toBe(0);
  });
});

describe("addMonthsUTC / addYearsUTC", () => {
  it("vira o ano corretamente (dezembro -> janeiro)", () => {
    const next = addMonthsUTC(utc(2026, 12, 1), 1);
    expect(next.getUTCFullYear()).toBe(2027);
    expect(next.getUTCMonth()).toBe(0);
  });

  it("volta o ano corretamente (janeiro -> dezembro)", () => {
    const prev = addMonthsUTC(utc(2026, 1, 1), -1);
    expect(prev.getUTCFullYear()).toBe(2025);
    expect(prev.getUTCMonth()).toBe(11);
  });

  it("soma/subtrai anos preservando mês e dia", () => {
    expect(addYearsUTC(utc(2026, 1, 1), 1).getUTCFullYear()).toBe(2027);
    expect(addYearsUTC(utc(2026, 1, 1), -1).getUTCFullYear()).toBe(2025);
  });
});

describe("buildViewHref", () => {
  const anchor = utc(2026, 9, 15);

  it("converte o anchor pro formato de param de cada visão", () => {
    expect(buildViewHref("day", anchor)).toBe("?view=day&date=2026-09-15");
    expect(buildViewHref("week", anchor)).toBe("?view=week&week=2026-09-14"); // segunda ISO da semana
    expect(buildViewHref("month", anchor)).toBe("?view=month&month=2026-09");
    expect(buildViewHref("year", anchor)).toBe("?view=year&year=2026");
    expect(buildViewHref("list", anchor)).toBe("?view=list&month=2026-09");
  });

  it("mês -> ano preserva o ano correto (caso citado no plano)", () => {
    const monthAnchor = utc(2026, 1, 1); // 1º de janeiro, anchor típico de month-view
    expect(buildViewHref("year", monthAnchor)).toBe("?view=year&year=2026");
  });
});
