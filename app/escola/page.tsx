/**
 * T251 — Tela lista de escolas do usuário
 * Redireciona para a única escola quando há só uma;
 * exibe seletor quando há múltiplas.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const dynamic = "force-dynamic";

export default async function EscolaIndexPage() {
  if (!isSchoolModuleEnabled()) redirect("/app/dashboard");
  const session = await requireOnboardedSession();

  const memberships = await prisma.schoolMembership.findMany({
    where: { userId: session.user.id, isActive: true },
    include: {
      school: { select: { id: true, name: true, isActive: true } },
      roles: { select: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const adminMemberships = memberships.filter((m) =>
    m.roles.some((r) => ["OWNER", "ADMIN"].includes(r.role)) && m.school.isActive,
  );

  if (adminMemberships.length === 0) redirect("/app/dashboard");
  if (adminMemberships.length === 1) redirect(`/escola/${adminMemberships[0]!.school.id}`);

  return (
    <main className="min-h-screen p-6 md:p-12">
      <h1 className="text-2xl font-semibold mb-6">Suas escolas</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminMemberships.map(({ school, roles }) => (
          <li key={school.id}>
            <Link
              href={`/escola/${school.id}`}
              className="block rounded-xl border border-border bg-card p-5 hover:bg-muted transition-colors"
            >
              <p className="font-medium text-base">{school.name}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {roles.map((r) => r.role).join(", ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
