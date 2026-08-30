/**
 * Policy Gate por provider — impõe arquiteturalmente os usos permitidos dos
 * dados de cada integração (armazenamento, combinação, compartilhamento e IA).
 *
 * O objetivo é transformar restrições de conformidade em barreiras de código,
 * não em convenção: qualquer caminho que persista cache, combine providers,
 * compartilhe com terceiros ou envie dados a IA/LLM DEVE passar por
 * `assertPolicy`, que lança um erro tipado quando a política proíbe a operação.
 *
 * As políticas refletem a documentação oficial vigente de cada provider e
 * começam conservadoras: para providers ainda não implementados, todo uso é
 * negado por padrão. A combinação entre providers tem uma trava adicional por
 * variável de ambiente, de modo que mesmo uma política permissiva não habilita
 * reconciliação sem o flag explícito.
 *
 * _Requisitos: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_
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
  /** Permite enviar dados do provider a IA/LLM/embeddings/RAG/treinamento. */
  allowAiProcessing: boolean;
  /** Permite divulgar dados do provider a terceiros. */
  allowThirdPartyDisclosure: boolean;
};

/**
 * Ação submetida ao Policy Gate.
 *
 * - `persist`  → `allowPersistentStorage`
 * - `combine`  → `allowCrossProviderCombination` (+ flag de reconciliação)
 * - `share`    → `allowThirdPartyDisclosure`
 * - `ai`       → `allowAiProcessing`
 */
export type PolicyAction = "persist" | "combine" | "share" | "ai";

/**
 * Política conservadora aplicada a providers ainda não implementados: nenhum
 * uso é permitido até que a política real seja definida com base na doc oficial.
 */
const DEFAULT_POLICY: ProviderDataPolicy = {
  allowPersistentStorage: false,
  allowCrossProviderCombination: false,
  allowAiProcessing: false,
  allowThirdPartyDisclosure: false,
};

/**
 * Políticas por provider, baseadas na documentação oficial vigente.
 *
 * GARMIN e STRAVA permitem armazenamento persistente (necessário para as
 * atividades importadas), mas NÃO permitem combinação entre providers, envio a
 * IA nem divulgação a terceiros enquanto as políticas vigentes proibirem.
 *
 * Providers futuros (POLAR/COROS/SUUNTO/FITBIT) herdam `DEFAULT_POLICY` (tudo
 * negado) e terão sua política própria definida quando forem implementados.
 *
 * _Requisitos: 15.1, 15.2, 15.4, 15.5_
 */
export const PROVIDER_POLICIES: Record<ProviderId, ProviderDataPolicy> = {
  GARMIN: {
    allowPersistentStorage: true,
    allowCrossProviderCombination: false,
    allowAiProcessing: false,
    allowThirdPartyDisclosure: false,
  },
  STRAVA: {
    allowPersistentStorage: true,
    // Cache de atividades do Strava com TTL conservador (7 dias). Ajustar contra
    // a política/doc oficial vigente ao evoluir o cache do módulo Strava.
    maxCacheAgeSeconds: 7 * 24 * 60 * 60,
    allowCrossProviderCombination: false,
    allowAiProcessing: false,
    allowThirdPartyDisclosure: false,
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
 * _Requisitos: 15.3, 15.4_
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
    case "share":
      return policy.allowThirdPartyDisclosure;
    case "ai":
      return policy.allowAiProcessing;
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
 * Deve ser chamado ANTES de persistir cache, combinar providers, compartilhar
 * com terceiros ou enviar dados a IA. Para `"ai"`, lança para STRAVA e GARMIN
 * enquanto `allowAiProcessing === false`, impondo a restrição
 * arquiteturalmente (Req 15.4). Para `"combine"`, lança quando a política nega
 * OU quando o flag de reconciliação está desligado (Req 15.6).
 *
 * _Requisitos: 15.3, 15.4, 15.5, 15.6_
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

/**
 * ---------------------------------------------------------------------------
 * Guards de alto nível para IA e compartilhamento com terceiros (Req 15.4/15.5)
 * ---------------------------------------------------------------------------
 *
 * Estes helpers são a superfície OBRIGATÓRIA para qualquer código que pretenda
 * enviar dados de um provider a IA/LLM/embeddings/RAG/memória de agente/
 * treinamento/fine-tuning, ou divulgá-los a terceiros. Eles apenas delegam a
 * `assertPolicy`, mas tornam a intenção explícita no ponto de chamada e
 * centralizam a enforcement em uma API estável.
 *
 * IMPORTANTE (regra de arquitetura, imposta por código e não por convenção):
 * TODO caminho futuro que envolva IA (OpenAI/Anthropic/Gemini/Bedrock/modelos
 * locais/embeddings/RAG/treinamento/classificação por LLM) ou exportação a
 * terceiros DEVE chamar `assertAiProcessingAllowed` /
 * `assertThirdPartyDisclosureAllowed` (ou a variante multi-provider) ANTES de
 * transmitir qualquer dado. Enquanto `allowAiProcessing`/
 * `allowThirdPartyDisclosure` forem `false` para GARMIN e STRAVA, essas chamadas
 * lançam `ProviderPolicyViolationError` e bloqueiam a operação.
 *
 * Não há, hoje, nenhum pipeline de IA nem caminho de divulgação a terceiros no
 * código; estes guards existem para que, quando um for adicionado, a barreira
 * seja intransponível sem alterar explicitamente a política.
 *
 * _Requisitos: 15.4, 15.5, 20.1_
 */

/**
 * Impõe a permissão de processamento por IA para um provider.
 *
 * Lança `ProviderPolicyViolationError` quando o provider não permite envio de
 * dados a IA/LLM/embeddings/RAG/treinamento. Deve ser chamado ANTES de qualquer
 * transmissão de dados a um modelo/serviço de IA.
 *
 * _Requisitos: 15.4, 15.5_
 */
export function assertAiProcessingAllowed(providerId: ProviderId): void {
  assertPolicy(providerId, "ai");
}

/**
 * Impõe a permissão de divulgação a terceiros para um provider.
 *
 * Lança `ProviderPolicyViolationError` quando o provider não permite divulgar
 * dados a terceiros. Deve ser chamado ANTES de qualquer exportação/envio de
 * dados do provider para fora do sistema.
 *
 * _Requisitos: 15.4, 15.5_
 */
export function assertThirdPartyDisclosureAllowed(providerId: ProviderId): void {
  assertPolicy(providerId, "share");
}

/**
 * Impõe a permissão de processamento por IA para TODOS os providers de um
 * conjunto (ex.: ao combinar dados multi-provider de um usuário para IA).
 *
 * Se QUALQUER provider proibir o uso por IA, lança
 * `ProviderPolicyViolationError` para o primeiro provider que negar — de modo
 * que basta um provider mais restritivo para bloquear todo o conjunto.
 *
 * _Requisitos: 15.4, 15.5_
 */
export function assertAiProcessingAllowedForProviders(
  providerIds: readonly ProviderId[],
): void {
  for (const providerId of providerIds) {
    assertAiProcessingAllowed(providerId);
  }
}

/**
 * Impõe a permissão de divulgação a terceiros para TODOS os providers de um
 * conjunto. Basta um provider negar para bloquear todo o conjunto.
 *
 * _Requisitos: 15.4, 15.5_
 */
export function assertThirdPartyDisclosureAllowedForProviders(
  providerIds: readonly ProviderId[],
): void {
  for (const providerId of providerIds) {
    assertThirdPartyDisclosureAllowed(providerId);
  }
}
