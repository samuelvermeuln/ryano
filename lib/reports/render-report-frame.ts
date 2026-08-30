import type {
  DailyGarminSummaryTemplateData,
  ReportMetric,
  ReportRequest,
  ReportThemeSport,
  ReportThemeVariant,
} from "@/lib/reports/types";

import {
  assertNever,
  formatBadgeValue,
  getReportMetricByLabels,
  parseBodyBatteryRange,
  parseScoreValue,
  withOpacity,
} from "./render-report-helpers";
import type {
  ChartPalette,
  DailyWhatsappMetricCardData,
  DailyWhatsappTheme,
  ReportFamily,
  ReportFrame,
  ReportPalette,
} from "./render-report-types";

export function toReportFrame(request: ReportRequest): ReportFrame {
  switch (request.template) {
    case "daily-garmin-summary":
      return {
        athleteName: request.data.athleteName,
        athleteImage: request.data.athleteImage,
        title: "Resumo do dia",
        dateLabel: request.data.dateLabel,
        narrative: request.data.overview,
        insight: request.data.chart.note,
        metrics: request.data.metrics,
        checklist: [],
        chart: request.data.chart,
        footer: request.data.footer,
        status: "default",
        badge: "Prontidão diária",
        family: request.data.theme?.family ?? "daily",
        theme: request.data.theme ?? { family: "daily", sport: "default", variant: "pearl" },
      };
    case "post-activity-report": {
      // O novo template post-activity-report gera SVG puro — não usa este engine.
      // Frame placeholder mantido apenas para satisfazer o exhaustive check do TypeScript.
      const d = request.data;
      const title = d.variant === "multi" ? d.title : d.title;
      const dateLabel = d.timeLabel;
      const sport = d.variant === "single" ? d.sport : "default";
      return {
        athleteName: d.athlete.name,
        athleteImage: d.athlete.photoUrl ?? undefined,
        title,
        dateLabel,
        narrative: "",
        insight: undefined,
        metrics: [],
        checklist: [],
        chart: undefined,
        footer: undefined,
        status: "default",
        badge: title,
        family: "activity",
        theme: { family: "activity", sport: sport as never, variant: "pearl" },
      };
    }
    case "garmin-daily-sync-check":
      return {
        athleteName: request.data.athleteName,
        athleteImage: request.data.athleteImage,
        title: request.data.title,
        dateLabel: request.data.dateLabel,
        narrative: request.data.message,
        metrics: [],
        checklist: request.data.checklist,
        chart: undefined,
        footer: request.data.footer,
        status: "warning",
        badge: "Leituras pendentes",
        family: request.data.theme?.family ?? "warning",
        theme: request.data.theme ?? { family: "warning", sport: "default", variant: "pearl" },
      };
    case "garmin-reconnect":
      return {
        athleteName: request.data.athleteName,
        athleteImage: request.data.athleteImage,
        title: request.data.title,
        dateLabel: "Garmin",
        narrative: request.data.message,
        metrics: [],
        checklist: request.data.checklist,
        chart: undefined,
        footer: request.data.footer,
        status: "warning",
        badge: "Reconexão necessária",
        family: request.data.theme?.family ?? "reconnect",
        theme: request.data.theme ?? { family: "reconnect", sport: "default", variant: "pearl" },
      };
    case "evolution-media-diagnostic":
      return {
        athleteName: "Admin",
        athleteImage: undefined,
        title: request.data.title,
        dateLabel: request.data.subtitle,
        narrative: request.data.message,
        metrics: request.data.metrics,
        checklist: [],
        chart: request.data.chart,
        footer: request.data.footer,
        status: request.data.status ?? "default",
        badge: "Teste interno",
        family: request.data.theme?.family ?? "diagnostic",
        theme: request.data.theme ?? { family: "diagnostic", sport: "default", variant: "pearl" },
      };
    case "athlete-daily-readiness":
      // Este template gera SVG puro — não usa o engine de ImageResponse.
      // O case existe apenas para satisfazer o exhaustive check do TypeScript.
      return {
        athleteName: request.data.athlete.name,
        athleteImage: undefined,
        title: "RESUMO DE DESEMPENHO DO DIA",
        dateLabel: request.data.date,
        narrative: request.data.readiness.description,
        metrics: [],
        checklist: request.data.recommendations,
        chart: undefined,
        footer: `${request.data.athlete.team} | RYVANO`,
        status: "default",
        badge: "Prontidão",
        family: "daily",
        theme: { family: "daily", sport: "default", variant: "pearl" },
      };
    default:
      return assertNever(request);
  }
}

