/**
 * SAM-74 — activity file parsers (§17.3, §21.6). Each format follows its
 * official specification, consulted on 2026-10-03:
 *
 * - FIT: Garmin's FIT SDK for JavaScript (`@garmin/fitsdk`, FIT Protocol
 *   License) — `Decoder` over a `Stream`, `isFIT` + `checkIntegrity`, then
 *   `read()` giving `sessionMesgs`, `lapMesgs`, `recordMesgs`, `lengthMesgs`;
 *   positions in semicircles (÷ 2^31 × 180 = degrees); `convertDateTimesToDates`.
 *   https://developer.garmin.com/fit/overview/ · https://github.com/garmin/fit-javascript-sdk
 * - GPX 1.1: namespace http://www.topografix.com/GPX/1/1, `gpx` → `trk` →
 *   `trkseg` → `trkpt[lat,lon]` with `ele`, `time`, `extensions` (heart rate
 *   and cadence usually under Garmin's TrackPointExtension `hr`/`cad`).
 *   https://www.topografix.com/GPX/1/1/
 * - TCX: namespace http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2,
 *   `Activities` → `Activity[Sport]` → `Lap[StartTime]` (TotalTimeSeconds,
 *   DistanceMeters, AverageHeartRateBpm/Value) → `Track` → `Trackpoint`
 *   (Time, Position/LatitudeDegrees/LongitudeDegrees, AltitudeMeters,
 *   DistanceMeters, HeartRateBpm/Value, Cadence, Extensions TPX Speed/Watts).
 *   https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd
 *
 * Output is the canonical pair: a `NormalizedActivity` and the rich
 * `NormalizedActivityDetail` (laps + sparse streams aligned to `time`).
 * Absence is `null`/absent, never zero. Unsupported or corrupted content
 * raises `ActivityFileError` with a message the athlete can act on.
 */
import { Decoder, Stream } from "@garmin/fitsdk";
import { XMLParser } from "fast-xml-parser";

import type { NormalizedActivity } from "@/modules/shared/activities/contracts";
import { normalizedActivityDetailSchema, type NormalizedActivityDetail, type NormalizedLap } from "@/modules/shared/activities/contracts/rich";
import { isRyvanoSportType, type RyvanoSportType } from "@/modules/shared/activities/sport-types";

export class ActivityFileError extends Error {
  constructor(message: string, readonly code: "UNSUPPORTED_FORMAT" | "CORRUPTED" | "EMPTY" = "CORRUPTED") {
    super(message);
    this.name = "ActivityFileError";
  }
}

export type ParsedActivityFile = {
  format: "FIT" | "GPX" | "TCX";
  activity: Omit<NormalizedActivity, "source" | "externalId">;
  detail: Omit<NormalizedActivityDetail, "provider" | "externalId">;
  /** Pool length in metres for pool swims, when the file says it. */
  poolLengthMeters: number | null;
};

const SOURCE = { provider: "FILE" as const, kind: "native" as const };
const SEMICIRCLE = 180 / 2 ** 31;

/** The canonical sport for what the file declares; unknown stays "default". */
function toSport(raw: string | undefined | null, subSport?: string | null): RyvanoSportType {
  const text = `${raw ?? ""} ${subSport ?? ""}`.toLowerCase();
  const table: Array<[RegExp, RyvanoSportType]> = [
    [/open.?water/, "open-water"], [/lap_swimming|pool|swim/, "swim"], [/trail/, "trail-run"], [/run|jog/, "run"],
    [/walk/, "walking"], [/hik/, "hiking"], [/mountain|mtb/, "mtb"], [/bik|cycl|ride|gravel/, "bike"],
    [/row/, "rowing"], [/kayak/, "kayak"], [/strength|training|gym/, "gym"],
  ];
  for (const [pattern, sport] of table) if (pattern.test(text) && isRyvanoSportType(sport)) return sport;
  return "default";
}

type Sample = { t: number; d: number | null; lat: number | null; lon: number | null; alt: number | null; hr: number | null; cad: number | null; pw: number | null; spd: number | null };

function streamsOf(samples: Sample[], startedAt: Date) {
  if (samples.length === 0) return [];
  const has = (pick: (sample: Sample) => number | null) => samples.some((sample) => pick(sample) !== null);
  const stream = (key: NormalizedActivityDetail["streams"][number]["key"], pick: (sample: Sample) => number | null) =>
    has(pick) ? [{ key, values: samples.map(pick), source: SOURCE }] : [];
  const latlng = samples.some((sample) => sample.lat !== null && sample.lon !== null)
    ? [{ key: "latlng" as const, values: samples.map((sample) => (sample.lat !== null && sample.lon !== null ? [sample.lat, sample.lon] as [number, number] : null)), source: SOURCE }]
    : [];
  void startedAt;
  return [
    { key: "time" as const, values: samples.map((sample) => sample.t), source: SOURCE },
    ...stream("distance", (sample) => sample.d), ...latlng, ...stream("altitude", (sample) => sample.alt),
    ...stream("heartRate", (sample) => sample.hr), ...stream("cadence", (sample) => sample.cad), ...stream("power", (sample) => sample.pw), ...stream("speed", (sample) => sample.spd),
  ];
}

