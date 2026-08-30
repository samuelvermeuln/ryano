/**
 * Contrato de requisito de capability por seção de relatório.
 *
 * Os relatórios da Ryvano (diário, pós-atividade) são provider-agnostic: cada
 * seção declara qual capability precisa para ser renderizada, em vez de assumir
 * campos específicos de um provider. Assim, o report builder monta o relatório
 * omitindo as seções cujas capabilities nenhum provider conectado fornece — sem
 * falhar por causa disso (Requisito 9.2, 9.3).
 *
 * `ReportSectionRequirement` reutiliza `CapabilityKey`
 * (`keyof ProviderCapabilities`) de `@/modules/shared/integrations/capabilities`,
 * mantendo o vocabulário de capabilities como fonte única. A flag `optional`
 * distingue seções que apenas somem quando indisponíveis (`true`) daquelas cuja
 * ausência de capability é significativa para o builder (`false`).
 *
 * _Requisitos: 9.2_
 */

import type {
  CapabilityKey,
  ProviderCapabilities,
} from "@/modules/shared/integrations/capabilities";

/**
 * Requisito de capability de uma seção de relatório.
 *
 * Declara qual capability a seção precisa e se ela é opcional. O report builder
 * consulta as capabilities dos providers conectados
 * (`getUserCapabilities`/`userHasCapability`) e decide se renderiza a seção.
 *
 * _Requisitos: 9.2_
 */
export type ReportSectionRequirement = {
  /** Capability exigida pela seção (ex.: `sleep`, `hrv`, `activities`). */
  capability: CapabilityKey;
  /**
   * Indica se a seção é opcional.
   *
   * Quando `true`, a ausência da capability apenas oculta a seção (o relatório
   * segue normalmente). Quando `false`, a seção é considerada essencial ao
   * escopo do relatório e a decisão de fallback fica a cargo do builder.
   */
  optional: boolean;
};

/**
 * Indica se uma seção de relatório deve ser renderizada dadas as capabilities
 * disponíveis do usuário.
 *
 * Helper trivial para o report builder: a seção renderiza quando a capability
 * exigida está presente. Seções não-opcionais também dependem da capability;
 * a distinção de `optional` orienta o builder sobre como tratar a ausência
 * (ocultar silenciosamente vs. registrar/adaptar), não altera esta decisão.
 *
 * _Requisitos: 9.2, 9.3_
 */
export function shouldRenderReportSection(
  requirement: ReportSectionRequirement,
  userCapabilities: ProviderCapabilities,
): boolean {
  return userCapabilities[requirement.capability] === true;
}
