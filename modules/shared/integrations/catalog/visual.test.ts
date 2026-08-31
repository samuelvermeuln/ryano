import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROVIDER_VISUAL,
  getProviderVisual,
} from "@/modules/shared/integrations/catalog/visual";
import type { ProviderId } from "@/modules/shared/integrations/types";

const KNOWN_PROVIDER_IDS: readonly ProviderId[] = [
  "GARMIN",
  "STRAVA",
  "POLAR",
  "COROS",
  "SUUNTO",
  "FITBIT",
];

describe("getProviderVisual", () => {
  it.each(KNOWN_PROVIDER_IDS)(
    "retorna icon e classes não-vazias para %s",
    (providerId) => {
      const visual = getProviderVisual(providerId);

      expect(visual.icon).not.toHaveLength(0);
      expect(visual.textClassName).not.toHaveLength(0);
      expect(visual.backgroundClassName).not.toHaveLength(0);
      expect(visual.borderClassName).not.toHaveLength(0);
    },
  );

  it("retorna exatamente DEFAULT_PROVIDER_VISUAL para um providerId desconhecido", () => {
    expect(getProviderVisual("UNKNOWN")).toEqual(DEFAULT_PROVIDER_VISUAL);
  });

  it("retorna icon e textClassName diferentes entre GARMIN e STRAVA", () => {
    const garmin = getProviderVisual("GARMIN");
    const strava = getProviderVisual("STRAVA");

    expect(garmin.icon).not.toBe(strava.icon);
    expect(garmin.textClassName).not.toBe(strava.textClassName);
  });
});