function summary(samples: Sample[], laps: NormalizedLap[]) {
  const hr = samples.map((sample) => sample.hr).filter((value): value is number => value !== null);
  const pw = samples.map((sample) => sample.pw).filter((value): value is number => value !== null);
  const spd = samples.map((sample) => sample.spd).filter((value): value is number => value !== null);
  const lapDistance = laps.reduce((sum, lap) => sum + (lap.distanceMeters ?? 0), 0);
  const lastDistance = [...samples].reverse().find((sample) => sample.d !== null)?.d ?? null;
  return {
    distanceMeters: lapDistance > 0 ? lapDistance : lastDistance ?? undefined,
    averageHeartRate: hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : undefined,
    maxHeartRate: hr.length ? Math.max(...hr) : undefined,
    averagePower: pw.length ? Math.round(pw.reduce((a, b) => a + b, 0) / pw.length) : undefined,
    maxPower: pw.length ? Math.max(...pw) : undefined,
    maxSpeed: spd.length ? Math.max(...spd) : undefined,
  };
}

function finish(format: ParsedActivityFile["format"], input: {
  sportType: RyvanoSportType; providerSportType: string; startedAt: Date; durationSeconds: number | null; movingSeconds?: number | null;
  samples: Sample[]; laps: NormalizedLap[]; poolLengthMeters?: number | null; extra?: Partial<NormalizedActivity>;
}): ParsedActivityFile {
  if (input.samples.length === 0 && input.laps.length === 0) throw new ActivityFileError("O arquivo não tem registros de atividade (nenhum ponto nem volta).", "EMPTY");
  const stats = summary(input.samples, input.laps);
  const detail = normalizedActivityDetailSchema.parse({ provider: "FILE", externalId: "file", laps: input.laps, streams: streamsOf(input.samples, input.startedAt), zones: [], sources: { laps: SOURCE, streams: SOURCE } });
  const { provider: _provider, externalId: _externalId, ...rest } = detail;
  void _provider; void _externalId;
  return {
    format,
    activity: {
      sportType: input.sportType, providerSportType: input.providerSportType, startedAt: input.startedAt,
      ...(input.durationSeconds !== null ? { durationSeconds: Math.round(input.durationSeconds) } : {}),
      ...(input.movingSeconds ? { movingSeconds: Math.round(input.movingSeconds) } : {}),
      ...Object.fromEntries(Object.entries(stats).filter(([, value]) => value !== undefined)),
      ...(stats.distanceMeters !== undefined && input.durationSeconds ? { averageSpeed: stats.distanceMeters / input.durationSeconds } : {}),
      ...input.extra,
    },
    detail: rest,
    poolLengthMeters: input.poolLengthMeters ?? null,
  };
}

// ---------------------------------------------------------------------------
// FIT
// ---------------------------------------------------------------------------

type FitRecord = { timestamp?: Date; positionLat?: number; positionLong?: number; distance?: number; altitude?: number; enhancedAltitude?: number; heartRate?: number; cadence?: number; power?: number; speed?: number; enhancedSpeed?: number };
type FitLap = { startTime?: Date; totalElapsedTime?: number; totalTimerTime?: number; totalDistance?: number; avgHeartRate?: number; maxHeartRate?: number; avgCadence?: number; avgPower?: number; totalCalories?: number; avgSpeed?: number; enhancedAvgSpeed?: number };
type FitSession = { sport?: string; subSport?: string; startTime?: Date; totalElapsedTime?: number; totalTimerTime?: number; totalMovingTime?: number; totalDistance?: number; poolLength?: number; poolLengthUnit?: string; totalAscent?: number };

