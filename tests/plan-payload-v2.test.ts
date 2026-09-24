/**
 * TM010 — planPayloadSchema v2: sessions[] per day (multimodal/multi-session).
 *
 * Foco: o formato antigo (schemaVersion=1) continua lido sem alteração; o
 * formato novo permite mais de uma sessão por dia com sportType canônico
 * próprio; `parsePlanPayload` despacha pelo schemaVersion (design D-03).
 */
import { describe, expect, it } from "vitest";
import {
  parsePlanPayload,
  planPayloadSchema,
  planPayloadSchemaV2,
  planSessionSchema,
  createTrainingProductVersion,
} from "@/modules/school/domain/training-product-version";

const now = new Date("2026-09-23T12:00:00Z");

const legacyPayload = {
  weeks: [{ week: 1, days: [{ workoutTemplateId: "tpl-1", dayOfWeek: 1 }] }],
};

const multimodalPayload = {
  weeks: [
    {
      week: 1,
      days: [
        {
          dayOfWeek: 1,
          sessions: [
            { planSessionId: "s1", workoutTemplateId: "tpl-run", sportType: "run", order: 0 },
            { planSessionId: "s2", workoutTemplateId: "tpl-strength", sportType: "gym", order: 1 },
          ],
        },
      ],
    },
  ],
};

describe("planSessionSchema [TM010]", () => {
  it("aceita sportType canônico", () => {
    expect(() => planSessionSchema.parse({
      planSessionId: "s1", workoutTemplateId: "tpl-1", sportType: "run", order: 0,
    })).not.toThrow();
  });

  it("rejeita sportType não canônico (RNF-006)", () => {
    expect(() => planSessionSchema.parse({
      planSessionId: "s1", workoutTemplateId: "tpl-1", sportType: "not-a-real-sport", order: 0,
    })).toThrow();
  });
});

describe("planPayloadSchemaV2 [TM010]", () => {
  it("aceita duas sessões (corrida + força) no mesmo dia", () => {
    const parsed = planPayloadSchemaV2.parse(multimodalPayload);
    expect(parsed.weeks[0].days[0].sessions).toHaveLength(2);
  });

  it("rejeita dia sem nenhuma sessão", () => {
    expect(() => planPayloadSchemaV2.parse({
      weeks: [{ week: 1, days: [{ dayOfWeek: 1, sessions: [] }] }],
    })).toThrow();
  });
});

describe("parsePlanPayload [TM010, design D-03]", () => {
  it("schemaVersion 1 despacha para o schema legado", () => {
    const parsed = parsePlanPayload(1, legacyPayload);
    expect(parsed).toEqual(planPayloadSchema.parse(legacyPayload));
  });

  it("schemaVersion 2 despacha para o schema multimodal", () => {
    const parsed = parsePlanPayload(2, multimodalPayload);
    expect(parsed).toEqual(planPayloadSchemaV2.parse(multimodalPayload));
  });

  it("payload legado passado com schemaVersion 2 é rejeitado (formatos não se misturam)", () => {
    expect(() => parsePlanPayload(2, legacyPayload)).toThrow();
  });
});

describe("createTrainingProductVersion com schemaVersion [TM010]", () => {
  it("schemaVersion omitido default para 1 e valida payload legado (retrocompatibilidade)", () => {
    const v = createTrainingProductVersion({
      id: "ver-1", productId: "prod-1", versionNumber: 1,
      planPayload: legacyPayload, changeNote: null, publishedAt: null,
    }, now);
    expect(v.schemaVersion).toBe(1);
  });

  it("schemaVersion=2 com payload multimodal válido", () => {
    const v = createTrainingProductVersion({
      id: "ver-2", productId: "prod-1", versionNumber: 2, schemaVersion: 2,
      planPayload: multimodalPayload, changeNote: null, publishedAt: null,
    }, now);
    expect(v.schemaVersion).toBe(2);
  });

  it("schemaVersion=2 com payload no formato legado é rejeitado", () => {
    expect(() => createTrainingProductVersion({
      id: "ver-3", productId: "prod-1", versionNumber: 3, schemaVersion: 2,
      planPayload: legacyPayload, changeNote: null, publishedAt: null,
    }, now)).toThrow();
  });

  it("duplicar semana preserva planSessionId estável (rastreabilidade)", () => {
    const week2 = { ...multimodalPayload.weeks[0], week: 2 };
    const twoWeeks = { weeks: [multimodalPayload.weeks[0], week2] };
    const v = createTrainingProductVersion({
      id: "ver-4", productId: "prod-1", versionNumber: 1, schemaVersion: 2,
      planPayload: twoWeeks, changeNote: null, publishedAt: null,
    }, now);
    const payload = v.planPayload as typeof multimodalPayload;
    expect(payload.weeks[0].days[0].sessions[0].planSessionId).toBe("s1");
    expect(payload.weeks[1].days[0].sessions[0].planSessionId).toBe("s1");
  });
});
