import Link from "next/link";

import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      profile: true,
      whatsappIdentity: true,
      wearableConnections: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <SectionCard title="Usuários" description="Busque usuários e acompanhe status da conta e das integrações.">
      <form className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="glass-input rounded-[20px] px-4 py-3 sm:min-w-80">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou email"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
          />
        </div>
        <button className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground">
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-foreground/72">
          <thead>
            <tr className="border-b border-white/10 text-foreground/55">
              <th className="px-3 py-3">Nome</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Configuração</th>
              <th className="px-3 py-3">Garmin</th>
              <th className="px-3 py-3">WhatsApp</th>
              <th className="px-3 py-3">Última sincronização</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const garmin = user.wearableConnections.find((connection) => connection.provider === "GARMIN");

              return (
                <tr key={user.id} className="border-b border-white/6">
                  <td className="px-3 py-4">
                    <Link href={`/admin/usuarios/${user.id}`} className="text-foreground hover:text-accent">
                      {user.name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-3 py-4">{user.email}</td>
                  <td className="px-3 py-4"><StatusBadge>{formatAccountStatus(user.status)}</StatusBadge></td>
                  <td className="px-3 py-4">{user.profile?.onboardingCompletedAt ? <StatusBadge tone="success">Concluído</StatusBadge> : <StatusBadge tone="warning">Pendente</StatusBadge>}</td>
                  <td className="px-3 py-4">{garmin ? <StatusBadge tone={garmin.status === "CONNECTED" ? "success" : "warning"}>{formatGarminStatus(garmin.status)}</StatusBadge> : "—"}</td>
                  <td className="px-3 py-4">{user.whatsappIdentity?.verifiedAt ? <StatusBadge tone="success">Verificado</StatusBadge> : <StatusBadge tone="warning">Pendente</StatusBadge>}</td>
                  <td className="px-3 py-4">{formatDateTime(garmin?.lastSyncAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
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
