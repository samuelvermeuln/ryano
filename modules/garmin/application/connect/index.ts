/**
 * Concern de conexão do Garmin (application/connect).
 *
 * Reexporta a parte de "connect" do serviço canônico
 * (`modules/garmin/application/garmin-service.ts`). A implementação permanece
 * unificada por causa do forte acoplamento interno entre connect/sync/reconnect;
 * expor por concern mantém o layout do módulo sem alterar o comportamento
 * (Requisito 5.6).
 *
 * _Requisitos: 5.1, 5.2_
 */

export { connectGarminForUser } from "@/modules/garmin/application/garmin-service";
