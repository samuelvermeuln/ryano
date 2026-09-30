/**
 * T250 — Layout do módulo Escola (visão administrativa)
 * Requer que o usuário autenticado seja OWNER ou ADMIN da escola.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContextShell } from "@/components/context-shell";
import { CONTEXT_PICKER_ROUTE, schoolContextKey } from "@/lib/user-context";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";

export const metadata = buildNoIndexMetadata({
  title: "Escola",
  description: "Painel administrativo da escola.",
  path: "/escola",
});

type LayoutProps = { children: ReactNode; params: Promise<{ schoolId: string }> };

export default async function EscolaAdminLayout({ children, params }: LayoutProps) {
  if (!isSchoolModuleEnabled()) notFound();

  const session = await requireOnboardedSession();
  const { schoolId } = await params;

  const membership = await prisma.schoolMembership.findFirst({
    where: { schoolId, userId: session.user.id, status: "ACTIVE" },
    include: { roles: { select: { role: true } } },
  });
  const isAuthorized = membership?.roles.some((r) => ["OWNER", "ADMIN"].includes(r.role));
  // SAM-14 — sem acesso a ESTA escola não se cai no dashboard do atleta (isso
  // trocava a persona); o seletor entra direto no único contexto válido.
  if (!isAuthorized) redirect(CONTEXT_PICKER_ROUTE);

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, status: true } });
  if (!school) notFound();

  return (
    <ContextShell user={session.user} impliedKey={schoolContextKey(schoolId)} scopeLabel={school.name}>
      {school.status === "INACTIVE" ? (
        <div className="theme-panel-danger rounded-2xl border p-5 space-y-1.5">
          <h2 className="text-base font-semibold">Esta escola foi desativada</h2>
          <p className="text-sm opacity-80">
            Todos os vínculos foram encerrados. Nenhuma ação pode ser realizada nesta escola.
            Entre em contato com o suporte da Ryvano caso precise reativar.
          </p>
          <Link
            href="/escola/buscar"
            className="inline-block text-sm text-primary underline underline-offset-2 hover:opacity-80"
          >
            Encontrar outra escola
          </Link>
        </div>
      ) : children}
    </ContextShell>
  );
}
