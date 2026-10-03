/** SAM-57 — canonical modalities offered in event forms and calendar filters. */
import { RYVANO_SPORT_TYPES, resolveSportLabel } from "@/modules/shared/activities/sport-types";

export function sportOptions(): Array<{ value: string; label: string }> {
  return RYVANO_SPORT_TYPES
    .filter((sport) => sport !== "default")
    .map((sport) => ({ value: sport, label: resolveSportLabel(sport) ?? sport }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
