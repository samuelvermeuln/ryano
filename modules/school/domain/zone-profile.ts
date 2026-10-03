/**
 * SAM-70 — a coach's zone profile (§18.1: "não existe Z2 universal").
 *
 * Configuration, not athlete data: the coach names the method, picks the
 * reference (FTP, CSS, threshold pace, FCmáx, FC de reserva or limiar) and
 * sets as many zones as the model has (3, 5, 7…), each as a lower bound in %
 * of the reference; the last zone is open. Every edit is a new immutable
 * version, so a prescription can say which version it was written against.
 * Nothing converts one model into another (§18.4).
 */
import { z } from "zod";

export const ZONE_FAMILIES = ["heartRate", "pace", "swim", "power"] as const;
export type ZoneFamily = (typeof ZONE_FAMILIES)[number];

export const ZONE_FAMILY_LABELS: Record<ZoneFamily, string> = {
  heartRate: "Frequência cardíaca",
  pace: "Ritmo de corrida",
  swim: "Natação (CSS)",
  power: "Potência",
};

/** The references each family can be measured against. */
export const ZONE_FAMILY_REFERENCES: Record<ZoneFamily, readonly string[]> = {
  heartRate: ["MAX_HR", "HRR", "LTHR"],
  pace: ["THRESHOLD_PACE"],
  swim: ["CSS"],
  power: ["FTP"],
};

export const ZONE_REFERENCE_LABELS: Record<string, string> = {
  MAX_HR: "% da FC máxima",
  HRR: "% da FC de reserva",
  LTHR: "% da FC de limiar",
  THRESHOLD_PACE: "% da velocidade de limiar",
  CSS: "% da velocidade do CSS",
  FTP: "% do FTP",
};

export const MIN_ZONES = 2;
export const MAX_ZONES = 12;

export const zoneBoundSchema = z.strictObject({
  zone: z.number().int().min(1).max(MAX_ZONES),
  label: z.string().trim().max(60).nullable().optional(),
  fromPercent: z.number().min(0).max(300),
});

export const zoneBoundsSchema = z.array(zoneBoundSchema).min(MIN_ZONES).max(MAX_ZONES).superRefine((bounds, ctx) => {
  bounds.forEach((bound, index) => {
    if (bound.zone !== index + 1) ctx.addIssue({ code: "custom", message: "As zonas são numeradas em ordem a partir de 1.", path: [index, "zone"] });
    if (index > 0 && bound.fromPercent <= bounds[index - 1]!.fromPercent) {
      ctx.addIssue({ code: "custom", message: "Cada zona começa acima da anterior.", path: [index, "fromPercent"] });
    }
  });
});
export type ZoneBounds = z.infer<typeof zoneBoundsSchema>;

export const zoneProfileInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  family: z.enum(ZONE_FAMILIES),
  reference: z.string().max(20),
  method: z.string().trim().min(1).max(200),
  bounds: zoneBoundsSchema,
}).refine((value) => ZONE_FAMILY_REFERENCES[value.family].includes(value.reference), {
  message: "Referência incompatível com a família de zonas.", path: ["reference"],
});
export type ZoneProfileInput = z.infer<typeof zoneProfileInputSchema>;

/** A profile version as applied to an athlete's sheet. */
export type AppliedZoneProfile = {
  versionId: string;
  name: string;
  version: number;
  method: string;
  reference: string;
  bounds: ZoneBounds;
};

/** `{family: versionId}` stored on the sheet; anything else reads as "none". */
export const sheetZoneProfilesSchema = z.partialRecord(z.enum(ZONE_FAMILIES), z.string().min(1).max(64));
export type SheetZoneProfiles = z.infer<typeof sheetZoneProfilesSchema>;

export function readSheetZoneProfiles(raw: unknown): SheetZoneProfiles {
  const parsed = sheetZoneProfilesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/** Bounds as bands: each zone runs up to the next one's lower bound; the last is open. */
export function profileBands(bounds: ZoneBounds) {
  return bounds.map((bound, index) => ({
    zone: bound.zone,
    label: bound.label ?? null,
    fromPercent: bound.fromPercent,
    toPercent: bounds[index + 1]?.fromPercent ?? null,
  }));
}

/**
 * "0, 55, 75, 90, 105, 120, 150" → bounds. The form takes the lower bounds as
 * a list because that is how the coach reads a zone model.
 */
export function boundsFromList(list: string, labels: string = ""): unknown {
  const names = labels.split(",").map((label) => label.trim());
  return list.split(/[,;\s]+/).filter(Boolean).map((value, index) => ({
    zone: index + 1,
    label: names[index] || null,
    fromPercent: Number(value.replace(",", ".")),
  }));
}
