/**
 * SAM-70 — assessments with protocol and the coach's versioned zone profiles
 * (§18.1, §18.2, §18.4, AC14).
 */
import { describe, expect, it } from "vitest";

import { loadFrozenReference } from "@/modules/school/application/athlete-assessments";
import { assessmentInputSchema, citeAssessment } from "@/modules/school/domain/athlete-assessment";
import { deriveTrainingZones, type ZoneParameters } from "@/modules/school/domain/training-zones";
import { boundsFromList, zoneBoundsSchema, zoneProfileInputSchema, type AppliedZoneProfile } from "@/modules/school/domain/zone-profile";
import { buildZoneOptions } from "@/modules/school/presentation/prescription-targets";

const PARAMS: ZoneParameters = {
  maxHeartRate: 190, thresholdHeartRate: 170, restingHeartRate: 50,
  thresholdPaceSecPerKm: 300, ftpWatts: 240, cssSecPer100m: 105, heartRateZoneMethod: null,
};

const SEVEN_POWER: AppliedZoneProfile = {
  versionId: "v-power", name: "Potência 7 zonas", version: 1, method: "Níveis do professor", reference: "FTP",
  bounds: zoneBoundsSchema.parse(boundsFromList("0, 55, 75, 90, 105, 120, 150")),
};

describe("perfil de zonas do professor (§18.1)", () => {
  it("aceita 3, 5, 7 zonas em ordem; recusa limites fora de ordem e referência de outra família", () => {
    expect(zoneBoundsSchema.parse(boundsFromList("0, 75, 90", "Leve, Moderado, Forte"))).toHaveLength(3);
    expect(zoneBoundsSchema.safeParse(boundsFromList("0, 90, 75")).success).toBe(false);
    expect(zoneBoundsSchema.safeParse(boundsFromList("50")).success).toBe(false);
    expect(zoneProfileInputSchema.safeParse({ name: "X", family: "power", reference: "CSS", method: "m", bounds: boundsFromList("0, 80") }).success).toBe(false);
    expect(zoneProfileInputSchema.safeParse({ name: "X", family: "swim", reference: "CSS", method: "m", bounds: boundsFromList("0, 80") }).success).toBe(true);
  });

  it("perfil de 7 zonas de potência gera as 7 faixas pelo FTP; o construtor oferece as 7 com o nome do perfil", () => {
    const zones = deriveTrainingZones(PARAMS, { power: SEVEN_POWER });
    expect(zones.power).toHaveLength(7);
    expect(zones.power![1]).toMatchObject({ zone: 2, fromWatts: 132, toWatts: 180 });
    expect(zones.power![6]).toMatchObject({ zone: 7, fromWatts: 360, toWatts: null });
    const options = buildZoneOptions(zones);
    expect(options.power).toHaveLength(7);
    expect(options.profiled).toEqual({ power: "Potência 7 zonas (v1)" });
    // The other families stay on the derived default.
    expect(zones.heartRate!.zones).toHaveLength(5);
  });

  it("perfil de 3 zonas de natação pelo CSS; FC por perfil usa a referência do perfil", () => {
    const swim: AppliedZoneProfile = { versionId: "v-swim", name: "Natação 3", version: 2, method: "m", reference: "CSS", bounds: zoneBoundsSchema.parse(boundsFromList("0, 85, 100")) };
    const zones = deriveTrainingZones(PARAMS, { swim });
    expect(zones.swim).toEqual([
      { zone: 1, label: null, fromPercent: 0, toPercent: 85, fromSec: 124, toSec: null },
      { zone: 2, label: null, fromPercent: 85, toPercent: 100, fromSec: 105, toSec: 124 },
      { zone: 3, label: null, fromPercent: 100, toPercent: null, fromSec: null, toSec: 105 },
    ]);
    const lthr: AppliedZoneProfile = { versionId: "v-hr", name: "FC 3", version: 1, method: "m", reference: "LTHR", bounds: zoneBoundsSchema.parse(boundsFromList("0, 90, 100")) };
    expect(deriveTrainingZones(PARAMS, { heartRate: lthr }).heartRate).toMatchObject({ method: "LTHR", zones: [{ fromBpm: 0, toBpm: 153 }, { fromBpm: 153, toBpm: 170 }, { fromBpm: 170, toBpm: 190 }] });
  });

  it("sem perfil, as zonas são exatamente as derivadas de antes", () => {
    const zones = deriveTrainingZones(PARAMS);
    expect(zones.profiles).toBeUndefined();
    expect(zones.power!.map((zone) => zone.fromWatts)).toEqual([0, 132, 180, 216, 252]);
    expect(buildZoneOptions(zones).profiled).toBeUndefined();
  });

  it("perfil cuja referência a ficha não tem não cai para outro modelo", () => {
    const zones = deriveTrainingZones({ ...PARAMS, ftpWatts: null }, { power: SEVEN_POWER });
    expect(zones.power).toBeNull();
  });
});

