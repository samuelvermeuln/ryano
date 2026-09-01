import type { ReportThemeSport } from "@/lib/reports/types";

export interface SportTheme {
  /** Nome exibido no badge do header */
  reportLabel: string;
  /** Emoji do ícone no badge do header */
  badgeEmoji: string;
  /** Cor primária (início do gradiente) */
  colorFrom: string;
  /** Cor secundária (fim do gradiente) */
  colorTo: string;
  /** Cor sólida para uso direto (accent) */
  colorAccent: string;
  /** Cor de fundo suave (soft bg para ícones) */
  colorSoft: string;
  /** Cor do texto sobre colorSoft */
  colorSoftText: string;
}

/**
 * Paletas por categoria, reaproveitadas pelas modalidades que não têm
 * identidade visual dedicada. Mantém o `Record<ReportThemeSport, SportTheme>`
 * exaustivo sem duplicar cores por esporte.
 */
type SportPalette = Omit<SportTheme, "reportLabel" | "badgeEmoji">;

/** Resistência com ritmo sem ícone dedicado (ex.: cadeira de rodas). */
const endurancePalette: SportPalette = {
  colorFrom: "#14B8A6",
  colorTo: "#0D9488",
  colorAccent: "#0D9488",
  colorSoft: "#F0FDFA",
  colorSoftText: "#0F766E",
};

/** Ciclismo (ex.: handbike). */
const cyclingPalette: SportPalette = {
  colorFrom: "#22C55E",
  colorTo: "#15803D",
  colorAccent: "#16A34A",
  colorSoft: "#F0FDF4",
  colorSoftText: "#15803D",
};

/** Vento e vela (kitesurf, vela, windsurf). */
const windSailPalette: SportPalette = {
  colorFrom: "#06B6D4",
  colorTo: "#1D4ED8",
  colorAccent: "#0891B2",
  colorSoft: "#ECFEFF",
  colorSoftText: "#0E7490",
};

/** Esportes coletivos e de raquete. */
const courtPalette: SportPalette = {
  colorFrom: "#3B82F6",
  colorTo: "#84CC16",
  colorAccent: "#2563EB",
  colorSoft: "#EFF6FF",
  colorSoftText: "#1D4ED8",
};

/** Força e estúdio sem tema dedicado (ex.: dança). */
const studioPalette: SportPalette = {
  colorFrom: "#A855F7",
  colorTo: "#EC4899",
  colorAccent: "#9333EA",
  colorSoft: "#FAF5FF",
  colorSoftText: "#7E22CE",
};

/** Neve, gelo e aventura. */
const snowPalette: SportPalette = {
  colorFrom: "#38BDF8",
  colorTo: "#6366F1",
  colorAccent: "#0284C7",
  colorSoft: "#F0F9FF",
  colorSoftText: "#0369A1",
};

