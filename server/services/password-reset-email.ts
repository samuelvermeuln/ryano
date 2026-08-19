import { formatDateTime } from "@/lib/format";
import { smtpEmailProvider } from "@/server/providers/email/smtp";

export function buildPasswordResetEmail(input: {
  name: string | null;
  resetUrl: string;
  expiresAt: Date;
}) {
  const firstName = input.name?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName ? `Olá, ${firstName}` : "Olá";
  const expiresAtLabel = formatDateTime(input.expiresAt);

  const subject = "RYANO · Redefinição de senha";
  const text = `${greeting}

Recebemos um pedido para redefinir sua senha na RYANO.

Use o link abaixo para criar uma nova senha:
${input.resetUrl}

Este link expira em ${expiresAtLabel}.

Se você não solicitou esta alteração, ignore este email.
`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>${greeting},</p>
      <p>Recebemos um pedido para redefinir sua senha na <strong>RYANO</strong>.</p>
      <p>
        <a href="${input.resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600">
          Redefinir senha
        </a>
      </p>
      <p>Se preferir, copie e cole este link no navegador:</p>
      <p><a href="${input.resetUrl}">${input.resetUrl}</a></p>
      <p>Este link expira em <strong>${expiresAtLabel}</strong>.</p>
      <p>Se você não solicitou esta alteração, ignore este email.</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string | null;
  resetUrl: string;
  expiresAt: Date;
}) {
  const message = buildPasswordResetEmail({
    name: input.name,
    resetUrl: input.resetUrl,
    expiresAt: input.expiresAt,
  });

  await smtpEmailProvider.send({
    to: input.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
