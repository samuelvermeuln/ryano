/**
 * SAM-35 — "Meus atletas" for both scopes: the school roster and the
 * independent roster are the same screen over `loadCoachRoster`.
 */
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { StatTiles } from "@/components/stat-tiles";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { resolveAthleteTimeZone } from "@/modules/school/application/athlete-time-zone";
import { requireOnboardedSession } from "@/server/auth-guards";
import { prisma } from "@/server/db";
import type { CoachAthleteScope } from "./hub-scope";
import { loadCoachRoster, summarizeRoster } from "./roster";
import { RosterPanel } from "./roster-panel";

export async function RosterScreen({ scope }: { scope: CoachAthleteScope }) {
  if (!isSchoolModuleEnabled()) notFound();
  const session = await requireOnboardedSession();

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!coachProfile) notFound();

  // "Today" is the school's day inside a school; outside one, the coach's own.
  const timeZone = scope.kind === "school"
    ? (await prisma.school.findUnique({ where: { id: scope.schoolId }, select: { timezone: true } }))?.timezone ?? "America/Sao_Paulo"
    : await resolveAthleteTimeZone(prisma, session.user.id);

  const athletes = await loadCoachRoster(prisma, { coachId: coachProfile.id, scope, timeZone });
  const summary = summarizeRoster(athletes);

  return (
    <div className="space-y-6 p-6 md:p-10">
      <div>
        <h1 className="text-xl font-semibold">Meus atletas</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {scope.kind === "school"
            ? "Atletas sob sua responsabilidade nesta escola."
            : "Atletas que você acompanha fora de uma escola."}
        </p>
      </div>

      <StatTiles
        items={[
          { label: "Atletas", value: athletes.length },
          {
            label: "Precisam de atenção",
            value: summary.needingAttention,
            tone: summary.needingAttention > 0 ? "warning" : "success",
            hint: summary.needingAttention === 0 ? "nada pendente" : "pendência ou treino atrasado",
          },
          { label: "Treinaram hoje", value: summary.activeToday, hint: "prescrito ou não" },
          {
            label: "Compliance médio",
            value: summary.rosterAverage != null ? `${(summary.rosterAverage / 10).toFixed(1)}/10` : "—",
            hint: summary.rosterAverage == null ? "sem avaliações" : `${summary.scoredCount} com nota`,
          },
        ]}
      />

      {athletes.length === 0 ? (
        <EmptyState
          title="Nenhum atleta atribuído"
          description={scope.kind === "school"
            ? "Quando a administração da escola vincular atletas a você, eles aparecem aqui com compliance, pendências e histórico."
            : "Quando um atleta pedir seu acompanhamento e você aceitar (ou entrar pelo seu link de convite), ele aparece aqui."}
        />
      ) : (
        <RosterPanel scope={scope} athletes={athletes} />
      )}
    </div>
  );
}
