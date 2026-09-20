/**
 * T290 — Fluxo de convite
 * Rota pública que resolve o token, exibe detalhes do convite e permite aceitar.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { ResolveInvitationLink } from "@/modules/school/application/resolve-invitation-link";
import { AcceptInvitationForm } from "./accept-invitation-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

const resolver = new ResolveInvitationLink(prisma);

export default async function ConvitePage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) redirect("/entrar");

  const { token } = await params;
  const session = await auth();

  let invitation: Awaited<ReturnType<ResolveInvitationLink["execute"]>> | null = null;
  let errorMessage: string | null = null;

  try {
    invitation = await resolver.execute({ token });
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : "Convite inválido.";
  }

  // Get school name for display
  const school = invitation?.schoolId
    ? await prisma.school.findUnique({ where: { id: invitation.schoolId }, select: { name: true } })
    : null;

  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(`/entrar/convite/${token}`);
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">Convite{school ? ` para ${school.name}` : ""}</h1>
          {errorMessage ? (
            <p className="text-destructive text-sm">{errorMessage}</p>
          ) : (
            <p className="text-muted-foreground text-sm">Faça login para aceitar o convite.</p>
          )}
          <Link href={`/entrar?callbackUrl=${callbackUrl}`}
            className="block w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 text-center">
            Entrar na conta
          </Link>
        </div>
      </main>
    );
  }

  if (errorMessage || !invitation) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">Convite inválido</h1>
          <p className="text-muted-foreground text-sm">{errorMessage ?? "Este convite não está disponível."}</p>
          <Link href="/app/dashboard" className="text-sm underline text-muted-foreground">Ir para o painel</Link>
        </div>
      </main>
    );
  }

  const typeLabel = invitation.type === "COACH" ? "Professor" : invitation.type === "SCHOOL_COACH" ? "Professor associado" : "Membro";

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Aceitar convite</h1>
          {school && <p className="text-muted-foreground text-sm">{school.name}</p>}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tipo</span>
            <span className="font-medium">{typeLabel}</span>
          </div>
          {invitation.requiresApproval && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aprovação</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">Necessária</span>
            </div>
          )}
          {invitation.expiresAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expira em</span>
              <span>{new Date(invitation.expiresAt).toLocaleDateString("pt-BR")}</span>
            </div>
          )}
          {invitation.maxUses != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Usos restantes</span>
              <span>{invitation.maxUses - invitation.usedCount}</span>
            </div>
          )}
        </div>

        {invitation.requiresApproval && (
          <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
            Sua solicitação ficará pendente até um administrador aprovar.
          </p>
        )}

        <AcceptInvitationForm token={token} requiresApproval={invitation.requiresApproval} />
      </div>
    </main>
  );
}
