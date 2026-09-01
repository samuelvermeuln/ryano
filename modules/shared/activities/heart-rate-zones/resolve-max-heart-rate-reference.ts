/**
 * FC máxima de referência usada como denominador do cálculo de `%FCmáx` para
 * zonas de frequência cardíaca calculadas (ver Requisito 2 do spec
 * `detalhe-atividade-multi-provider`).
 *
 * Todos os campos são opcionais/nulos porque esta função é chamada com dados
 * normalizados de atividade (que podem não ter FC) e com o perfil do usuário
 * (que hoje não possui campo de idade — ver a "Observação de design sobre FC
 * máxima por idade" em design.md). Este módulo é puro: sem I/O, sem
 * dependência de `@prisma/client` nem de nenhum módulo de provider.
 */
export interface MaxHeartRateReferenceInput {
  /** FC máxima observada na própria atividade (`activity.maxHeartRate`). */
  maxHeartRate?: number | null;
  /** FC média observada na própria atividade (`activity.averageHeartRate`). */
  averageHeartRate?: number | null;
  /**
   * Idade em anos, quando disponível. Hoje sempre `undefined` na prática (o
   * `UserProfile` não tem campo de idade/data de nascimento ainda) — o
   * parâmetro já está pronto para quando esse dado existir.
   */
  ageYears?: number | null;
}

/** Fórmula genérica de FC máxima estimada por idade (Requisito 2.4-b). */
function estimateMaxHeartRateByAge(ageYears: number): number {
  return 208 - 0.7 * ageYears;
}

/**
 * Resolve a FC máxima de referência seguindo a ordem de precedência do
 * Requisito 2.4:
 *
 * (a) `maxHeartRate` da atividade, quando presente e maior que
 *     `averageHeartRate` (quando `averageHeartRate` estiver ausente, basta
 *     `maxHeartRate` estar presente);
 * (b) na ausência de (a), estimativa por idade (`208 - 0.7 * idade`), quando
 *     `ageYears` estiver presente;
 * (c) na ausência de ambas, `null` — sinal para o chamador NÃO exibir zonas
 *     de FC calculadas para essa atividade.
 *
 * Função pura e determinística (Requisito 10.3): nunca lança, não faz I/O.
 */
export function resolveMaxHeartRateReference(
  input: MaxHeartRateReferenceInput,
): number | null {
  const { maxHeartRate, averageHeartRate, ageYears } = input;

  const hasValidMaxHeartRate =
    typeof maxHeartRate === "number" &&
    Number.isFinite(maxHeartRate) &&
    (typeof averageHeartRate !== "number" ||
      !Number.isFinite(averageHeartRate) ||
      maxHeartRate > averageHeartRate);

  if (hasValidMaxHeartRate) {
    return maxHeartRate as number;
  }

  if (typeof ageYears === "number" && Number.isFinite(ageYears)) {
    return estimateMaxHeartRateByAge(ageYears);
  }

  return null;
}
