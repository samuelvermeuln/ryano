/**
 * SAM-52 — per-modality event fields (§12–§16, AC15).
 */
import { describe, expect, it } from "vitest";

import {
  describeEventConditions,
  describeSegments,
  eventDetailsFamily,
  parseEventDetails,
  parseOptionDetails,
} from "@/modules/school/domain/sport-event-details";

describe("família por modalidade", () => {
  it("mapeia modalidades canônicas; as demais ficam só com observações", () => {
    expect(eventDetailsFamily("open-water")).toBe("openWater");
    expect(eventDetailsFamily("swim")).toBe("pool");
    expect(eventDetailsFamily("trail-run")).toBe("run");
    expect(eventDetailsFamily("mtb")).toBe("bike");
    expect(eventDetailsFamily("aquathlon")).toBe("multisport");
    expect(eventDetailsFamily("tennis")).toBeNull();
    expect(parseEventDetails("tennis", { notes: "quadra 3" })).toEqual({ schemaVersion: 1, notes: "quadra 3" });
    expect(() => parseEventDetails("tennis", { conditions: {} })).toThrow();
  });

  it("campos de outra modalidade são recusados; vazio vira nulo", () => {
    expect(() => parseOptionDetails("swim", { segments: [] })).toThrow();
    expect(parseOptionDetails("swim", {})).toBeNull();
    expect(parseOptionDetails("swim", null)).toBeNull();
    expect(() => parseOptionDetails("swim", { schemaVersion: 9, stroke: "MEDLEY" })).toThrow(/Versão/);
  });
});

describe("águas abertas (§13.3)", () => {
  const details = parseEventDetails("open-water", {
    water: "SALT",
    conditions: {
      waterTemperature: { value: 21, unit: "°C", source: "FORECAST", sourceName: "organizador", observedAt: "2026-12-10T09:00:00-03:00" },
    },
    safety: { responsible: "Equipe de resgate do organizador", exitPoints: "boias 2 e 4" },
  });

  it("previsão da água com proveniência; ar desconhecido não copia a água", () => {
    const rows = describeEventConditions("open-water", details, "America/Sao_Paulo");
    const water = rows.find((row) => row.label === "Temperatura da água")!;
    const air = rows.find((row) => row.label === "Temperatura do ar")!;
    expect(water.value).toBe("21 °C");
    expect(water.provenance).toBe("previsão, organizador, 10/12");
    expect(air).toEqual({ label: "Temperatura do ar", value: "desconhecida", provenance: null });
    expect(rows).toHaveLength(7);
  });

  it("condição sem fonte é recusada; não há 'certificado de segurança'", () => {
    expect(() => parseEventDetails("open-water", { conditions: { wind: { value: 12, unit: "nós" } } })).toThrow();
    expect(() => parseEventDetails("open-water", { safety: { certified: true } })).toThrow();
  });
});

describe("piscina (§12.1)", () => {
  it("25 m e 50 m são opções distintas, sem conversão", () => {
    const short = parseOptionDetails("swim", { stroke: "FREESTYLE", poolLength: { value: 25, unit: "m" }, timing: "ELECTRONIC" });
    const long = parseOptionDetails("swim", { stroke: "FREESTYLE", poolLength: { value: 50, unit: "m" } });
    expect(short).toMatchObject({ poolLength: { value: 25, unit: "m" } });
    expect(long).toMatchObject({ poolLength: { value: 50, unit: "m" } });
    expect(parseOptionDetails("swim", { poolLength: { value: 25, unit: "yd" } })).toMatchObject({ poolLength: { unit: "yd" } });
  });
});

describe("triathlon (§16.1)", () => {
  it("cinco segmentos com cortes; transição sem distância; distâncias não somadas", () => {
    const details = parseOptionDetails("triathlon", {
      format: "OLYMPIC",
      segments: [
        { kind: "SWIM", distanceValue: 1.5, distanceUnit: "km", cutoffMinutes: 50 },
        { kind: "T1" },
        { kind: "BIKE", distanceValue: 40, distanceUnit: "km", cutoffMinutes: 150 },
        { kind: "T2" },
        { kind: "RUN", distanceValue: 10, distanceUnit: "km", cutoffMinutes: 230 },
      ],
    });
    const rows = describeSegments(details);
    expect(rows.map((row) => row.label)).toEqual(["Natação", "T1", "Ciclismo", "T2", "Corrida"]);
    expect(rows[0]!.value).toBe("1,5 km · corte 50 min");
    expect(rows[1]!.value).toBe("—");
    expect(() => parseOptionDetails("triathlon", { segments: [{ kind: "T1", distanceValue: 200, distanceUnit: "m" }] })).toThrow(/Transição/);
    expect(() => parseOptionDetails("triathlon", { segments: [{ kind: "SWIM", distanceValue: 750 }] })).toThrow(/valor e unidade/);
  });
});
