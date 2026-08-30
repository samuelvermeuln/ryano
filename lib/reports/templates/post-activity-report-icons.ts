// Ícones lucide-react convertidos para SVG paths inline
// Todos usam viewBox="0 0 24 24", stroke="currentColor", stroke-width="2",
// stroke-linecap="round", stroke-linejoin="round", fill="none"
// Referência: https://lucide.dev/icons/

export type LucideIconName =
  | "clock"
  | "map-pin"
  | "heart"
  | "heart-pulse"
  | "flame"
  | "gauge"
  | "trending-up"
  | "check-circle-2"
  | "arrow-right-left"
  | "mountain";

/** Retorna o SVG completo (com <svg>) do ícone lucide dado. */
export function lucideIcon(
  name: LucideIconName,
  opts: { size?: number; color?: string; strokeWidth?: number } = {}
): string {
  const size = opts.size ?? 16;
  const color = opts.color ?? "currentColor";
  const strokeWidth = opts.strokeWidth ?? 2;
  const inner = ICON_PATHS[name];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const ICON_PATHS: Record<LucideIconName, string> = {
  clock: `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,

  "map-pin": `<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>`,

  heart: `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>`,

  "heart-pulse": `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>`,

  flame: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,

  gauge: `<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>`,

  "trending-up": `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>`,

  "check-circle-2": `<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`,

  "arrow-right-left": `<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>`,

  mountain: `<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>`,
};

/** Mapa entre nomes usados no exemplo (`metric.icon`) e nome lucide oficial */
export const METRIC_ICON_MAP: Record<string, LucideIconName> = {
  heart: "heart",
  heartpulse: "heart-pulse",
  flame: "flame",
  gauge: "gauge",
  trending: "trending-up",
  mountain: "mountain",
};
