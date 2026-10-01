"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { IconCalendar, IconLoader2, IconMail, IconMapPin, IconPhone, IconUsers } from "@tabler/icons-react";

import { Modal } from "@/components/modal";
import { UserAvatar } from "@/components/user-avatar";
import { SchoolLogo, sportLabel, type SchoolCardData, type ViewerMembership } from "./school-discovery";

/** Shape returned by `GET /api/schools/[id]/profile` (dates serialized as ISO strings). */
type SchoolProfile = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  since: string;
  sportTypes: string[];
  address: { street: string | null; number: string | null; district: string | null; city: string | null; state: string | null };
  phoneE164: string | null;
  email: string | null;
  joinPolicy: string;
  coachSelectionPolicy: string;
  activeAthleteCount: number;
  achievements: string[];
  specialties: string[];
  responsible: { name: string | null; image: string | null } | null;
  coaches: Array<{ id: string; displayName: string; bio: string | null; image: string | null }>;
  viewer: { membershipStatus: "NONE" | "PENDING" | "ACTIVE"; requestedAt: string | null };
};

type Props = {
  school: SchoolCardData;
  viewer: ViewerMembership | null;
  onClose: () => void;
  onRequested: (schoolId: string, requestedAt: string) => void;
};

const SHARED_HISTORY_ITEMS = [
  "atividades e métricas importadas",
  "treinos prescritos e compliance",
  "notas, comentários e avaliações do professor",
  "seu próprio feedback de treino",
];

