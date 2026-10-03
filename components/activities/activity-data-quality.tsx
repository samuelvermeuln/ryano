/**
 * SAM-73 — "Qualidade dos dados" of an activity (§14.6, §18.3): the value in
 * force with a "corrigido" badge and the original readable, elapsed/moving/
 * pauses labelled, GPS inconsistencies flagged (never fixed), every estimate
 * with its method. Same section for the athlete and the coach; both may
 * correct (the server decides who).
 */
import { formatDistance, formatDuration } from "@/lib/format";
import { listActivityCorrections } from "@/modules/shared/activities/application/activity-corrections";
import { listActivityFiles } from "@/modules/file-import/application/stored-files";
import { loadResolvedActivityDetail } from "@/modules/shared/activities/detail-ingestion/load-resolved-activity-detail";
import {
  CORRECTION_FIELD_LABELS, detectGpsInconsistencies, effectiveValue, timeBreakdown, type CorrectionRow,
} from "@/modules/shared/activities/domain/activity-correction";
import { prisma } from "@/server/db";
import { StatusBadge } from "@/components/status-badge";
import { ActivityCorrectionForm } from "./activity-correction-form";

const time = (seconds: number | null) => (seconds === null ? "não medido" : formatDuration(seconds));

export async function ActivityDataQuality({ activityId, canCorrect }: { activityId: string; canCorrect: boolean }) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { id: true, sportType: true, provider: true, externalId: true, duplicateOfActivityId: true, distanceMeters: true, movingSeconds: true, durationSeconds: true, elapsedSeconds: true, timerSeconds: true },
  });
  if (!activity) return null;
  const [corrections, detail, files] = await Promise.all([
    listActivityCorrections(prisma, activity.id),
    loadResolvedActivityDetail(prisma, activity).catch(() => null),
    // SAM-74 — the imported file, downloadable only through the private route.
    listActivityFiles(prisma, activity.id),
  ]);
  const distance = effectiveValue("distanceMeters", activity.distanceMeters, corrections);
  const moving = effectiveValue("movingSeconds", activity.movingSeconds, corrections);
  const pool = effectiveValue("poolLengthMeters", null, corrections);
  const times = timeBreakdown({ elapsedSeconds: activity.elapsedSeconds, timerSeconds: activity.timerSeconds, movingSeconds: moving.value, durationSeconds: activity.durationSeconds });
  const series = (key: string) => (detail?.streams.find((stream) => stream.key === key)?.values ?? undefined) as never;
  const timeSeries = series("time") as number[] | undefined;
  const gps = timeSeries ? detectGpsInconsistencies({ sportType: activity.sportType, time: timeSeries, distance: series("distance"), latlng: series("latlng") }) : [];
  const hasSamples = Boolean(timeSeries && timeSeries.length > 1);

  return (
    <section className="space-y-3 rounded-[20px] border border-white/10 bg-white/5 p-4" data-testid="activity-data-quality">
      <h2 className="text-sm font-semibold">Qualidade dos dados</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div data-testid="quality-distance" data-corrected={distance.corrected}>
          <dt className="text-xs uppercase tracking-wide text-foreground/50">Distância</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {distance.value === null ? "não medida" : formatDistance(distance.value)}
            {distance.corrected && <StatusBadge tone="warning">corrigido</StatusBadge>}
            {distance.corrected && distance.correction && distance.correction.originalValue !== null && (
              <span className="text-xs text-foreground/55">original: {formatDistance(distance.correction.originalValue)}</span>
            )}
          </dd>
        </div>
        {pool.corrected && (
          <div data-testid="quality-pool">
            <dt className="text-xs uppercase tracking-wide text-foreground/50">Comprimento da piscina</dt>
            <dd className="flex flex-wrap items-center gap-2">{pool.value} m <StatusBadge tone="warning">corrigido</StatusBadge></dd>
          </div>
        )}
        <div data-testid="quality-times">
          <dt className="text-xs uppercase tracking-wide text-foreground/50">Tempos</dt>
          <dd className="text-foreground/80">
            decorrido {time(times.elapsed)} · em movimento {time(times.moving)}{moving.corrected ? " (corrigido)" : ""} · pausas {time(times.pauses)} · timer {time(times.timer)}
          </dd>
        </div>
        <div data-testid="quality-samples">
          <dt className="text-xs uppercase tracking-wide text-foreground/50">Séries</dt>
          <dd className="text-foreground/80">{hasSamples ? "amostras disponíveis — comparação por amostra" : "arquivo sem série — comparação por resumo"}</dd>
        </div>
      </dl>
      {files.length > 0 && (
        <p className="text-xs text-foreground/70" data-testid="activity-files">
          Arquivo importado: {files.map((file) => <a key={file.id} href={`/api/files/${file.id}`} className="underline">{file.filename}</a>).reduce<React.ReactNode[]>((acc, node, index) => (index === 0 ? [node] : [...acc, ", ", node]), [])}
          {" "}· privado: só você e quem acompanha você abre.
        </p>
      )}
      {gps.length > 0 && (
        <p className="text-xs text-amber-500" role="note" data-testid="gps-warning">
          A distância por GPS pode estar incorreta: {gps.map((finding) => `${finding.kind === "JUMP" ? "salto" : "velocidade implausível"} aos ${Math.round(finding.atSecond / 60)} min (${finding.detail})`).join("; ")}. Nada foi alterado automaticamente.
        </p>
      )}
      {corrections.length > 0 && (
        <ol className="space-y-1 text-xs" data-testid="correction-history">
          {corrections.map((row: CorrectionRow, index) => (
            <li key={index} data-testid="correction-row">
              {CORRECTION_FIELD_LABELS[row.field]}: {row.originalValue ?? "—"} → {row.correctedValue} · {row.reason} · {row.authorRole === "athlete" ? "aluno" : "professor"}{row.authorName ? ` ${row.authorName}` : ""} · {row.createdAt.toLocaleString("pt-BR")}
            </li>
          ))}
        </ol>
      )}
      {canCorrect && <ActivityCorrectionForm activityId={activity.id} isPool={activity.sportType === "swim"} currentDistance={distance.value} currentMoving={moving.value} />}
    </section>
  );
}
