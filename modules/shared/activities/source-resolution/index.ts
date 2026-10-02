/**
 * SAM-45 — resolução de fonte: qual conexão alimenta cada campo quando o
 * atleta tem mais de uma (Garmin espelhando no Strava, Polar + Fitbit…).
 *
 * Não é reconciliação: nada é mesclado, nenhum valor é recalculado. Para cada
 * campo escolhe-se UM provider e rotula-se a origem, de modo que a tela diga
 * "Sono: Garmin · FC de repouso: Polar". A reconciliação de métricas da mesma
 * atividade (`modules/shared/activities/reconciliation`) continua desligada
 * por padrão; aqui, quando a combinação entre providers NÃO está liberada,
 * o detalhe de uma atividade vem inteiro de uma única conexão (a primária).
 *
 * Puro: sem I/O, sem Prisma, sem import de módulo de provider. A ordem de
 * preferência vem de fora (preferência do atleta, depois ordem do catálogo).
 */
import type { ProviderId } from "@/modules/shared/integrations/types";
import {
  ACTIVITY_DETAIL_FIELDS,
  DAILY_HEALTH_FIELDS,
  type ActivityDetailField,
  type DailyHealthField,
  type MetricSource,
  type NormalizedActivityDetail,
  type NormalizedDailyHealth,
  type SessionFingerprint,
} from "../contracts/rich";

// ---------------------------------------------------------------------------
// Preferência
// ---------------------------------------------------------------------------

/** Ordena providers: os preferidos primeiro (na ordem dada), depois os demais na ordem em que apareceram. */
export function rankProviders(present: readonly ProviderId[], preferred: readonly ProviderId[] = []): ProviderId[] {
  const seen = new Set<ProviderId>();
  const ranked: ProviderId[] = [];
  for (const provider of [...preferred, ...present]) {
    if (present.includes(provider) && !seen.has(provider)) {
      seen.add(provider);
      ranked.push(provider);
    }
  }
  return ranked;
}

// ---------------------------------------------------------------------------
// Detalhe de atividade
// ---------------------------------------------------------------------------

export type ActivityDetailCandidate = {
  provider: ProviderId;
  detail: NormalizedActivityDetail;
};

export type ResolvedActivityDetailSources = {
  primaryProvider: ProviderId;
  laps: NormalizedActivityDetail["laps"];
  zones: NormalizedActivityDetail["zones"];
  streams: NormalizedActivityDetail["streams"];
  stats: NormalizedActivityDetail["stats"];
  /** Quem alimentou cada bloco presente. */
  sources: Partial<Record<ActivityDetailField, MetricSource>>;
};

function hasBlock(detail: NormalizedActivityDetail, field: ActivityDetailField): boolean {
  if (field === "stats") return Object.values(detail.stats).some((value) => value !== null && value !== undefined);
  return detail[field].length > 0;
}

/** Zonas nativas valem mais que derivadas; entre iguais, a de maior cobertura (mais segundos somados). */
function zoneQuality(detail: NormalizedActivityDetail): number {
  return detail.zones.reduce((best, set) => {
    const seconds = set.zones.reduce((sum, zone) => sum + zone.durationSeconds, 0);
    const score = (set.source.kind === "native" ? 1_000_000_000 : 0) + seconds;
    return Math.max(best, score);
  }, 0);
}

/** Mais amostras = série mais rica; lat/lng presente desempata (habilita o mapa). */
function streamQuality(detail: NormalizedActivityDetail): number {
  const samples = detail.streams.reduce((sum, stream) => sum + stream.values.filter((value) => value !== null).length, 0);
  const hasGps = detail.streams.some((stream) => stream.key === "latlng") ? 1_000_000_000 : 0;
  return hasGps + samples;
}

function statsQuality(detail: NormalizedActivityDetail): number {
  return Object.values(detail.stats).filter((value) => value !== null && value !== undefined).length;
}

function blockQuality(detail: NormalizedActivityDetail, field: ActivityDetailField): number {
  switch (field) {
    case "laps": return detail.laps.length;
    case "zones": return zoneQuality(detail);
    case "streams": return streamQuality(detail);
    case "stats": return statsQuality(detail);
  }
}

/**
 * Escolhe, por bloco, a conexão que alimenta o detalhe da atividade.
 *
 * - `combinationAllowed: false` (padrão; é o estado do Policy Gate): tudo vem
 *   da conexão primária — a primeira na ordem de preferência que tem algum
 *   dado. Blocos que ela não tem ficam ausentes mesmo que outra conexão os
 *   tenha: sem licença para combinar, não se combina.
 * - `combinationAllowed: true`: por bloco, a melhor fonte (zonas nativas >
 *   derivadas; série com GPS e mais amostras; mais voltas; mais estatísticas),
 *   empates pela ordem de preferência. Cada bloco continua vindo inteiro de
 *   UM provider e rotulado — nunca metade de cada.
 */
