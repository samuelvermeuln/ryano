/**
 * SAM-63 — weekly regularity in four separate groups (§17.4, AC12), with what
 * stays outside the denominator spelled out and the original plan kept.
 */
import { SectionCard } from "@/components/section-card";
import type { WeeklyRegularity } from "@/modules/school/domain/weekly-regularity";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function WeeklyRegularityCard({
  regularity, load,
}: {
  regularity: WeeklyRegularity;
  load: { method: "SRPE"; totalUA: number; sessionsWithRpe: number } | null;
}) {
  const outside = [
    regularity.outside.cancelled ? plural(regularity.outside.cancelled, "cancelada pelo professor", "canceladas pelo professor") : null,
    regularity.outside.rest ? plural(regularity.outside.rest, "descanso planejado", "descansos planejados") : null,
    regularity.outside.unavailable ? plural(regularity.outside.unavailable, "em indisponibilidade do aluno", "em indisponibilidade do aluno") : null,
    regularity.outside.awaitingRecord ? plural(regularity.outside.awaitingRecord, "aguardando registro", "aguardando registro") : null,
    regularity.outside.future ? plural(regularity.outside.future, "ainda por vir", "ainda por vir") : null,
  ].filter(Boolean);
  const tiles = [
    { key: "full", label: "Integrais", value: regularity.full },
    { key: "partial", label: "Parciais", value: regularity.partial },
    { key: "no-record", label: "Sem registro", value: regularity.noRecord },
    { key: "not-done", label: "Não realizadas (confirmado)", value: regularity.notDoneConfirmed },
  ];
  return (
    <SectionCard title="Regularidade da semana" description="Sessões devidas desta semana, em grupos separados — nunca um único “% concluído”.">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="week-regularity">
        {tiles.map((tile) => (
          <div key={tile.key} data-testid={`regularity-${tile.key}`} data-value={tile.value}>
            <dt className="text-xs uppercase tracking-wide text-foreground/50">{tile.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-foreground/60" data-testid="regularity-denominator" data-value={regularity.denominator}>
        Denominador: {plural(regularity.denominator, "sessão devida", "sessões devidas")} (integrais + parciais + sem registro + não realizadas confirmadas
        {regularity.justified ? `, ${plural(regularity.justified, "justificada", "justificadas")}` : ""}).
      </p>
      {outside.length > 0 && <p className="text-xs text-foreground/60">Fora do denominador, nunca contadas como falta: {outside.join(", ")}.</p>}
      <p className="text-xs text-foreground/50">Planejamento original da semana: {plural(regularity.originalPlan, "prescrição", "prescrições")}.</p>
      {load && (
        <p className="mt-2 text-xs text-foreground/70" data-testid="week-load">
          Carga sRPE da semana: {load.totalUA} UA ({plural(load.sessionsWithRpe, "sessão com RPE", "sessões com RPE")}). Instrumento de acompanhamento, não diagnóstico.
        </p>
      )}
    </SectionCard>
  );
}
