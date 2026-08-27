export type ReportTemplateName =
  | "daily-garmin-summary"
  | "post-activity-report"
  | "garmin-daily-sync-check"
  | "garmin-reconnect";

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
  metrics: ReportMetric[];
  chart: ReportChart;
  footer: string;
  cta: string;
};

export type PostActivityReportTemplateData = {
  athleteName: string;
  activityLabel: string;
  occurredAtLabel: string;
  summary: string;
  insight: string;
  metrics: ReportMetric[];
  chips: string[];
  chart: ReportChart;
  footer?: string;
  cta?: string;
};

export type GarminDailySyncCheckTemplateData = {
  athleteName: string;
  dateLabel: string;
  title: string;
  message: string;
  checklist: string[];
  footer: string;
};

export type GarminReconnectTemplateData = {
  athleteName: string;
  title: string;
  message: string;
  checklist: string[];
  footer: string;
};

export type ReportTemplateDataMap = {
  "daily-garmin-summary": DailyGarminSummaryTemplateData;
  "post-activity-report": PostActivityReportTemplateData;
  "garmin-daily-sync-check": GarminDailySyncCheckTemplateData;
  "garmin-reconnect": GarminReconnectTemplateData;
};

export type ReportRequest = {
  [Key in ReportTemplateName]: {
    template: Key;
    data: ReportTemplateDataMap[Key];
  }
}[ReportTemplateName];
