"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { IconBuildingCommunity, IconCalendar, IconCertificate, IconLoader2, IconMapPin, IconUsers } from "@tabler/icons-react";

import { Modal } from "@/components/modal";
import { UserAvatar } from "@/components/user-avatar";
import { resolveSportLabel } from "@/modules/shared/activities/sport-types";
import type { CoachCardData, ViewerAssignment } from "./coach-discovery";

/** Shape returned by `GET /api/coaches/[id]/profile` (dates serialized as ISO strings). */
type CoachProfile = {
  id: string;
  displayName: string;
  bio: string | null;
  image: string | null;
  since: string;
  schools: Array<{ id: string; name: string; city: string | null; state: string | null }>;
  activeAthleteCount: number;
  sportTypes: string[];
  credentials: string[];
  acceptsIndependentAthletes: boolean;
  viewer: {
    assignments: Array<{ id: string; schoolId: string | null; status: "PENDING" | "ACTIVE"; requestedAt: string }>;
    sharedSchoolIds: string[];
    isSelf: boolean;
  };
};

type Props = {
  coach: CoachCardData;
  viewer: ViewerAssignment | null;
  onClose: () => void;
  onRequested: (coachId: string, assignment: ViewerAssignment) => void;
  onCancelled: (coachId: string) => void;
};

const SHARED_HISTORY_ITEMS = [
  "atividades e métricas importadas",
  "treinos prescritos e compliance",
  "notas, comentários e avaliações",
  "seu próprio feedback de treino",
];

function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * SAM-25 — perfil do professor em modal centralizado (rules/ui.md) com o
 * pedido de acompanhamento dentro: escopo (independente ou numa escola em
 * comum), mensagem opcional, histórico compartilhado por padrão (consentimento
 * do atleta), "Solicitar acompanhamento" e "Cancelar pedido" enquanto pendente.
 */
