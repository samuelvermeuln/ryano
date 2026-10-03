/**
 * SAM-62 — what the prescription detail (athlete and coach, school and
 * independent) shows about the linked activities: each link with its
 * explanation, the undone ones with who/why, the pieces summed once, and the
 * trail of link/confirm/undo.
 */
import { combineExecutions } from "../domain/execution-combination";
import { describeMatch } from "./match-explanation";

type PanelExecution = {
  id: string;
  matchStatus: string;
  matchScore: number;
  matchDetail: unknown;
  matchMethod: string | null;
  source: string;
  sportType: string;
  startedAt: Date;
  durationSeconds: number | null;
  distanceMeters: number | null;
  activityId: string | null;
  unlinkedAt: Date | null;
  unlinkReason: string | null;
  providerRemovedAt: Date | null;
};
type PanelHistory = { id: string; eventType: string; payload: unknown; createdAt: Date; actor: { name: string | null } | null };

const STATUS_LABEL: Record<string, string> = {
  AUTO_MATCHED: "Automática — aguardando confirmação",
  PENDING: "Sugerida — confirme se for esta",
  CONFIRMED: "Confirmada",
  OVERRIDDEN: "Escolhida manualmente",
  NO_MATCH: "Desfeita",
};

function historyLabel(eventType: string, payload: Record<string, unknown>): string {
  const reason = typeof payload.reason === "string" && payload.reason ? ` — ${payload.reason}` : "";
  if (eventType === "MATCH_CONFIRMED") return "Associação confirmada";
  if (eventType === "MATCH_UNLINKED") return `Associação desfeita${reason}`;
  if (payload.relinked) return "Associação refeita";
  const score = typeof payload.score === "number" ? ` (score ${payload.score})` : "";
  if (payload.automatic || payload.method === "AUTO") return `Associada automaticamente${score}`;
  const who = payload.method === "COACH" ? "pelo professor" : "pelo aluno";
  const how = payload.mode === "add" ? "somada à sessão" : "associada";
  return `Atividade ${how} ${who}${score}${payload.otherSport ? " — outra modalidade" : ""}${reason}`;
}

export function matchPanelModel(panel: { executions: PanelExecution[]; history: PanelHistory[] }) {
  const active = panel.executions.filter((execution) => execution.matchStatus !== "NO_MATCH");
  const combined = combineExecutions(active);
  return {
    links: panel.executions.map((execution) => ({
      id: execution.id,
      status: execution.matchStatus,
      statusLabel: STATUS_LABEL[execution.matchStatus] ?? execution.matchStatus,
      explanation: describeMatch(execution),
      startedAt: execution.startedAt.toISOString(),
      durationSeconds: execution.durationSeconds,
      distanceMeters: execution.distanceMeters,
      source: execution.source,
      sportType: execution.sportType,
      providerRemoved: execution.providerRemovedAt !== null,
      unlinked: execution.unlinkedAt ? { at: execution.unlinkedAt.toISOString(), reason: execution.unlinkReason } : null,
      counted: combined ? !combined.overlapping.some((piece) => piece.id === execution.id) : false,
    })),
    combined: combined && combined.pieces.length + combined.overlapping.length > 1
      ? { pieces: combined.pieces.length, overlapping: combined.overlapping.length, durationSeconds: combined.durationSeconds, distanceMeters: combined.distanceMeters }
      : null,
    history: panel.history.map((entry) => ({
      id: entry.id,
      label: historyLabel(entry.eventType, (entry.payload ?? {}) as Record<string, unknown>),
      actorName: (entry.payload as { automatic?: boolean } | null)?.automatic ? "Ryvano" : entry.actor?.name ?? "—",
      at: entry.createdAt.toISOString(),
    })),
  };
}

export type MatchPanelModel = ReturnType<typeof matchPanelModel>;
