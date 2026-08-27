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

export type SendImageInput = {
  to: string;
  image: Buffer;
  caption?: string;
  fileName?: string;
};

export type ConfigureWebhookInput = {
  events: readonly string[];
  allowHttpFallback: boolean;
};

export type WebhookConfig = {
  url: string | null;
  events: string[];
  enabled: boolean;
};

export type EvolutionInstanceEnsureResult = {
  status: "existing" | "created";
};

export type MessageResult = {
  status: "sent" | "failed";
  externalMessageId?: string | null;
};

export type IncomingMessage = {
  text: string;
  senderPhone: string | null;
  externalJid: string | null;
  timestamp: Date | null;
};

export interface MessagingProviderContract {
  ensureInstanceExists(): Promise<EvolutionInstanceEnsureResult>;
  getStatus(): Promise<MessagingStatus>;
  getConnectQrCode(): Promise<QrCodeResult>;
  getWebhookConfig(): Promise<WebhookConfig | null>;
  configureWebhook(input: ConfigureWebhookInput): Promise<void>;
  sendText(input: SendTextInput): Promise<MessageResult>;
  sendImage(input: SendImageInput): Promise<MessageResult>;
  disconnect(): Promise<void>;
}
