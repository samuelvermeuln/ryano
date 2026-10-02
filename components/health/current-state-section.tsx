import { SectionCard } from "@/components/section-card";
import type { AthleteCurrentState } from "@/modules/school/application/get-athlete-current-state";
import { CurrentStateCards } from "./current-state-cards";

/**
 * SAM-43 — the "Estado atual" block as the coach's hub and the school's sheet
 * render it: omitted when no connection has a health capability; cards when
 * there is data; a consent notice when every day is withheld; an empty line
 * when the connection exists but no day was ingested yet. Server Component.
 */
export function CurrentStateSection({ state, athleteName }: { state: AthleteCurrentState; athleteName: string }) {
  if (!state.available) return null;
  const hasData = state.current !== null || state.series.length > 0;

  return (
    <SectionCard
      title="Estado atual"
      description="FC de repouso, energia, sono e VFC de hoje, com a média de 7 dias e as últimas 4 semanas — cada valor com a origem."
    >
      {hasData ? (
        <CurrentStateCards state={state} />
      ) : state.withheldDays > 0 ? (
        <p className="theme-panel-warning rounded-[20px] border px-4 py-3 text-xs leading-6" data-testid="current-state-withheld">
          Os dados de saúde de {athleteName} neste período dependem de autorização do próprio atleta (categoria métricas).
        </p>
      ) : (
        <p className="text-sm text-foreground/50" data-testid="current-state-empty">
          Nenhuma leitura de saúde diária ainda para {athleteName}.
        </p>
      )}
      {hasData && state.withheldDays > 0 && (
        <p className="mt-3 text-xs text-foreground/55" data-testid="current-state-withheld">
          {state.withheldDays} dia(s) anteriores ao vínculo não aparecem: dependem de autorização do atleta.
        </p>
      )}
    </SectionCard>
  );
}
