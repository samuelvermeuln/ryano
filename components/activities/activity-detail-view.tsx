/**
 * SAM-34 — the activity detail as one view, whoever is reading it.
 *
 * The athlete (`/app/atividades/[id]`), the coach (hub "Atividades") and the
 * school read the same sections from the same `ActivityVisualData`; what
 * changes is who is shown in the header, whether the card layout can be
 * saved, and the badges the caller adds (prescribed × executed, consent).
 * A Server Component: it only resolves labels and hands the data to the
 * client dashboard.
 */
import type { ReactNode } from "react";
import { ActivityVisualDashboard } from "@/components/activities/activity-visual-dashboard";
import type { SavedCardLayoutValue } from "@/components/layout/customizable-card-grid";
import { humanizeActivityLabel } from "@/lib/activity-text";
import type { ActivityVisualData } from "@/modules/shared/activities/presentation/activity-visual-data";
import { getProviderDefinition } from "@/modules/shared/integrations/catalog";
import type { ProviderId } from "@/modules/shared/integrations/types";

export function activityProviderLabel(providerId: string): string {
  return getProviderDefinition(providerId as ProviderId)?.name ?? providerId;
}

export function ActivityDetailView({
  activityName,
  visualData,
  viewer,
  savedLayout,
  layoutEditable,
  before,
}: {
  activityName: string | null;
  visualData: ActivityVisualData;
  /** Whose avatar heads the page: the athlete the activity belongs to. */
  viewer: { name: string; image: string | null | undefined };
  savedLayout?: SavedCardLayoutValue;
  /** True only for the athlete who owns the activity. */
  layoutEditable: boolean;
  /** Anything the caller wants above the dashboard (badges, links back). */
  before?: ReactNode;
}) {
  return (
    <>
      {before}
      <ActivityVisualDashboard
        userName={viewer.name}
        userImage={viewer.image}
        title={humanizeActivityLabel(activityName) ?? visualData.sportLabel}
        sportLabel={visualData.sportLabel}
        provider={activityProviderLabel(visualData.provider)}
        providerId={visualData.provider}
        startedAtLabel={visualData.startedAtLabel}
        heroStats={visualData.heroStats}
        overviewMetrics={visualData.overviewMetrics}
        barSections={visualData.barSections}
        metricSections={visualData.metricSections}
        savedLayout={savedLayout}
        layoutEditable={layoutEditable}
      />
    </>
  );
}
