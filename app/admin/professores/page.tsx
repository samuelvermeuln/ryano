import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminProfessoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const statusFilter = params.status ?? "";

  const coaches = await prisma.coachProfile.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { user: { name: { contains: q, mode: "insensitive" } } },
              { user: { email: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(statusFilter ? { status: statusFilter as "ACTIVE" | "INACTIVE" } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      schoolMemberships: {
        where: { status: "ACTIVE" },
        include: { school: { select: { id: true, name: true, status: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  function statusVariant(status: string) {
    return status === "ACTIVE" ? ("success" as const) : ("warning" as const);
  }

  return (
    <SectionCard
      title="Professores"
      description="Todos os perfis de coach cadastrados na plataforma."
    >
      <form className="mb-5 flex flex-col gap-3 sm:flex-row flex-wrap">
        <div className="glass-input rounded-[20px] px-4 py-3 sm:min-w-72">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou e-mail"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
          />
        </div>
        <select
          name="status"
          defaultValue={statusFilter}
          className="glass-input rounded-[20px] px-4 py-3 text-sm bg-transparent text-foreground outline-none"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativos</option>
          <option value="INACTIVE">Inativos</option>
        </select>
        <button className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground">
          Filtrar
        </button>
      </form>

      <div className="text-xs text-foreground/50 mb-3">
        {coaches.length} professor{coaches.length !== 1 ? "es" : ""}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
              <th className="pb-3 pr-4 font-medium">Nome / Display</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium hidden sm:table-cell">Usuário</th>
              <th className="pb-3 pr-4 font-medium hidden md:table-cell">Escolas ativas</th>
              <th className="pb-3 font-medium hidden lg:table-cell">Criado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {coaches.map((coach) => (
              <tr key={coach.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-3 pr-4">
                  <p className="font-medium">{coach.displayName}</p>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge tone={statusVariant(coach.status)}>
                    {coach.status === "ACTIVE" ? "Ativo" : "Inativo"}
                  </StatusBadge>
                </td>
                <td className="py-3 pr-4 hidden sm:table-cell">
                  <p className="truncate max-w-[180px]">{coach.user.name ?? coach.user.email}</p>
                  <p className="text-xs text-foreground/40 truncate max-w-[180px]">{coach.user.email}</p>
                </td>
                <td className="py-3 pr-4 hidden md:table-cell">
                  {coach.schoolMemberships.length === 0 ? (
                    <span className="text-foreground/30">Independente</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {coach.schoolMemberships.map((m) => (
                        <li key={m.id} className="text-xs truncate max-w-[180px]">
                          {m.school.name}
                          {m.school.status !== "ACTIVE" && (
                            <span className="ml-1 text-warning/70">(inativa)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-3 hidden lg:table-cell text-foreground/50">
                  {formatDateTime(coach.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {coaches.length === 0 && (
          <p className="text-center text-sm text-foreground/40 py-12">Nenhum professor encontrado.</p>
        )}
      </div>
    </SectionCard>
  );
}
