/**
 * Tipos base compartilhados do core de integrações esportivas.
 *
 * Estes tipos são provider-agnostic e formam a fundação do catálogo, das
 * capabilities, do registry e dos contratos. Nenhum módulo do core deve
 * depender de um provider específico — providers são plugins.
 *
 * _Requisitos: 1.2, 1.3, 4.5_
 */

/**
 * Identificador canônico de um provider esportivo suportado pela Ryvano.
 *
 * Alinhado ao enum Prisma `WearableProvider` (STRAVA é adicionado ao enum na
 * Fase 3). O fato de um valor existir aqui não significa que a integração está
 * habilitada — a liberação é controlada pela disponibilidade/feature flag no
 * catálogo.
 */
export type ProviderId =
  | "GARMIN"
  | "STRAVA"
  | "POLAR"
  | "COROS"
  | "SUUNTO"
  | "FITBIT";

/**
 * Estado de disponibilidade de um provider no catálogo.
 *
 * Distingue "provider existe no catálogo" de "provider está liberado":
 * somente `AVAILABLE` permite iniciar um fluxo de conexão real.
 */
export type ProviderAvailability =
  | "AVAILABLE"
  | "COMING_SOON"
  | "PRIVATE_BETA"
  | "DISABLED";

/**
 * Tipo de autenticação de um provider, tratado como capability em vez de
 * método obrigatório no contrato compartilhado.
 */
export type ProviderAuthType = "OAUTH2" | "CREDENTIALS" | "API_KEY" | "OTHER";
