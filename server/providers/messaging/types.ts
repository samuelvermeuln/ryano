export type MessagingStatus = {
  connected: boolean;
  status: string;
  identity?: string | null;
};

export type QrCodeResult = {
  qrCode?: string | null;
  status: string;
};

export type SendTextInput = {
  to: string;
  text: string;
};

export type MessageResult = {
  status: "sent" | "failed";
  externalMessageId?: string | null;
};

export interface MessagingProviderContract {
  getStatus(): Promise<MessagingStatus>;
  getConnectQrCode(): Promise<QrCodeResult>;
  sendText(input: SendTextInput): Promise<MessageResult>;
  disconnect(): Promise<void>;
}