export function CoachProfileModal({ coach, viewer, onClose, onRequested, onCancelled }: Props) {
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [current, setCurrent] = useState<ViewerAssignment | null>(viewer);
  const [scopeSchoolId, setScopeSchoolId] = useState("");
  const [note, setNote] = useState("");
  const [shareHistory, setShareHistory] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [isCancelling, startCancel] = useTransition();

  useEffect(() => {
    let active = true;
    fetch(`/api/coaches/${coach.id}/profile`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("PROFILE_FAILED");
        return (await response.json()) as CoachProfile;
      })
      .then((data) => {
        if (!active) return;
        setProfile(data);
        // The server knows better than the card which relationship is open.
        const open = data.viewer.assignments.find((a) => a.status === "ACTIVE") ?? data.viewer.assignments[0] ?? null;
        setCurrent(open ? { id: open.id, status: open.status, schoolId: open.schoolId, requestedAt: open.requestedAt } : null);
        // SAM-28 — a coach who only works inside schools gets no "independent" option.
        if (!data.acceptsIndependentAthletes) {
          const firstShared = data.schools.find((school) => data.viewer.sharedSchoolIds.includes(school.id));
          setScopeSchoolId(firstShared?.id ?? "");
        }
      })
      .catch(() => {
        if (active) setLoadError("Não foi possível carregar o perfil do professor agora.");
      });
    return () => {
      active = false;
    };
  }, [coach.id]);

  const sharedSchools = profile ? profile.schools.filter((school) => profile.viewer.sharedSchoolIds.includes(school.id)) : [];

  const submit = () => {
    setActionError(null);
    startSubmit(async () => {
      try {
        const response = await fetch(`/api/coaches/${coach.id}/athlete-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schoolId: scopeSchoolId || null, shareHistory, note: note.trim() || null }),
        });
        const body = (await response.json().catch(() => ({}))) as { id?: string; schoolId?: string | null; createdAt?: string; message?: string };
        if (!response.ok || !body.id) {
          setActionError(body.message ?? "Não foi possível enviar o pedido. Tente novamente.");
          return;
        }
        const assignment: ViewerAssignment = {
          id: body.id,
          status: "PENDING",
          schoolId: body.schoolId ?? (scopeSchoolId || null),
          requestedAt: body.createdAt ?? new Date().toISOString(),
        };
        setCurrent(assignment);
        onRequested(coach.id, assignment);
      } catch {
        setActionError("Não foi possível enviar o pedido. Tente novamente.");
      }
    });
  };

  const cancel = () => {
    if (!current) return;
    setActionError(null);
    startCancel(async () => {
      try {
        const response = await fetch(`/api/coaches/${coach.id}/athlete-requests/${current.id}`, { method: "DELETE" });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { message?: string };
          setActionError(body.message ?? "Não foi possível cancelar o pedido agora.");
          return;
        }
        setCurrent(null);
        onCancelled(coach.id);
      } catch {
        setActionError("Não foi possível cancelar o pedido agora.");
      }
    });
  };

  const activeHref = current?.schoolId ? `/atleta/${current.schoolId}` : "/app/treinos";

  return (
    <Modal title={coach.displayName} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <UserAvatar name={coach.displayName} image={profile?.image ?? coach.image} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            {profile ? (
              <p className="flex items-center gap-1 text-sm text-foreground/60">
                <IconCalendar size={14} />
                Na Ryvano desde {formatSince(profile.since)}
              </p>
            ) : null}
            <p className="flex items-center gap-1 text-sm text-foreground/60">
              <IconUsers size={14} />
              {(profile?.activeAthleteCount ?? coach.activeAthleteCount)} atleta
              {(profile?.activeAthleteCount ?? coach.activeAthleteCount) !== 1 ? "s" : ""} acompanhado
              {(profile?.activeAthleteCount ?? coach.activeAthleteCount) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {loadError ? <div className="theme-panel-warning rounded-[18px] border px-4 py-3 text-sm">{loadError}</div> : null}

        {!profile && !loadError ? (
          <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Carregando perfil do professor">
            <div className="h-4 w-3/4 rounded-full bg-white/10" />
            <div className="h-4 w-1/2 rounded-full bg-white/10" />
            <div className="h-20 w-full rounded-[16px] bg-white/10" />
          </div>
        ) : null}

        {profile ? (
          <>
            {profile.bio ? <p className="whitespace-pre-line text-sm leading-7 text-foreground/75">{profile.bio}</p> : null}

            {/* SAM-28 — what the coach declared about themself. */}
            {profile.sportTypes.length > 0 ? (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Modalidades</h3>
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="coach-sports">
                  {profile.sportTypes.map((sport) => (
                    <span key={sport} className="theme-pill-info rounded-full px-2.5 py-1 text-xs font-medium">{resolveSportLabel(sport) ?? sport}</span>
                  ))}
                </div>
              </section>
            ) : null}

            {profile.credentials.length > 0 ? (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Credenciais</h3>
                <ul className="mt-2 space-y-1 text-sm text-foreground/85" data-testid="coach-credentials">
                  {profile.credentials.map((item) => (
                    <li key={item} className="flex gap-2"><IconCertificate size={16} className="mt-0.5 shrink-0 text-foreground/50" />{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Atua em</h3>
              {profile.schools.length === 0 ? (
                <p className="mt-2 text-sm text-foreground/60">Professor independente — atende sem vínculo com escola.</p>
              ) : (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {profile.schools.map((school) => (
                    <li key={school.id} className="flex items-center gap-3 rounded-[16px] border border-border bg-white/[0.04] px-3 py-2.5">
                      <IconBuildingCommunity size={16} className="shrink-0 text-foreground/50" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{school.name}</p>
                        {(school.city || school.state) && (
                          <p className="flex items-center gap-1 text-xs text-foreground/55">
                            <IconMapPin size={11} />
                            {[school.city, school.state].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {profile.viewer.isSelf ? (
              <div className="theme-panel-neutral rounded-[18px] border px-4 py-4 text-sm">Este é o seu próprio perfil de professor.</div>
            ) : current?.status === "ACTIVE" ? (
              <div className="theme-panel-success flex flex-col gap-3 rounded-[18px] border px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">{coach.displayName} já acompanha seus treinos.</p>
                <Link href={activeHref} className="glass-button-primary rounded-[14px] px-4 py-2 text-xs font-semibold">
                  Ver meus treinos
                </Link>
              </div>
            ) : current?.status === "PENDING" ? (
              <div className="theme-panel-warning space-y-3 rounded-[18px] border px-4 py-4 text-sm" data-testid="coach-request-pending">
                <div>
                  <p className="font-semibold">Aguardando resposta</p>
                  <p className="mt-1 text-foreground/75">
                    Pedido enviado em {formatDate(current.requestedAt)}. O professor decide em breve; você verá o resultado aqui.
                  </p>
                </div>
                {actionError ? <p className="text-destructive">{actionError}</p> : null}
                <button
                  type="button"
                  onClick={cancel}
                  disabled={isCancelling}
                  aria-busy={isCancelling}
                  className="glass-button inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-xs font-semibold text-foreground/80 disabled:opacity-60"
                >
                  {isCancelling ? <IconLoader2 size={14} className="animate-spin" /> : null}
                  {isCancelling ? "Cancelando…" : "Cancelar pedido"}
                </button>
              </div>
            ) : !profile.acceptsIndependentAthletes && sharedSchools.length === 0 ? (
              // SAM-28 — the coach's choice: only inside their schools, and the viewer shares none.
              <div className="theme-panel-neutral rounded-[18px] border px-4 py-4 text-sm" data-testid="coach-schools-only">
                {coach.displayName} atende apenas dentro das escolas em que está vinculado. Associe-se a uma delas para pedir o acompanhamento.
              </div>
            ) : (
              <form
                className="space-y-4 rounded-[18px] border border-border bg-white/[0.04] px-4 py-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <h3 className="text-sm font-semibold">Solicitar acompanhamento</h3>

                {sharedSchools.length > 0 ? (
                  <label className="block space-y-1.5 text-sm">
                    <span className="text-foreground/75">Onde</span>
                    <select
                      value={scopeSchoolId}
                      onChange={(event) => setScopeSchoolId(event.target.value)}
                      aria-label="Onde"
                      className="glass-input w-full rounded-[14px] px-3 py-2.5 text-sm text-foreground outline-none"
                    >
                      {profile.acceptsIndependentAthletes ? <option value="">Como professor independente</option> : null}
                      {sharedSchools.map((school) => (
                        <option key={school.id} value={school.id}>
                          Na escola {school.name}
                        </option>
                      ))}
                    </select>
                    <span className="block text-xs text-foreground/50">Dentro de uma escola, você tem um professor principal por vez.</span>
                  </label>
                ) : null}

                <label className="block space-y-1.5 text-sm">
                  <span className="text-foreground/75">Mensagem (opcional)</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, 500))}
                    rows={3}
                    placeholder="Conte seu objetivo, rotina ou o que procura no acompanhamento."
                    className="glass-input w-full resize-none rounded-[14px] px-3 py-2.5 text-sm text-foreground outline-none"
                  />
                </label>

                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={shareHistory}
                    onChange={(event) => setShareHistory(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                    data-testid="share-history"
                  />
                  <span>
                    <span className="font-medium">Compartilhar meu histórico de treinos com o professor</span>
                    <span className="mt-1 block text-xs leading-5 text-foreground/55">
                      Inclui {SHARED_HISTORY_ITEMS.join(", ")}. Você pode revogar quando quiser.
                    </span>
                  </span>
                </label>

                {actionError ? <p className="text-destructive text-sm">{actionError}</p> : null}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={onClose} className="glass-button rounded-[14px] px-4 py-2 text-sm font-medium text-foreground/80">
                    Agora não
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                    className="glass-button-primary inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? <IconLoader2 size={16} className="animate-spin" /> : null}
                    {isSubmitting ? "Enviando…" : "Solicitar acompanhamento"}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
