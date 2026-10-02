/**
 * SAM-32 — o detalhe do Garmin decide ritmo/cadência/velocidade pela categoria
 * canônica de exibição de métricas, não por substring do `typeKey` do Garmin.
 */

import { describe, expect, it } from "vitest";

import { METRIC_DISPLAY_RULES } from "@/modules/shared/activities/metric-display-categories";
import { resolveGarminDisplayProfile } from "@/modules/garmin/application/activities/garmin-activity-details";

describe("resolveGarminDisplayProfile (SAM-32)", () => {
  it("usa a categoria canônica da modalidade persistida", () => {
    expect(resolveGarminDisplayProfile("swim", "lap_swimming")).toEqual({
      category: "swim",
      rules: METRIC_DISPLAY_RULES.swim,
    });
    expect(resolveGarminDisplayProfile("run", "running")).toEqual({
      category: "endurance-pace",
      rules: METRIC_DISPLAY_RULES["endurance-pace"],
    });
    expect(resolveGarminDisplayProfile("bike", "cycling")).toEqual({
      category: "cycling",
      rules: METRIC_DISPLAY_RULES.cycling,
    });
    expect(resolveGarminDisplayProfile("gym", "strength_training")).toEqual({
      category: "strength-studio",
      rules: METRIC_DISPLAY_RULES["strength-studio"],
    });
  });

  it("a modalidade canônica vence o typeKey do Garmin quando discordam", () => {
    // Um "running" rotulado como open-water pelo normalizador é natação.
    expect(resolveGarminDisplayProfile("open-water", "running").category).toBe("swim");
  });

  it("legado sem modalidade canônica cai na inferência conservadora pelo typeKey", () => {
    expect(resolveGarminDisplayProfile("", "open_water_swimming").category).toBe("swim");
    expect(resolveGarminDisplayProfile("Corrida", "trail_running").category).toBe("endurance-pace");
    expect(resolveGarminDisplayProfile("", "road_biking").category).toBe("cycling");
    expect(resolveGarminDisplayProfile("", "yoga").category).toBe("default");
  });
});
