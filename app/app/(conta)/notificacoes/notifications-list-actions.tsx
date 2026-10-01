"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconChecks, IconLoader2 } from "@tabler/icons-react";

/** SAM-29 — "marcar todas como lidas" on the notifications page. */
export function NotificationsListActions({ unread }: { unread: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (unread === 0) return <p className="text-xs text-foreground/50">Tudo lido.</p>;

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => null);
          router.refresh();
        })
      }
      className="glass-button inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {isPending ? <IconLoader2 size={16} className="animate-spin" /> : <IconChecks size={16} />}
      Marcar todas como lidas ({unread})
    </button>
  );
}
