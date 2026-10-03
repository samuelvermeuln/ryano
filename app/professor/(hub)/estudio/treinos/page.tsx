/**
 * SAM-58 — `/professor/estudio/treinos`: the coach's catalog (personal and the
 * institutional catalogs of their schools) with free-text search ("orientação
 * mar", "corrida 10 km", "cadência"…), filters, favourites, folders, preview of
 * the computed summary, duplicate, variant, archive and "Usar este modelo".
 * Nothing here reaches an athlete by itself (§9.1).
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { FIELD_CLASS, ITEM_CLASS, PAGE_CLASS, PageHeader, PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { WorkoutCatalog } from "@/modules/school/application/workout-catalog";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { SchoolError } from "@/modules/school/domain/errors";
import { TEMPLATE_CONTENT_KIND_LABELS } from "@/modules/school/domain/workout-template-content";
import { describeTemplateSummary } from "@/modules/school/presentation/template-summary";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import { coachAthletes, environmentOptions, sportOptions } from "./catalog-data";
import { TemplateActions } from "./template-actions";

export const dynamic = "force-dynamic";

type Search = { q?: string; sportType?: string; environment?: string; level?: string; phase?: string; folder?: string; tag?: string; author?: string; favorites?: string; archived?: string; maxDurationMin?: string; maxDistanceM?: string };

export default async function CatalogoTreinosPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession({ next: "/professor/estudio/treinos" });
  const search = await searchParams;
  const filters = Object.fromEntries(Object.entries(search).filter(([, value]) => typeof value === "string" && value !== ""));
  let templates: Awaited<ReturnType<WorkoutCatalog["list"]>>;
  try {
    templates = await new WorkoutCatalog(prisma).list(session.user.id, filters);
  } catch (error) {
    if (error instanceof SchoolError && error.status === 401) redirect("/login");
    if (error instanceof SchoolError) templates = [];
    else throw error;
  }
  const athletes = await coachAthletes(session.user.id);
  const folders = [...new Set(templates.map((item) => item.folder).filter((value): value is string => Boolean(value)))].sort();

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Catálogo de treinos"
        description="Seus modelos e os da sua escola. Editar cria uma nova versão; o que já foi prescrito não muda."
        actions={<Link href="/professor/estudio/treinos/novo" className={PRIMARY_ACTION_CLASS} data-testid="catalog-new">Novo modelo</Link>}
      />

      <form method="get" className="grid gap-2 sm:grid-cols-4" role="search" aria-label="Buscar no catálogo">
        <input name="q" defaultValue={search.q ?? ""} placeholder="Buscar: orientação mar, corrida 10 km, cadência…" aria-label="Buscar" className={`${FIELD_CLASS} sm:col-span-2`} />
        <select name="sportType" defaultValue={search.sportType ?? ""} aria-label="Modalidade" className={FIELD_CLASS}>
          <option value="">Todas as modalidades</option>
          {sportOptions().map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select name="environment" defaultValue={search.environment ?? ""} aria-label="Ambiente" className={FIELD_CLASS}>
          <option value="">Todos os ambientes</option>
          {environmentOptions().map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select name="level" defaultValue={search.level ?? ""} aria-label="Nível" className={FIELD_CLASS}>
          <option value="">Todos os níveis</option>
          <option value="BEGINNER">Iniciante</option><option value="INTERMEDIATE">Intermediário</option><option value="ADVANCED">Avançado</option><option value="PROFESSIONAL">Profissional</option>
        </select>
        <input name="phase" defaultValue={search.phase ?? ""} placeholder="Fase" aria-label="Fase" className={FIELD_CLASS} />
        <input name="tag" defaultValue={search.tag ?? ""} placeholder="Etiqueta" aria-label="Etiqueta" className={FIELD_CLASS} />
        <select name="folder" defaultValue={search.folder ?? ""} aria-label="Pasta" className={FIELD_CLASS}>
          <option value="">Todas as pastas</option>
          {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
        </select>
        <input name="maxDurationMin" type="number" min={1} defaultValue={search.maxDurationMin ?? ""} placeholder="Duração até (min)" aria-label="Duração máxima" className={FIELD_CLASS} />
        <input name="maxDistanceM" type="number" min={1} defaultValue={search.maxDistanceM ?? ""} placeholder="Distância até (m)" aria-label="Distância máxima" className={FIELD_CLASS} />
        <select name="author" defaultValue={search.author ?? ""} aria-label="Autoria" className={FIELD_CLASS}>
          <option value="">Pessoais e da escola</option><option value="me">Só os meus</option><option value="school">Só da escola</option>
        </select>
        <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" name="favorites" value="1" defaultChecked={search.favorites === "1"} /> Favoritos</label>
        <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" name="archived" value="1" defaultChecked={search.archived === "1"} /> Arquivados</label>
        <button type="submit" className={SECONDARY_ACTION_CLASS}>Filtrar</button>
      </form>

      <SectionCard title={`Modelos (${templates.length})`}>
        {templates.length === 0 ? (
          <EmptyState title="Nenhum modelo encontrado" description="Crie um modelo ou ajuste a busca. Modelos não chegam a nenhum aluno sozinhos: você decide ao prescrever." />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2" data-testid="catalog-list">
            {templates.map((item) => {
              const summary = describeTemplateSummary(item.summary);
              // An institutional template is prescribed inside its own school only.
              const allowed = athletes.filter((athlete) => item.ownerType === "COACH" || athlete.schoolId === item.schoolId);
              return (
                <li key={item.id} className={`${ITEM_CLASS} space-y-2`} data-testid="catalog-item">
                  <Link href={`/professor/estudio/treinos/${item.id}`} className="block space-y-1 hover:opacity-90">
                    <p className="font-medium leading-tight">{item.code ? `${item.code} · ` : ""}{item.title}</p>
                    <p className="text-xs text-foreground/60">
                      {resolveSportLabel(item.sportType) ?? item.sportType}
                      {` · ${TEMPLATE_CONTENT_KIND_LABELS[item.contentKind as keyof typeof TEMPLATE_CONTENT_KIND_LABELS] ?? item.contentKind}`}
                      {` · v${item.version}`}
                      {item.status === "DRAFT" ? " · rascunho" : item.status === "ARCHIVED" ? " · arquivado" : ""}
                      {item.ownerType === "SCHOOL" ? ` · ${item.schoolName ?? "escola"}` : " · pessoal"}
                      {item.parentTemplateId ? " · variante" : ""}
                    </p>
                    <p className="text-xs" data-testid="catalog-summary">
                      {[summary.distance ? `📏 ${summary.distance}` : null, `⏱ ${summary.duration}`].filter(Boolean).join(" · ")}
                    </p>
                    {item.tags.length > 0 && <p className="text-[11px] text-foreground/50">{item.tags.map((tag) => `#${tag}`).join(" ")}{item.folder ? ` · 📁 ${item.folder}` : ""}</p>}
                  </Link>
                  <TemplateActions
                    templateId={item.id}
                    favorite={item.favorite}
                    archived={item.status === "ARCHIVED"}
                    canEdit
                    athletes={allowed.map((athlete) => ({ label: athlete.label, href: `${athlete.prescribePath}?modelo=${item.id}` }))}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