export function getReportPalette(frame: ReportFrame): ReportPalette {
  const variant = frame.theme.variant ?? "pearl";
  const accent = getAccentColor(frame.family, frame.theme.sport ?? "default", variant);

  if (variant === "mist") {
    return {
      pageBackground: "#F8FBFD",
      shellBackground: "#F2F7FA",
      surface: "#FFFFFF",
      surfaceMuted: "#FBFDFF",
      surfaceStrong: "#F8FBFE",
      border: "#DFE7EF",
      grid: "#E7EEF5",
      accent,
      accentWash: withOpacity(accent, 0.10),
      accentSoft: withOpacity(accent, 0.18),
      accentStrong: accent,
      comparison: "#AAB6C6",
      comparisonSoft: "#EEF2F7",
      success: "#45B649",
      successSoft: "#EEF9F0",
      warning: frame.family === "reconnect" ? "#D06352" : "#C6882A",
      warningSoft: frame.family === "reconnect" ? "#FFF0EC" : "#FFF4E6",
      textPrimary: "#111827",
      textSecondary: "#445066",
      textMuted: "#6B7280",
      footerSurface: "#F6F9FC",
      brandBorder: "#DFE7EF",
    };
  }

  if (variant === "sunrise") {
    return {
      pageBackground: "#FEFBF7",
      shellBackground: "#FAF3EA",
      surface: "#FFFFFF",
      surfaceMuted: "#FFFDFC",
      surfaceStrong: "#FFF9F4",
      border: "#EADFD2",
      grid: "#F0E7DE",
      accent,
      accentWash: withOpacity(accent, 0.10),
      accentSoft: withOpacity(accent, 0.18),
      accentStrong: accent,
      comparison: "#B9B3AA",
      comparisonSoft: "#F6F1EA",
      success: "#45B649",
      successSoft: "#EEF9F0",
      warning: frame.family === "reconnect" ? "#CC6758" : "#C98627",
      warningSoft: frame.family === "reconnect" ? "#FFF0EC" : "#FFF2E1",
      textPrimary: "#171717",
      textSecondary: "#514A43",
      textMuted: "#7A746B",
      footerSurface: "#FAF5EF",
      brandBorder: "#EADFD2",
    };
  }

  return {
    pageBackground: "#FAFBFE",
    shellBackground: "#F4F7FB",
    surface: "#FFFFFF",
    surfaceMuted: "#FCFDFF",
    surfaceStrong: "#F8FAFD",
    border: "#E2E6EE",
    grid: "#E9EDF4",
    accent,
    accentWash: withOpacity(accent, 0.10),
    accentSoft: withOpacity(accent, 0.18),
    accentStrong: accent,
    comparison: "#B8BEC8",
    comparisonSoft: "#F2F5FA",
    success: "#45B649",
    successSoft: "#EEF9F0",
    warning: frame.family === "reconnect" ? "#CF5E52" : "#C88727",
    warningSoft: frame.family === "reconnect" ? "#FFF0EC" : "#FFF3E3",
    textPrimary: "#111827",
    textSecondary: "#4B5563",
    textMuted: "#6B7280",
    footerSurface: "#F6F8FC",
    brandBorder: "#E2E6EE",
  };
}