export function parseFit(bytes: Uint8Array): ParsedActivityFile {
  const stream = Stream.fromByteArray(bytes);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new ActivityFileError("Este arquivo não é um FIT válido.", "UNSUPPORTED_FORMAT");
  if (!decoder.checkIntegrity()) throw new ActivityFileError("O arquivo FIT está corrompido (falha na verificação de integridade).");
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true, convertTypesToStrings: true, applyScaleAndOffset: true, expandSubFields: true, expandComponents: true, mergeHeartRates: true, includeUnknownData: false }) as unknown as { messages: Record<string, unknown[]>; errors: unknown[] };
  if (errors.length > 0 && !(messages.recordMesgs?.length)) throw new ActivityFileError("Não foi possível ler as mensagens do arquivo FIT.");
  const session = (messages.sessionMesgs?.[0] ?? {}) as FitSession;
  const records = (messages.recordMesgs ?? []) as FitRecord[];
  const start = session.startTime ?? records.find((record) => record.timestamp)?.timestamp;
  if (!start) throw new ActivityFileError("O arquivo FIT não informa quando a atividade começou.");
  const t0 = start.getTime();
  const samples: Sample[] = records.filter((record) => record.timestamp).map((record) => ({
    t: Math.round((record.timestamp!.getTime() - t0) / 1000),
    d: record.distance ?? null,
    lat: record.positionLat !== undefined ? record.positionLat * SEMICIRCLE : null,
    lon: record.positionLong !== undefined ? record.positionLong * SEMICIRCLE : null,
    alt: record.enhancedAltitude ?? record.altitude ?? null,
    hr: record.heartRate ?? null, cad: record.cadence ?? null, pw: record.power ?? null, spd: record.enhancedSpeed ?? record.speed ?? null,
  })).filter((sample) => sample.t >= 0);
  const laps: NormalizedLap[] = ((messages.lapMesgs ?? []) as FitLap[]).map((lap, index) => ({
    lapNumber: index + 1, startedAt: lap.startTime ?? null,
    durationSeconds: lap.totalElapsedTime ?? null, movingSeconds: lap.totalTimerTime ?? null, distanceMeters: lap.totalDistance ?? null,
    averagePace: null, averageSpeed: lap.enhancedAvgSpeed ?? lap.avgSpeed ?? null, averageHeartRate: lap.avgHeartRate ?? null, maxHeartRate: lap.maxHeartRate ?? null,
    averageCadence: lap.avgCadence ?? null, averageStrokeRate: null, maxStrokeRate: null, averageDistancePerStroke: null, averagePower: lap.avgPower ?? null,
    calories: lap.totalCalories ?? null, averageTemperature: null,
  }));
  const poolLength = session.poolLength ? (session.poolLengthUnit === "statute" ? session.poolLength * 0.9144 : session.poolLength) : null;
  return finish("FIT", {
    sportType: toSport(session.sport, session.subSport), providerSportType: [session.sport, session.subSport].filter(Boolean).join("/") || "unknown",
    startedAt: start, durationSeconds: session.totalElapsedTime ?? session.totalTimerTime ?? (samples.length ? samples[samples.length - 1]!.t : null),
    movingSeconds: session.totalMovingTime ?? session.totalTimerTime ?? null, samples, laps, poolLengthMeters: poolLength,
    extra: { ...(session.totalAscent !== undefined ? { elevationGain: session.totalAscent } : {}), ...(session.totalDistance !== undefined ? { distanceMeters: session.totalDistance } : {}) },
  });
}

// ---------------------------------------------------------------------------
// GPX 1.1 and TCX v2 (XML)
// ---------------------------------------------------------------------------

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, isArray: (name) => ["trk", "trkseg", "trkpt", "Activity", "Lap", "Track", "Trackpoint"].includes(name) });

const num = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "object" && value !== null && "#text" in value ? Number((value as { "#text": unknown })["#text"]) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const date = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

function haversine(a: [number, number], b: [number, number]) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function parseGpx(text: string): ParsedActivityFile {
  const doc = xml.parse(text) as { gpx?: { "@_version"?: string; metadata?: { time?: string }; trk?: Array<{ name?: string; type?: string; trkseg?: Array<{ trkpt?: Array<Record<string, unknown>> }> }> } };
  if (!doc.gpx) throw new ActivityFileError("Este arquivo não é um GPX (raiz <gpx> ausente).", "UNSUPPORTED_FORMAT");
  const points = (doc.gpx.trk ?? []).flatMap((track) => (track.trkseg ?? []).flatMap((segment) => segment.trkpt ?? []));
  const timed = points.map((point) => ({ point, at: date(point.time) })).filter((entry): entry is { point: Record<string, unknown>; at: Date } => entry.at !== null);
  if (timed.length === 0) throw new ActivityFileError("O GPX não tem pontos com horário: não dá para reconstruir a atividade.", "EMPTY");
  const t0 = timed[0]!.at.getTime();
  let covered = 0;
  let previous: [number, number] | null = null;
  const samples: Sample[] = timed.map(({ point, at }) => {
    const lat = num(point["@_lat"]);
    const lon = num(point["@_lon"]);
    if (lat !== null && lon !== null) {
      if (previous) covered += haversine(previous, [lat, lon]);
      previous = [lat, lon];
    }
    const ext = (point.extensions ?? {}) as Record<string, unknown>;
    const tpx = (ext.TrackPointExtension ?? ext) as Record<string, unknown>;
    return { t: Math.round((at.getTime() - t0) / 1000), d: lat !== null && lon !== null ? Math.round(covered * 100) / 100 : null, lat, lon, alt: num(point.ele), hr: num(tpx.hr), cad: num(tpx.cad), pw: num(ext.power ?? tpx.power), spd: null };
  });
  const type = doc.gpx.trk?.[0]?.type ?? "";
  const duration = samples[samples.length - 1]!.t;
  return finish("GPX", { sportType: toSport(type), providerSportType: type || "gpx", startedAt: timed[0]!.at, durationSeconds: duration, samples, laps: [] });
}

