import Link from "next/link";
import { IconBellOff } from "@tabler/icons-react";

import { SectionCard } from "@/components/section-card";
import { NotificationService } from "@/modules/shared/notifications";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { buildNoIndexMetadata } from "@/server/seo";
import { NotificationsListActions } from "./notifications-list-actions";

export const metadata = buildNoIndexMetadata({
  title: "Notificações — Ryvano",
  description: "Avisos sobre seus pedidos, seus professores e suas escolas.",
  path: "/app/notificacoes",
});

export const dynamic = "force-dynamic";

function formatWhen(date: Date): string {
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** SAM-29 — every notification of the account, newest first, with "marcar todas como lidas". */
export default async function NotificationsPage() {
  const session = await requireOnboardedSession();
  const service = new NotificationService(prisma);
  const [items, unread] = await Promise.all([service.list(session.user.id, { limit: 100 }), service.countUnread(session.user.id)]);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Notificações"
        description="Respostas aos seus pedidos, mudanças dos seus professores e avisos das suas escolas. Cada uma leva à tela certa."
        action={<NotificationsListActions unread={unread} />}
      >
        {items.length === 0 ? (
          <div className="py-16 text-center text-foreground/50">
            <IconBellOff size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhuma notificação ainda.</p>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="notifications-list">
            {items.map((item) => {
              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{item.title}</p>
                    <span className="shrink-0 text-xs text-foreground/50">{formatWhen(item.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground/70">{item.body}</p>
                </>
              );
              const className = `block rounded-[16px] border px-4 py-3 transition-colors ${item.readAt ? "border-border bg-white/[0.02] opacity-80" : "theme-panel-neutral"}`;
              return (
                <li key={item.id} data-testid="notification-row" data-unread={item.readAt ? undefined : "true"}>
                  {item.href ? (
                    <Link href={`/api/notifications/${item.id}/open`} className={className}>{content}</Link>
                  ) : (
                    <div className={className}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
