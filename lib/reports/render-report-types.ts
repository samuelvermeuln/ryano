import type {
  ReportChart,
  ReportMetric,
  ReportTheme,
} from "@/lib/reports/types";

export type ReportFamily = NonNullable<ReportTheme["family"]>;

export type ReportFrame = {
  athleteName: string;
  athleteImage?: string | null;
  title: string;
  dateLabel: string;
  narrative?: string;
  insight?: string;
  metrics: ReportMetric[];
  checklist: string[];
  chart?: ReportChart;
  footer?: string;
  status: "default" | "warning";
  badge: string;
  family: ReportFamily;
  theme: ReportTheme;
};

export type ReportBrandAssets = {
  logoPrincipalSrc: string;
  logoMarkSrc: string;
};

export type ReportPalette = {
  pageBackground: string;
  shellBackground: string;
  surface: string;
  surfaceMuted: string;
  surfaceStrong: string;
  border: string;
  grid: string;
  accent: string;
  accentWash: string;
  accentSoft: string;
  accentStrong: string;
  comparison: string;
  comparisonSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  footerSurface: string;
  brandBorder: string;
};

export type ChartPalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  neutral: string;
  fill: string;
};

export type DailyWhatsappTheme = {
  label: string;
  from: string;
  to: string;
  accent: string;
  soft: string;
};

export type DailyWhatsappMetricCardData = {
  label: string;
  icon: "moon" | "battery" | "hrv" | "hr";
  type: "score" | "battery" | "badge";
  value: string;
  helper?: string;
  tone?: ReportMetric["tone"];
  score?: number;
  from?: number | null;
  to?: number | null;
};

export const PAGE_WIDTH = 1080;
export const PAGE_HEIGHT = 1620;
