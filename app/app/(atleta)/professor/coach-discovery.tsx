"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconBuildingCommunity, IconSearch, IconUserCheck, IconUsers } from "@tabler/icons-react";

import { SectionCard } from "@/components/section-card";
import { UserAvatar } from "@/components/user-avatar";
import { CoachProfileModal } from "./coach-profile-modal";

export type CoachCardData = {
  id: string;
  displayName: string;
  bio: string | null;
  image: string | null;
  schools: Array<{ id: string; name: string }>;
  activeAthleteCount: number;
};

export type ViewerAssignment = {
  id: string;
  status: "PENDING" | "ACTIVE";
  /** SAM-30 — a PENDING "proposal" was opened by the coach (continue independently); the athlete decides it. */
  kind?: "request" | "proposal";
  schoolId: string | null;
  requestedAt: string;
};

type Props = {
  initialCoaches: CoachCardData[];
  viewerAssignments: Record<string, ViewerAssignment>;
  enabled: boolean;
  /** SAM-30 — open this coach's profile on arrival (notification link `?professor=`). */
  initialOpenCoachId?: string | null;
};

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

/**
 * SAM-25 — lista inicial + busca por nome ou e-mail + "Ver perfil" (modal) com
 * "Solicitar acompanhamento". O estado do vínculo vem do servidor; o pedido e o
 * cancelamento são delegados às rotas, que validam e gravam em transação.
 */
export function CoachDiscovery({ initialCoaches, viewerAssignments, enabled, initialOpenCoachId = null }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CoachCardData[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [viewer, setViewer] = useState(viewerAssignments);
  const [openCoach, setOpenCoach] = useState<CoachCardData | null>(
    () => initialCoaches.find((coach) => coach.id === initialOpenCoachId) ?? null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSearchError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const text = value.trim();
    if (text.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setSearching(false);
      return;
    }

    const seq = ++requestSeq.current;
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/coaches/search?q=${encodeURIComponent(text)}&limit=30`, { cache: "no-store" });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const data = (await response.json()) as { items?: CoachCardData[] };
        if (seq !== requestSeq.current) return;
        setResults(data.items ?? []);
      } catch {
        if (seq !== requestSeq.current) return;
        setResults([]);
        setSearchError("Não foi possível buscar agora. Tente novamente em instantes.");
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  const coaches = results ?? initialCoaches;
  const isSearching = query.trim().length >= MIN_QUERY_LENGTH;

  const emptyMessage = useMemo(() => {
    if (!enabled) return "O módulo de escolas não está disponível neste ambiente.";
    if (isSearching) return searchError ?? "Nenhum professor encontrado com esse nome ou e-mail.";
    return "Nenhum professor cadastrado ainda.";
  }, [enabled, isSearching, searchError]);

  const handleRequested = (coachId: string, assignment: ViewerAssignment) => {
    setViewer((current) => ({ ...current, [coachId]: assignment }));
    router.refresh();
  };

  const handleCancelled = (coachId: string) => {
    setViewer((current) => {
      const next = { ...current };
      delete next[coachId];
      return next;
    });
    router.refresh();
  };

  return (
    <>
      <SectionCard
        title="Encontrar um professor"
        description="Encontre treinadores e professores cadastrados na plataforma para acompanhar sua evolução."
        action={
          <label className="relative block w-full sm:w-80">
            <span className="sr-only">Buscar professor</span>
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              type="search"
              aria-label="Buscar professor"
              placeholder="Nome ou e-mail do professor…"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              className="glass-input w-full rounded-[16px] py-2.5 pl-9 pr-10 text-sm text-foreground outline-none"
            />
            {searching ? (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground/50" aria-live="polite">
                …
              </span>
            ) : null}
          </label>
        }
      >
        {coaches.length === 0 ? (
          <div className="py-16 text-center text-foreground/50">
            <IconUserCheck size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{emptyMessage}</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {coaches.map((coach) => (
              <li key={coach.id} data-testid="coach-card">
                <CoachCard coach={coach} viewer={viewer[coach.id] ?? null} onOpen={() => setOpenCoach(coach)} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {openCoach ? (
        <CoachProfileModal
          coach={openCoach}
          viewer={viewer[openCoach.id] ?? null}
          onClose={() => setOpenCoach(null)}
          onRequested={handleRequested}
          onCancelled={handleCancelled}
        />
      ) : null}
    </>
  );
}

function CoachCard({
  coach,
  viewer,
  onOpen,
}: {
  coach: CoachCardData;
  viewer: ViewerAssignment | null;
  onOpen: () => void;
}) {
  const badge =
    viewer?.status === "ACTIVE"
      ? { cls: "theme-pill-success", label: "Seu professor" }
      : viewer?.status === "PENDING" && viewer.kind === "proposal"
        ? { cls: "theme-pill-info", label: "Proposta do professor" }
        : viewer?.status === "PENDING"
          ? { cls: "theme-pill-warning", label: "Aguardando resposta" }
          : null;

  return (
    <div className="glass flex h-full flex-col gap-3 rounded-[18px] p-4 transition-colors hover:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={coach.displayName} image={coach.image} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{coach.displayName}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-foreground/50">
              <IconUsers size={11} />
              {coach.activeAthleteCount} atleta{coach.activeAthleteCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {badge ? (
          <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
            {badge.label}
          </span>
        ) : null}
      </div>

      {coach.bio && <p className="line-clamp-3 text-sm leading-relaxed text-foreground/65">{coach.bio}</p>}

      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <div className="flex min-w-0 flex-col gap-1">
          {coach.schools.length > 0 ? (
            coach.schools.map((school) => (
              <p key={school.id} className="flex items-center gap-1.5 truncate text-xs text-foreground/50">
                <IconBuildingCommunity size={12} className="shrink-0" />
                {school.name}
              </p>
            ))
          ) : (
            <p className="text-xs text-foreground/45">Professor independente</p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-[10px] bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
        >
          Ver perfil
        </button>
      </div>
    </div>
  );
}
