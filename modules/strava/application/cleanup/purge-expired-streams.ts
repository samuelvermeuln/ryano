/**
 * Purge de TTL do cache de STREAMS do Strava (Task 8) — NO-OP documentado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DECISÃO — por que isto é, hoje, um no-op:
 *
 * O cache de streams do Strava foi INTENCIONALMENTE ADIADO na Fase 3 (banco de
 * dados modular): nenhuma tabela `StravaStreamCache` foi criada no schema
 * (`prisma/schema.prisma`). Os streams (séries temporais de HR/potência/GPS por
 * ponto) são volumosos e ainda não são consumidos por nenhuma feature; criar a
 * tabela agora seria carga morta.
 *
 * Ainda assim, a Task 8 pede a rotina de retenção `purgeExpiredStreams` para
 * FECHAR a superfície de cleanup (todos os caches transitórios do Strava têm sua
 * função de purge correspondente e entram no agregador `runStravaRetentionCleanup`).
 * Implementamos então um no-op SEGURO que retorna `0`: quando os streams forem
 * adicionados (uma tabela `StravaStreamCache` com `expiresAt`), basta trocar o
 * corpo desta função por um `deleteMany({ where: { expiresAt: { lt: now } } })`
 * — a assinatura, o agregador e os testes já estarão prontos.
 *
 * Idempotência (Req 17.5): retornar `0` sem tocar o banco é trivialmente
 * idempotente. Segurança (Req 20.1/20.2): sem I/O, sem dados sensíveis.
 *
 * _Requisitos: 17.1, 17.2, 17.5_
 */

/** Parâmetros do purge de streams expirados (relógio injetável para simetria). */
export interface PurgeExpiredStreamsInput {
  /** Relógio injetável (default `() => new Date()`), para testes/simetria. */
  now?: () => Date;
}

/** Resultado do purge de streams: quantas linhas foram removidas. */
export interface PurgeExpiredStreamsResult {
  /** Linhas removidas do cache de streams (sempre 0 enquanto a tabela não existir). */
  deletedStreamEntries: number;
}

/**
 * No-op de retenção de streams do Strava. Retorna `0` porque a tabela de cache
 * de streams ainda não existe (adiada na Fase 3). Ativa-se automaticamente
 * quando um `StravaStreamCache` com `expiresAt` for adicionado — ver a decisão
 * documentada no topo do arquivo.
 */
export async function purgeExpiredStreams(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _input: PurgeExpiredStreamsInput = {},
): Promise<PurgeExpiredStreamsResult> {
  // Nenhuma tabela `StravaStreamCache` foi criada (streams adiados na Fase 3).
  // Quando existir, substituir por:
  //   const now = _input.now ? _input.now() : new Date();
  //   const deleted = await prisma.stravaStreamCache.deleteMany({
  //     where: { expiresAt: { lt: now } },
  //   });
  //   return { deletedStreamEntries: deleted.count };
  return { deletedStreamEntries: 0 };
}
