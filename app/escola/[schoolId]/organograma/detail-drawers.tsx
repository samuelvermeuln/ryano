"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import {
  loadAthleteDetailAction,
  loadCoachDetailAction,
  type AthleteDetailData,
  type CoachDetailData,
} from "./actions";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

/** Null last access means unknown (sessions are pruned), never "never used". */
function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Não disponível";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Não disponível" : dateTimeFormat.format(date);
}

/**
 * Side panel so the organograma stays visible behind it, as opposed to
 * navigating away and losing the position in the tree.
 */
function Drawer({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/10 bg-[#0d1117] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="glass-button h-8 w-8 rounded-full text-sm"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 flex-1">{children}</div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-2 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}

/**
 * Loads a record once per `key`, keyed so switching cards refetches.
 *
 * The result is stored together with the key it belongs to, so a slow response
 * for a previously selected card cannot overwrite the current one — the stale
 * response is simply not for the key being rendered.
 */
function useDetail<T>(
  load: () => Promise<{ ok: true; detail: T } | { ok: false; message: string }>,
  key: string,
): { detail?: T; error?: string } {
  const [state, setState] = useState<{ key: string; detail?: T; error?: string } | null>(null);
  const loader = useRef(load);
  useEffect(() => { loader.current = load; }, [load]);

  useEffect(() => {
    let active = true;
    loader.current().then((result) => {
      if (!active) return;
      setState(result.ok ? { key, detail: result.detail } : { key, error: result.message });
    }).catch(() => {
      if (active) setState({ key, error: "Não foi possível carregar os detalhes." });
    });
    return () => { active = false; };
  }, [key]);

  return state?.key === key ? state : {};
}

export function CoachDrawer({
  schoolId, membershipId, onClose,
}: {
  schoolId: string;
  membershipId: string;
  onClose: () => void;
}) {
  const { detail, error } = useDetail<CoachDetailData>(
    () => loadCoachDetailAction(schoolId, membershipId),
    `${schoolId}:${membershipId}`,
  );

  return (
    <Drawer title="Detalhes do professor" onClose={onClose}>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!detail && !error ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {detail ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <UserAvatar name={detail.coach.displayName} image={detail.user.image} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{detail.coach.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{detail.user.email}</p>
            </div>
          </div>

          <dl>
            <Field
              label="Status na escola"
              value={detail.membership.suspendedAt ? "Inativo" : "Ativo"}
            />
            <Field label="Telefone" value={detail.user.phoneE164} />
            <Field label="Alunos" value={detail.athletes.length} />
            <Field label="Entrou em" value={formatDate(detail.membership.startedAt)} />
            <Field label="Último acesso" value={formatDateTime(detail.lastAccess?.at)} />
            {detail.membership.suspendedAt ? (
              <Field label="Desativado em" value={formatDate(detail.membership.suspendedAt)} />
            ) : null}
          </dl>

          {detail.user.address ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Endereço</h3>
              <p className="mt-1 text-sm">
                {[
                  detail.user.address.street,
                  detail.user.address.number,
                  detail.user.address.district,
                  detail.user.address.city,
                  detail.user.address.state,
                  detail.user.address.postalCode,
                ].filter(Boolean).join(", ") || "—"}
              </p>
            </div>
          ) : null}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Alunos vinculados
            </h3>
            {detail.athletes.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Nenhum aluno vinculado.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {detail.athletes.map((assignment) => (
                  <li key={assignment.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{assignment.athlete.name ?? assignment.athlete.email}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {assignment.sportType ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href={`/escola/${schoolId}/professores/${membershipId}`}
            className="glass-button block rounded-full px-4 py-2 text-center text-sm font-semibold"
          >
            Ver perfil completo
          </Link>
        </div>
      ) : null}
    </Drawer>
  );
}

export function AthleteDrawer({
  schoolId, athleteId, onClose,
}: {
  schoolId: string;
  athleteId: string;
  onClose: () => void;
}) {
  const { detail, error } = useDetail<AthleteDetailData>(
    () => loadAthleteDetailAction(schoolId, athleteId),
    `${schoolId}:${athleteId}`,
  );

  return (
    <Drawer title="Detalhes do aluno" onClose={onClose}>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {!detail && !error ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {detail ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <UserAvatar
              name={detail.athlete.name ?? detail.athlete.email ?? "Aluno"}
              image={detail.athlete.image}
              size="lg"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{detail.athlete.name ?? "Aluno"}</p>
              <p className="truncate text-xs text-muted-foreground">{detail.athlete.email}</p>
            </div>
          </div>

          <dl>
            <Field label="Status" value={detail.athlete.status === "ACTIVE" ? "Ativo" : "Inativo"} />
            <Field label="Telefone" value={detail.athlete.phoneE164} />
            <Field
              label="Professor responsável"
              value={detail.currentCoach?.displayName ?? "Sem professor"}
            />
            <Field label="Modalidade" value={detail.currentCoach?.sportType} />
            <Field label="Na escola desde" value={formatDate(detail.membership.startedAt)} />
            <Field label="Último acesso" value={formatDateTime(detail.lastAccess?.at)} />
            <Field label="Planos ativos" value={detail.activeLicenses.length} />
          </dl>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Histórico de vínculo
            </h3>
            {detail.history.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Sem histórico registrado.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {detail.history.map((period) => (
                  <li key={period.id} className="rounded-2xl border border-white/8 px-3 py-2 text-sm">
                    <p className="font-medium">{period.coachName}</p>
                    <p className="text-xs text-muted-foreground">
                      {period.endedAt
                        ? `${formatDate(period.startedAt)} até ${formatDate(period.endedAt)}`
                        : `Desde ${formatDate(period.startedAt)}`}
                    </p>
                    {period.reason ? (
                      <p className="mt-1 text-xs text-foreground/70">Motivo: {period.reason}</p>
                    ) : null}
                    {period.assignedByName ? (
                      <p className="text-xs text-muted-foreground">Por: {period.assignedByName}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <Link
            href={`/escola/${schoolId}/atletas`}
            className="glass-button block rounded-full px-4 py-2 text-center text-sm font-semibold"
          >
            Ver perfil completo
          </Link>
        </div>
      ) : null}
    </Drawer>
  );
}
