/**
 * SAM-34/SAM-40 — the activity detail as one screen, whoever is reading it.
 *
 * The athlete (`/app/atividades/[id]`), the coach (hub "Atividades") and the
 * school render the same `ActivityDetailModel`: header with adaptive KPIs,
 * then ONE page of cards (route and series, time in zones with a chart of
 * the reader's choice, laps, statistics, analysis, self-assessment) — every
 * card reorderable and resizable like the dashboard, the layout saved as the
 * viewer's preference. `viewerKind` only decides who heads the page and
 * whether the title is editable; the caller adds badges and links through
 * `before`. Server Component.
 */
import type { ReactNode } from "react";
import { Icon } from "@iconify/react";

import { ActivityDetailCards } from "@/components/activities/activity-detail-cards";
import { ActivityLapsTable } from "@/components/activities/activity-laps-table";
import { AnalysisSectionContent, FeedbackContent, StatGroupContent } from "@/components/activities/activity-stats";
import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { ActivityTitleEditor } from "@/components/activities/activity-title-editor";
import { ActivityZoneChart } from "@/components/activities/activity-zone-chart";
import type { CustomizableCardGridItem, SavedCardLayoutValue } from "@/components/layout/customizable-card-grid";
import { UserAvatar } from "@/components/user-avatar";
import type { ActivityDetailModel } from "@/modules/shared/activities/presentation/activity-detail-model";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import { getProviderVisual } from "@/modules/shared/integrations/catalog/visual";
import type { ProviderId } from "@/modules/shared/integrations/types";

export function activityProviderLabel(providerId: string): string {
  // SAM-74 — a file imported by the athlete is not a catalog provider.
  if (providerId === "FILE") return "Arquivo importado";
  return getProviderDefinition(providerId as ProviderId)?.name ?? providerId;
}

export type ActivityViewerKind = "athlete" | "coach" | "school";

function EmptyPanel({ children }: { children: ReactNode }) {
  return <p className="rounded-[20px] border border-dashed border-border px-5 py-8 text-center text-sm text-foreground/60">{children}</p>;
}

/** One card per section; ids are generic so a saved layout applies to every activity. */
export function buildActivityCards(model: ActivityDetailModel): CustomizableCardGridItem[] {
  const cards: CustomizableCardGridItem[] = [];
  if (model.route || model.timeline) {
    cards.push({
      id: "route-series", label: "Percurso e gráficos", defaultSpan: 2, accentClassName: "before:bg-sky-300/80",
      content: <ActivityTimeline route={model.route} timeline={model.timeline} />,
    });
  }
  for (const set of model.zones) {
    cards.push({
      id: `zones:${set.id}`, label: set.title, defaultSpan: 1, accentClassName: "before:bg-rose-300/80",
      content: <ActivityZoneChart set={set} />,
    });
  }
  if (model.zones.length === 0) {
    cards.push({
      id: "zones:empty", label: "Tempo em zonas", defaultSpan: 1, accentClassName: "before:bg-rose-300/80",
      content: (
        <section data-testid="activity-zones-empty">
          <h3 className="mb-3 text-base font-semibold text-foreground">Tempo em zonas</h3>
          <EmptyPanel>Sem tempo em zonas para esta atividade.</EmptyPanel>
        </section>
      ),
    });
  }
  cards.push({
    id: "laps", label: model.laps ? `Voltas (${model.laps.rows.length})` : "Voltas", defaultSpan: 2, accentClassName: "before:bg-violet-300/80",
    content: (
      <section data-testid="activity-laps">
        <h3 className="mb-3 text-base font-semibold text-foreground">{model.laps ? `${model.laps.vocabulary === "lap" ? "Voltas" : "Splits"} (${model.laps.rows.length})` : "Voltas"}</h3>
        {model.laps ? <ActivityLapsTable laps={model.laps} /> : <EmptyPanel>Esta atividade não trouxe voltas ou splits.</EmptyPanel>}
      </section>
    ),
  });
  for (const group of model.stats) {
    cards.push({
      id: `stats:${group.id}`, label: group.title, defaultSpan: 1, accentClassName: "before:bg-emerald-300/80",
      content: <StatGroupContent group={group} />,
    });
  }
  for (const section of model.analysis) {
    cards.push({
      id: `analysis:${section.id}`, label: section.title, defaultSpan: 1, accentClassName: "before:bg-amber-300/80",
      content: <AnalysisSectionContent section={section} />,
    });
  }
  if (model.feedback) {
    cards.push({
      id: "feedback", label: "Autoavaliação", defaultSpan: 1, accentClassName: "before:bg-cyan-300/80",
      content: <FeedbackContent feedback={model.feedback} />,
    });
  }
  return cards;
}

export function ActivityDetailView({
  model,
  athlete,
  viewerKind,
  savedLayout,
  before,
}: {
  model: ActivityDetailModel;
  /** Whose activity it is (heads the page when the reader is not the athlete). */
  athlete: { name: string; image: string | null | undefined };
  viewerKind: ActivityViewerKind;
  /** The viewer's saved card layout (order and width). */
  savedLayout?: SavedCardLayoutValue;
  /** Anything the caller wants above the header (badges, links back). */
  before?: ReactNode;
}) {
  const { header } = model;
  const visual = getProviderVisual(header.providerId);
  const subtitle = [header.sportLabel, header.subSportType].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5" data-testid="activity-detail">
      {before}

      <section className="glass-strong rounded-[24px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-4">
            <UserAvatar name={athlete.name} image={athlete.image} size="lg" />
            <div className="min-w-0">
              <p className="text-sm uppercase tracking-[0.24em] text-foreground/42">
                {viewerKind === "athlete" ? "Atividade" : `Atividade de ${athlete.name}`}
              </p>
              <div className="mt-3">
                {viewerKind === "athlete"
                  ? <ActivityTitleEditor activityId={model.activityId} title={header.title} editorialTitle={header.editorialTitle} />
                  : <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.2rem]" data-testid="activity-title">{header.title}</h1>}
              </div>
              <p className="mt-3 text-sm leading-7 text-foreground/66">{subtitle} · {header.startedAtLabel}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold tracking-[0.14em] ${visual.textClassName} ${visual.backgroundClassName} ${visual.borderClassName}`}>
                  <Icon icon={visual.icon} width={14} height={14} />
                  {header.providerLabel}
                </span>
                <span className="inline-flex items-center rounded-full border theme-pill-success px-3 py-2 text-xs font-semibold tracking-[0.14em]">{header.sportLabel}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[460px] xl:grid-cols-4" data-testid="activity-kpis">
            {header.kpis.map((stat) => (
              <div key={stat.label} className="rounded-[20px] border border-border theme-panel-neutral px-4 py-4" data-testid="activity-kpi">
                <p className="text-xs uppercase tracking-[0.18em] text-foreground/46">{stat.label}</p>
                <p className={`mt-3 text-2xl font-semibold tracking-tight ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ActivityDetailCards items={buildActivityCards(model)} savedLayout={savedLayout} />

      {model.sources.length > 0 && (
        <p className="text-xs text-foreground/55" data-testid="activity-sources">{model.sources.join(" · ")}</p>
      )}
    </div>
  );
}
