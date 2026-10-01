"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBuildingCommunity, IconMapPin, IconSearch, IconUsers } from "@tabler/icons-react";

import { SectionCard } from "@/components/section-card";
import { humanizeActivityLabel } from "@/lib/activity-text";
import { SchoolProfileModal } from "./school-profile-modal";

export type SchoolCardData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  state: string | null;
  sportTypes: string[];
  activeAthleteCount: number;
  joinPolicy: string;
  coachSelectionPolicy: string;
};

export type ViewerMembership = {
  /** SAM-29 — REJECTED is shown ("Recusado") and leaves the request open to be made again. */
  status: "PENDING" | "ACTIVE" | "REJECTED";
  requestedAt: string;
  decidedAt?: string | null;
};

type Props = {
  initialSchools: SchoolCardData[];
  viewerMemberships: Record<string, ViewerMembership>;
  enabled: boolean;
  /** SAM-29 — deep link from a notification: open this school's modal on arrival… */
  initialOpenSchoolId?: string | null;
  /** …with this coach pre-selected as preferred ("seguir professor"). */
  initialPreferredCoachId?: string | null;
};

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

export function sportLabel(sportType: string): string {
  return humanizeActivityLabel(sportType) ?? sportType;
}

/**
 * SAM-24 — lista inicial + busca por nome/cidade + "Ver escola" (modal) com
 * "Associar-se à escola". A UI não decide política nenhuma: o estado do vínculo
 * vem do servidor e o pedido é delegado à rota, que valida e grava em transação.
 */
export function SchoolDiscovery({
  initialSchools,
  viewerMemberships,
  enabled,
  initialOpenSchoolId = null,
  initialPreferredCoachId = null,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SchoolCardData[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [viewer, setViewer] = useState(viewerMemberships);
  const [openSchool, setOpenSchool] = useState<SchoolCardData | null>(
    () => (initialOpenSchoolId ? initialSchools.find((school) => school.id === initialOpenSchoolId) ?? null : null),
  );
  // Only the deep-linked opening carries the coach; a later manual "Ver escola" starts clean.
  const [preferredCoachFromLink, setPreferredCoachFromLink] = useState<string | null>(initialPreferredCoachId);
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
        const response = await fetch(`/api/schools/search?q=${encodeURIComponent(text)}&limit=30`, { cache: "no-store" });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const data = (await response.json()) as { items?: SchoolCardData[] };
        // Ignore responses that arrive after a newer query was typed.
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

  const schools = results ?? initialSchools;
  const isSearching = query.trim().length >= MIN_QUERY_LENGTH;

  const handleRequested = (schoolId: string, requestedAt: string) => {
    setViewer((current) => ({ ...current, [schoolId]: { status: "PENDING", requestedAt } }));
    router.refresh();
  };

  const emptyMessage = useMemo(() => {
    if (!enabled) return "O módulo de escolas não está disponível neste ambiente.";
    if (isSearching) return searchError ?? "Nenhuma escola encontrada com esse nome ou cidade.";
    return "Nenhuma escola cadastrada ainda.";
  }, [enabled, isSearching, searchError]);

  return (
    <>
      <SectionCard
        title="Encontrar uma escola"
        description="Conecte-se a uma escola esportiva e acesse treinos, avaliações e acompanhamento profissional."
        action={
          <label className="relative block w-full sm:w-80">
            <span className="sr-only">Buscar escola</span>
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              type="search"
              aria-label="Buscar escola"
              placeholder="Nome da escola ou cidade…"
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
        {schools.length === 0 ? (
          <div className="py-16 text-center text-foreground/50">
            <IconBuildingCommunity size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">{emptyMessage}</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {schools.map((school) => (
              <li key={school.id} data-testid="school-card">
                <SchoolCard
                  school={school}
                  viewer={viewer[school.id] ?? null}
                  onOpen={() => {
                    setPreferredCoachFromLink(null);
                    setOpenSchool(school);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {openSchool ? (
        <SchoolProfileModal
          school={openSchool}
          viewer={viewer[openSchool.id] ?? null}
          initialPreferredCoachId={preferredCoachFromLink}
          onClose={() => setOpenSchool(null)}
          onRequested={handleRequested}
        />
      ) : null}
    </>
  );
}

function joinPolicyLabel(policy: string): string {
  if (policy === "AUTO_APPROVE") return "Entrada automática";
  if (policy === "INVITE_ONLY") return "Somente por convite";
  return "Aprovação da escola";
}

function SchoolCard({
  school,
  viewer,
  onOpen,
}: {
  school: SchoolCardData;
  viewer: ViewerMembership | null;
  onOpen: () => void;
}) {
  const badge =
    viewer?.status === "ACTIVE"
      ? { cls: "theme-pill-success", label: "Vinculado" }
      : viewer?.status === "PENDING"
        ? { cls: "theme-pill-warning", label: "Aguardando aprovação" }
        : viewer?.status === "REJECTED"
          ? { cls: "theme-pill-danger", label: "Recusado" }
        : school.joinPolicy === "INVITE_ONLY"
          ? { cls: "theme-pill-neutral", label: "Somente por convite" }
          : null;

  return (
    <div className="glass flex h-full flex-col gap-3 rounded-[18px] p-4 transition-colors hover:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SchoolLogo name={school.name} logoUrl={school.logoUrl} />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{school.name}</p>
            {(school.city || school.state) && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-foreground/50">
                <IconMapPin size={11} />
                {[school.city, school.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>
        {badge ? (
          <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
            {badge.label}
          </span>
        ) : null}
      </div>

      {school.description && (
        <p className="line-clamp-2 text-sm leading-relaxed text-foreground/65">{school.description}</p>
      )}

      {school.sportTypes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {school.sportTypes.slice(0, 4).map((sport) => (
            <span
              key={sport}
              className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent/80"
            >
              {sportLabel(sport)}
            </span>
          ))}
          {school.sportTypes.length > 4 && (
            <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-foreground/40">
              +{school.sportTypes.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-col gap-0.5 text-xs text-foreground/45">
          <p className="flex items-center gap-1">
            <IconUsers size={12} />
            {school.activeAthleteCount} atleta{school.activeAthleteCount !== 1 ? "s" : ""}
          </p>
          <p>{joinPolicyLabel(school.joinPolicy)}</p>
        </div>
        <div className="flex items-center gap-2">
          {viewer?.status === "ACTIVE" ? (
            <Link
              href={`/atleta/${school.id}`}
              className="rounded-[10px] px-3 py-1.5 text-xs font-semibold text-foreground/70 transition-colors hover:text-foreground"
            >
              Meu painel
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onOpen}
            className="rounded-[10px] bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
          >
            Ver escola
          </button>
        </div>
      </div>
    </div>
  );
}

export function SchoolLogo({ name, logoUrl, size = "md" }: { name: string; logoUrl: string | null; size?: "md" | "lg" }) {
  const dimension = size === "lg" ? "h-16 w-16 rounded-[16px] text-2xl" : "h-10 w-10 rounded-[10px] text-lg";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} className={`${dimension} shrink-0 object-cover`} />;
  }
  return (
    <div className={`${dimension} flex shrink-0 items-center justify-center bg-accent/20 font-bold text-accent`} aria-hidden="true">
      {name[0]?.toUpperCase() ?? "E"}
    </div>
  );
}
