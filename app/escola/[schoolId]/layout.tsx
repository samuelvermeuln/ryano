/**
 * T250 — Layout do módulo Escola (visão administrativa)
 * Requer que o usuário autenticado seja OWNER ou ADMIN da escola.
 */
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { buildMobileDockItemsFromNavigation } from "@/lib/navigation";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";

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
  if (!isAuthorized) redirect("/app/dashboard");

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, status: true } });
  if (!school) notFound();

  const navigation = [
    { href: `/escola/${schoolId}`,              label: "Painel",         subtitle: "Visão geral",           icon: "overview"  as const },
    { href: `/escola/${schoolId}/membros`,       label: "Membros",        subtitle: "Papéis e status",        icon: "users"     as const },
    { href: `/escola/${schoolId}/professores`,   label: "Professores",    subtitle: "Equipe de coaching",    icon: "team"      as const },
    { href: `/escola/${schoolId}/atletas`,        label: "Atletas",       subtitle: "Gerenciar atletas",     icon: "school"    as const },
    { href: `/escola/${schoolId}/turmas`,         label: "Turmas",        subtitle: "Grupos e equipes",      icon: "team"      as const },
    { href: `/escola/${schoolId}/solicitacoes`,   label: "Solicitações",  subtitle: "Pendentes e aprovadas", icon: "requests"  as const },
    { href: `/escola/${schoolId}/convites`,       label: "Convites",      subtitle: "Links de convite",      icon: "invites"   as const },
    // TM046 — own flag (MARKETPLACE_ENABLED can be off while the school module is on).
    ...(isMarketplaceEnabled()
      ? [{ href: `/escola/${schoolId}/marketplace`, label: "Marketplace", subtitle: "Produtos e vendas", icon: "workout" as const }]
      : []),
  ] as const;

  return (
    <AppShell
      mode="app"
      navigation={navigation}
      userName={session.user.name ?? session.user.email ?? "Usuário"}
      userImage={session.user.image}
      mobileDock={
        <MobileDock
          variant="custom"
          items={buildMobileDockItemsFromNavigation(navigation)}
          user={{ name: session.user.name ?? session.user.email, image: session.user.image }}
        />
      }
    >
      {school.status === "INACTIVE" ? (
        <div className="theme-panel-danger rounded-2xl border p-5 space-y-1.5">
          <h2 className="text-base font-semibold">Esta escola foi desativada</h2>
          <p className="text-sm opacity-80">
            Todos os vínculos foram encerrados. Nenhuma ação pode ser realizada nesta escola.
            Entre em contato com o suporte da Ryvano caso precise reativar.
          </p>
          <a
            href="/escola/buscar"
            className="inline-block text-sm text-primary underline underline-offset-2 hover:opacity-80"
          >
            Encontrar outra escola
          </a>
        </div>
      ) : children}
    </AppShell>
  );
}
