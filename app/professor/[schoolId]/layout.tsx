/**
 * T270 — Layout do painel do professor
 * Requer que o usuário seja coach ativo na escola.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContextShell } from "@/components/context-shell";
import { CONTEXT_PICKER_ROUTE } from "@/lib/user-context";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const metadata = buildNoIndexMetadata({
  title: "Painel do professor",
  description: "Gerencie seus atletas e prescrições.",
  path: "/professor",
});

type LayoutProps = { children: ReactNode; params: Promise<{ schoolId: string }> };

export default async function ProfessorLayout({ children, params }: LayoutProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true },
  });
  // SAM-14 — perder o papel de professor não converte a conta em atleta: o
  // seletor decide o próximo contexto válido.
  if (!coachProfile || coachProfile.status !== "ACTIVE") redirect(CONTEXT_PICKER_ROUTE);

  const membership = await prisma.coachSchoolMembership.findFirst({
    where: { schoolId, coachId: coachProfile.id, status: "ACTIVE", endedAt: null },
    select: { id: true },
  });
  // Professor válido, mas sem vínculo com ESTA escola: o hub lista as escolas dele.
  if (!membership) redirect("/professor");

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, status: true } });
  if (!school) notFound();

  return (
    <ContextShell
      user={session.user}
      impliedKey="professor"
      scope={{ kind: "professor-school", schoolId }}
      scopeLabel={school.name}
    >
      {school.status === "INACTIVE" ? (
        <div className="p-6">
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
            <h2 className="text-base font-semibold text-destructive">Esta escola foi desativada</h2>
            <p className="text-sm text-foreground/70 mt-1.5">
              O seu vínculo como professor nesta escola foi encerrado. Você pode vincular-se a outra escola ou atuar como coach independente.
            </p>
            <div className="flex flex-wrap gap-3 mt-3">
              <Link href="/professor/buscar-escola" className="text-sm text-primary underline underline-offset-2 hover:opacity-80">
                Vincular-se a outra escola
              </Link>
              <Link href="/professor/independente" className="text-sm text-primary underline underline-offset-2 hover:opacity-80">
                Coach independente
              </Link>
            </div>
          </div>
        </div>
      ) : children}
    </ContextShell>
  );
}
