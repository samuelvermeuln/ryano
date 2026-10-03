"use client";

import { useState, useTransition, useRef } from "react";
import { IconSearch } from "@tabler/icons-react";

import { EmptyState } from "@/components/empty-state";
import { ITEM_CLASS, PRIMARY_ACTION_CLASS } from "@/components/page-header";

type SchoolResult = {
  id: string;
  name: string;
  description?: string | null;
  joinPolicy?: string | null;
  city?: string | null;
  state?: string | null;
};

export function CoachSchoolSearchPanel({ existingSchoolIds }: { existingSchoolIds: string[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set(existingSchoolIds));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/schools/search?q=${encodeURIComponent(value)}&limit=10`)
        .then((r) => r.json())
        .then((data: { items?: SchoolResult[] }) => { setResults(data.items ?? []); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 350);
  }

  function requestCoachMembership(schoolId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/schools/${schoolId}/coaches`, { method: "POST" });
        const data = await res.json() as { message?: string; code?: string };
        if (!res.ok) {
          if (data.code === "COACH_SCHOOL_MEMBERSHIP_ALREADY_ACTIVE") {
            setRequested((prev) => new Set([...prev, schoolId]));
            return;
          }
          setErrors((prev) => ({ ...prev, [schoolId]: data.message ?? "Erro ao solicitar vínculo." }));
          return;
        }
        setRequested((prev) => new Set([...prev, schoolId]));
      } catch {
        setErrors((prev) => ({ ...prev, [schoolId]: "Erro de rede. Tente novamente." }));
      }
    });
  }

  function statusLabel(school: SchoolResult) {
    if (requested.has(school.id)) {
      // If was pre-existing (already in existingSchoolIds), show proper label
      return existingSchoolIds.includes(school.id) ? "Já solicitado" : "Solicitado ✓";
    }
    return null;
  }

  return (
    <div className="space-y-4">
      <label className="glass-input flex items-center gap-2 rounded-[16px] px-4 py-2.5">
        <IconSearch size={16} className="shrink-0 text-foreground/50" aria-hidden="true" />
        <span className="sr-only">Nome da escola</span>
        <input
          type="search"
          placeholder="Nome da escola…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground/42"
          autoFocus
        />
        {searching && <span className="shrink-0 text-xs text-foreground/50">Buscando…</span>}
      </label>

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((school) => {
            const label = statusLabel(school);
            return (
              <li key={school.id} className={`${ITEM_CLASS} flex items-center justify-between gap-4`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{school.name}</p>
                  {(school.city || school.state) && (
                    <p className="mt-0.5 text-xs text-foreground/55">
                      {[school.city, school.state].filter(Boolean).join(" — ")}
                    </p>
                  )}
                  {school.description && (
                    <p className="mt-0.5 truncate text-xs text-foreground/55">{school.description}</p>
                  )}
                  {errors[school.id] && (
                    <p role="alert" className="mt-1 text-xs text-rose-400">{errors[school.id]}</p>
                  )}
                </div>

                {label ? (
                  <span className="theme-pill-success shrink-0 rounded-full border px-3 py-1 text-xs font-semibold">{label}</span>
                ) : school.joinPolicy === "INVITE_ONLY" ? (
                  <span className="theme-pill-neutral shrink-0 rounded-full border px-3 py-1 text-xs font-semibold">Somente convite</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => requestCoachMembership(school.id)}
                    disabled={isPending}
                    className={`${PRIMARY_ACTION_CLASS} shrink-0 text-xs`}
                  >
                    Solicitar entrada
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <EmptyState title="Nenhuma escola encontrada" description="Confira o nome digitado ou peça à escola um link de convite." />
      )}

      {query.trim().length < 2 && (
        <p className="text-xs text-foreground/55">Digite pelo menos 2 caracteres para buscar.</p>
      )}
    </div>
  );
}
