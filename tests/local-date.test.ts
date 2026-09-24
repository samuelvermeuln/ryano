/**
 * TM011 — local-date.ts: timezone-correct calendar math, no date library.
 *
 * Real 2026 DST transitions for America/New_York, verified against the
 * system's own Intl data (not hardcoded folklore): 2026-03-08 is the
 * 23-hour "spring forward" day (offset GMT-5 -> GMT-4), 2026-11-01 is the
 * 25-hour "fall back" day (GMT-4 -> GMT-5).
 */
import { describe, expect, it } from "vitest";
import {
  addCalendarDays, isValidLocalDate, isoWeekday, localMidnightToUtc, mondayOnOrBefore,
} from "@/modules/school/domain/local-date";

describe("isValidLocalDate [TM011]", () => {
  it("aceita datas reais", () => {
    expect(isValidLocalDate("2026-09-23")).toBe(true);
    expect(isValidLocalDate("2026-02-28")).toBe(true);
  });
  it("rejeita 29/02 em ano não bissexto e outras datas inexistentes", () => {
    expect(isValidLocalDate("2026-02-29")).toBe(false);
    expect(isValidLocalDate("2026-04-31")).toBe(false);
  });
  it("rejeita formato incorreto", () => {
    expect(isValidLocalDate("23-09-2026")).toBe(false);
    expect(isValidLocalDate("2026-9-23")).toBe(false);
  });
});

describe("addCalendarDays [TM011]", () => {
  it("soma dentro do mesmo mês", () => {
    expect(addCalendarDays("2026-09-01", 5)).toBe("2026-09-06");
  });
  it("atravessa virada de mês e de ano", () => {
    expect(addCalendarDays("2026-09-28", 5)).toBe("2026-10-03");
    expect(addCalendarDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("aceita offset negativo", () => {
    expect(addCalendarDays("2026-09-05", -10)).toBe("2026-08-26");
  });
});

describe("isoWeekday / mondayOnOrBefore [TM011]", () => {
  it("2026-09-23 é uma quarta-feira (isoWeekday=3)", () => {
    expect(isoWeekday("2026-09-23")).toBe(3);
  });
  it("segunda-feira aponta para si mesma", () => {
    expect(isoWeekday("2026-09-21")).toBe(1);
    expect(mondayOnOrBefore("2026-09-21")).toBe("2026-09-21");
  });
  it("domingo retrocede para a segunda anterior (não avança)", () => {
    expect(isoWeekday("2026-09-27")).toBe(7);
    expect(mondayOnOrBefore("2026-09-27")).toBe("2026-09-21");
  });
});

describe("localMidnightToUtc [TM011, RF-006]", () => {
  it("fuso positivo (Asia/Tokyo, UTC+9): meia-noite local = 15:00 UTC do dia anterior", () => {
    const utc = localMidnightToUtc("2026-09-23", "Asia/Tokyo");
    expect(utc.toISOString()).toBe("2026-09-22T15:00:00.000Z");
  });

  it("fuso negativo (America/New_York, GMT-4 em setembro): meia-noite local = 04:00 UTC do mesmo dia", () => {
    const utc = localMidnightToUtc("2026-09-23", "America/New_York");
    expect(utc.toISOString()).toBe("2026-09-23T04:00:00.000Z");
  });

  it("dia de 'spring forward' (2026-03-08, America/New_York): o dia dura 23h, não 24h", () => {
    const startOfDay = localMidnightToUtc("2026-03-08", "America/New_York");
    const startOfNextDay = localMidnightToUtc("2026-03-09", "America/New_York");
    const hours = (startOfNextDay.getTime() - startOfDay.getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  it("dia de 'fall back' (2026-11-01, America/New_York): o dia dura 25h, não 24h", () => {
    const startOfDay = localMidnightToUtc("2026-11-01", "America/New_York");
    const startOfNextDay = localMidnightToUtc("2026-11-02", "America/New_York");
    const hours = (startOfNextDay.getTime() - startOfDay.getTime()) / 3_600_000;
    expect(hours).toBe(25);
  });

  it("uma semana inteira atravessando o 'spring forward' não desloca nenhum dia", () => {
    // Monday 2026-03-02 .. Sunday 2026-03-08 (DST falls on the Sunday).
    const days = Array.from({ length: 7 }, (_, i) => addCalendarDays("2026-03-02", i));
    const localWeekdays = days.map((d) => {
      const utc = localMidnightToUtc(d, "America/New_York");
      // Reading the LOCAL date back out of the UTC instant must round-trip
      // to the same day — this is exactly what a naive "+24h" scheme breaks.
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(utc);
    });
    expect(localWeekdays).toEqual(days);
  });
});
