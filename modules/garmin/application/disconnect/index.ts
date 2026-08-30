/**
 * Concern de desconexão do Garmin (application/disconnect).
 *
 * Reexporta a parte de "disconnect" do serviço canônico
 * (`modules/garmin/application/garmin-service.ts`). Comportamento preservado
 * (Requisito 5.6).
 *
 * _Requisitos: 5.1, 5.2_
 */

export { disconnectGarminForUser } from "@/modules/garmin/application/garmin-service";
