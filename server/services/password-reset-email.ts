import { formatDateTime } from "@/lib/format";
import { sendEmailProvider } from "@/server/providers/email/send";

export function buildPasswordResetEmail(input: {
  name: string | null;
  resetCode: string;
  resetPageUrl: string;
  prefilledResetPageUrl: string;
  expiresAt: Date;
}) {
  const firstName = input.name?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName ? `Olá, ${firstName}` : "Olá";
  const expiresAtLabel = formatDateTime(input.expiresAt);

  const subject = "ryvano · Redefinição de senha";
  const text = `${greeting}

Recebemos um pedido para recuperar sua conta na ryvano.

Seu código para continuar é:
${input.resetCode}

Como usar:
1. Abra a tela para criar nova senha
2. Digite este código de 6 números
3. Crie sua nova senha

Use botão abaixo para abrir tela com código já aplicado:
${input.prefilledResetPageUrl}

Este código expira em ${expiresAtLabel}.

Se você não solicitou esta alteração, ignore este email.
`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <p>${greeting},</p>
      <p>Recebemos um pedido para recuperar sua conta na <strong>ryvano</strong>.</p>
      <p>Use este código de 6 números para continuar:</p>
      <p style="margin:16px 0;font-size:32px;font-weight:700;letter-spacing:0.18em">${input.resetCode}</p>
      <p>Passo a passo:</p>
      <ol style="padding-left:20px">
        <li>Abra a tela para criar nova senha</li>
        <li>Digite este código</li>
        <li>Crie sua nova senha</li>
      </ol>
      <p>
        <a href="${input.prefilledResetPageUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600">
          Usar código deste e-mail
        </a>
      </p>
      <p>Se preferir, você também pode abrir a tela manualmente:</p>
      <p><a href="${input.resetPageUrl}">${input.resetPageUrl}</a></p>
      <p>Este código expira em <strong>${expiresAtLabel}</strong>.</p>
      <p>Se você não solicitou esta alteração, ignore este email.</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string | null;
  resetCode: string;
  resetPageUrl: string;
  prefilledResetPageUrl: string;
  expiresAt: Date;
}) {
  const message = buildPasswordResetEmail({
    name: input.name,
    resetCode: input.resetCode,
    resetPageUrl: input.resetPageUrl,
    prefilledResetPageUrl: input.prefilledResetPageUrl,
    expiresAt: input.expiresAt,
  });

  await sendEmailProvider.send({
    to: input.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