export function getChartPalette(frame: ReportFrame, palette: ReportPalette): ChartPalette {
  const sport = frame.theme.sport ?? "default";

  if (frame.family === "daily") {
    return {
      primary: "#0C56EF",
      secondary: palette.comparison,
      tertiary: palette.success,
      neutral: palette.comparison,
      fill: withOpacity("#0C56EF", 0.14),
    };
  }

  if (frame.family === "warning") {
    return {
      primary: palette.warning,
      secondary: "#D9A85C",
      tertiary: "#E8C48A",
      neutral: palette.comparison,
      fill: withOpacity(palette.warning, 0.14),
    };
  }

  if (frame.family === "reconnect") {
    return {
      primary: palette.warning,
      secondary: "#E18C7F",
      tertiary: "#F2B6AD",
      neutral: palette.comparison,
      fill: withOpacity(palette.warning, 0.14),
    };
  }

  if (sport === "swim" || sport === "open-water" || sport === "surf") {
    return {
      primary: palette.accent,
      secondary: "#12A4D9",
      tertiary: "#78D3F2",
      neutral: "#9DB6CC",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "rowing" || sport === "kayak" || sport === "stand-up-paddle") {
    return {
      primary: palette.accent,
      secondary: "#0F766E",
      tertiary: "#5EEAD4",
      neutral: "#9CB6B3",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "bike" || sport === "mtb") {
    return {
      primary: palette.accent,
      secondary: "#F59E0B",
      tertiary: "#FCD34D",
      neutral: "#B8B09A",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "run" || sport === "trail-run") {
    return {
      primary: palette.accent,
      secondary: "#F97316",
      tertiary: "#FB7185",
      neutral: "#BFA8B0",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "walking" || sport === "hiking") {
    return {
      primary: palette.accent,
      secondary: "#65A30D",
      tertiary: "#A3E635",
      neutral: "#AAB7A1",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "triathlon" || sport === "duathlon" || sport === "aquathlon") {
    return {
      primary: palette.accent,
      secondary: "#06B6D4",
      tertiary: "#8B5CF6",
      neutral: "#A8B0C8",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "gym" || sport === "crossfit") {
    return {
      primary: palette.accent,
      secondary: "#6B7280",
      tertiary: "#EF4444",
      neutral: "#B7BBC3",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "football" || sport === "futsal") {
    return {
      primary: palette.accent,
      secondary: "#22C55E",
      tertiary: "#84CC16",
      neutral: "#A8BAA8",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "basketball" || sport === "volleyball") {
    return {
      primary: palette.accent,
      secondary: "#F97316",
      tertiary: "#FDBA74",
      neutral: "#BBB2AA",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  if (sport === "tennis" || sport === "padel") {
    return {
      primary: palette.accent,
      secondary: "#65A30D",
      tertiary: "#BEF264",
      neutral: "#B0B79E",
      fill: withOpacity(palette.accent, 0.14),
    };
  }

  return {
    primary: palette.accent,
    secondary: "#0C56EF",
    tertiary: "#45B649",
    neutral: palette.comparison,
    fill: withOpacity(palette.accent, 0.14),
  };
}

export function getAccentColor(
  family: ReportFamily,
  sport: ReportThemeSport,
  variant: ReportThemeVariant,
) {
  if (family === "daily") {
    return variant === "mist" ? "#0A63E8" : variant === "sunrise" ? "#165FDF" : "#0C56EF";
  }

  if (family === "warning") {
    return variant === "mist" ? "#BA7C21" : variant === "sunrise" ? "#C98728" : "#BE8127";
  }

  if (family === "reconnect") {
    return variant === "mist" ? "#CF6455" : variant === "sunrise" ? "#D46F60" : "#CB5B50";
  }

  if (family === "diagnostic") {
    return variant === "mist" ? "#4E78D8" : variant === "sunrise" ? "#6272E1" : "#4668D8";
  }

  if (sport === "swim") {
    return variant === "mist" ? "#1680B7" : variant === "sunrise" ? "#247BC0" : "#206FCE";
  }

  if (sport === "open-water") {
    return variant === "mist" ? "#0E6F92" : variant === "sunrise" ? "#176EAB" : "#155E9F";
  }

  if (sport === "surf") {
    return variant === "mist" ? "#0D8BA6" : variant === "sunrise" ? "#198DAE" : "#127A9A";
  }

  if (sport === "rowing" || sport === "kayak" || sport === "stand-up-paddle") {
    return variant === "mist" ? "#2A8A87" : variant === "sunrise" ? "#33908D" : "#2B7A77";
  }

  if (sport === "bike") {
    return variant === "mist" ? "#B67E1D" : variant === "sunrise" ? "#C88B24" : "#B97D18";
  }

  if (sport === "mtb") {
    return variant === "mist" ? "#8F7B2C" : variant === "sunrise" ? "#A0832A" : "#857326";
  }

  if (sport === "run") {
    return variant === "mist" ? "#CB5E74" : variant === "sunrise" ? "#D56A69" : "#CC5B71";
  }

  if (sport === "trail-run") {
    return variant === "mist" ? "#A16A35" : variant === "sunrise" ? "#B0743F" : "#99632D";
  }

  if (sport === "walking") {
    return variant === "mist" ? "#4C8E58" : variant === "sunrise" ? "#669658" : "#4B8456";
  }

  if (sport === "hiking") {
    return variant === "mist" ? "#6F8752" : variant === "sunrise" ? "#7C9151" : "#687E4D";
  }

  if (sport === "triathlon" || sport === "duathlon" || sport === "aquathlon") {
    return variant === "mist" ? "#6C5CE3" : variant === "sunrise" ? "#7C64F0" : "#6558DF";
  }

  if (sport === "gym") {
    return variant === "mist" ? "#6B7280" : variant === "sunrise" ? "#7A6275" : "#5E6675";
  }

  if (sport === "crossfit") {
    return variant === "mist" ? "#B85649" : variant === "sunrise" ? "#C46353" : "#AF4D44";
  }

  if (sport === "football" || sport === "futsal") {
    return variant === "mist" ? "#4C8C45" : variant === "sunrise" ? "#6B9342" : "#4A7E40";
  }

  if (sport === "basketball" || sport === "volleyball") {
    return variant === "mist" ? "#C06B2A" : variant === "sunrise" ? "#D07B33" : "#B86225";
  }

  if (sport === "tennis" || sport === "padel") {
    return variant === "mist" ? "#6F8E29" : variant === "sunrise" ? "#86A031" : "#6A8627";
  }

  return variant === "mist" ? "#2E7E8B" : variant === "sunrise" ? "#C2763E" : "#3968D8";
}

export function getDailyWhatsappTheme(sport: ReportThemeSport) {
  if (sport === "swim" || sport === "open-water") {
    return {
      label: "Natação",
      from: "#0EA5E9",
      to: "#0369A1",
      accent: "#0EA5E9",
      soft: "#F0F9FF",
    } satisfies DailyWhatsappTheme;
  }

  if (sport === "bike" || sport === "mtb") {
    return {
      label: "Ciclismo",
      from: "#22C55E",
      to: "#15803D",
      accent: "#16A34A",
      soft: "#F0FDF4",
    } satisfies DailyWhatsappTheme;
  }

  if (sport === "run" || sport === "trail-run") {
    return {
      label: "Corrida",
      from: "#F97316",
      to: "#EF4444",
      accent: "#F97316",
      soft: "#FFF7ED",
    } satisfies DailyWhatsappTheme;
  }

  if (sport === "triathlon" || sport === "duathlon" || sport === "aquathlon") {
    return {
      label: "Triathlon",
      from: "#3B82F6",
      to: "#8B5CF6",
      accent: "#6366F1",
      soft: "#EEF2FF",
    } satisfies DailyWhatsappTheme;
  }

  if (sport === "surf") {
    return {
      label: "Surf",
      from: "#06B6D4",
      to: "#1D4ED8",
      accent: "#0891B2",
      soft: "#ECFEFF",
    } satisfies DailyWhatsappTheme;
  }

  return {
    label: "Performance",
    from: "#0C56EF",
    to: "#6D5EF9",
    accent: "#2155F5",
    soft: "#EEF2FF",
  } satisfies DailyWhatsappTheme;
}

export function getDailyWhatsappPalette(theme: DailyWhatsappTheme): ReportPalette {
  return {
    pageBackground: "#F4F7FB",
    shellBackground: "#EEF2F7",
    surface: "#FFFFFF",
    surfaceMuted: "#FFFFFF",
    surfaceStrong: "#F9FBFF",
    border: "#E3E8F0",
    grid: "#E8EDF5",
    accent: theme.accent,
    accentWash: withOpacity(theme.accent, 0.1),
    accentSoft: withOpacity(theme.accent, 0.18),
    accentStrong: theme.accent,
    comparison: "#A9B3C4",
    comparisonSoft: "#EEF2F7",
    success: "#22C55E",
    successSoft: "#DCFCE7",
    warning: "#F59E0B",
    warningSoft: "#FEF3C7",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    footerSurface: "#F8FAFD",
    brandBorder: "#E3E8F0",
  };
}

export function getDailyWhatsappMetricCards(data: DailyGarminSummaryTemplateData): DailyWhatsappMetricCardData[] {
  const sleepMetric = getReportMetricByLabels(data.metrics, ["sleep"]);
  const batteryMetric = getReportMetricByLabels(data.metrics, ["body battery"]);
  const hrvMetric = getReportMetricByLabels(data.metrics, ["vfc"]);
  const hrMetric = getReportMetricByLabels(data.metrics, ["fc repouso"]);
  const batteryRange = parseBodyBatteryRange(batteryMetric?.value);

  return [
    {
      label: sleepMetric?.label ?? "SONO REGENERATIVO",
      icon: "moon",
      type: "score",
      value: sleepMetric?.value ?? "—",
      helper: data.visual?.sleepDurationLabel ?? sleepMetric?.helper,
      tone: sleepMetric?.tone,
      score: data.visual?.sleepScore ?? parseScoreValue(sleepMetric?.value),
    },
    {
      label: batteryMetric?.label ?? "BODY BATTERY",
      icon: "battery",
      type: "battery",
      value: batteryMetric?.value ?? "—",
      helper: batteryMetric?.helper,
      tone: batteryMetric?.tone,
      from: data.visual?.bodyBatteryStart ?? batteryRange.from,
      to: data.visual?.bodyBatteryEnd ?? batteryRange.to,
    },
    {
      label: hrvMetric?.label ?? "VFC NOTURNA",
      icon: "hrv",
      type: "badge",
      value: hrvMetric?.value ?? formatBadgeValue(data.visual?.hrvValue, "ms"),
      helper: data.visual?.hrvStatusLabel ?? hrvMetric?.helper,
      tone: hrvMetric?.tone,
    },
    {
      label: hrMetric?.label ?? "FC REPOUSO",
      icon: "hr",
      type: "badge",
      value: hrMetric?.value ?? formatBadgeValue(data.visual?.restingHeartRate, "bpm"),
      helper: hrMetric?.helper,
      tone: hrMetric?.tone,
    },
  ];
}

export function getDailyWhatsappRecommendations(data: DailyGarminSummaryTemplateData) {
  const recommendations = data.recommendations?.filter(Boolean).slice(0, 3) ?? [];

  if (recommendations.length) {
    return recommendations;
  }

  return [
    "Use este card como triagem rápida antes da decisão final de treino.",
    "Cruze percepção subjetiva, carga recente e sinais fisiológicos antes de aumentar intensidade.",
    "Painel completo disponível na Ryvano para aprofundar a leitura do dia.",
  ];
}

export function getDailyToneColors(tone: ReportMetric["tone"] | undefined) {
  if (tone === "accent") {
    return {
      background: "#DCFCE7",
      text: "#15803D",
      dot: "#22C55E",
    };
  }

  if (tone === "warning") {
    return {
      background: "#FEF3C7",
      text: "#B45309",
      dot: "#F59E0B",
    };
  }

  return {
    background: "#F1E9FF",
    text: "#7C3AED",
    dot: "#8B5CF6",
  };
}

export function getDailyToneLabel(tone: ReportMetric["tone"] | undefined) {
  if (tone === "accent") {
    return "ÓTIMA";
  }

  if (tone === "warning") {
    return "ATENÇÃO";
  }

  return "BALANCEADA";
}

export function getDailyMetricIcon(icon: DailyWhatsappMetricCardData["icon"]) {
  if (icon === "battery") {
    return "BB";
  }

  if (icon === "hrv") {
    return "V";
  }

  if (icon === "hr") {
    return "FC";
  }

  return "Z";
}
