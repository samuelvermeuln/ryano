"use client";

import { useState, useTransition, useRef } from "react";

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
      <div className="relative">
        <input
          type="search"
          placeholder="Nome da escola…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring pr-10"
          autoFocus
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">…</span>
        )}
      </div>

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((school) => {
            const label = statusLabel(school);
            return (
              <li key={school.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{school.name}</p>
                  {(school.city || school.state) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[school.city, school.state].filter(Boolean).join(" — ")}
                    </p>
                  )}
                  {school.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{school.description}</p>
                  )}
                  {school.joinPolicy === "INVITE_ONLY" && !label && (
                    <p className="text-xs text-muted-foreground mt-1">Escola aceita somente por convite.</p>
                  )}
                  {errors[school.id] && (
                    <p className="text-xs text-destructive mt-1">{errors[school.id]}</p>
                  )}
                </div>

                {label ? (
                  <span className="shrink-0 text-xs text-green-700 dark:text-green-400 font-medium">{label}</span>
                ) : school.joinPolicy === "INVITE_ONLY" ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Somente convite</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => requestCoachMembership(school.id)}
                    disabled={isPending}
                    className="shrink-0 text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-50"
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
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma escola encontrada.</p>
      )}

      {query.trim().length < 2 && (
        <p className="text-xs text-muted-foreground text-center pt-2">Digite pelo menos 2 caracteres para buscar.</p>
      )}
    </div>
  );
}
