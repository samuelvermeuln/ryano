/**
 * Barrel da camada de relatórios do módulo Garmin (tarefa 2.4).
 *
 * Importar este barrel garante o efeito colateral de registro dos
 * materializadores/hook/configurações do Garmin no registro compartilhado
 * (`@/modules/shared/reports/delivery`).
 *
 * _Requisitos: 5.1, 5.2, 9.6_
 */

export {
  enqueueDueDailyGarminSummaries,
  enqueueGarminReconnectReport,
  getGarminPostActivitySplits,
  registerGarminReporting,
} from "@/modules/garmin/application/reporting/garmin-reporting";
