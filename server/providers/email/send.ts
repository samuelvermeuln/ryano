import { env, hasPasswordResetEmailEnv, requireEnv } from "@/server/env";
import type { EmailProviderContract, SendEmailInput } from "@/server/providers/email/types";

export class SendEmailProvider implements EmailProviderContract {
  async send(input: SendEmailInput): Promise<void> {
    if (!hasPasswordResetEmailEnv()) {
      throw new Error("SEND_NOT_CONFIGURED");
    }

    const response = await fetch(requireEnv("SEND_API_URL"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("SEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.SEND_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    if (response.ok) {
      return;
    }

    const errorBody = await response.text().catch(() => "SEND_REQUEST_FAILED");
    throw new Error(`SEND_REQUEST_FAILED:${response.status}:${errorBody}`);
  }
}

export const sendEmailProvider = new SendEmailProvider();
