import { EvolutionTools } from "@/components/admin/evolution-tools";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { env } from "@/server/env";
import { requireAdmin } from "@/server/auth-guards";
import { evolutionProvider } from "@/server/providers/messaging/evolution";

export const dynamic = "force-dynamic";

async function getEvolutionState() {
  try {
    const [status, qr] = await Promise.all([
      evolutionProvider.getStatus(),
      evolutionProvider.getConnectQrCode(),
    ]);

    return { status, qr, error: null };
  } catch (error) {
    return {
      status: null,
      qr: null,
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
          </div>
        )}
      </SectionCard>

      <SectionCard title="QR Code / reconnect / teste" description="Ferramentas administrativas para pareamento e mensagem de teste, sempre via backend interno.">
        <EvolutionTools initialQrCode={state.qr?.qrCode ?? null} />
      </SectionCard>
    </div>
  );
}
