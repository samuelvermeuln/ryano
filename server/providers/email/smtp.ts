import nodemailer from "nodemailer";

import { env, hasPasswordResetEmailEnv, isSmtpSecure, requireEnv } from "@/server/env";
import type { EmailProviderContract, SendEmailInput } from "@/server/providers/email/types";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!hasPasswordResetEmailEnv()) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  transporter = nodemailer.createTransport({
    host: requireEnv("SMTP_HOST"),
    port: Number(requireEnv("SMTP_PORT")),
    secure: isSmtpSecure(),
    auth: {
      user: requireEnv("SMTP_USER"),
      pass: requireEnv("SMTP_PASSWORD"),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return transporter;
}

export class SmtpEmailProvider implements EmailProviderContract {
  async send(input: SendEmailInput): Promise<void> {
    const activeTransporter = getTransporter();

    await activeTransporter.sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }
}

export const smtpEmailProvider = new SmtpEmailProvider();
