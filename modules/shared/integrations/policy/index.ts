/**
 * Policy Gate por provider — impõe arquiteturalmente os usos permitidos dos
 * dados de cada integração (armazenamento e combinação entre providers).
 *
 * O objetivo é transformar restrições de conformidade em barreiras de código,
 * não em convenção: qualquer caminho que persista cache ou combine providers
 * DEVE passar por `assertPolicy`, que lança um erro tipado quando a política
 * proíbe a operação.
 *
 * As políticas refletem a documentação oficial vigente de cada provider e
 * começam conservadoras: para providers ainda não implementados, todo uso é
 * negado por padrão. A combinação entre providers tem uma trava adicional por
 * variável de ambiente, de modo que mesmo uma política permissiva não habilita
 * reconciliação sem o flag explícito.
 *
 * _Requisitos: 15.1, 15.2, 15.3, 15.6_
 */

import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * Política de uso de dados de um provider.
 *
 * Cada flag representa um uso que só é permitido quando explicitamente liberado.
 * O padrão para providers não mapeados é negar tudo (ver `DEFAULT_POLICY`).
 *
 * _Requisitos: 15.1_
 */
export type ProviderDataPolicy = {
  /** Permite persistir dados do provider (ex.: cache de atividades). */
  allowPersistentStorage: boolean;
  /** Idade máxima de cache permitida, em segundos, quando a persistência é permitida. */
  maxCacheAgeSeconds?: number;
  /** Permite combinar/reconciliar dados deste provider com os de outro. */
  allowCrossProviderCombination: boolean;
};

/**
 * Ação submetida ao Policy Gate.
 *
 * - `persist`  → `allowPersistentStorage`
 * - `combine`  → `allowCrossProviderCombination` (+ flag de reconciliação)
 */
export type PolicyAction = "persist" | "combine";

/**
 * Política conservadora aplicada a providers ainda não implementados: nenhum
 * uso é permitido até que a política real seja definida com base na doc oficial.
 */
const DEFAULT_POLICY: ProviderDataPolicy = {
  allowPersistentStorage: false,
  allowCrossProviderCombination: false,
};

/**
 * Políticas por provider, baseadas na documentação oficial vigente.
 *
 * GARMIN e STRAVA permitem armazenamento persistente (necessário para as
 * atividades importadas), mas NÃO permitem combinação entre providers enquanto
 * as políticas vigentes proibirem.
 *
 * Providers futuros (POLAR/COROS/SUUNTO/FITBIT) herdam `DEFAULT_POLICY` (tudo
 * negado) e terão sua política própria definida quando forem implementados.
 *
 * _Requisitos: 15.1, 15.2_
 */
export const PROVIDER_POLICIES: Record<ProviderId, ProviderDataPolicy> = {
  GARMIN: {
    allowPersistentStorage: true,
    allowCrossProviderCombination: false,
  },
  STRAVA: {
    allowPersistentStorage: true,
    // Cache de atividades do Strava com TTL conservador (7 dias). Ajustar contra
    // a política/doc oficial vigente ao evoluir o cache do módulo Strava.
    maxCacheAgeSeconds: 7 * 24 * 60 * 60,
    allowCrossProviderCombination: false,
  },
  // Providers ainda não implementados: política definida ao implementar.
  POLAR: DEFAULT_POLICY,
  COROS: DEFAULT_POLICY,
  SUUNTO: DEFAULT_POLICY,
  FITBIT: DEFAULT_POLICY,
};

/**
 * Erro lançado quando o Policy Gate bloqueia uma operação.
 *
 * Tipado para permitir que o chamador capture, registre e omita a
 * funcionalidade sem confundir com outros erros. Carrega o provider e a ação
 * negados para observabilidade.
 *
 * _Requisitos: 15.3_
 */
export class ProviderPolicyViolationError extends Error {
  /** Provider cuja política bloqueou a operação. */
  readonly providerId: ProviderId;
  /** Ação que foi negada pelo Policy Gate. */
  readonly action: PolicyAction;

  constructor(providerId: ProviderId, action: PolicyAction, reason?: string) {
    super(
      `Policy Gate bloqueou a ação "${action}" para o provider "${providerId}"` +
        (reason ? `: ${reason}` : "."),
    );
    this.name = "ProviderPolicyViolationError";
    this.providerId = providerId;
    this.action = action;
    // Mantém a cadeia de protótipo correta ao estender Error (target ES5+).
    Object.setPrototypeOf(this, ProviderPolicyViolationError.prototype);
  }
}

/**
 * Lê, de forma centralizada, o flag que habilita a combinação/reconciliação
 * entre providers (`STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED`).
 *
 * Nenhum outro ponto do core deve acessar essa variável diretamente. O padrão é
 * `false`: somente o valor explícito `"true"` habilita a combinação, garantindo
 * que a possibilidade técnica não vire permissão implícita.
 *
 * _Requisitos: 15.6_
 */
export function isCrossProviderCombinationFlagEnabled(): boolean {
  const raw = process.env.STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED;

  if (raw === undefined) {
    return false;
  }

  return raw.trim().toLowerCase() === "true";
}

/**
 * Retorna a política de um provider (ou a política conservadora padrão para
 * providers ainda não mapeados).
 */
export function getProviderPolicy(providerId: ProviderId): ProviderDataPolicy {
  return PROVIDER_POLICIES[providerId] ?? DEFAULT_POLICY;
}

/**
 * Indica se uma ação é permitida para um provider, aplicando também a trava de
 * ambiente para a combinação entre providers.
 *
 * Diferente de `assertPolicy`, não lança — útil para decidir se uma seção
 * opcional deve ser exibida/processada.
 *
 * _Requisitos: 15.3, 15.6_
 */
export function isPolicyAllowed(
  providerId: ProviderId,
  action: PolicyAction,
): boolean {
  const policy = getProviderPolicy(providerId);

  switch (action) {
    case "persist":
      return policy.allowPersistentStorage;
    case "combine":
      // Combinação exige AMBOS: política permissiva E flag de ambiente ligado.
      return (
        policy.allowCrossProviderCombination &&
        isCrossProviderCombinationFlagEnabled()
      );
    default: {
      // Exaustividade: qualquer nova ação deve ser tratada explicitamente.
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/**
 * Impõe a política de um provider para uma ação, lançando
 * `ProviderPolicyViolationError` quando a operação não é permitida.
 *
 * Deve ser chamado ANTES de persistir cache ou combinar providers. Para
 * `"combine"`, lança quando a política nega OU quando o flag de reconciliação
 * está desligado (Req 15.6).
 *
 * _Requisitos: 15.3, 15.6_
 */
export function assertPolicy(
  providerId: ProviderId,
  action: PolicyAction,
): void {
  if (isPolicyAllowed(providerId, action)) {
    return;
  }

  if (
    action === "combine" &&
    getProviderPolicy(providerId).allowCrossProviderCombination &&
    !isCrossProviderCombinationFlagEnabled()
  ) {
    throw new ProviderPolicyViolationError(
      providerId,
      action,
      "combinação entre providers desabilitada por STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED",
    );
  }

  throw new ProviderPolicyViolationError(providerId, action);
}
