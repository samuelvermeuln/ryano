export type ReportTemplateName =
  | "daily-garmin-summary"
  | "post-activity-report"
  | "garmin-daily-sync-check"
  | "garmin-reconnect"
  | "evolution-media-diagnostic"
  | "athlete-daily-readiness";

export type ReportThemeVariant = "pearl" | "mist" | "sunrise";
export type ReportThemeSport =
  | "default"
  | "swim"
  | "open-water"
  | "bike"
  | "mtb"
  | "run"
  | "trail-run"
  | "triathlon"
  | "duathlon"
  | "aquathlon"
  | "walking"
  | "hiking"
  | "gym"
  | "crossfit"
  | "football"
  | "futsal"
  | "basketball"
  | "volleyball"
  | "tennis"
  | "padel"
  | "surf"
  | "rowing"
  | "kayak"
  | "stand-up-paddle";

export type ReportTheme = {
  family?: "daily" | "activity" | "warning" | "reconnect" | "diagnostic";
  variant?: ReportThemeVariant;
  sport?: ReportThemeSport;
};

export type ReportMetric = {
  label: string;
  value: string;
  helper?: string;
  tone?: "accent" | "neutral" | "warning";
};

export type ChartPoint = {
  label: string;
  value: number;
  formattedValue?: string;
  tone?: "accent" | "neutral" | "warning";
};

export type ReportChart = {
  title: string;
  type: "line" | "bar";
  data: ChartPoint[];
  note?: string;
};

export type DailyGarminSummaryTemplateData = {
  athleteName: string;
  dateLabel: string;
  overview: string;
  athleteImage?: string | null;
  metrics: ReportMetric[];
  chart: ReportChart;
  footer: string;
  cta: string;
  reportType?: string;
  recommendations?: string[];
  visual?: {
    readinessScore?: number | null;
    readinessLabel?: string | null;
    readinessDescription?: string | null;
    readinessTone?: ReportMetric["tone"];
    sleepScore?: number | null;
    sleepDurationLabel?: string | null;
    bodyBatteryStart?: number | null;
    bodyBatteryEnd?: number | null;
    hrvValue?: number | null;
    hrvStatusLabel?: string | null;
    restingHeartRate?: number | null;
  };
  theme?: ReportTheme;
};

export type PostActivityReportTemplateData = {
  athleteName: string;
  athleteImage?: string | null;
  activityLabel: string;
  occurredAtLabel: string;
  summary: string;
  insight: string;
  metrics: ReportMetric[];
  chips: string[];
  chart: ReportChart;
  footer?: string;
  cta?: string;
  sport?: ReportThemeSport;
  theme?: ReportTheme;
};

export type GarminDailySyncCheckTemplateData = {
  athleteName: string;
  athleteImage?: string | null;
  dateLabel: string;
  title: string;
  message: string;
  checklist: string[];
  footer: string;
  theme?: ReportTheme;
};

export type GarminReconnectTemplateData = {
  athleteName: string;
  athleteImage?: string | null;
  title: string;
  message: string;
  checklist: string[];
  footer: string;
  theme?: ReportTheme;
};

export type EvolutionMediaDiagnosticTemplateData = {
  title: string;
  subtitle: string;
  message: string;
  metrics: ReportMetric[];
  chart: ReportChart;
  footer: string;
  status?: "default" | "warning";
  theme?: ReportTheme;
};

export type AthleteDailyReadinessTemplateData = {
  sport: ReportThemeSport;
  reportType: string;
  date: string;
  athlete: {
    name: string;
    team: string;
    photoUrl?: string;
  };
  readiness: {
    score: number;
    statusLabel: string;
    tone: "good" | "moderate" | "warn" | "bad";
    description: string;
  };
  metrics: Array<{
    type: "sleep" | "battery" | "badge";
    icon: "moon" | "battery" | "hrv" | "hr";
    label: string;
    value?: number;
    from?: number;
    to?: number;
    sub?: string;
    unit?: string;
    statusLabel?: string;
    tone?: "good" | "moderate" | "warn" | "bad";
  }>;
  recommendations: string[];
};

export type ReportTemplateDataMap = {
  "daily-garmin-summary": DailyGarminSummaryTemplateData;
  "post-activity-report": PostActivityReportTemplateData;
  "garmin-daily-sync-check": GarminDailySyncCheckTemplateData;
  "garmin-reconnect": GarminReconnectTemplateData;
  "evolution-media-diagnostic": EvolutionMediaDiagnosticTemplateData;
  "athlete-daily-readiness": AthleteDailyReadinessTemplateData;
};

export type ReportRequest = {
  [Key in ReportTemplateName]: {
    template: Key;
    data: ReportTemplateDataMap[Key];
  }
}[ReportTemplateName];
