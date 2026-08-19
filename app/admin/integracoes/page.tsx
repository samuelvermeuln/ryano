import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  await requireAdmin();

  const [connections, events] = await Promise.all([
    prisma.wearableConnection.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 20,
      include: { user: true },
    }),
    prisma.integrationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <SectionCard title="Conexões de wearable" description="Saúde operacional das conexões armazenadas localmente.">
        <div className="grid gap-3">
          {connections.map((connection) => (
            <div key={connection.id} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/72">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-foreground">{connection.user.name ?? connection.user.email}</p>
                <StatusBadge tone={connection.status === "CONNECTED" ? "success" : connection.status === "ERROR" ? "danger" : "warning"}>{connection.status}</StatusBadge>
              </div>
              <p className="mt-2">Provider: {connection.provider}</p>
              <p>Última sync: {formatDateTime(connection.lastSyncAt)}</p>
              <p>Status sync: {connection.lastSyncStatus ?? "—"}</p>
              <p>Erro: {connection.lastErrorCode ?? "—"}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Eventos de integração" description="Webhook e dedupe operacional registrados para auditoria.">
        <div className="grid gap-3">
          {events.length ? (
            events.map((event) => (
              <div key={event.id} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/72">
                <p className="font-semibold text-foreground">{event.provider} · {event.eventType}</p>
                <p className="mt-2">External ID: {event.externalId ?? "—"}</p>
                <p>Criado em: {formatDateTime(event.createdAt)}</p>
              </div>
            ))
          ) : (
            <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-foreground/72">
              Sem eventos de integração registrados até o momento.
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
