"use client";

import { saveActivityLayoutOrderAction } from "@/app/actions/activities";
import {
  CustomizableCardGrid,
  type CustomizableCardGridItem,
  type SavedCardLayoutValue,
} from "@/components/layout/customizable-card-grid";

/**
 * SAM-40 — every section of the activity screen (route and series, time in
 * zones, laps, statistics, analysis, self-assessment) is a card of the same
 * customizable grid the dashboard uses: drag to reorder, drag the side handle
 * to resize. The layout is the VIEWER's preference (`UserProfile.activityLayoutOrder`
 * of whoever is logged in), so a coach arranging the screen never touches the
 * athlete's layout. Card ids are generic (`zones:heart-rate`, `laps`…) so one
 * saved layout applies to every activity; a card the activity does not have
 * is simply skipped.
 */
export function ActivityDetailCards({ items, savedLayout }: { items: CustomizableCardGridItem[]; savedLayout?: SavedCardLayoutValue }) {
  return (
    <div data-testid="activity-cards">
      <CustomizableCardGrid
        items={items}
        savedLayout={savedLayout}
        onSave={saveActivityLayoutOrderAction}
        pendingDescription="A nova ordem e o tamanho dos cards desta tela foram detectados. Salve para usar em todas as atividades."
      />
    </div>
  );
}
