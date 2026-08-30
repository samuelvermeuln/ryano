/**
 * Superfície mínima de MÉTRICAS rotuladas por provider para as integrações
 * esportivas (Task 9.3 / Req 20.4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Por que in-process (um `Map`) e não uma dependência de métricas?
 *
 * O objetivo desta camada é oferecer, de forma leve e testável, contadores
 * ROTULADOS por provider (e por métrica/status) SEM introduzir uma dependência
 * pesada (Prometheus client, OpenTelemetry, etc.). Os contadores vivem em um
 * `Map` do processo: são incrementados nos call sites-chave (client, refresh,
 * sync, webhook) e podem ser inspecionados via `getIntegrationMetricsSnapshot`.
 *
 * Consequência (documentada de propósito): o estado é POR PROCESSO e volátil —
 * reinícios zeram os contadores e, em deploy multi-instância, cada instância
 * mantém os seus. Isso é suficiente para introspecção/observabilidade local e
 * para os testes; quando for necessário exportar/scrapear (Prometheus, StatsD,
 * OTel), basta ler `getIntegrationMetricsSnapshot()` em um endpoint/coletor e
 * publicar as séries — sem tocar nos call sites.
 *
 * Segurança (Req 20.1/20.2): as LABELS são estritamente controladas
 * (provider + métrica + status). Nunca passe tokens/secrets/PII como label —
 * `status` deve ser um rótulo estável e de baixa cardinalidade (ex.: "ok",
 * "http_error", "rate_limited"), jamais um valor sensível.
 *
 * _Requisitos: 20.4_
 */

import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * Métricas rastreadas por provider. Conjunto pequeno e fechado — a cardinalidade
 * é intencionalmente baixa para manter o `Map` enxuto e as séries úteis.
 *
 * - `request`       → chamada à API do provider concluída com sucesso.
 * - `error`         → chamada/operação do provider que terminou em erro.
 * - `sync`          → uma sincronização (backfill/incremental) concluída.
 * - `webhook`       → um evento de webhook processado.
 * - `token_refresh` → um refresh de token executado.
 */
export type IntegrationMetricName =
  | "request"
  | "error"
  | "sync"
  | "webhook"
  | "token_refresh";

/** Argumentos para incrementar um contador rotulado. */
export interface IncrementIntegrationMetricInput {
  /** Provider ao qual a métrica pertence (label obrigatório). */
  provider: ProviderId;
  /** Nome da métrica (label obrigatório). */
  metric: IntegrationMetricName;
  /**
   * Rótulo de status opcional e de BAIXA cardinalidade (ex.: "ok",
   * "http_error", "rate_limited", "processed"). NUNCA um valor sensível/PII.
   */
  status?: string;
  /** Quantidade a somar (default 1). */
  by?: number;
}

/** Entrada do snapshot: uma série rotulada com seu valor acumulado. */
export interface IntegrationMetricSnapshotEntry {
  provider: ProviderId;
  metric: IntegrationMetricName;
  /** `undefined` quando a métrica foi incrementada sem `status`. */
  status?: string;
  count: number;
}

/**
 * Estado dos contadores (por processo). A chave codifica os labels de forma
 * estável; os valores originais ficam guardados para reconstruir o snapshot.
 */
interface MetricCell {
  provider: ProviderId;
  metric: IntegrationMetricName;
  status?: string;
  count: number;
}

const counters = new Map<string, MetricCell>();

/** Monta a chave estável do `Map` a partir dos labels. */
function labelKey(
  provider: ProviderId,
  metric: IntegrationMetricName,
  status: string | undefined,
): string {
  return `${provider}::${metric}::${status ?? ""}`;
}

/**
 * Incrementa (por processo) o contador rotulado por `provider` + `metric`
 * (+ `status` opcional). Retorna o valor acumulado após o incremento.
 *
 * Chamado nos call sites-chave das integrações; deve ser barato e nunca lançar.
 *
 * _Requisitos: 20.4_
 */
export function incrementIntegrationMetric(
  input: IncrementIntegrationMetricInput,
): number {
  const by = typeof input.by === "number" && Number.isFinite(input.by) ? input.by : 1;
  const key = labelKey(input.provider, input.metric, input.status);
  const existing = counters.get(key);

  if (existing) {
    existing.count += by;
    return existing.count;
  }

  counters.set(key, {
    provider: input.provider,
    metric: input.metric,
    status: input.status,
    count: by,
  });

  return by;
}

/**
 * Retorna um snapshot imutável de todos os contadores acumulados. Ordenado de
 * forma determinística (provider, métrica, status) para facilitar asserções e
 * introspecção. Pode ser lido por um endpoint/coletor para exportar as séries.
 */
export function getIntegrationMetricsSnapshot(): IntegrationMetricSnapshotEntry[] {
  return [...counters.values()]
    .map((cell) => ({
      provider: cell.provider,
      metric: cell.metric,
      status: cell.status,
      count: cell.count,
    }))
    .sort((a, b) => {
      if (a.provider !== b.provider) return a.provider < b.provider ? -1 : 1;
      if (a.metric !== b.metric) return a.metric < b.metric ? -1 : 1;
      return (a.status ?? "") < (b.status ?? "") ? -1 : (a.status ?? "") > (b.status ?? "") ? 1 : 0;
    });
}

/**
 * Lê o valor acumulado de UMA série rotulada (0 quando nunca incrementada).
 * Útil para introspecção pontual e para os testes.
 */
export function getIntegrationMetric(input: {
  provider: ProviderId;
  metric: IntegrationMetricName;
  status?: string;
}): number {
  return counters.get(labelKey(input.provider, input.metric, input.status))?.count ?? 0;
}

/**
 * Zera todos os contadores. Existe para isolar cenários nos testes; em produção
 * os contadores só são zerados por reinício do processo.
 */
export function resetIntegrationMetrics(): void {
  counters.clear();
}
