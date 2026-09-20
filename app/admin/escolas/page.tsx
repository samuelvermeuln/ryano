import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminEscolasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const statusFilter = params.status ?? "";

  const schools = await prisma.school.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(statusFilter ? { status: statusFilter as "ACTIVE" | "INACTIVE" | "ARCHIVED" } : {}),
    },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      memberships: { where: { status: "ACTIVE" }, select: { id: true } },
      coachMemberships: { where: { status: "ACTIVE" }, select: { id: true } },
      athleteMemberships: { where: { status: "ACTIVE" }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  function statusVariant(status: string) {
    if (status === "ACTIVE") return "success" as const;
    if (status === "INACTIVE") return "warning" as const;
    return "neutral" as const;
  }

  function statusLabel(status: string) {
    if (status === "ACTIVE") return "Ativa";
    if (status === "INACTIVE") return "Inativa";
    return "Arquivada";
  }

  return (
    <SectionCard
      title="Escolas"
      description="Todas as escolas cadastradas na plataforma."
    >
      <form className="mb-5 flex flex-col gap-3 sm:flex-row flex-wrap">
        <div className="glass-input rounded-[20px] px-4 py-3 sm:min-w-72">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar pelo nome"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/40"
          />
        </div>
        <select
          name="status"
          defaultValue={statusFilter}
          className="glass-input rounded-[20px] px-4 py-3 text-sm bg-transparent text-foreground outline-none"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativas</option>
          <option value="INACTIVE">Inativas</option>
          <option value="ARCHIVED">Arquivadas</option>
        </select>
        <button className="glass-button rounded-[20px] px-5 py-3 text-sm font-semibold text-foreground">
          Filtrar
        </button>
      </form>

      <div className="text-xs text-foreground/50 mb-3">{schools.length} escola{schools.length !== 1 ? "s" : ""}</div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
              <th className="pb-3 pr-4 font-medium">Nome</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium hidden sm:table-cell">Responsável</th>
              <th className="pb-3 pr-4 font-medium hidden md:table-cell">Membros</th>
              <th className="pb-3 pr-4 font-medium hidden md:table-cell">Coaches</th>
              <th className="pb-3 pr-4 font-medium hidden md:table-cell">Atletas</th>
              <th className="pb-3 font-medium hidden lg:table-cell">Criada</th>
              <th className="pb-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {schools.map((school) => (
              <tr key={school.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-3 pr-4">
                  <p className="font-medium">{school.name}</p>
                  <p className="text-xs text-foreground/40 mt-0.5 truncate max-w-[180px]">
                    {[school.city, school.state].filter(Boolean).join(", ") || school.slug}
                  </p>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge tone={statusVariant(school.status)}>
                    {statusLabel(school.status)}
                  </StatusBadge>
                </td>
                <td className="py-3 pr-4 hidden sm:table-cell">
                  <p className="truncate max-w-[160px]">{school.owner.name ?? school.owner.email}</p>
                </td>
                <td className="py-3 pr-4 hidden md:table-cell text-center">{school.memberships.length}</td>
                <td className="py-3 pr-4 hidden md:table-cell text-center">{school.coachMemberships.length}</td>
                <td className="py-3 pr-4 hidden md:table-cell text-center">{school.athleteMemberships.length}</td>
                <td className="py-3 pr-4 hidden lg:table-cell text-foreground/50">
                  {formatDateTime(school.createdAt)}
                </td>
                <td className="py-3 text-right">
                  <Link
                    href={`/admin/escolas/${school.id}`}
                    className="text-xs text-accent hover:text-foreground transition-colors"
                  >
                    Detalhes →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {schools.length === 0 && (
          <p className="text-center text-sm text-foreground/40 py-12">Nenhuma escola encontrada.</p>
        )}
      </div>
    </SectionCard>
  );
}
