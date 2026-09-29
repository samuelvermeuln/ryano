"use client";

import { useId, useMemo, useState } from "react";

export type PersonOption = { id: string; name: string; email: string | null };

/**
 * SAM-8 — Multi-selection of existing school people for the new-team form.
 *
 * There was no multi-select in the codebase (only the single `<select>` of the
 * team detail screen), and a plain multi-`<select>` cannot show who is chosen
 * nor be searched, which the task requires.
 *
 * The selection is React state and the checkboxes carry no `name`: the value
 * that reaches the server is one hidden input per selected id. That is what
 * keeps a person selected while the search box hides their row — a named
 * checkbox filtered out of the DOM would silently drop the choice.
 */
export function ParticipantPicker({
  field,
  label,
  options,
  selected,
  onChange,
  searchLabel,
  emptyLabel,
}: {
  field: string;
  label: string;
  options: PersonOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  searchLabel: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.name} ${option.email ?? ""}`.toLowerCase().includes(needle),
    );
  }, [options, query]);

  const selectedSet = new Set(selected);
  const chosen = options.filter((option) => selectedSet.has(option.id));

  // Selecting the same person twice is the same choice, so toggling off is the
  // only way a duplicate could appear — the Set is what makes it impossible.
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  return (
    <fieldset className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <legend className="px-1 text-xs font-medium text-foreground/70">{label}</legend>

      {selected.map((id) => (
        <input key={id} type="hidden" name={field} value={id} />
      ))}

      {options.length === 0 ? (
        <p className="text-xs text-foreground/45">{emptyLabel}</p>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            aria-label={searchLabel}
            aria-controls={listId}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/25"
          />

          {chosen.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={`${label} selecionados`}>
              {chosen.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => toggle(option.id)}
                    aria-label={`Remover ${option.name}`}
                    className="flex items-center gap-1.5 rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-white/25"
                  >
                    {option.name}
                    <span aria-hidden="true" className="text-foreground/60">
                      ✕
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div
            id={listId}
            className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-1"
          >
            {visible.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-foreground/45">
                Ninguém corresponde a esta busca.
              </p>
            ) : (
              visible.map((option) => (
                <label
                  key={option.id}
                  // `foreground/5` and not `white/…`: globals.css only remaps
                  // the base `bg-white/*` classes for light, never the `hover:`
                  // variants, so a white tint would be invisible there.
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-foreground/5"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(option.id)}
                    onChange={() => toggle(option.id)}
                    className="h-4 w-4 shrink-0 accent-emerald-400"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{option.name}</span>
                    {option.email && (
                      <span className="block truncate text-xs text-foreground/50">{option.email}</span>
                    )}
                  </span>
                </label>
              ))
            )}
          </div>

          <p className="text-xs text-foreground/50" role="status">
            {selected.length === 0
              ? "Nenhum selecionado."
              : `${selected.length} selecionado(s) de ${options.length}.`}
          </p>
        </>
      )}
    </fieldset>
  );
}
