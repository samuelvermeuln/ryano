// Temas do template post-activity-report
// Espelha SPORT_THEMES / LEG_THEMES / COMBO_THEMES do exemplo-post-activity-report.jsx

import type { PostActivityArtKey } from "./post-activity-report-art";

export interface ActivityTheme {
  label: string;
  from: string;
  to: string;
  accent: string;
  soft: string;
  illustrations: PostActivityArtKey[];
  badges: PostActivityArtKey[];
}

/** Tema quando é modalidade única */
export const SPORT_THEMES: Record<string, ActivityTheme> = {
  natacao: {
    label: "Natação",
    from: "#0EA5E9",
    to: "#0369A1",
    accent: "#0EA5E9",
    soft: "#F0F9FF",
    illustrations: ["swimmer"],
    badges: ["badge_cap"],
  },
  corrida: {
    label: "Corrida",
    from: "#F97316",
    to: "#EF4444",
    accent: "#F97316",
    soft: "#FFF7ED",
    illustrations: ["runner"],
    badges: ["badge_shoe"],
  },
  ciclismo: {
    label: "Ciclismo",
    from: "#22C55E",
    to: "#0EA5E9",
    accent: "#16A34A",
    soft: "#F0FDF4",
    illustrations: ["cyclist"],
    badges: ["badge_bike"],
  },
  surf: {
    label: "Surf",
    from: "#06B6D4",
    to: "#1D4ED8",
    accent: "#0891B2",
    soft: "#ECFEFF",
    illustrations: ["swimmer"],
    badges: ["badge_cap"],
  },
};

/** Tema de cada perna DENTRO de uma prova combinada */
export interface LegTheme {
  label: string;
  from: string;
  to: string;
  accent: string;
  soft: string;
  badge: PostActivityArtKey;
}

export const LEG_THEMES: Record<string, LegTheme> = {
  natacao: {
    label: "Natação",
    from: "#0EA5E9",
    to: "#0369A1",
    accent: "#0EA5E9",
    soft: "#F0F9FF",
    badge: "badge_cap",
  },
  corrida: {
    label: "Corrida",
    from: "#F97316",
    to: "#EF4444",
    accent: "#F97316",
    soft: "#FFF7ED",
    badge: "badge_shoe",
  },
  ciclismo: {
    label: "Ciclismo",
    from: "#22C55E",
    to: "#0EA5E9",
    accent: "#16A34A",
    soft: "#F0FDF4",
    badge: "badge_bike",
  },
};

/** Tema geral das provas combinadas (cabeçalho, barra de totais) */
export const COMBO_THEMES: Record<string, ActivityTheme> = {
  swimrun: {
    label: "Natação e Corrida",
    from: "#14B8A6",
    to: "#0EA5E9",
    accent: "#0D9488",
    soft: "#F0FDFA",
    illustrations: ["swimmer", "runner"],
    badges: ["badge_cap", "badge_shoe"],
  },
  triatlo: {
    label: "Triathlon",
    from: "#3B82F6",
    to: "#8B5CF6",
    accent: "#6366F1",
    soft: "#EEF2FF",
    illustrations: ["swimmer", "cyclist", "runner"],
    badges: ["badge_cap", "badge_bike", "badge_shoe"],
  },
  duatlo: {
    label: "Ciclismo e Corrida",
    from: "#16A34A",
    to: "#F97316",
    accent: "#15803D",
    soft: "#F0FDF4",
    illustrations: ["cyclist", "runner"],
    badges: ["badge_bike", "badge_shoe"],
  },
};

/** Tons usados nos deltas de parciais (fast / slow / neutral) */
export const TONES = {
  fast: { bg: "#DCFCE7", text: "#16A34A" },
  slow: { bg: "#FEF3C7", text: "#B45309" },
  neutral: { bg: "#F1F5F9", text: "#64748B" },
} as const;
