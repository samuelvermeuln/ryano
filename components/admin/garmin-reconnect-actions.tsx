"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { sendGarminReconnectNotificationAction } from "@/app/actions/admin";
import { formatDateTime } from "@/lib/format";

export function GarminReconnectActions({
  userId,
  disabled = false,
  lastSentAt = null,
  cooldownUntil = null,
}: {
  userId: string;
  disabled?: boolean;
  lastSentAt?: string | null;
  cooldownUntil?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const cooldownActive = Boolean(cooldownUntil && new Date(cooldownUntil).getTime() > Date.now());

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        disabled={disabled || pending || cooldownActive}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await sendGarminReconnectNotificationAction(userId);
            setMessage(result.message ?? null);
            router.refresh();
          });
        }}
        className="glass-button rounded-[18px] px-4 py-2 text-xs font-semibold text-foreground"
      >
        {pending ? "Enviando link Garmin..." : cooldownActive ? "Cooldown ativo no link Garmin" : "Reenviar link Garmin no WhatsApp"}
      </button>

      {message ? <p className="text-xs leading-5 text-foreground/60">{message}</p> : null}
      {!message && lastSentAt ? <p className="text-xs leading-5 text-foreground/60">Último link enviado em {formatDateTime(lastSentAt)}.</p> : null}
      {!message && cooldownActive && cooldownUntil ? <p className="text-xs leading-5 text-foreground/60">Novo reenvio liberado em {formatDateTime(cooldownUntil)}.</p> : null}
    </div>
  );
}