export function parseTcx(text: string): ParsedActivityFile {
  const doc = xml.parse(text) as { TrainingCenterDatabase?: { Activities?: { Activity?: Array<{ "@_Sport"?: string; Id?: string; Lap?: Array<Record<string, unknown>> }> } } };
  const activity = doc.TrainingCenterDatabase?.Activities?.Activity?.[0];
  if (!activity) throw new ActivityFileError("Este arquivo não é um TCX com atividade (<Activities>/<Activity> ausente).", "UNSUPPORTED_FORMAT");
  const lapsRaw = activity.Lap ?? [];
  const trackpoints = lapsRaw.flatMap((lap) => ((lap.Track as Array<{ Trackpoint?: Array<Record<string, unknown>> }> | undefined) ?? []).flatMap((track) => track.Trackpoint ?? []));
  const start = date(lapsRaw[0]?.["@_StartTime"]) ?? date(activity.Id) ?? date(trackpoints[0]?.Time);
  if (!start) throw new ActivityFileError("O TCX não informa quando a atividade começou.");
  const t0 = start.getTime();
  const samples: Sample[] = trackpoints.map((point) => ({ point, at: date(point.Time) })).filter((entry): entry is { point: Record<string, unknown>; at: Date } => entry.at !== null).map(({ point, at }) => {
    const position = point.Position as { LatitudeDegrees?: unknown; LongitudeDegrees?: unknown } | undefined;
    const tpx = ((point.Extensions as Record<string, unknown> | undefined)?.TPX ?? {}) as Record<string, unknown>;
    return {
      t: Math.round((at.getTime() - t0) / 1000), d: num(point.DistanceMeters), lat: num(position?.LatitudeDegrees), lon: num(position?.LongitudeDegrees), alt: num(point.AltitudeMeters),
      hr: num((point.HeartRateBpm as { Value?: unknown } | undefined)?.Value), cad: num(point.Cadence), pw: num(tpx.Watts), spd: num(tpx.Speed),
    };
  }).filter((sample) => sample.t >= 0);
  const laps: NormalizedLap[] = lapsRaw.map((lap, index) => ({
    lapNumber: index + 1, startedAt: date(lap["@_StartTime"]), durationSeconds: num(lap.TotalTimeSeconds), movingSeconds: null, distanceMeters: num(lap.DistanceMeters),
    averagePace: null, averageSpeed: null, averageHeartRate: num((lap.AverageHeartRateBpm as { Value?: unknown } | undefined)?.Value), maxHeartRate: num((lap.MaximumHeartRateBpm as { Value?: unknown } | undefined)?.Value),
    averageCadence: num(lap.Cadence), averageStrokeRate: null, maxStrokeRate: null, averageDistancePerStroke: null, averagePower: null, calories: num(lap.Calories), averageTemperature: null,
  }));
  const duration = laps.reduce((sum, lap) => sum + (lap.durationSeconds ?? 0), 0) || (samples.length ? samples[samples.length - 1]!.t : null);
  const sport = activity["@_Sport"] ?? "Other";
  return finish("TCX", { sportType: toSport(sport), providerSportType: sport, startedAt: start, durationSeconds: duration, samples, laps });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const SUPPORTED_EXTENSIONS = ["fit", "gpx", "tcx"] as const;

export function parseActivityFile(filename: string, bytes: Uint8Array): ParsedActivityFile {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  const header = new TextDecoder("latin1").decode(bytes.slice(0, 12));
  if (extension === "fit" || header.includes(".FIT")) return parseFit(bytes);
  const text = new TextDecoder("utf-8").decode(bytes);
  if (extension === "gpx" || /<gpx[\s>]/i.test(text)) return parseGpx(text);
  if (extension === "tcx" || /<TrainingCenterDatabase[\s>]/i.test(text)) return parseTcx(text);
  throw new ActivityFileError("Formato não suportado. Aceitamos FIT, GPX 1.1 e TCX.", "UNSUPPORTED_FORMAT");
}
