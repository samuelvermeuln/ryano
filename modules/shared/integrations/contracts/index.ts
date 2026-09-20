/**
 * Contratos de provider do core de integrações esportivas.
 *
 * O contrato compartilhado é composto por interfaces pequenas e opcionais
 * (`ActivityProvider`, `RecoveryProvider`, `WebhookProvider`, ...) em vez de uma
 * interface única que forçaria todos os providers a implementar tudo. O tipo de
 * autenticação é uma capability (`ProviderAuthType`), não um método obrigatório.
 *
 * O `ProviderContext` carrega `userId`, `connectionId` e um acessor de secrets
 * injetado, de modo que os módulos de provider não precisam saber como o core
 * armazena/criptografa segredos, e o core não lida com criptografia por provider.
 *
 * _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5_
 */

import type { ProviderCapabilities } from "@/modules/shared/integrations/capabilities";
import type {
  ProviderAuthType,
  ProviderId,
} from "@/modules/shared/integrations/types";

import type {
  DailyWellnessSnapshot,
  ListActivitiesInput,
  NormalizedActivity,
} from "./activity-placeholders";

// Peça genérica remanescente do contrato legado `WearableProviderContract`.
// Reexportada aqui para que consumidores continuem obtendo o tipo a partir dos
// contratos do core. Ver `./legacy-wearable.ts`.
export type { WearableCapability } from "./legacy-wearable";

// Contrato para envio de treinos planejados ao dispositivo do atleta.
export type {
  PlannedWorkoutStep,
  PlannedWorkoutInput,
  PlannedWorkoutPushResult,
  PlannedWorkoutProvider,
} from "./planned-workout";

// Re-exporta os tipos de atividade/bem-estar para que consumidores importem
// tudo de um ponto. `NormalizedActivity`/`ActivitySource`/`ProviderMetric` vêm
// do contrato canônico em `modules/shared/activities/contracts` (via
// `activity-placeholders`); `DailyWellnessSnapshot`/`ListActivitiesInput` são do
// core de integrações.
export type {
  ActivitySource,
  DailyWellnessSnapshot,
  ListActivitiesInput,
  NormalizedActivity,
  ProviderMetric,
} from "./activity-placeholders";

/**
 * Acessor de secrets injetado no `ProviderContext`.
 *
 * Abstrai o armazenamento/descriptografia de segredos (tokens, credenciais) de
 * uma conexão. O core injeta a implementação; os módulos apenas consomem os
 * valores já em texto claro, sem tocar em criptografia.
 */
export interface ProviderSecretsAccessor {
  /**
   * Retorna o valor em texto claro de um secret da conexão, ou `null` se
   * ausente. O tipo é o nome do secret (ex.: `"STRAVA_ACCESS_TOKEN"`), mantido
   * como `string` para não acoplar o contrato ao enum Prisma `SecretType`.
   */
  getSecret(type: string): Promise<string | null>;
}

/**
 * Contexto de execução passado a toda operação de provider.
 *
 * Identifica a conexão do usuário sobre a qual a operação atua e fornece acesso
 * aos secrets dessa conexão sem expor detalhes de armazenamento/criptografia.
 */
export interface ProviderContext {
  /** Usuário dono da conexão. */
  userId: string;
  /** Conexão (`WearableConnection.id`) sobre a qual a operação atua. */
  connectionId: string;
  /** Acessor de secrets da conexão (injetado pelo core). */
  secrets: ProviderSecretsAccessor;
}

/**
 * Base comum a todos os contratos de provider: metadados que o core lê sem
 * conhecer o protocolo do provider.
 */
export interface BaseProvider {
  /** Identificador canônico do provider. */
  id: ProviderId;
  /** Capabilities declaradas (espelham as do catálogo). */
  capabilities: ProviderCapabilities;
  /** Tipo de autenticação (capability, não método obrigatório). */
  authType: ProviderAuthType;
}

/**
 * Provider capaz de listar/obter atividades.
 *
 * `getActivity` é opcional: nem todo provider expõe detalhe individual.
 */
export interface ActivityProvider extends BaseProvider {
  /** Lista atividades da conexão conforme os filtros informados. */
  listActivities(
    ctx: ProviderContext,
    input: ListActivitiesInput,
  ): Promise<NormalizedActivity[]>;
  /** Obtém uma atividade específica pelo id no provider, se suportado. */
  getActivity?(
    ctx: ProviderContext,
    externalId: string,
  ): Promise<NormalizedActivity | null>;
}

/**
 * Provider capaz de fornecer um snapshot diário de bem-estar
 * (recovery/sleep/hrv/readiness).
 */
export interface RecoveryProvider extends BaseProvider {
  /** Snapshot diário de bem-estar para a data informada (YYYY-MM-DD). */
  getDailyWellness(
    ctx: ProviderContext,
    date: string,
  ): Promise<DailyWellnessSnapshot | null>;
}

/**
 * Provider capaz de receber e processar eventos via webhook.
 */
export interface WebhookProvider extends BaseProvider {
  /**
   * Valida o desafio de verificação (GET) e devolve o challenge a ecoar quando
   * válido. Síncrono: apenas compara tokens/parâmetros.
   */
  verifyChallenge(query: Record<string, string>): {
    ok: boolean;
    challenge?: string;
  };
  /** Processa um evento (POST) já validado/persistido pela rota adapter. */
  handleEvent(payload: unknown): Promise<void>;
}

/**
 * Módulo de um provider registrado no `providerRegistry`.
 *
 * Compõe as interfaces de capability opcionais: um módulo implementa apenas as
 * que fizerem sentido para o provider. O core seleciona a capability desejada
 * (ex.: `module.activity`) e trata a ausência como "capability indisponível".
 */
export interface ProviderModule {
  /** Identificador canônico do provider deste módulo. */
  id: ProviderId;
  /** Contrato de atividades, quando o provider as fornece. */
  activity?: ActivityProvider;
  /** Contrato de bem-estar diário, quando o provider o fornece. */
  recovery?: RecoveryProvider;
  /** Contrato de webhook, quando o provider o suporta. */
  webhook?: WebhookProvider;
}
