/**
 * Peça genérica remanescente do antigo contrato `WearableProviderContract`
 * (que vivia em `server/providers/wearables/types.ts`).
 *
 * O contrato genérico de provider é, a partir da tarefa 1.3, composto pelas
 * interfaces pequenas em `./index.ts` (`BaseProvider`, `ActivityProvider`,
 * `RecoveryProvider`, `WebhookProvider`) — que sucedem o antigo
 * `WearableProviderContract`. Este arquivo hospeda apenas o que é genuinamente
 * genérico e protocol-agnostic do contrato legado: a lista de capabilities
 * (`WearableCapability`). O contrato legado `WearableProviderContract` em si é
 * acoplado ao Garmin (retorna `GarminDailyReportResult`) e, portanto, vive em
 * `modules/garmin/domain/types.ts` enquanto seus únicos consumidores forem o
 * próprio módulo Garmin.
 *
 * `modules/shared` NÃO deve depender de `modules/garmin`; por isso apenas o tipo
 * sem dependências de provider fica aqui.
 *
 * _Requisitos: 5.1, 5.5, 4.4, 4.5_
 */

/**
 * Capacidades declaradas por um provider wearable legado.
 *
 * Preservado verbatim da definição original para compatibilidade de
 * comportamento. A taxonomia de capabilities do core multi-provider é
 * `ProviderCapabilities` (ver `modules/shared/integrations/capabilities`); este
 * tipo permanece para o contrato legado do Garmin durante a transição.
 */
export type WearableCapability =
  | "activities"
  | "health"
  | "sleep"
  | "recovery"
  | "body"
  | "workouts";