const themes: Record<ReportThemeSport, SportTheme> = {
  default: {
    reportLabel: "RELATÓRIO | PERFORMANCE",
    badgeEmoji: "🏅",
    colorFrom: "#6366F1",
    colorTo: "#8B5CF6",
    colorAccent: "#6366F1",
    colorSoft: "#EEF2FF",
    colorSoftText: "#4338CA",
  },
  triathlon: {
    reportLabel: "RELATÓRIO TRIATHLON | PERFORMANCE",
    badgeEmoji: "🏊",
    colorFrom: "#3B82F6",
    colorTo: "#8B5CF6",
    colorAccent: "#6366F1",
    colorSoft: "#EEF2FF",
    colorSoftText: "#4338CA",
  },
  duathlon: {
    reportLabel: "RELATÓRIO DUATHLON | PERFORMANCE",
    badgeEmoji: "🚴",
    colorFrom: "#3B82F6",
    colorTo: "#22C55E",
    colorAccent: "#2563EB",
    colorSoft: "#EFF6FF",
    colorSoftText: "#1D4ED8",
  },
  aquathlon: {
    reportLabel: "RELATÓRIO AQUATHLON | PERFORMANCE",
    badgeEmoji: "🌊",
    colorFrom: "#0EA5E9",
    colorTo: "#6366F1",
    colorAccent: "#0284C7",
    colorSoft: "#F0F9FF",
    colorSoftText: "#0369A1",
  },
  swim: {
    reportLabel: "RELATÓRIO NATAÇÃO | PERFORMANCE",
    badgeEmoji: "🏊",
    colorFrom: "#0EA5E9",
    colorTo: "#0369A1",
    colorAccent: "#0EA5E9",
    colorSoft: "#F0F9FF",
    colorSoftText: "#0369A1",
  },
  "open-water": {
    reportLabel: "RELATÓRIO ÁGUA ABERTA | PERFORMANCE",
    badgeEmoji: "🌊",
    colorFrom: "#06B6D4",
    colorTo: "#0EA5E9",
    colorAccent: "#0891B2",
    colorSoft: "#ECFEFF",
    colorSoftText: "#0E7490",
  },
  bike: {
    reportLabel: "RELATÓRIO CICLISMO | PERFORMANCE",
    badgeEmoji: "🚴",
    colorFrom: "#22C55E",
    colorTo: "#15803D",
    colorAccent: "#16A34A",
    colorSoft: "#F0FDF4",
    colorSoftText: "#15803D",
  },
  mtb: {
    reportLabel: "RELATÓRIO MTB | PERFORMANCE",
    badgeEmoji: "🚵",
    colorFrom: "#84CC16",
    colorTo: "#15803D",
    colorAccent: "#65A30D",
    colorSoft: "#F7FEE7",
    colorSoftText: "#4D7C0F",
  },
  run: {
    reportLabel: "RELATÓRIO CORRIDA | PERFORMANCE",
    badgeEmoji: "🏃",
    colorFrom: "#F97316",
    colorTo: "#EF4444",
    colorAccent: "#EA580C",
    colorSoft: "#FFF7ED",
    colorSoftText: "#C2410C",
  },
  "trail-run": {
    reportLabel: "RELATÓRIO TRAIL RUN | PERFORMANCE",
    badgeEmoji: "⛰️",
    colorFrom: "#D97706",
    colorTo: "#92400E",
    colorAccent: "#B45309",
    colorSoft: "#FFFBEB",
    colorSoftText: "#92400E",
  },
  walking: {
    reportLabel: "RELATÓRIO CAMINHADA | PERFORMANCE",
    badgeEmoji: "🚶",
    colorFrom: "#14B8A6",
    colorTo: "#0D9488",
    colorAccent: "#0D9488",
    colorSoft: "#F0FDFA",
    colorSoftText: "#0F766E",
  },
  hiking: {
    reportLabel: "RELATÓRIO HIKING | PERFORMANCE",
    badgeEmoji: "🥾",
    colorFrom: "#78716C",
    colorTo: "#44403C",
    colorAccent: "#57534E",
    colorSoft: "#FAFAF9",
    colorSoftText: "#44403C",
  },
  gym: {
    reportLabel: "RELATÓRIO GYM | PERFORMANCE",
    badgeEmoji: "💪",
    colorFrom: "#EF4444",
    colorTo: "#DC2626",
    colorAccent: "#DC2626",
    colorSoft: "#FEF2F2",
    colorSoftText: "#B91C1C",
  },
  crossfit: {
    reportLabel: "RELATÓRIO CROSSFIT | PERFORMANCE",
    badgeEmoji: "🏋️",
    colorFrom: "#F59E0B",
    colorTo: "#D97706",
    colorAccent: "#D97706",
    colorSoft: "#FFFBEB",
    colorSoftText: "#92400E",
  },
  football: {
    reportLabel: "RELATÓRIO FUTEBOL | PERFORMANCE",
    badgeEmoji: "⚽",
    colorFrom: "#22C55E",
    colorTo: "#1D4ED8",
    colorAccent: "#16A34A",
    colorSoft: "#F0FDF4",
    colorSoftText: "#15803D",
  },
  futsal: {
    reportLabel: "RELATÓRIO FUTSAL | PERFORMANCE",
    badgeEmoji: "⚽",
    colorFrom: "#F97316",
    colorTo: "#1D4ED8",
    colorAccent: "#EA580C",
    colorSoft: "#FFF7ED",
    colorSoftText: "#C2410C",
  },
  basketball: {
    reportLabel: "RELATÓRIO BASQUETE | PERFORMANCE",
    badgeEmoji: "🏀",
    colorFrom: "#F97316",
    colorTo: "#DC2626",
    colorAccent: "#EA580C",
    colorSoft: "#FFF7ED",
    colorSoftText: "#C2410C",
  },
  volleyball: {
    reportLabel: "RELATÓRIO VÔLEI | PERFORMANCE",
    badgeEmoji: "🏐",
    colorFrom: "#3B82F6",
    colorTo: "#F97316",
    colorAccent: "#2563EB",
    colorSoft: "#EFF6FF",
    colorSoftText: "#1D4ED8",
  },
  tennis: {
    reportLabel: "RELATÓRIO TÊNIS | PERFORMANCE",
    badgeEmoji: "🎾",
    colorFrom: "#84CC16",
    colorTo: "#F59E0B",
    colorAccent: "#65A30D",
    colorSoft: "#F7FEE7",
    colorSoftText: "#4D7C0F",
  },
  padel: {
    reportLabel: "RELATÓRIO PADEL | PERFORMANCE",
    badgeEmoji: "🏓",
    colorFrom: "#3B82F6",
    colorTo: "#84CC16",
    colorAccent: "#2563EB",
    colorSoft: "#EFF6FF",
    colorSoftText: "#1D4ED8",
  },
  surf: {
    reportLabel: "RELATÓRIO SURF | PERFORMANCE",
    badgeEmoji: "🏄",
    colorFrom: "#06B6D4",
    colorTo: "#1D4ED8",
    colorAccent: "#0891B2",
    colorSoft: "#ECFEFF",
    colorSoftText: "#0E7490",
  },
  rowing: {
    reportLabel: "RELATÓRIO REMO | PERFORMANCE",
    badgeEmoji: "🚣",
    colorFrom: "#0EA5E9",
    colorTo: "#1D4ED8",
    colorAccent: "#0284C7",
    colorSoft: "#F0F9FF",
    colorSoftText: "#0369A1",
  },
  kayak: {
    reportLabel: "RELATÓRIO CAIAQUE | PERFORMANCE",
    badgeEmoji: "🛶",
    colorFrom: "#14B8A6",
    colorTo: "#0EA5E9",
    colorAccent: "#0D9488",
    colorSoft: "#F0FDFA",
    colorSoftText: "#0F766E",
  },
  "stand-up-paddle": {
    reportLabel: "RELATÓRIO SUP | PERFORMANCE",
    badgeEmoji: "🏄",
    colorFrom: "#06B6D4",
    colorTo: "#22C55E",
    colorAccent: "#0891B2",
    colorSoft: "#ECFEFF",
    colorSoftText: "#0E7490",
  },
  wheelchair: {
    reportLabel: "RELATÓRIO CADEIRA DE RODAS | PERFORMANCE",
    badgeEmoji: "🦽",
    ...endurancePalette,
  },
  handcycle: {
    reportLabel: "RELATÓRIO HANDBIKE | PERFORMANCE",
    badgeEmoji: "🚴",
    ...cyclingPalette,
  },
  kitesurf: {
    reportLabel: "RELATÓRIO KITESURF | PERFORMANCE",
    badgeEmoji: "🪁",
    ...windSailPalette,
  },
  sail: {
    reportLabel: "RELATÓRIO VELA | PERFORMANCE",
    badgeEmoji: "⛵",
    ...windSailPalette,
  },
  windsurf: {
    reportLabel: "RELATÓRIO WINDSURF | PERFORMANCE",
    badgeEmoji: "🏄",
    ...windSailPalette,
  },
  pickleball: {
    reportLabel: "RELATÓRIO PICKLEBALL | PERFORMANCE",
    badgeEmoji: "🏓",
    ...courtPalette,
  },
  badminton: {
    reportLabel: "RELATÓRIO BADMINTON | PERFORMANCE",
    badgeEmoji: "🏸",
    ...courtPalette,
  },
  squash: {
    reportLabel: "RELATÓRIO SQUASH | PERFORMANCE",
    badgeEmoji: "🎾",
    ...courtPalette,
  },
  "table-tennis": {
    reportLabel: "RELATÓRIO TÊNIS DE MESA | PERFORMANCE",
    badgeEmoji: "🏓",
    ...courtPalette,
  },
  racquetball: {
    reportLabel: "RELATÓRIO RAQUETEBOL | PERFORMANCE",
    badgeEmoji: "🎾",
    ...courtPalette,
  },
  golf: {
    reportLabel: "RELATÓRIO GOLFE | PERFORMANCE",
    badgeEmoji: "⛳",
    ...courtPalette,
  },
  cricket: {
    reportLabel: "RELATÓRIO CRÍQUETE | PERFORMANCE",
    badgeEmoji: "🏏",
    ...courtPalette,
  },
  dance: {
    reportLabel: "RELATÓRIO DANÇA | PERFORMANCE",
    badgeEmoji: "💃",
    ...studioPalette,
  },
  "alpine-ski": {
    reportLabel: "RELATÓRIO ESQUI ALPINO | PERFORMANCE",
    badgeEmoji: "⛷️",
    ...snowPalette,
  },
  "backcountry-ski": {
    reportLabel: "RELATÓRIO ESQUI FORA DE PISTA | PERFORMANCE",
    badgeEmoji: "🎿",
    ...snowPalette,
  },
  "nordic-ski": {
    reportLabel: "RELATÓRIO ESQUI NÓRDICO | PERFORMANCE",
    badgeEmoji: "🎿",
    ...snowPalette,
  },
  snowboard: {
    reportLabel: "RELATÓRIO SNOWBOARD | PERFORMANCE",
    badgeEmoji: "🏂",
    ...snowPalette,
  },
  snowshoe: {
    reportLabel: "RELATÓRIO RAQUETE DE NEVE | PERFORMANCE",
    badgeEmoji: "🥾",
    ...snowPalette,
  },
  "ice-skate": {
    reportLabel: "RELATÓRIO PATINAÇÃO NO GELO | PERFORMANCE",
    badgeEmoji: "⛸️",
    ...snowPalette,
  },
  "inline-skate": {
    reportLabel: "RELATÓRIO PATINAÇÃO INLINE | PERFORMANCE",
    badgeEmoji: "🛼",
    ...snowPalette,
  },
  "roller-ski": {
    reportLabel: "RELATÓRIO ESQUI DE RODAS | PERFORMANCE",
    badgeEmoji: "🎿",
    ...snowPalette,
  },
  skateboard: {
    reportLabel: "RELATÓRIO SKATE | PERFORMANCE",
    badgeEmoji: "🛹",
    ...snowPalette,
  },
  "rock-climbing": {
    reportLabel: "RELATÓRIO ESCALADA | PERFORMANCE",
    badgeEmoji: "🧗",
    ...snowPalette,
  },
};

/** Retorna o tema para um esporte. Nunca falha — cai em `default` se não encontrar. */
export function getSportTheme(sport: ReportThemeSport | string | undefined): SportTheme {
  return themes[(sport as ReportThemeSport) ?? "default"] ?? themes["default"];
}