describe("avaliação com protocolo (§18.1)", () => {
  const base = { sportType: "swimming", assessedLocalDate: "2026-09-10", protocol: "CSS 400/200", source: "IN_PERSON" };

  it("CSS em min:s vira segundos por 100 m com a unidade da referência; 'outro' exige unidade", () => {
    expect(assessmentInputSchema.parse({ ...base, reference: "CSS", resultValue: "1:45" })).toMatchObject({ resultValue: 105, resultUnit: "s/100 m", environment: null });
    expect(assessmentInputSchema.safeParse({ ...base, reference: "OTHER", resultValue: "12" }).success).toBe(false);
    expect(assessmentInputSchema.safeParse({ ...base, reference: "FTP", resultValue: "-3" }).success).toBe(false);
    expect(assessmentInputSchema.safeParse({ ...base, assessedLocalDate: "2026-02-30", reference: "FTP", resultValue: "240" }).success).toBe(false);
  });

  it("cita o resultado com a data da avaliação", () => {
    expect(citeAssessment("FTP", 240, "W", "2026-09-10")).toBe("FTP 240 W (avaliação de 10/09/2026)");
    expect(citeAssessment("CSS", 105, "s/100 m", "2026-09-10")).toBe("CSS 1:45/100 m (avaliação de 10/09/2026)");
  });
});

describe("referência congelada na prescrição (§18.2, AC14)", () => {
  it("guarda revisão, valores, versões de perfil e cita o parâmetro vindo de avaliação promovida", async () => {
    const db = {
      athleteTechnicalSheet: {
        findFirst: async () => ({
          id: "sheet-1", ftpWatts: 240, cssSecPer100m: 105, thresholdPaceSecPerKm: null, thresholdHeartRate: null, maxHeartRate: 190, restingHeartRate: null,
          zoneProfileVersions: { power: "v-power" },
          revisions: [
            { id: "rev-3", changes: { zoneProfiles: { from: {}, to: { power: "v-power" } } }, assessment: null },
            { id: "rev-2", changes: { ftpWatts: { from: 220, to: 240 } }, assessment: { reference: "FTP", resultValue: 240, resultUnit: "W", assessedLocalDate: "2026-09-10" } },
            { id: "rev-1", changes: { maxHeartRate: { from: null, to: 190 } }, assessment: null },
          ],
        }),
      },
      zoneProfileVersion: {
        findMany: async () => [{ id: "v-power", version: 1, method: "m", bounds: SEVEN_POWER.bounds, profile: { name: "Potência 7 zonas", family: "power", reference: "FTP" } }],
      },
    };
    const reference = await loadFrozenReference(db as never, { coachId: "c1", schoolId: null }, "a1");
    expect(reference).toEqual({
      sheetRevisionId: "rev-3",
      parameters: { ftpWatts: 240, cssSecPer100m: 105, maxHeartRate: 190 },
      zoneProfiles: { power: { versionId: "v-power", name: "Potência 7 zonas", version: 1 } },
      citations: { ftpWatts: "FTP 240 W (avaliação de 10/09/2026)" },
    });
  });
});
