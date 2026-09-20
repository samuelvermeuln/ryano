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
    where: { userId: session.user.id, status: "ACTIVE" },
    include: {
      school: { select: { id: true, name: true, status: true } },
      roles: { select: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const adminMemberships = memberships.filter((m) =>
    m.roles.some((r) => ["OWNER", "ADMIN"].includes(r.role)) && m.school.status === "ACTIVE",
  );

  if (adminMemberships.length === 0) redirect("/escola/criar");
  if (adminMemberships.length === 1) redirect(`/escola/${adminMemberships[0]!.school.id}`);

  return (
    <main className="min-h-screen p-6 md:p-12">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-semibold">Suas escolas</h1>
        <Link
          href="/escola/criar"
          className="text-sm rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium hover:opacity-90 transition-opacity"
        >
          Nova escola
        </Link>
      </div>
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
