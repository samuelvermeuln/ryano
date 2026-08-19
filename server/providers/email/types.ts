export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailProviderContract {
  send(input: SendEmailInput): Promise<void>;
}
