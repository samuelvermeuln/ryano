import { EvolutionMediaTestPanel } from "@/components/admin/evolution-media-test-panel";
import { EvolutionTools } from "@/components/admin/evolution-tools";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { env, getEvolutionWebhookEvents } from "@/server/env";
import { getStoredEvolutionHttpFallbackAllowed } from "@/server/evolution-settings";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { evolutionProvider } from "@/server/providers/messaging/evolution";

export const dynamic = "force-dynamic";

async function getEvolutionState() {
  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [status, webhookConfig, allowHttpFallback, latestWebhookEvent, recentWebhookCount] = await Promise.all([
      evolutionProvider.getStatus(),
      evolutionProvider.getWebhookConfig(),
      getStoredEvolutionHttpFallbackAllowed(),
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

    return { status, qr: null, webhookConfig, allowHttpFallback, latestWebhookEvent, recentWebhookCount, error: null };
  } catch (error) {
    return {
      status: null,
      qr: null,
      webhookConfig: null,
      allowHttpFallback: false,
      latestWebhookEvent: null,
      recentWebhookCount: 0,
      error: error instanceof Error ? error.message : "Não foi possível consultar conexão com WhatsApp.",
    };
  }
}

export default async function AdminWhatsappPage() {
  await requireAdmin();
  const state = await getEvolutionState();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Status da conexão" description="Acompanhe o estado atual da integração com WhatsApp.">
        {state.error ? (
          <div className="theme-panel-danger rounded-[22px] border px-4 py-4 text-sm">
            {state.error}
          </div>
        ) : (
          <div className="space-y-3 text-sm leading-7 text-foreground/72">
            <p>
              Estado: <StatusBadge tone={state.status?.connected ? "success" : "warning"}>{state.status?.status ?? "desconhecido"}</StatusBadge>
            </p>
            <p>Identidade conectada: {state.status?.identity ?? "não informada"}</p>
            <p>Número conectado: {state.status?.phoneE164 ?? "não detectado"}</p>
            <p>Status do QR Code: {state.status?.connected ? "dispensado" : "sob demanda"}</p>
            <p>Segredo configurado: {env.EVOLUTION_WEBHOOK_SECRET ? "sim" : "não"}</p>
            <p>Eventos monitorados: {(state.webhookConfig?.events ?? getEvolutionWebhookEvents()).join(", ")}</p>
            <p>Conexão local temporária: {state.allowHttpFallback ? "habilitada" : "desabilitada"}</p>
            <p>
              Recebimento de eventos: <StatusBadge tone={state.recentWebhookCount > 0 ? "success" : "warning"}>{state.recentWebhookCount > 0 ? "recebendo eventos" : "sem eventos recentes"}</StatusBadge>
            </p>
            <p>
              Último evento recebido: {state.latestWebhookEvent ? formatDateTime(state.latestWebhookEvent.createdAt) : "nenhum evento registrado"}
            </p>
            <p>Eventos recebidos nas últimas 24h: {state.recentWebhookCount}</p>
          </div>
        )}
        </SectionCard>

        <SectionCard title="Pareamento e testes" description="Use estas ações para conectar novamente a conta e validar o envio de mensagens.">
          <EvolutionTools
            initialQrCode={null}
            initialStatus={state.status?.status ?? "desconhecido"}
            initialConnected={Boolean(state.status?.connected)}
            initialIdentity={state.status?.identity ?? null}
            initialPhoneE164={state.status?.phoneE164 ?? null}
            initialWebhookEvents={(state.webhookConfig?.events ?? getEvolutionWebhookEvents()).join(",")}
            initialAllowHttpFallback={state.allowHttpFallback}
          />
        </SectionCard>
      </div>

      <SectionCard title="Diagnóstico de mídia" description="Teste PNG administrativo para descobrir variante compatível do sendMedia na Evolution deste ambiente.">
        <EvolutionMediaTestPanel />
      </SectionCard>
    </div>
  );
}