export function resolveActivityDetailSources(
  candidates: readonly ActivityDetailCandidate[],
  options: { preferred?: readonly ProviderId[]; combinationAllowed?: boolean } = {},
): ResolvedActivityDetailSources | null {
  if (candidates.length === 0) return null;
  const order = rankProviders(candidates.map((candidate) => candidate.provider), options.preferred);
  const byProvider = new Map(candidates.map((candidate) => [candidate.provider, candidate.detail]));
  const ordered = order.map((provider) => ({ provider, detail: byProvider.get(provider)! }));

  const primary = ordered.find(({ detail }) => ACTIVITY_DETAIL_FIELDS.some((field) => hasBlock(detail, field))) ?? ordered[0]!;
  const empty: ResolvedActivityDetailSources = {
    primaryProvider: primary.provider, laps: [], zones: [], streams: [], stats: primary.detail.stats, sources: {},
  };

  const pick = (field: ActivityDetailField): ActivityDetailCandidate | null => {
    if (!options.combinationAllowed) {
      return hasBlock(primary.detail, field) ? primary : null;
    }
    let best: ActivityDetailCandidate | null = null;
    let bestQuality = 0;
    for (const candidate of ordered) {
      if (!hasBlock(candidate.detail, field)) continue;
      const quality = blockQuality(candidate.detail, field);
      if (best === null || quality > bestQuality) {
        best = candidate;
        bestQuality = quality;
      }
    }
    return best;
  };

  const sourceOf = (candidate: ActivityDetailCandidate, field: ActivityDetailField): MetricSource =>
    candidate.detail.sources[field] ?? { provider: candidate.provider, kind: "native" };

  const result: ResolvedActivityDetailSources = { ...empty, stats: { ...empty.stats } };
  for (const field of ACTIVITY_DETAIL_FIELDS) {
    const chosen = pick(field);
    if (!chosen) continue;
    if (field === "stats") result.stats = chosen.detail.stats;
    else result[field] = chosen.detail[field] as never;
    result.sources[field] = sourceOf(chosen, field);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Saúde diária
// ---------------------------------------------------------------------------

export type ResolvedDailyHealth = {
  date: string;
  /** Campo a campo, de onde o valor veio; campos sem fonte não aparecem. */
  sources: Partial<Record<DailyHealthField, ProviderId>>;
  values: Partial<Pick<NormalizedDailyHealth, DailyHealthField>>;
  providers: ProviderId[];
};

/**
 * Para um dia, uma conexão por campo: a preferida (ordem dada) que tem o
 * valor; entre iguais, a de `fetchedAt` mais recente. Fases do sono nunca se
 * misturam com um score de outro provider sem rótulo: cada campo tem o seu.
 */
export function resolveDailyHealthSources(
  records: readonly NormalizedDailyHealth[],
  options: { preferred?: readonly ProviderId[] } = {},
): ResolvedDailyHealth | null {
  if (records.length === 0) return null;
  const date = records[0]!.date;
  const sameDay = records.filter((record) => record.date === date);
  const order = rankProviders(sameDay.map((record) => record.provider), options.preferred);
  const byProvider = new Map<ProviderId, NormalizedDailyHealth>();
  for (const record of sameDay) {
    const current = byProvider.get(record.provider);
    if (!current || record.fetchedAt > current.fetchedAt) byProvider.set(record.provider, record);
  }

  const result: ResolvedDailyHealth = { date, sources: {}, values: {}, providers: order };
  for (const field of DAILY_HEALTH_FIELDS) {
    for (const provider of order) {
      const value = byProvider.get(provider)![field];
      if (value === null || value === undefined) continue;
      (result.values as Record<string, unknown>)[field] = value;
      result.sources[field] = provider;
      break;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// A mesma sessão vinda de duas conexões
// ---------------------------------------------------------------------------

export type DuplicateSessionOptions = {
  /** Diferença máxima entre os inícios (padrão 10 min). */
  maxStartDeltaMs?: number;
  /** Tolerância relativa de duração/distância (padrão 15%). */
  tolerance?: number;
  preferred?: readonly ProviderId[];
};

export type DuplicateSession = { keepId: string; duplicateId: string; keepProvider: ProviderId; duplicateProvider: ProviderId };

function within(left: number | null, right: number | null, tolerance: number): boolean | null {
  if (left === null || right === null) return null;
  if (left === 0 && right === 0) return true;
  const base = Math.max(Math.abs(left), Math.abs(right));
  return Math.abs(left - right) / base <= tolerance;
}

/**
 * Detecta a mesma sessão registrada por conexões diferentes: mesma modalidade
 * canônica, inícios próximos e duração ou distância compatíveis (quando ambos
 * existem, os dois têm de bater; sem nenhum dos dois, só o início próximo
 * não basta). Devolve pares `keep`/`duplicate`, mantendo a conexão preferida
 * (ou a de maior preferência entre as presentes). Nunca junta duas sessões
 * do MESMO provider: isso é outra atividade, não um espelho.
 */
export function findDuplicateSessions(
  sessions: readonly SessionFingerprint[],
  options: DuplicateSessionOptions = {},
): DuplicateSession[] {
  const maxDelta = options.maxStartDeltaMs ?? 10 * 60_000;
  const tolerance = options.tolerance ?? 0.15;
  const order = rankProviders([...new Set(sessions.map((session) => session.provider))], options.preferred);
  const rank = (provider: ProviderId) => order.indexOf(provider);
  const duplicates: DuplicateSession[] = [];
  const taken = new Set<string>();

  const sorted = [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  for (let i = 0; i < sorted.length; i += 1) {
    const left = sorted[i]!;
    if (taken.has(left.id)) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const right = sorted[j]!;
      if (taken.has(right.id) || right.provider === left.provider) continue;
      if (right.startedAt.getTime() - left.startedAt.getTime() > maxDelta) break;
      if (right.sportType !== left.sportType) continue;
      const duration = within(left.durationSeconds, right.durationSeconds, tolerance);
      const distance = within(left.distanceMeters, right.distanceMeters, tolerance);
      if (duration === false || distance === false) continue;
      if (duration === null && distance === null) continue;
      const keepLeft = rank(left.provider) <= rank(right.provider);
      const keep = keepLeft ? left : right;
      const duplicate = keepLeft ? right : left;
      duplicates.push({ keepId: keep.id, duplicateId: duplicate.id, keepProvider: keep.provider, duplicateProvider: duplicate.provider });
      taken.add(duplicate.id);
      break;
    }
  }
  return duplicates;
}
