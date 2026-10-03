/**
 * SAM-78 — `/escola/[schoolId]/catalogo`: the collaborative institutional
 * catalog — roles per coach (editor / reviewer / reader) and the proposals
 * waiting for review. OWNER/ADMIN only; a reviewer reviews from the API.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogRoleForm, ReviewProposalForm } from "@/components/catalog/catalog-collaboration-forms";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { CanManageSchool } from "@/modules/school/application/can-manage-school";
import { listCatalogRoles, listSchoolProposals } from "@/modules/school/application/workout-catalog-collaboration";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { CATALOG_ROLE_LABELS } from "@/modules/school/domain/catalog-roles";
import { SchoolMembershipRepository } from "@/modules/school/infrastructure/school-membership-repository";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { PENDING: "aguardando revisão", APPROVED: "publicada", REJECTED: "recusada", WITHDRAWN: "retirada" };

export default async function SchoolCatalogPage({ params }: { params: Promise<{ schoolId: string }> }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId } = await params;
  if (!await new CanManageSchool(new SchoolMembershipRepository(prisma)).execute(session.user.id, schoolId)) notFound();
  const [roles, proposals] = await Promise.all([listCatalogRoles(prisma, schoolId), listSchoolProposals(prisma, schoolId, "ALL")]);
  const pending = proposals.filter((proposal) => proposal.status === "PENDING");
  const history = proposals.filter((proposal) => proposal.status !== "PENDING");

  return (
    <div className={PAGE_CLASS}>
      <PageHeader title="Catálogo institucional" description="Quem edita, quem revisa e o que os professores propuseram. Publicar cria uma cópia na escola com a autoria do professor; o modelo pessoal continua dele." />

      <SectionCard title="Propostas aguardando revisão" description="Cada versão publicada registra o autor e os direitos de uso informados.">
        {pending.length === 0 ? <p className="text-sm text-foreground/55">Nenhuma proposta pendente.</p> : (
          <ul className="space-y-3 text-sm" data-testid="pending-proposals">
            {pending.map((proposal) => (
              <li key={proposal.id} className="rounded-[14px] border border-white/10 p-3" data-testid="proposal">
                <p className="font-medium">{proposal.template.title} <span className="text-xs text-foreground/55">({resolveSportLabel(proposal.template.sportType) ?? proposal.template.sportType}) · proposto por {proposal.proposer.displayName}</span></p>
                {proposal.usageRights && <p className="text-xs text-foreground/60">Direitos/origem: {proposal.usageRights}</p>}
                {proposal.note && <p className="text-xs text-foreground/60">Nota: {proposal.note}</p>}
                <div className="mt-2"><ReviewProposalForm proposalId={proposal.id} /></div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Papéis no catálogo" description="Editor altera modelos institucionais (nova versão, autor por versão); revisor publica propostas; leitor só lê. Sem papel, o professor lê o institucional.">
        <div className="space-y-2" data-testid="catalog-roles">
          {roles.map((row) => <CatalogRoleForm key={row.coachId} schoolId={schoolId} coachId={row.coachId} name={row.name} current={row.role} />)}
        </div>
      </SectionCard>

      {history.length > 0 && (
        <SectionCard title="Histórico de propostas">
          <ul className="space-y-1 text-sm" data-testid="proposal-history">
            {history.map((proposal) => (
              <li key={proposal.id} data-testid="proposal-history-row" data-status={proposal.status}>
                {proposal.template.title} · {proposal.proposer.displayName} · {STATUS[proposal.status] ?? proposal.status}
                {proposal.reviewNote ? ` — ${proposal.reviewNote}` : ""}
                {proposal.publishedTemplateId && <> · <Link href={`/professor/estudio/treinos/${proposal.publishedTemplateId}`} className="underline">modelo publicado</Link></>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      <p className="text-xs text-foreground/50">Política de desligamento: o institucional fica na escola (autoria preservada), o catálogo pessoal sai com o professor e as sessões já entregues aos alunos permanecem. Papéis: {Object.values(CATALOG_ROLE_LABELS).join(", ")}.</p>
    </div>
  );
}