import { env, hasPasswordResetEmailEnv, requireEnv } from "@/server/env";
import type { EmailProviderContract, SendEmailInput } from "@/server/providers/email/types";
import { createHttpClient } from "@/lib/http-client";

const sendHttpClient = createHttpClient();

export class SendEmailProvider implements EmailProviderContract {
  async send(input: SendEmailInput): Promise<void> {
    if (!hasPasswordResetEmailEnv()) {
      throw new Error("SEND_NOT_CONFIGURED");
    }

    const response = await sendHttpClient.request({
      url: requireEnv("SEND_API_URL"),
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("SEND_API_KEY")}`,
      },
      data: {
        from: env.SEND_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      },
    });

    if (response.status >= 200 && response.status < 300) {
      return;
    }

    const errorBody = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    throw new Error(`SEND_REQUEST_FAILED:${response.status}:${errorBody}`);
  }
}

export const sendEmailProvider = new SendEmailProvider();
