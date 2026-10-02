"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export type ActivityDetailTab = { id: string; label: string; content: ReactNode; empty?: boolean };

/**
 * SAM-40 — the three panels of the activity screen (Estatísticas / Voltas /
 * Tempo em zonas). Accessible tabs: `tablist`/`tab`/`tabpanel`, arrow keys,
 * the first tab selected by default. Panels are rendered by the server and
 * handed in as nodes; this component only switches them.
 */
export function ActivityDetailTabs({ tabs, initial }: { tabs: ActivityDetailTab[]; initial?: string }) {
  const baseId = useId();
  const [active, setActive] = useState(initial ?? tabs[0]?.id ?? "");

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setActive(tabs[next]!.id);
    document.getElementById(`${baseId}-tab-${tabs[next]!.id}`)?.focus();
  }

  return (
    <div className="space-y-4" data-testid="activity-tabs">
      <div role="tablist" aria-label="Seções da atividade" className="flex flex-wrap gap-2">
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${selected ? "theme-pill-success" : "theme-pill-neutral"} ${tab.empty ? "opacity-60" : ""}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <section
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== active}
          data-testid={`activity-tab-${tab.id}`}
        >
          {tab.content}
        </section>
      ))}
    </div>
  );
}
