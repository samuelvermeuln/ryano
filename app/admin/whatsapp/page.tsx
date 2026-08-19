import { EvolutionTools } from "@/components/admin/evolution-tools";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { env } from "@/server/env";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { evolutionProvider } from "@/server/providers/messaging/evolution";

export const dynamic = "force-dynamic";

async function getEvolutionState() {
  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [status, qr, latestWebhookEvent, recentWebhookCount] = await Promise.all([
      evolutionProvider.getStatus(),
      evolutionProvider.getConnectQrCode(),
      prisma.integrationEvent.findFirst({
        where: { provider: "EVOLUTION" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.integrationEvent.count({
        where: {
          provider: "EVOLUTION",
          createdAt: { gte: last24Hours },
        },
      }),
    ]);

    return { status, qr, latestWebhookEvent, recentWebhookCount, error: null };
  } catch (error) {
    return {
      status: null,
      qr: null,
      latestWebhookEvent: null,
      recentWebhookCount: 0,
      error: error instanceof Error ? error.message : "Falha ao consultar Evolution.",
    };
  }
}

export default async function AdminWhatsappPage() {
  await requireAdmin();
  const state = await getEvolutionState();

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard title="Status da instância" description="Consulta feita exclusivamente no backend da aplicação.">
        {state.error ? (
          <div className="rounded-[22px] border border-rose-300/18 bg-rose-300/8 px-4 py-4 text-sm text-rose-100">
            {state.error}
          </div>
        ) : (
          <div className="space-y-3 text-sm leading-7 text-foreground/72">
            <p>
              Estado: <StatusBadge tone={state.status?.connected ? "success" : "warning"}>{state.status?.status ?? "desconhecido"}</StatusBadge>
            </p>
            <p>Identidade conectada: {state.status?.identity ?? "não informada"}</p>
            <p>QR state: {state.qr?.status ?? "indisponível"}</p>
            <p>Webhook secret configurado: {env.EVOLUTION_WEBHOOK_SECRET ? "sim" : "não"}</p>
            <p>
              Status webhook: <StatusBadge tone={state.recentWebhookCount > 0 ? "success" : "warning"}>{state.recentWebhookCount > 0 ? "recebendo eventos" : "sem eventos recentes"}</StatusBadge>
            </p>
            <p>
              Último webhook recebido: {state.latestWebhookEvent ? formatDateTime(state.latestWebhookEvent.createdAt) : "nenhum evento registrado"}
            </p>
            <p>Webhooks nas últimas 24h: {state.recentWebhookCount}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="QR Code / reconnect / teste" description="Ferramentas administrativas para pareamento, refresh, disconnect e mensagem de teste, sempre via backend interno.">
        <EvolutionTools
          initialQrCode={state.qr?.qrCode ?? null}
          initialStatus={state.status?.status ?? "desconhecido"}
          initialConnected={Boolean(state.status?.connected)}
          initialIdentity={state.status?.identity ?? null}
        />
      </SectionCard>
    </div>
  );
}
