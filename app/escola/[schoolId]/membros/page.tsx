/**
 * T254 — Tela membros e papéis
 * Lista todos os membros da escola com seus papéis e status.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string }> };

export default async function MembrosPage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  await requireOnboardedSession();
  const { schoolId } = await params;

  const members = await prisma.schoolMembership.findMany({
    where: { schoolId },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      roles: { select: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <SectionCard title="Membros e papéis">
        {members.length === 0 ? (
          <p className="text-center text-sm text-foreground/40 py-12">Nenhum membro encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-xs text-foreground/50 uppercase tracking-wide">
                  <th className="py-3 pr-4 font-medium">Nome</th>
                  <th className="py-3 pr-4 font-medium">E-mail</th>
                  <th className="py-3 pr-4 font-medium">Papéis</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-4 font-medium">{m.user.name ?? "—"}</td>
                    <td className="py-3 pr-4 text-foreground/60">{m.user.email}</td>
                    <td className="py-3 pr-4">
                      {m.roles.length === 0
                        ? <span className="text-foreground/40">—</span>
                        : m.roles.map((r) => (
                            <span key={r.role} className="inline-block rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-foreground/60 mr-1">{r.role}</span>
                          ))}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge tone={m.status === "ACTIVE" ? "success" : "neutral"}>
                        {m.status === "ACTIVE" ? "Ativo" : "Inativo"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
