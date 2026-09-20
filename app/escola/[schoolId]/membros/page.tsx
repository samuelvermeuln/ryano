/**
 * T254 — Tela membros e papéis
 * Lista todos os membros da escola com seus papéis e status.
 */
import { notFound } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

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
    <div className="p-6 md:p-10 space-y-6">
      <h1 className="text-xl font-semibold">Membros e papéis</h1>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">E-mail</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Papéis</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{m.user.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.user.email}</td>
                <td className="px-4 py-3">
                  {m.roles.length === 0
                    ? <span className="text-muted-foreground">—</span>
                    : m.roles.map((r) => (
                        <span key={r.role} className="inline-block text-xs bg-secondary rounded px-2 py-0.5 mr-1">{r.role}</span>
                      ))}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block text-xs rounded px-2 py-0.5 ${m.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {m.isActive ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhum membro encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
