/**
 * SAM-72 — §19.2: the sections of a session's comparison, reachable by anchor
 * (Resumo, Blocos, Gráficos, Zonas, Feedback, Revisão). Open-water and
 * triathlon sessions add their own sections where they exist.
 */
const SECTIONS: Array<[string, string]> = [["resumo", "Resumo"], ["blocos", "Blocos/voltas"], ["graficos", "Gráficos"], ["zonas", "Tempo em zonas"], ["feedback", "Feedback"], ["revisao", "Revisão"]];

export function SessionSectionNav({ hide = [] }: { hide?: string[] }) {
  return (
    <nav aria-label="Seções da sessão" className="mt-3 flex flex-wrap gap-2 text-xs" data-testid="session-sections">
      {SECTIONS.filter(([id]) => !hide.includes(id)).map(([id, label]) => (
        <a key={id} href={`#${id}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 hover:bg-white/10">{label}</a>
      ))}
    </nav>
  );
}