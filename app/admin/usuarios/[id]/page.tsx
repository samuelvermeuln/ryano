import { notFound } from "next/navigation";

import { AdminUserIdentityForm } from "@/components/admin/admin-user-identity-form";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth-guards";
import { decryptSecret, type EncryptedSecret } from "@/server/crypto/secret-vault";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      profile: true,
      address: true,
      whatsappIdentity: true,
      wearableConnections: true,
      notificationPreference: true,
      messageDeliveries: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      integrationEvents: {
        where: {
          provider: "EVOLUTION",
          eventType: {
            in: ["WHATSAPP_DELIVERY_SENT", "WHATSAPP_DELIVERY_FAILED"],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!user) {
    notFound();
  }

  const garmin = user.wearableConnections.find((connection) => connection.provider === "GARMIN") ?? null;
  const cpf = user.profile?.cpfEncrypted
    ? decryptSecret(JSON.parse(user.profile.cpfEncrypted) as EncryptedSecret)
    : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SectionCard title={user.name ?? user.email} description="Resumo administrativo da conta.">
        <div className="grid gap-3">
          <Row label="Email" value={user.email} />
          <Row label="Status" value={formatAccountStatus(user.status)} />
          <Row label="Perfil de acesso" value={formatRole(user.role)} />
          <Row label="Configuração inicial" value={user.profile?.onboardingCompletedAt ? formatDateTime(user.profile.onboardingCompletedAt) : "Pendente"} />
          <Row label="CPF" value={formatCpf(cpf)} />
          <Row label="Telefone" value={user.profile?.phoneE164 ?? "—"} />
          <Row label="WhatsApp" value={user.whatsappIdentity?.verifiedAt ? "Verificado" : "Pendente"} />
        </div>
      </SectionCard>

      <SectionCard title="Correção administrativa" description="Ajuste CPF e telefone quando cliente digitar algo errado.">
        <AdminUserIdentityForm userId={user.id} cpf={cpf} phone={user.profile?.phoneE164 ?? null} />
      </SectionCard>

      <SectionCard title="Integrações" description="Estado atual das conexões e das mensagens da conta.">
        <div className="grid gap-3">
          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-foreground">Garmin</p>
              <StatusBadge tone={garmin?.status === "CONNECTED" ? "success" : garmin ? "warning" : "neutral"}>
                {garmin ? formatGarminStatus(garmin.status) : "Sem conexão"}
              </StatusBadge>
            </div>
            <p className="mt-2 text-sm text-foreground/65">Última sincronização: {formatDateTime(garmin?.lastSyncAt)}</p>
            <p className="mt-1 text-sm text-foreground/65">Status da sincronização: {garmin?.lastSyncStatus ?? "—"}</p>
          </div>
          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
            <p className="font-semibold text-foreground">Mensagens recentes</p>
            <div className="mt-3 grid gap-2">
              {user.messageDeliveries.length ? (
                user.messageDeliveries.map((delivery) => (
                  <div key={delivery.id} className="theme-panel-neutral rounded-[16px] border px-3 py-3 text-sm">
                    <p>{delivery.type}</p>
                    <p className="mt-1 text-xs text-foreground/55">{delivery.status} · {formatDateTime(delivery.createdAt)}</p>
                    <p className="mt-1 text-xs text-foreground/55">Erro atual: {delivery.errorCode ?? "—"}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-foreground/60">Sem mensagens registradas.</p>
              )}
            </div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
            <p className="font-semibold text-foreground">Log de entrega por usuário</p>
            <div className="mt-3 grid gap-2">
              {user.integrationEvents.length ? (
                user.integrationEvents.map((event) => (
                  <div key={event.id} className="theme-panel-neutral rounded-[16px] border px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{formatDeliveryEventType(event.eventType)}</p>
                      <p className="text-xs text-foreground/55">{formatDateTime(event.createdAt)}</p>
                    </div>
                    <p className="mt-2 text-xs text-foreground/60">Tipo: {getEventPayloadString(event.payload, "deliveryType") ?? "—"}</p>
                    <p className="text-xs text-foreground/60">Entrega: {getEventPayloadString(event.payload, "deliveryId") ?? "—"}</p>
                    <p className="text-xs text-foreground/60">Telefone: {getEventPayloadString(event.payload, "phoneE164") ?? "—"}</p>
                    <p className="text-xs text-foreground/60">ID externo: {getEventPayloadString(event.payload, "externalMessageId") ?? "—"}</p>
                    <p className="mt-2 text-xs text-amber-200/90 break-words">Detalhe: {getEventPayloadString(event.payload, "detail") ?? "—"}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-foreground/60">Sem log detalhado de entrega para este usuário.</p>
              )}
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm text-foreground/55">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function formatAccountStatus(status: string) {
  if (status === "ACTIVE") {
    return "Ativa";
  }

  if (status === "PENDING") {
    return "Pendente";
  }

  return status;
}

function formatRole(role: string) {
  if (role === "ADMIN") {
    return "Administrador";
  }

  if (role === "USER") {
    return "Usuário";
  }

  return role;
}

function formatDeliveryEventType(value: string) {
  if (value === "WHATSAPP_DELIVERY_SENT") {
    return "WhatsApp enviado";
  }

  if (value === "WHATSAPP_DELIVERY_FAILED") {
    return "WhatsApp falhou";
  }

  return value;
}

function getEventPayloadString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function formatGarminStatus(status: string) {
  if (status === "CONNECTED") {
    return "Conectado";
  }

  if (status === "RECONNECT_REQUIRED") {
    return "Reconectar";
  }

  if (status === "ERROR") {
    return "Erro";
  }

  return status;
}

function formatCpf(value: string | null) {
  if (!value) {
    return "—";
  }

  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length !== 11) {
    return value;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
