/**
 * Camada genérica (provider-agnostic) de materialização/entrega de relatórios.
 *
 * Este é o ponto de injeção/registro que quebra o ciclo de dependência entre a
 * fila/entrega genérica (`server/services/reporting.ts`) e os módulos de
 * provider (ex.: `modules/garmin`). A engine genérica NÃO conhece nenhum
 * provider: ela apenas resolve o materializador registrado para um tipo de
 * entrega, executa hooks pós-envio registrados e consulta o provedor de
 * configurações de despacho registrado.
 *
 * Os módulos de provider (ex.: `modules/garmin/application/reporting`) registram
 * seus materializadores/hooks/configurações no momento do import, e passam a
 * depender apenas desta camada compartilhada (uma direção).
 *
 * _Requisitos: 5.1, 5.2, 9.6_
 */

/**
 * Resultado da materialização de uma entrega, pronto para ser enviado pelo
 * transporte (WhatsApp/Evolution). Formato preservado da implementação anterior
 * em `reporting.ts` para não alterar comportamento.
 */
export type MaterializedDelivery =
  | { ok: true; kind: "text"; phoneE164: string; text: string }
  | { ok: true; kind: "image"; phoneE164: string; image: Buffer; caption?: string; fileName?: string }
  | { ok: false; errorCode: string };

/**
 * Contexto passado ao materializador. `canonicalType` é o tipo de entrega já
 * normalizado (sem sufixos de reenvio).
 */
export type DeliveryMaterializerContext = {
  deliveryId: string;
  userId: string;
  canonicalType: string;
};

export type DeliveryMaterializer = (ctx: DeliveryMaterializerContext) => Promise<MaterializedDelivery>;

/**
 * Prefixos de tipo de entrega GENÉRICOS (provider-agnostic).
 *
 * TAREFA 9 (Requisito 9.6) — A camada de fila/entrega evolui para nomes de tipo
 * que não citam um provider específico, permitindo que o mesmo tipo de entrega
 * (resumo diário, pós-atividade, aviso de sincronização, reconexão) seja usado
 * por qualquer provider. Os prefixos provider-específicos legados
 * (ex.: `DAILY_GARMIN_SUMMARY:`) permanecem registrados como ALIASES para não
 * quebrar entregas em andamento: `MessageDelivery` já enfileirados com o nome
 * antigo continuam sendo materializados normalmente.
 *
 * `postActivity` já era provider-agnostic desde o início (`POST_ACTIVITY_REPORT:`),
 * então seu prefixo é reaproveitado como canônico genérico.
 */
export const GENERIC_DELIVERY_PREFIXES = {
  /** Relatório pós-atividade (qualquer provider). */
  postActivity: "POST_ACTIVITY_REPORT:",
  /** Resumo diário fisiológico (qualquer provider com as capabilities). */
  dailySummary: "DAILY_SUMMARY:",
  /** Aviso de que as leituras diárias ainda não chegaram. */
  syncCheck: "DAILY_SYNC_CHECK:",
  /** Alerta de reconexão de uma integração. */
  reconnect: "RECONNECT_ALERT:",
} as const;

/** Opções de registro de um materializador. */
export type RegisterDeliveryMaterializerOptions = {
  /**
   * Prefixos legados/adicionais que o mesmo materializador deve atender. Usado
   * para compatibilidade retroativa: um materializador registrado sob um prefixo
   * genérico também resolve os prefixos provider-específicos antigos.
   */
  aliases?: readonly string[];
};

/**
 * Resultado de uma tentativa de despacho, entregue aos hooks registrados
 * (ex.: registro de evento de reconexão do Garmin).
 */
export type DeliveryDispatchOutcome = {
  deliveryType: string;
  userId: string;
  status: "sent" | "failed";
  sentTo: string | null;
  errorCode: string | null;
};

export type DeliveryDispatchHook = (outcome: DeliveryDispatchOutcome) => Promise<void>;

/**
 * Configurações de throttle do despacho de WhatsApp. Injetadas por um provider
 * (ex.: Garmin fornece `getStoredGarminReportingSettings`). Enquanto nenhum
 * provider registrar um provedor, valores padrão seguros são usados.
 */
export type WhatsAppDispatchSettings = {
  whatsappDispatchPaused: boolean;
  maxMessagesPerRun: number;
  delayBetweenMessagesSeconds: number;
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
};

export type WhatsAppDispatchSettingsProvider = () => Promise<WhatsAppDispatchSettings>;

const DEFAULT_DISPATCH_SETTINGS: WhatsAppDispatchSettings = {
  whatsappDispatchPaused: false,
  maxMessagesPerRun: 3,
  delayBetweenMessagesSeconds: 20,
  maxMessagesPerHour: 24,
  maxMessagesPerDay: 150,
};

const materializers = new Map<string, DeliveryMaterializer>();
const dispatchHooks: DeliveryDispatchHook[] = [];
let dispatchSettingsProvider: WhatsAppDispatchSettingsProvider | null = null;

/**
 * Registra um materializador para um prefixo de tipo de entrega
 * (ex.: `"POST_ACTIVITY_REPORT:"`). O primeiro prefixo que casar com o tipo
 * canônico será usado.
 */
export function registerDeliveryMaterializer(
  prefix: string,
  materializer: DeliveryMaterializer,
  options?: RegisterDeliveryMaterializerOptions,
) {
  materializers.set(prefix, materializer);

  // Registra aliases legados apontando para o mesmo materializador, de modo que
  // o resolver aceite tanto o prefixo genérico quanto os provider-específicos
  // antigos (compatibilidade retroativa — Requisito 9.6).
  for (const alias of options?.aliases ?? []) {
    materializers.set(alias, materializer);
  }
}

export function resolveDeliveryMaterializer(canonicalType: string): DeliveryMaterializer | null {
  for (const [prefix, materializer] of materializers) {
    if (canonicalType.startsWith(prefix)) {
      return materializer;
    }
  }

  return null;
}

export function registerDeliveryDispatchHook(hook: DeliveryDispatchHook) {
  dispatchHooks.push(hook);
}

export function getDeliveryDispatchHooks(): readonly DeliveryDispatchHook[] {
  return dispatchHooks;
}

export function registerWhatsAppDispatchSettingsProvider(provider: WhatsAppDispatchSettingsProvider) {
  dispatchSettingsProvider = provider;
}

export async function getWhatsAppDispatchSettings(): Promise<WhatsAppDispatchSettings> {
  if (dispatchSettingsProvider) {
    return dispatchSettingsProvider();
  }

  return DEFAULT_DISPATCH_SETTINGS;
}
