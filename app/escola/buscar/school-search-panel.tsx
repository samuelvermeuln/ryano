/**
 * T291/T292 — Client component: busca de escola + solicitação de vínculo
 */
"use client";
import { useState, useTransition, useRef } from "react";

type SchoolResult = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  memberCount?: number;
};

export function SchoolSearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [requested, setRequested] = useState<Set<string>>(new Set());
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
        .then((data: { schools?: SchoolResult[] }) => { setResults(data.schools ?? []); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 350);
  }

  function requestMembership(schoolId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/schools/${schoolId}/memberships`, { method: "POST" });
        const data = await res.json() as { message?: string };
        if (!res.ok) {
          setErrors((prev) => ({ ...prev, [schoolId]: data.message ?? "Erro ao solicitar vínculo." }));
          return;
        }
        setRequested((prev) => new Set([...prev, schoolId]));
      } catch {
        setErrors((prev) => ({ ...prev, [schoolId]: "Erro ao solicitar vínculo." }));
      }
    });
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
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">…</span>
        )}
      </div>

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((school) => (
            <li key={school.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 gap-4">
              <div>
                <p className="font-medium text-sm">{school.name}</p>
                {(school.city || school.state) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[school.city, school.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {errors[school.id] && (
                  <p className="text-xs text-destructive mt-1">{errors[school.id]}</p>
                )}
              </div>
              {requested.has(school.id) ? (
                <span className="shrink-0 text-xs text-green-700 dark:text-green-400 font-medium">Solicitado ✓</span>
              ) : (
                <button
                  type="button"
                  onClick={() => requestMembership(school.id)}
                  disabled={isPending}
                  className="shrink-0 text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Solicitar entrada
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhuma escola encontrada.</p>
      )}
    </div>
  );
}
