/**
 * Detalhe de um membro da escola: identidade, contato, endereço, papéis locais
 * e vínculos (atleta / professor), com ações de papel e desativação.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { GetSchoolMemberDetail } from "@/modules/school/application/get-school-member-detail";
import { SchoolError } from "@/modules/school/domain/errors";
import type { SchoolRole } from "@/modules/school/domain/enums";
import { ASSIGNABLE_SCHOOL_ROLES } from "@/modules/school/presentation/role-labels";
import { formatAddress, formatDate, formatPhoneBR } from "@/modules/school/presentation/format";
import { SectionCard } from "@/components/section-card";
import { StatusBadge } from "@/components/status-badge";
import { DeactivateMemberButton, MemberRoleEditor } from "../member-actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ schoolId: string; membershipId: string }> };

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-foreground/45">{label}</dt>
      <dd className="mt-1 text-sm">{value ?? <span className="text-foreground/40">Não informado</span>}</dd>
    </div>
  );
}

export default async function MembroDetalhePage({ params }: PageProps) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { schoolId, membershipId } = await params;

  let detail;
  try {
    detail = await new GetSchoolMemberDetail(prisma).execute(session.user.id, schoolId, membershipId);
  } catch (error) {
    // 401/403/404 all become the same "not found" page: an administrator of
    // another school must not be able to tell a real membership from a fake id.
    if (error instanceof SchoolError) notFound();
    throw error;
  }

  const { membership, roles, user, isOwner, athleteMembership, coach } = detail;
  const isActive = membership.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/escola/${schoolId}/membros`}
            className="text-xs text-foreground/50 hover:text-foreground transition-colors"
          >
            ← Membros
          </Link>
          <h1 className="mt-2 text-xl font-semibold">{user.name ?? user.email}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge tone={isActive ? "success" : "neutral"}>
              {isActive ? "Ativo" : "Inativo"}
            </StatusBadge>
            {isOwner && <StatusBadge tone="success">Proprietário</StatusBadge>}
          </div>
        </div>
        {isActive && (
          <DeactivateMemberButton
            schoolId={schoolId}
            membershipId={membership.id}
            disabled={isOwner}
            disabledReason="O proprietário não pode ser desativado."
          />
        )}
      </div>

      <SectionCard title="Dados de contato">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome" value={user.name} />
          <Field label="E-mail" value={user.email} />
          <Field label="Telefone" value={formatPhoneBR(user.phoneE164)} />
          <Field label="Conta criada em" value={formatDate(user.createdAt)} />
          <div className="sm:col-span-2">
            <Field label="Endereço" value={formatAddress(user.address)} />
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Papéis na escola">
        <MemberRoleEditor
          schoolId={schoolId}
          membershipId={membership.id}
          roles={roles.map((r) => r.role as SchoolRole)}
          assignableRoles={ASSIGNABLE_SCHOOL_ROLES}
          canEdit={isActive && !isOwner}
        />
        {isOwner && (
          <p className="mt-3 text-xs text-foreground/45">
            Os papéis do proprietário não podem ser alterados por aqui.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Vínculo com a escola">
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Início" value={formatDate(membership.startedAt ?? membership.createdAt)} />
          <Field label="Término" value={membership.endedAt ? formatDate(membership.endedAt) : null} />
        </dl>
      </SectionCard>

      {athleteMembership && (
        <SectionCard title="Como atleta">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Field label="Situação" value={athleteMembership.status} />
            <Field label="Desde" value={formatDate(athleteMembership.startedAt)} />
          </dl>
          <Link
            href={`/escola/${schoolId}/atletas`}
            className="mt-4 inline-block text-sm font-medium hover:underline"
          >
            Ver atletas da escola →
          </Link>
        </SectionCard>
      )}

      {coach && (
        <SectionCard title="Como professor">
          <dl className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome de exibição" value={coach.displayName} />
            <Field label="Situação do perfil" value={coach.status} />
          </dl>
          {coach.membership && (
            <Link
              href={`/escola/${schoolId}/professores/${coach.membership.id}`}
              className="mt-4 inline-block text-sm font-medium hover:underline"
            >
              Abrir ficha do professor →
            </Link>
          )}
        </SectionCard>
      )}
    </div>
  );
}
