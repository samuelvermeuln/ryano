"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBell, IconChecks, IconLoader2 } from "@tabler/icons-react";

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * SAM-29 — the bell in every context's header. Server-rendered unread count,
 * popover loaded on open (`glass-strong`, light and dark). Opening a
 * notification marks it read and follows its `href` into the right context.
 */
export function NotificationsBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // A server refresh brings a new count; adopt it during render (no effect, no cascade).
  const [seenInitial, setSeenInitial] = useState(initialUnread);
  if (seenInitial !== initialUnread) {
    setSeenInitial(initialUnread);
    setUnread(initialUnread);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=10", { cache: "no-store" });
      if (!response.ok) throw new Error("NOTIFICATIONS_FAILED");
      const data = (await response.json()) as { items: NotificationItem[]; unreadCount: number };
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openItem = (item: NotificationItem) => {
    startTransition(async () => {
      if (!item.readAt) {
        await fetch(`/api/notifications/${item.id}/read`, { method: "POST" }).catch(() => null);
        setUnread((current) => Math.max(0, current - 1));
      }
      setOpen(false);
      if (item.href) router.push(item.href);
      router.refresh();
    });
  };

  const readAll = () => {
    startTransition(async () => {
      await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => null);
      setUnread(0);
      setItems((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) ?? current);
      router.refresh();
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notificações: ${unread} não lida${unread === 1 ? "" : "s"}` : "Notificações"}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="notifications-bell"
        className="glass-button relative flex h-10 w-10 items-center justify-center rounded-full"
      >
        <IconBell size={18} />
        {unread > 0 ? (
          <span
            data-testid="notifications-unread"
            className="theme-pill-warning absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-bold tabular-nums"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notificações"
          data-testid="notifications-popover"
          className="glass-strong absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] rounded-[20px] border border-border p-2 shadow-xl"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-semibold">Notificações</p>
            <button
              type="button"
              onClick={readAll}
              disabled={isPending || unread === 0}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground disabled:opacity-50"
            >
              <IconChecks size={14} /> Marcar todas como lidas
            </button>
          </div>
          {loading && items === null ? (
            <p className="flex items-center gap-2 px-2 py-4 text-sm text-foreground/60" aria-busy="true">
              <IconLoader2 size={14} className="animate-spin" /> Carregando…
            </p>
          ) : items && items.length > 0 ? (
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    data-testid="notification-item"
                    data-unread={item.readAt ? undefined : "true"}
                    className={`block w-full rounded-[14px] px-3 py-2 text-left transition-colors hover:bg-white/10 ${item.readAt ? "opacity-70" : ""}`}
                  >
                    <p className="flex items-start justify-between gap-2 text-sm">
                      <span className="font-medium">{item.title}</span>
                      <span className="shrink-0 text-[11px] text-foreground/50">{formatWhen(item.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-foreground/65">{item.body}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-4 text-sm text-foreground/60">Nenhuma notificação por aqui.</p>
          )}
          <div className="border-t border-border px-2 pt-2">
            <Link href="/app/notificacoes" onClick={() => setOpen(false)} className="block py-1 text-center text-xs font-medium text-foreground/70 hover:text-foreground">
              Ver todas
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
