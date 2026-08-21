export type MessagingStatus = {
  connected: boolean;
  status: string;
  identity?: string | null;
  phoneE164?: string | null;
};

export type QrCodeResult = {
  qrCode?: string | null;
  status: string;
};

export type SendTextInput = {
  to: string;
  text: string;
};

export type ConfigureWebhookInput = {
  events: readonly string[];
  allowHttpFallback: boolean;
};

export type EvolutionInstanceEnsureResult = {
  status: "existing" | "created";
};

export type MessageResult = {
  status: "sent" | "failed";
  externalMessageId?: string | null;
};

export interface MessagingProviderContract {
  ensureInstanceExists(): Promise<EvolutionInstanceEnsureResult>;
  getStatus(): Promise<MessagingStatus>;
  getConnectQrCode(): Promise<QrCodeResult>;
  configureWebhook(input: ConfigureWebhookInput): Promise<void>;
  sendText(input: SendTextInput): Promise<MessageResult>;
  disconnect(): Promise<void>;
}
