import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { AdminSchoolActions } from "./school-actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AdminEscolaDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const school = await prisma.school.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      memberships: {
        where: { status: "ACTIVE" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          roles: { select: { role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      coachMemberships: {
        where: { status: "ACTIVE" },
        include: { coach: { include: { user: { select: { id: true, name: true, email: true } } } } },
        orderBy: { createdAt: "asc" },
      },
      athleteMemberships: {
        where: { status: "ACTIVE" },
        include: { athlete: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!school) notFound();

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/escolas" className="text-xs text-foreground/50 hover:text-foreground transition-colors">
            ← Todas as escolas
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-xl font-semibold">{school.name}</h1>
            <StatusBadge tone={statusVariant(school.status)}>{statusLabel(school.status)}</StatusBadge>
          </div>
        </div>
        <AdminSchoolActions schoolId={school.id} currentStatus={school.status} />
      </div>

      {/* Dados básicos */}
      <SectionCard title="Dados da escola" description="Informações cadastrais.">
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div><dt className="text-foreground/50 text-xs uppercase tracking-wide">Responsável</dt><dd>{school.owner.name ?? school.owner.email}</dd></div>
          <div><dt className="text-foreground/50 text-xs uppercase tracking-wide">Slug</dt><dd>{school.slug}</dd></div>
          {school.city && <div><dt className="text-foreground/50 text-xs uppercase tracking-wide">Cidade</dt><dd>{school.city}{school.state ? ` / ${school.state}` : ""}</dd></div>}
          {school.email && <div><dt className="text-foreground/50 text-xs uppercase tracking-wide">E-mail</dt><dd>{school.email}</dd></div>}
          <div><dt className="text-foreground/50 text-xs uppercase tracking-wide">Criada</dt><dd>{formatDateTime(school.createdAt)}</dd></div>
          {school.deactivatedAt && <div><dt className="text-foreground/50 text-xs uppercase tracking-wide">Desativada</dt><dd>{formatDateTime(school.deactivatedAt)}</dd></div>}
        </dl>
      </SectionCard>

      {/* Membros admin */}
      <SectionCard title={`Membros (${school.memberships.length})`} description="Usuários com papel na escola.">
        {school.memberships.length === 0 ? (
          <p className="text-sm text-foreground/40">Nenhum membro ativo.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {school.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5 gap-4 text-sm">
                <div>
                  <p className="font-medium">{m.user.name ?? m.user.email}</p>
                  <p className="text-xs text-foreground/40">{m.user.email}</p>
                </div>
                <p className="text-xs text-foreground/50">{m.roles.map((r) => r.role).join(", ")}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Coaches */}
      <SectionCard title={`Professores (${school.coachMemberships.length})`} description="Coaches vinculados ativos.">
        {school.coachMemberships.length === 0 ? (
          <p className="text-sm text-foreground/40">Nenhum professor ativo.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {school.coachMemberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5 gap-4 text-sm">
                <div>
                  <p className="font-medium">{m.coach.displayName}</p>
                  <p className="text-xs text-foreground/40">{m.coach.user.name ?? m.coach.user.email}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Atletas */}
      <SectionCard title={`Atletas (${school.athleteMemberships.length})`} description="Atletas matriculados ativos.">
        {school.athleteMemberships.length === 0 ? (
          <p className="text-sm text-foreground/40">Nenhum atleta ativo.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {school.athleteMemberships.map((m) => (
              <li key={m.id} className="py-2.5 text-sm">
                <p className="font-medium">{m.athlete.name ?? m.athlete.email}</p>
                <p className="text-xs text-foreground/40">{m.athlete.email}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
