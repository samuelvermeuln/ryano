/**
 * T254 — Tela membros e papéis
 * Lista todos os membros da escola com seus papéis e status, e permite
 * adicionar, abrir detalhes e desativar.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { schoolRoleLabel } from "@/modules/school/presentation/role-labels";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { AddMemberForm } from "./add-member-form";
import { DeactivateMemberButton } from "./member-actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function MembrosPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const [school, members] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, ownerUserId: true } }),
    prisma.schoolMembership.findMany({
      where: { schoolId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        roles: { select: { role: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!school) notFound();

  const active = members.filter((m) => m.status === "ACTIVE");
  const inactive = members.filter((m) => m.status !== "ACTIVE");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Membros</h1>
          <p className="text-sm text-foreground/50 mt-1">
            {active.length === 0
              ? "Nenhum membro ativo."
              : `${active.length} ${active.length === 1 ? "membro ativo" : "membros ativos"}`}
          </p>
        </div>
        <AddMemberForm schoolId={schoolId} />
      </div>

      {members.length === 0 ? (
        <EmptyState
          title="Esta escola ainda não tem membros"
          description="Adicione pessoas que já tenham conta Ryvano, ou gere um link de convite."
        />
      ) : (
        <SectionCard title={`Ativos (${active.length})`}>
          {active.length === 0 ? (
            <p className="text-center text-sm text-foreground/40 py-12">Nenhum membro ativo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
                    <th className="py-3 pr-4 font-medium">Nome</th>
                    <th className="py-3 pr-4 font-medium">E-mail</th>
                    <th className="py-3 pr-4 font-medium">Papéis</th>
                    <th className="py-3 pr-4 font-medium">Desde</th>
                    <th className="py-3 pr-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {active.map((m) => {
                    const isOwner = m.user.id === school.ownerUserId;
                    return (
                      <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 pr-4 font-medium">
                          <Link href={`/escola/${schoolId}/membros/${m.id}`} className="hover:underline">
                            {m.user.name ?? "—"}
                          </Link>
                          {isOwner && (
                            <span className="ml-2"><StatusBadge tone="success">Proprietário</StatusBadge></span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-foreground/60">{m.user.email}</td>
                        <td className="py-3 pr-4">
                          {m.roles.length === 0
                            ? <span className="text-foreground/40">—</span>
                            : m.roles.map((r) => (
                                <span key={r.role} className="inline-block rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-foreground/60 mr-1">{schoolRoleLabel(r.role)}</span>
                              ))}
                        </td>
                        <td className="py-3 pr-4 text-xs text-foreground/50">
                          {new Date(m.startedAt ?? m.createdAt).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 pr-4">
                          <DeactivateMemberButton
                            schoolId={schoolId}
                            membershipId={m.id}
                            disabled={isOwner}
                            disabledReason="Proprietário"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {inactive.length > 0 && (
        <SectionCard title={`Inativos (${inactive.length})`}>
          <ul className="divide-y divide-white/5">
            {inactive.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <Link href={`/escola/${schoolId}/membros/${m.id}`} className="font-medium hover:underline">
                  {m.user.name ?? m.user.email}
                </Link>
                <span className="flex items-center gap-3 text-xs text-foreground/50">
                  {m.endedAt && <span>até {new Date(m.endedAt).toLocaleDateString("pt-BR")}</span>}
                  <StatusBadge tone="neutral">Inativo</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
