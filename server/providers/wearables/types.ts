export type WearableCapability =
  | "activities"
  | "health"
  | "sleep"
  | "recovery"
  | "body"
  | "workouts";

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
