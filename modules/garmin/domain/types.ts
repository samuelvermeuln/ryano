/**
 * Tipos de domínio do provider Garmin.
 *
 * Movidos de `server/providers/wearables/types.ts` na tarefa 2.1. São mantidos
 * verbatim para preservar o comportamento observável do Garmin (nenhuma mudança
 * de comportamento nesta etapa estrutural — Requisito 5.6).
 *
 * A peça genérica do contrato legado (`WearableCapability`) foi movida para
 * `modules/shared/integrations/contracts` (arquivo `legacy-wearable.ts`) e é
 * reexportada aqui por conveniência. O contrato genérico "moderno" que sucede o
 * `WearableProviderContract` vive nas interfaces pequenas de
 * `modules/shared/integrations/contracts` (tarefa 1.3).
 *
 * O `WearableProviderContract` legado permanece aqui por ser acoplado ao Garmin
 * (retorna `GarminDailyReportResult`) e ter como único implementador/consumidor
 * o próprio módulo Garmin.
 *
 * _Requisitos: 5.1, 5.5_
 */

import type { WearableCapability } from "@/modules/shared/integrations/contracts";

export type { WearableCapability };

export type WearableConnectionResult = {
  externalAccountId?: string | null;
  accountApiKey?: string | null;
  status: "connected" | "error";
  message?: string;
  mfaRequired?: boolean;
};

export type WearableReconnectResult = {
  ok: boolean;
  mfaRequired?: boolean;
  message?: string;
};

export type WearableSyncResult = {
  syncedCount: number;
  status: "success" | "partial" | "error";
  cursor?: string;
  message?: string;
};

export type GarminDailyReportResult = {
  accountId: string;
  date: string;
  cached: boolean;
  summary: Record<string, unknown> | null;
  health: Record<string, unknown>;
  training: Record<string, unknown>;
  body: Record<string, unknown>;
  nutrition: Record<string, unknown>;
  warnings: string[];
};

export interface WearableProviderContract {
  provider: string;
  capabilities: WearableCapability[];
  connect(input: { email: string; password: string; label: string }): Promise<WearableConnectionResult>;
  reconnect?(input: { accountApiKey: string }): Promise<WearableReconnectResult>;
  validateConnection(input: { accountApiKey: string }): Promise<{ ok: boolean; message?: string }>;
  syncActivities(input: { accountApiKey: string; start?: number; limit?: number }): Promise<unknown[]>;
  getLatestActivity?(input: { accountApiKey: string; fresh?: boolean }): Promise<unknown | null>;
  getDailyReport?(input: { accountApiKey: string; date: string }): Promise<GarminDailyReportResult>;
}
