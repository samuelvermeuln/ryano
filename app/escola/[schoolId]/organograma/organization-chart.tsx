"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { EmptyState } from "@/components/empty-state";
import {
  setCoachSuspensionAction,
  transferAthleteAction,
  type OrganizationChartData,
} from "./actions";
import { useCardDrag } from "./use-card-drag";
import { CoachDrawer, AthleteDrawer } from "./detail-drawers";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const UNASSIGNED = "__unassigned__";

type StatusFilter = "all" | "active" | "inactive";
type DragPayload = { athleteId: string; name: string; fromCoachId: string | null };
type PendingTransfer = DragPayload & { toCoachId: string; toCoachName: string; fromCoachName: string };

/** Numeric zoom is kept out of the URL: it is a viewport preference, not state to share. */
export function OrganizationChart({
  schoolId,
  initial,
}: {
  schoolId: string;
  initial: OrganizationChartData;
}) {
  const [chart, setChart] = useState(initial);
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState("");
  const [coachFilter, setCoachFilter] = useState<StatusFilter>("all");
  const [athleteFilter, setAthleteFilter] = useState<StatusFilter>("all");
  const [sportFilter, setSportFilter] = useState("all");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [openCoach, setOpenCoach] = useState<string | null>(null);
  const [openAthlete, setOpenAthlete] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTransfer | null>(null);
  const [transferReason, setTransferReason] = useState("");
  const [confirmSuspend, setConfirmSuspend] = useState<{ membershipId: string; name: string } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { canManage } = chart;

  const sportTypes = useMemo(
    () => [...new Set(chart.coaches.flatMap((coach) => coach.sportTypes))].sort(),
    [chart.coaches],
  );

  const normalize = (value: string) =>
    value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const term = normalize(search.trim());

  const matches = useCallback(
    (name: string | null) => term.length > 0 && normalize(name ?? "").includes(term),
    [term],
  );

  const visibleCoaches = useMemo(() => chart.coaches.filter((coach) => {
    if (coachFilter === "active" && !coach.active) return false;
    if (coachFilter === "inactive" && coach.active) return false;
    if (sportFilter !== "all" && !coach.sportTypes.includes(sportFilter)) return false;
    return true;
  }), [chart.coaches, coachFilter, sportFilter]);

  const athletesOf = useCallback((coachId: string) => {
    const coach = chart.coaches.find((c) => c.coachId === coachId);
    if (!coach) return [];
    return coach.athletes.filter((athlete) => {
      if (athleteFilter === "active" && athlete.status !== "ACTIVE") return false;
      if (athleteFilter === "inactive" && athlete.status === "ACTIVE") return false;
      if (sportFilter !== "all" && athlete.sportType !== sportFilter) return false;
      return true;
    });
  }, [chart.coaches, athleteFilter, sportFilter]);

  const applyResult = (result: Awaited<ReturnType<typeof transferAthleteAction>>) => {
    if (result.ok) {
      setChart(result.chart);
      setFeedback({ tone: "ok", text: result.message ?? "Alteração concluída." });
    } else {
      setFeedback({ tone: "error", text: result.message });
    }
  };

  const runTransfer = (target: PendingTransfer, reason: string) => {
    startTransition(async () => {
      applyResult(await transferAthleteAction({
        schoolId,
        athleteId: target.athleteId,
        coachId: target.toCoachId,
        reason: reason.trim() === "" ? null : reason.trim(),
      }));
      setPending(null);
      setTransferReason("");
    });
  };

  const runSuspension = (membershipId: string, suspended: boolean) => {
    startTransition(async () => {
      applyResult(await setCoachSuspensionAction({ schoolId, membershipId, suspended }));
      setConfirmSuspend(null);
    });
  };

  const handleDrop = useCallback((payload: DragPayload, toCoachId: string | null) => {
    if (!toCoachId || toCoachId === payload.fromCoachId) return;
    const target = chart.coaches.find((coach) => coach.coachId === toCoachId);
    // A suspended coach is not a valid destination; the card is also marked
    // non-droppable, so this only catches a release on a stale layout.
    if (!target || !target.active) return;
    setPending({
      ...payload,
      toCoachId,
      toCoachName: target.displayName,
      fromCoachName: chart.coaches.find((c) => c.coachId === payload.fromCoachId)?.displayName
        ?? "Sem professor",
    });
    setTransferReason("");
  }, [chart.coaches]);

  const { drag, start } = useCardDrag<DragPayload>({
    enabled: canManage,
    dropAttribute: "data-drop-coach",
    onDrop: handleDrop,
    onClick: (payload) => setOpenAthlete(payload.athleteId),
  });

  // The hook reports the zone under the pointer; the unassigned tray is a valid
  // zone for the layout but never a transfer destination.
  const hoveredCoach = drag && drag.over !== drag.payload.fromCoachId && drag.over !== UNASSIGNED
    ? drag.over
    : null;

  const toggleCollapse = (coachId: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(coachId)) next.delete(coachId); else next.add(coachId);
    return next;
  });

  const centerOn = useCallback((element: HTMLElement | null) => {
    const viewport = viewportRef.current;
    if (!viewport || !element) return;
    viewport.scrollTo({
      left: element.offsetLeft * zoom - viewport.clientWidth / 2 + element.offsetWidth * zoom / 2,
      top: element.offsetTop * zoom - viewport.clientHeight / 2 + element.offsetHeight * zoom / 2,
      behavior: "smooth",
    });
  }, [zoom]);

  // Bring the first match into view so "buscar" also answers "where is it?".
  useEffect(() => {
    if (term.length === 0) return;
    const timer = setTimeout(() => {
      const hit = canvasRef.current?.querySelector<HTMLElement>("[data-match='true']");
      if (hit) centerOn(hit);
    }, 250);
    return () => clearTimeout(timer);
  }, [term, centerOn]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const fitToScreen = () => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;
    const ratio = viewport.clientWidth / (canvas.scrollWidth + 48);
    setZoom(Math.min(1, Math.max(ZOOM_MIN, ratio)));
    viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  };

  const recenter = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setZoom(1);
    viewport.scrollTo({
      left: (viewport.scrollWidth - viewport.clientWidth) / 2,
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <div className="space-y-4">
      <Toolbar
        search={search}
        onSearch={setSearch}
        zoom={zoom}
        onZoom={setZoom}
        onFit={fitToScreen}
        onCenter={recenter}
        coachFilter={coachFilter}
        onCoachFilter={setCoachFilter}
        athleteFilter={athleteFilter}
        onAthleteFilter={setAthleteFilter}
        sportTypes={sportTypes}
        sportFilter={sportFilter}
        onSportFilter={setSportFilter}
      />

      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-2xl border px-4 py-3 text-sm ${
            feedback.tone === "ok"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/30 bg-red-400/10 text-red-200"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}

      {chart.truncated.coaches || chart.truncated.athletes ? (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          A escola tem mais registros do que o organograma exibe de uma vez. Use os
          filtros e a busca para encontrar quem você procura.
        </p>
      ) : null}

      <div
        ref={viewportRef}
        className="relative overflow-auto rounded-3xl border border-white/8 bg-white/[0.02] p-4 sm:p-6"
        style={{ maxHeight: "72vh", touchAction: drag ? "none" : "auto" }}
      >
        <div
          ref={canvasRef}
          className="origin-top-left transition-transform duration-150 md:inline-block md:min-w-full"
          style={{ transform: `scale(${zoom})` }}
        >
          <SchoolCard school={chart.school} />

          {visibleCoaches.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="Nenhum professor encontrado"
                description="Ajuste os filtros ou convide um professor para a escola."
              />
            </div>
          ) : (
            <>
              {/* Vertical trunk from the school down to the row of coaches. */}
              <div className="mx-auto hidden h-8 w-px bg-white/15 md:block" aria-hidden="true" />
              <div className="hidden md:flex md:items-stretch md:justify-center" aria-hidden="true">
                <div className="h-px w-full max-w-[calc(100%-8rem)] bg-white/15" />
              </div>
              <ul className="mt-2 flex flex-col gap-6 md:mt-0 md:flex-row md:items-start md:justify-center md:gap-8">
                {visibleCoaches.map((coach) => {
                  const athletes = athletesOf(coach.coachId);
                  const isCollapsed = collapsed.has(coach.coachId);
                  const isDropTarget = hoveredCoach === coach.coachId && coach.active;
                  const droppable = Boolean(drag) && coach.active
                    && coach.coachId !== drag?.payload.fromCoachId;
                  return (
                    <li key={coach.membershipId} className="md:flex md:flex-col md:items-center">
                      {/* Stub joining this coach to the horizontal bar above. */}
                      <div className="mx-auto hidden h-6 w-px bg-white/15 md:block" aria-hidden="true" />
                      <CoachCard
                        coach={coach}
                        athleteCount={athletes.length}
                        collapsed={isCollapsed}
                        highlight={matches(coach.displayName)}
                        droppable={droppable}
                        isDropTarget={isDropTarget}
                        canManage={canManage}
                        busy={isPending}
                        onOpen={() => setOpenCoach(coach.membershipId)}
                        onToggle={() => toggleCollapse(coach.coachId)}
                        onSuspend={() => setConfirmSuspend({
                          membershipId: coach.membershipId,
                          name: coach.displayName,
                        })}
                        onResume={() => runSuspension(coach.membershipId, false)}
                      />
                      {!isCollapsed && athletes.length > 0 ? (
                        <ul className="mt-3 space-y-2 border-l border-white/10 pl-4 md:ml-0 md:w-[260px] md:border-l-0 md:pl-0">
                          {athletes.map((athlete) => (
                            <li key={athlete.assignmentId}>
                              <AthleteCard
                                name={athlete.name}
                                email={athlete.email}
                                image={athlete.image}
                                status={athlete.status}
                                sportType={athlete.sportType}
                                highlight={matches(athlete.name)}
                                dragging={drag?.payload.athleteId === athlete.athleteId}
                                draggable={canManage}
                                onPointerDown={(event) => start(event, {
                                  athleteId: athlete.athleteId,
                                  name: athlete.name ?? "Aluno",
                                  fromCoachId: coach.coachId,
                                })}
                                onOpen={() => setOpenAthlete(athlete.athleteId)}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {chart.unassigned.length > 0 ? (
            <section className="mt-8" data-drop-coach={UNASSIGNED}>
              <h2 className="text-sm font-semibold text-foreground/70">
                Sem professor ({chart.unassigned.length})
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {canManage
                  ? "Arraste um aluno para um professor para criar o vínculo."
                  : "Alunos ativos na escola que ainda não têm professor."}
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {chart.unassigned.map((athlete) => (
                  <li key={athlete.membershipId} className="w-full sm:w-[260px]">
                    <AthleteCard
                      name={athlete.name}
                      email={athlete.email}
                      image={athlete.image}
                      status={athlete.status}
                      sportType={null}
                      highlight={matches(athlete.name)}
                      dragging={drag?.payload.athleteId === athlete.athleteId}
                      draggable={canManage}
                      onPointerDown={(event) => start(event, {
                        athleteId: athlete.athleteId,
                        name: athlete.name ?? "Aluno",
                        fromCoachId: null,
                      })}
                      onOpen={() => setOpenAthlete(athlete.athleteId)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      {drag ? (
        <div
          className="pointer-events-none fixed z-50 w-[240px] rounded-2xl border border-emerald-400/40 bg-[#0d1117] px-3 py-2 text-sm shadow-xl"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          <span className="font-medium">{drag.payload.name}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Solte sobre um professor</span>
        </div>
      ) : null}

      {pending ? (
        <ConfirmDialog
          title="Transferir aluno"
          confirmLabel="Transferir"
          busy={isPending}
          onCancel={() => setPending(null)}
          onConfirm={() => runTransfer(pending, transferReason)}
        >
          <p className="text-sm">
            <span className="font-medium">{pending.name}</span>
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">De:</dt>
              <dd>{pending.fromCoachName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Para:</dt>
              <dd>{pending.toCoachName}</dd>
            </div>
          </dl>
          <label className="mt-4 block text-sm">
            <span className="text-muted-foreground">Motivo (opcional)</span>
            <textarea
              value={transferReason}
              onChange={(event) => setTransferReason(event.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm"
              placeholder="Ex.: realinhamento de modalidade"
            />
          </label>
        </ConfirmDialog>
      ) : null}

      {confirmSuspend ? (
        <ConfirmDialog
          title="Desativar professor"
          confirmLabel="Desativar"
          busy={isPending}
          onCancel={() => setConfirmSuspend(null)}
          onConfirm={() => runSuspension(confirmSuspend.membershipId, true)}
        >
          <p className="text-sm">
            Deseja desativar o professor <span className="font-medium">{confirmSuspend.name}</span>?
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            O professor não será excluído e seu histórico será mantido. Os alunos
            atuais continuam vinculados, mas ele não receberá novos alunos até ser
            reativado.
          </p>
        </ConfirmDialog>
      ) : null}

      {openCoach ? (
        <CoachDrawer
          schoolId={schoolId}
          membershipId={openCoach}
          onClose={() => setOpenCoach(null)}
        />
      ) : null}
      {openAthlete ? (
        <AthleteDrawer
          schoolId={schoolId}
          athleteId={openAthlete}
          onClose={() => setOpenAthlete(null)}
        />
      ) : null}
    </div>
  );
}

function Toolbar({
  search, onSearch, zoom, onZoom, onFit, onCenter,
  coachFilter, onCoachFilter, athleteFilter, onAthleteFilter,
  sportTypes, sportFilter, onSportFilter,
}: {
  search: string;
  onSearch: (value: string) => void;
  zoom: number;
  onZoom: (value: number) => void;
  onFit: () => void;
  onCenter: () => void;
  coachFilter: StatusFilter;
  onCoachFilter: (value: StatusFilter) => void;
  athleteFilter: StatusFilter;
  onAthleteFilter: (value: StatusFilter) => void;
  sportTypes: string[];
  sportFilter: string;
  onSportFilter: (value: string) => void;
}) {
  const selectClass = "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs";
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-white/8 bg-white/[0.02] p-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="sr-only">Buscar professor ou aluno</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar professor ou aluno..."
            className="w-full rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          <span className="mr-2">Professores</span>
          <select
            value={coachFilter}
            onChange={(event) => onCoachFilter(event.target.value as StatusFilter)}
            className={selectClass}
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          <span className="mr-2">Alunos</span>
          <select
            value={athleteFilter}
            onChange={(event) => onAthleteFilter(event.target.value as StatusFilter)}
            className={selectClass}
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
        {sportTypes.length > 0 ? (
          <label className="text-xs text-muted-foreground">
            <span className="mr-2">Modalidade</span>
            <select
              value={sportFilter}
              onChange={(event) => onSportFilter(event.target.value)}
              className={selectClass}
            >
              <option value="all">Todas</option>
              {sportTypes.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onZoom(Math.max(ZOOM_MIN, Number((zoom - ZOOM_STEP).toFixed(2))))}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Reduzir zoom"
          className="glass-button h-8 w-8 rounded-full text-sm font-semibold disabled:opacity-40"
        >
          −
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => onZoom(Math.min(ZOOM_MAX, Number((zoom + ZOOM_STEP).toFixed(2))))}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Aumentar zoom"
          className="glass-button h-8 w-8 rounded-full text-sm font-semibold disabled:opacity-40"
        >
          +
        </button>
        <button type="button" onClick={onFit} className="glass-button rounded-full px-3 py-1.5 text-xs font-semibold">
          Ajustar
        </button>
        <button type="button" onClick={onCenter} className="glass-button rounded-full px-3 py-1.5 text-xs font-semibold">
          Centralizar
        </button>
      </div>
    </div>
  );
}

function SchoolCard({ school }: { school: OrganizationChartData["school"] }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-center">
      <div className="flex items-center justify-center gap-3">
        <UserAvatar name={school.name} image={school.logoUrl} size="md" />
        <div className="text-left">
          <p className="text-base font-semibold">{school.name}</p>
          <p className="text-xs text-muted-foreground">/{school.slug}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
          <dt className="text-xs text-muted-foreground">Professores</dt>
          <dd className="font-semibold tabular-nums">
            {school.activeCoachCount}
            {school.coachCount !== school.activeCoachCount ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                de {school.coachCount}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
          <dt className="text-xs text-muted-foreground">Alunos ativos</dt>
          <dd className="font-semibold tabular-nums">{school.athleteCount}</dd>
        </div>
      </dl>
    </div>
  );
}

function CoachCard({
  coach, athleteCount, collapsed, highlight, droppable, isDropTarget,
  canManage, busy, onOpen, onToggle, onSuspend, onResume,
}: {
  coach: OrganizationChartData["coaches"][number];
  athleteCount: number;
  collapsed: boolean;
  highlight: boolean;
  droppable: boolean;
  isDropTarget: boolean;
  canManage: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onSuspend: () => void;
  onResume: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      // Only an active coach advertises itself as a drop target.
      data-drop-coach={coach.active ? coach.coachId : undefined}
      data-match={highlight ? "true" : undefined}
      className={`w-full rounded-3xl border p-4 transition md:w-[260px] ${
        isDropTarget
          ? "border-emerald-400/70 bg-emerald-400/10 ring-2 ring-emerald-400/40"
          : droppable
            ? "border-emerald-400/30 bg-white/[0.04] border-dashed"
            : "border-white/10 bg-white/[0.04]"
      } ${highlight ? "ring-2 ring-sky-400/60" : ""} ${coach.active ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 items-start gap-3 text-left"
          aria-label={`Ver detalhes de ${coach.displayName}`}
        >
          <UserAvatar name={coach.displayName} image={coach.image} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{coach.displayName}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  coach.active
                    ? "bg-emerald-400/15 text-emerald-200"
                    : "bg-white/10 text-foreground/60"
                }`}
              >
                {coach.active ? "Ativo" : "⏸ Inativo"}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {athleteCount} {athleteCount === 1 ? "aluno" : "alunos"}
              </span>
            </span>
            {coach.sportTypes.length > 0 ? (
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                {coach.sportTypes.join(", ")}
              </span>
            ) : null}
          </span>
        </button>

        {canManage ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={`Ações de ${coach.displayName}`}
              aria-expanded={menuOpen}
              className="glass-button h-7 w-7 rounded-full text-xs"
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-8 z-20 w-44 rounded-2xl border border-white/10 bg-[#0d1117] p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onOpen(); }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/5"
                >
                  Ver detalhes
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setMenuOpen(false); if (coach.active) onSuspend(); else onResume(); }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/5 disabled:opacity-50"
                >
                  {coach.active ? "Desativar professor" : "Reativar professor"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/8 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-white/5"
      >
        <span>{collapsed ? "Mostrar alunos" : "Ocultar alunos"}</span>
        <span aria-hidden="true">{collapsed ? "▶" : "▼"}</span>
      </button>
    </div>
  );
}

function AthleteCard({
  name, email, image, status, sportType, highlight, dragging, draggable, onPointerDown, onOpen,
}: {
  name: string | null;
  email: string | null;
  image: string | null;
  status: string;
  sportType: string | null;
  highlight: boolean;
  dragging: boolean;
  draggable: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onOpen: () => void;
}) {
  const label = name ?? email ?? "Aluno";
  return (
    <div
      onPointerDown={onPointerDown}
      data-match={highlight ? "true" : undefined}
      className={`rounded-2xl border px-3 py-2 transition ${
        dragging
          ? "border-emerald-400/60 bg-emerald-400/10 opacity-40"
          : "border-white/8 bg-white/[0.03]"
      } ${highlight ? "ring-2 ring-sky-400/60" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ touchAction: draggable ? "none" : undefined }}
    >
      {/* Keyboard and assistive-technology path to the same details the click opens. */}
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 text-left">
        <UserAvatar name={label} image={image} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{label}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px]">
            <span className={status === "ACTIVE" ? "text-emerald-200" : "text-foreground/50"}>
              {status === "ACTIVE" ? "Ativo" : "Inativo"}
            </span>
            {sportType ? <span className="text-muted-foreground">· {sportType}</span> : null}
          </span>
        </span>
      </button>
    </div>
  );
}

function ConfirmDialog({
  title, children, confirmLabel, busy, onCancel, onConfirm,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0d1117] p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="mt-3">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="glass-button rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Aguarde..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
