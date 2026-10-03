/**
 * SAM-58 — `/professor/estudio/treinos/[templateId]`: edit a template (saving
 * creates a new version) or read an older version (`?versao=N`, read-only).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";

import { ITEM_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { WorkoutCatalog } from "@/modules/school/application/workout-catalog";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { describeTemplateSummary } from "@/modules/school/presentation/template-summary";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { coachAthletes, environmentOptions, sportOptions } from "../catalog-data";
import { TemplateActions } from "../template-actions";
import { TemplateEditor } from "../template-editor";
import { FutureSessions } from "./future-sessions";
import { diffPrescription } from "@/modules/school/presentation/prescription-diff";

export const dynamic = "force-dynamic";

export default async function ModeloPage({ params, searchParams }: { params: Promise<{ templateId: string }>; searchParams: Promise<{ versao?: string }> }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();
  const { templateId } = await params;
  const { versao } = await searchParams;
  let data: Awaited<ReturnType<WorkoutCatalog["get"]>>;
  try {
    data = await new WorkoutCatalog(prisma).get(session.user.id, templateId, versao && /^\d+$/.test(versao) ? Number(versao) : undefined);
  } catch (error) {
    if (error instanceof SchoolError) notFound();
    throw error;
  }
  const { template, version } = data;
  const isCurrent = version.number === template.version;
  const summary = describeTemplateSummary(version.summary);
  const athletes = (await coachAthletes(session.user.id)).filter((athlete) => template.ownerType === "COACH" || athlete.schoolId === template.schoolId);
  // SAM-60 — what changed from the previous version, shown before updating future sessions.
  const previous = isCurrent && version.number > 1 ? await new WorkoutCatalog(prisma).get(session.user.id, template.id, version.number - 1).catch(() => null) : null;
  const diff = previous
    ? diffPrescription(
      { title: "", description: null, sportType: template.sportType, scheduledAtLocal: null, blocks: previous.version.content.blocks },
      { title: "", description: null, sportType: template.sportType, scheduledAtLocal: null, blocks: version.content.blocks },
    )
    : null;
  const diffLines = diff
    ? diff.blocks.map((change) => change.kind === "changed"
      ? `Bloco ${change.position}: ${change.changes.map((item) => `${item.label} ${item.from} → ${item.to}`).join("; ")}`
      : `Bloco ${change.position} ${change.kind === "added" ? "adicionado" : "removido"}: ${change.summary}`)
    : [];

  return (
    <div className={PAGE_CLASS}>
      <Link href="/professor/estudio/treinos" className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50 hover:text-foreground/80">
        <IconArrowLeft size={14} aria-hidden="true" /> Catálogo
      </Link>
      <PageHeader
        title={`${template.code ? `${template.code} · ` : ""}${template.title}`}
        description={isCurrent ? `Versão ${version.number} (atual). Salvar cria a versão ${version.number + 1}.` : `Versão ${version.number} — somente leitura. A atual é a ${template.version}.`}
      />

      <SectionCard title="Resumo calculado">
        <div className="space-y-1 text-sm" data-testid="template-summary">
          {summary.distance && <p>📏 Distância: {summary.distance}</p>}
          <p>⏱ Duração: {summary.duration}</p>
          {summary.missing.length > 0 && <ul className="text-xs text-foreground/55">{summary.missing.map((line) => <li key={line}>{line}</li>)}</ul>}
        </div>
        <div className="mt-3 space-y-2">
          {isCurrent && template.status !== "ARCHIVED" && (
            <Link href={`/professor/estudio/treinos/${template.id}/atribuir`} className="glass-button-primary inline-flex rounded-full px-4 py-2 text-sm font-medium" data-testid="batch-assign-link">
              Atribuir em lote
            </Link>
          )}
          <TemplateActions
            templateId={template.id}
            favorite={data.favorite}
            archived={template.status === "ARCHIVED"}
            canEdit={data.canEdit}
            athletes={athletes.map((athlete) => ({ label: athlete.label, href: `${athlete.prescribePath}?modelo=${template.id}` }))}
          />
        </div>
      </SectionCard>

      <TemplateEditor
        key={version.number}
        initial={{
          id: template.id,
          version: template.version,
          meta: {
            title: template.title, code: template.code, contentKind: template.contentKind, sportType: template.sportType, environment: template.environment,
            sessionType: template.sessionType, level: template.level, phase: template.phase, tags: template.tags, capabilities: template.capabilities,
            folder: template.folder, description: template.description, status: template.status === "DRAFT" ? "DRAFT" : "ACTIVE",
          },
          content: version.content,
        }}
        sports={sportOptions()}
        environments={environmentOptions()}
        schools={[]}
        readOnly={!isCurrent || !data.canEdit || template.status === "ARCHIVED"}
      />

      {isCurrent && data.canEdit && <FutureSessions templateId={template.id} diffLines={diffLines} />}

      <SectionCard title={`Versões (${data.versions.length})`} description="Cada versão é imutável; prescrições guardam a versão de onde vieram.">
        <ul className="space-y-1.5" data-testid="template-versions">
          {data.versions.map((item) => (
            <li key={item.number} className={`${ITEM_CLASS} flex items-center justify-between text-sm`}>
              <Link href={`/professor/estudio/treinos/${template.id}?versao=${item.number}`} className="hover:underline">Versão {item.number}{item.number === template.version ? " (atual)" : ""}</Link>
              <span className="text-xs text-foreground/50">{item.createdAt.toLocaleString("pt-BR")}{item.authorName ? ` · ${item.authorName}` : ""}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
