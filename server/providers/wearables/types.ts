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
};

export type WearableSyncResult = {
  syncedCount: number;
  status: "success" | "partial" | "error";
  cursor?: string;
  message?: string;
};

export interface WearableProviderContract {
  provider: string;
  capabilities: WearableCapability[];
  connect(input: { email: string; password: string; label: string }): Promise<WearableConnectionResult>;
  validateConnection(input: { accountApiKey: string }): Promise<{ ok: boolean; message?: string }>;
  syncActivities(input: { accountApiKey: string; start?: number; limit?: number }): Promise<unknown[]>;
}