/** +5511912340001 → (11) 91234-0001; anything unexpected is shown as stored. */
export function formatPhoneBR(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function joinPolicyLabel(policy: string): string {
  if (policy === "AUTO_APPROVE") return "Entrada automática";
  if (policy === "INVITE_ONLY") return "Somente por convite";
  return "A escola aprova cada pedido";
}

/**
 * SAM-24 — perfil público da escola em modal centralizado (rules/ui.md), com o
 * pedido de vínculo dentro: professor preferido (opcional), compartilhamento do
 * histórico (marcado por padrão, consentimento do atleta) e "Associar-se".
 */
export function SchoolProfileModal({ school, viewer, onClose, onRequested }: Props) {
  const [profile, setProfile] = useState<SchoolProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shareHistory, setShareHistory] = useState(true);
  const [preferredCoachId, setPreferredCoachId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(viewer?.status === "PENDING" ? viewer.requestedAt : null);
  const [isSubmitting, startSubmit] = useTransition();

  useEffect(() => {
    let active = true;
    fetch(`/api/schools/${school.id}/profile`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("PROFILE_FAILED");
        return (await response.json()) as SchoolProfile;
      })
      .then((data) => {
        if (!active) return;
        setProfile(data);
        if (data.viewer.membershipStatus === "PENDING" && data.viewer.requestedAt) setRequestedAt(data.viewer.requestedAt);
      })
      .catch(() => {
        if (active) setLoadError("Não foi possível carregar o perfil da escola agora.");
      });
    return () => {
      active = false;
    };
  }, [school.id]);

  const membershipStatus: "NONE" | "PENDING" | "ACTIVE" =
    viewer?.status === "ACTIVE" || profile?.viewer.membershipStatus === "ACTIVE"
      ? "ACTIVE"
      : requestedAt
        ? "PENDING"
        : "NONE";

  const canChooseCoach =
    !!profile && profile.coaches.length > 0 && profile.coachSelectionPolicy !== "INVITE_DEFINES_COACH";

  const submit = () => {
    setSubmitError(null);
    startSubmit(async () => {
      try {
        const response = await fetch(`/api/schools/${school.id}/athletes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareHistory, preferredCoachId: preferredCoachId || null }),
        });
        const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string; createdAt?: string };
        if (!response.ok) {
          if (body.code === "SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_PENDING") {
            const at = new Date().toISOString();
            setRequestedAt(at);
            onRequested(school.id, at);
            return;
          }
          setSubmitError(body.message ?? "Não foi possível enviar o pedido. Tente novamente.");
          return;
        }
        const at = body.createdAt ?? new Date().toISOString();
        setRequestedAt(at);
        onRequested(school.id, at);
      } catch {
        setSubmitError("Não foi possível enviar o pedido. Tente novamente.");
      }
    });
  };

  const address = profile
    ? [
        [profile.address.street, profile.address.number].filter(Boolean).join(", "),
        profile.address.district,
        [profile.address.city, profile.address.state].filter(Boolean).join(" - "),
      ].filter((part) => part && part.length > 0)
    : [];

  return (
    <Modal title={school.name} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          <SchoolLogo name={school.name} logoUrl={profile?.logoUrl ?? school.logoUrl} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            {(school.city || school.state) && (
              <p className="flex items-center gap-1 text-sm text-foreground/60">
                <IconMapPin size={14} />
                {[school.city, school.state].filter(Boolean).join(", ")}
              </p>
            )}
            {profile ? (
              <p className="flex items-center gap-1 text-sm text-foreground/60">
                <IconCalendar size={14} />
                Na Ryvano desde {formatSince(profile.since)}
              </p>
            ) : null}
            <p className="flex items-center gap-1 text-sm text-foreground/60">
              <IconUsers size={14} />
              {(profile?.activeAthleteCount ?? school.activeAthleteCount)} atleta
              {(profile?.activeAthleteCount ?? school.activeAthleteCount) !== 1 ? "s" : ""} ativo
              {(profile?.activeAthleteCount ?? school.activeAthleteCount) !== 1 ? "s" : ""} · {joinPolicyLabel(school.joinPolicy)}
            </p>
          </div>
        </div>

        {loadError ? (
          <div className="theme-panel-warning rounded-[18px] border px-4 py-3 text-sm">{loadError}</div>
        ) : null}

        {!profile && !loadError ? (
          <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Carregando perfil da escola">
            <div className="h-4 w-3/4 rounded-full bg-white/10" />
            <div className="h-4 w-1/2 rounded-full bg-white/10" />
            <div className="h-20 w-full rounded-[16px] bg-white/10" />
          </div>
        ) : null}

        {profile ? (
          <>
            {profile.description ? (
              <p className="whitespace-pre-line text-sm leading-7 text-foreground/75">{profile.description}</p>
            ) : null}

            {/* SAM-28 — the school's own words about itself. */}
            {profile.achievements.length > 0 ? (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Prêmios e conquistas</h3>
                <ul className="mt-2 space-y-1 text-sm" data-testid="school-achievements">
                  {profile.achievements.map((item) => (
                    <li key={item} className="flex gap-2 text-foreground/85"><span aria-hidden>🏅</span><span>{item}</span></li>
                  ))}
                </ul>
              </section>
            ) : null}

            {profile.specialties.length > 0 ? (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Especialidades</h3>
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="school-specialties">
                  {profile.specialties.map((item) => (
                    <span key={item} className="theme-pill-neutral rounded-full px-2.5 py-1 text-xs font-medium">{item}</span>
                  ))}
                </div>
              </section>
            ) : null}

            {profile.sportTypes.length > 0 ? (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Modalidades</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profile.sportTypes.map((sport) => (
                    <span key={sport} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent/90">
                      {sportLabel(sport)}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-border bg-white/[0.04] px-4 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Contato</h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  {profile.phoneE164 ? (
                    <div className="flex items-center gap-2">
                      <IconPhone size={14} className="shrink-0 text-foreground/50" />
                      <dd data-testid="school-phone">{formatPhoneBR(profile.phoneE164)}</dd>
                    </div>
                  ) : null}
                  {profile.email ? (
                    <div className="flex items-center gap-2">
                      <IconMail size={14} className="shrink-0 text-foreground/50" />
                      <dd className="break-all" data-testid="school-email">{profile.email}</dd>
                    </div>
                  ) : null}
                  {address.length > 0 ? (
                    <div className="flex items-start gap-2">
                      <IconMapPin size={14} className="mt-0.5 shrink-0 text-foreground/50" />
                      <dd className="text-foreground/80">{address.join(" · ")}</dd>
                    </div>
                  ) : null}
                  {!profile.phoneE164 && !profile.email && address.length === 0 ? (
                    <dd className="text-foreground/50">A escola ainda não informou contato.</dd>
                  ) : null}
                </dl>
              </div>

              <div className="rounded-[18px] border border-border bg-white/[0.04] px-4 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">Responsável</h3>
                {profile.responsible ? (
                  <div className="mt-2 flex items-center gap-3" data-testid="school-responsible">
                    <UserAvatar name={profile.responsible.name ?? school.name} image={profile.responsible.image} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{profile.responsible.name ?? "Gestor da escola"}</p>
                      <p className="text-xs text-foreground/50">Responde pela escola na Ryvano</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-foreground/50">Não informado.</p>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground/45">
                Professores ({profile.coaches.length})
              </h3>
              {profile.coaches.length === 0 ? (
                <p className="mt-2 text-sm text-foreground/50">A escola ainda não tem professores ativos.</p>
              ) : (
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {profile.coaches.map((coach) => (
                    <li key={coach.id} className="flex items-center gap-3 rounded-[16px] border border-border bg-white/[0.04] px-3 py-2.5">
                      <UserAvatar name={coach.displayName} image={coach.image} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{coach.displayName}</p>
                        {coach.bio ? <p className="line-clamp-1 text-xs text-foreground/55">{coach.bio}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Join / status */}
            {membershipStatus === "ACTIVE" ? (
              <div className="theme-panel-success flex flex-col gap-3 rounded-[18px] border px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">Você já faz parte desta escola.</p>
                <Link href={`/atleta/${school.id}`} className="glass-button-primary rounded-[14px] px-4 py-2 text-xs font-semibold">
                  Abrir meu painel
                </Link>
              </div>
            ) : membershipStatus === "PENDING" ? (
              <div className="theme-panel-warning rounded-[18px] border px-4 py-4 text-sm" data-testid="school-request-pending">
                <p className="font-semibold">Aguardando aprovação</p>
                <p className="mt-1 text-foreground/75">
                  Pedido enviado{requestedAt ? ` em ${formatDate(requestedAt)}` : ""}. A escola decide em breve; você verá o resultado aqui e no seu dashboard.
                </p>
              </div>
            ) : profile.joinPolicy === "INVITE_ONLY" ? (
              <div className="theme-panel-neutral rounded-[18px] border px-4 py-4 text-sm">
                Esta escola aceita atletas apenas por convite. Peça o link de convite diretamente à escola.
              </div>
            ) : (
              <form
                className="space-y-4 rounded-[18px] border border-border bg-white/[0.04] px-4 py-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <h3 className="text-sm font-semibold">Associar-se à escola</h3>

                {canChooseCoach ? (
                  <label className="block space-y-1.5 text-sm">
                    <span className="text-foreground/75">Professor preferido (opcional)</span>
                    <select
                      aria-label="Professor preferido"
                      value={preferredCoachId}
                      onChange={(event) => setPreferredCoachId(event.target.value)}
                      className="glass-input w-full rounded-[14px] px-3 py-2.5 text-sm text-foreground outline-none"
                    >
                      <option value="">Sem preferência — a escola escolhe</option>
                      {profile.coaches.map((coach) => (
                        <option key={coach.id} value={coach.id}>
                          {coach.displayName}
                        </option>
                      ))}
                    </select>
                    <span className="block text-xs text-foreground/50">A escola confirma o professor ao aprovar seu pedido.</span>
                  </label>
                ) : null}

                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={shareHistory}
                    onChange={(event) => setShareHistory(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="font-medium">Compartilhar meu histórico de treinos com a escola</span>
                    <span className="mt-1 block text-xs leading-5 text-foreground/55">
                      Inclui {SHARED_HISTORY_ITEMS.join(", ")}. Você pode revogar a qualquer momento em Histórico, no painel da escola.
                    </span>
                  </span>
                </label>

                {submitError ? <p className="text-destructive text-sm">{submitError}</p> : null}

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
                    {isSubmitting ? "Enviando…" : "Associar-se à escola"}
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
