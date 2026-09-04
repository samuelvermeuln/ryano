import type { ReportChart, ReportMetric } from "@/lib/reports/types";

import {
  cleanNarrative,
  clampPercentage,
  getInitials,
  getMetricInterpretation,
  getSportBadgeLabel,
  splitMetricValue,
  withOpacity,
} from "./render-report-helpers";
import {
  getDailyMetricIcon,
  getDailyToneColors,
  getDailyToneLabel,
} from "./render-report-frame";
import {
  BarInsightChart,
  LineInsightChart,
  Panel,
  Pill,
} from "./render-report-primitives";
import type {
  ChartPalette,
  DailyWhatsappMetricCardData,
  DailyWhatsappTheme,
  ReportBrandAssets,
  ReportFrame,
  ReportPalette,
} from "./render-report-types";
import { PAGE_HEIGHT, PAGE_WIDTH } from "./render-report-types";
import type { ReactNode } from "react";

export function ReportPage(input: { palette: ReportPalette; children: ReactNode }) {
  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        display: "flex",
        backgroundColor: input.palette.pageBackground,
        padding: 36,
        // Satori resolves the supplied ImageResponse font by exact family name;
        // a CSS fallback list makes it fall back to an unavailable system font
        // in the production container and renders tofu squares.
        fontFamily: "Geist",
        color: input.palette.textPrimary,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          borderRadius: 32,
          border: `1px solid ${input.palette.border}`,
          backgroundColor: input.palette.surface,
          padding: 22,
        }}
      >
        {input.children}
      </div>
    </div>
  );
}

export function HeaderBar(input: {
  palette: ReportPalette;
  brand: ReportBrandAssets;
  metaLabel: string;
  metaValue: string;
  badge?: string;
}) {
  return (
    <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <img src={input.brand.logoPrincipalSrc} alt="Logo Ryvano" width={176} height={34} />
      </div>

      <div style={{ display: "flex", marginLeft: "auto", alignItems: "center" }}>
        {input.badge ? (
          <Pill
            palette={input.palette}
            value={input.badge}
            background={input.palette.accentWash}
            color={input.palette.accentStrong}
            border={input.palette.accentSoft}
          />
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: input.badge ? 12 : 0,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 10,
            paddingBottom: 10,
            borderRadius: 18,
            border: `1px solid ${input.palette.border}`,
            backgroundColor: input.palette.surfaceMuted,
            minWidth: 172,
          }}
        >
          <div style={{ display: "flex", fontSize: 12, fontWeight: 600, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 0.9 }}>
            {input.metaLabel}
          </div>
          <div style={{ display: "flex", marginTop: 4, fontSize: 16, fontWeight: 500, color: input.palette.textPrimary }}>
            {input.metaValue}
          </div>
        </div>
      </div>
    </div>
  );
}

export function IntroCard(input: {
  palette: ReportPalette;
  athleteName: string;
  athleteImage?: string | null;
  title: string;
  narrative: string;
  accentLabel: string;
  warning?: boolean;
}) {
  return (
    <Panel palette={input.palette} padding={24}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {input.athleteImage ? (
          <img
            src={input.athleteImage}
            alt={input.athleteName}
            width={30}
            height={30}
            style={{
              display: "flex",
              width: 30,
              height: 30,
              borderRadius: 999,
              objectFit: "cover",
              border: `1px solid ${input.warning ? withOpacity(input.palette.warning, 0.22) : input.palette.accentSoft}`,
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 30,
              height: 30,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: input.warning ? input.palette.warningSoft : input.palette.accentWash,
              color: input.warning ? input.palette.warning : input.palette.accentStrong,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {getInitials(input.athleteName)}
          </div>
        )}
        <div style={{ display: "flex", marginLeft: 10, fontSize: 15, fontWeight: 500, color: input.palette.textSecondary }}>
          {input.athleteName}
        </div>
      </div>

      <div style={{ display: "flex", marginTop: 18, fontSize: 42, lineHeight: 1.06, fontWeight: 500, color: input.palette.textPrimary }}>
        {input.title}
      </div>

      <div style={{ display: "flex", marginTop: 16, fontSize: 20, lineHeight: 1.35, fontWeight: 400, color: input.palette.textSecondary }}>
        {cleanNarrative(input.narrative)}
      </div>

      <div
        style={{
          display: "flex",
          width: 64,
          height: 3,
          borderRadius: 999,
          marginTop: "auto",
          backgroundColor: input.warning ? input.palette.warning : input.palette.accent,
        }}
      />

      <div style={{ display: "flex", marginTop: 14 }}>
        <Pill
          palette={input.palette}
          value={input.accentLabel}
          background={input.warning ? input.palette.warningSoft : input.palette.accentWash}
          color={input.warning ? input.palette.warning : input.palette.accentStrong}
          border={input.warning ? withOpacity(input.palette.warning, 0.18) : input.palette.accentSoft}
        />
      </div>
    </Panel>
  );
}

export function ReadinessCard(input: { metric: ReportMetric | null; palette: ReportPalette }) {
  const value = input.metric?.value ?? "—";
  const [mainValue, suffix] = splitMetricValue(value);
  const tone = input.metric?.tone ?? "neutral";
  const accent = tone === "warning" ? input.palette.warning : input.palette.accent;
  const soft = tone === "warning" ? input.palette.warningSoft : input.palette.accentWash;

  return (
    <Panel palette={input.palette} padding={26} subtle>
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        <div
          style={{
            display: "flex",
            width: 4,
            borderRadius: 999,
            marginRight: 22,
            backgroundColor: accent,
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 18, fontWeight: 500, color: input.palette.textSecondary, textTransform: "uppercase", letterSpacing: 1.1 }}>
              {input.metric?.label ?? "Prontidão"}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, borderRadius: 18, backgroundColor: soft, border: `1px solid ${withOpacity(accent, 0.18)}` }}>
              <div style={{ display: "flex", width: 18, height: 18, borderRadius: 999, backgroundColor: accent }} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", marginTop: 24 }}>
            <div style={{ display: "flex", fontSize: 88, lineHeight: 0.92, fontWeight: 500, color: accent }}>
              {mainValue}
            </div>
            {suffix ? (
              <div style={{ display: "flex", marginLeft: 8, marginBottom: 10, fontSize: 34, lineHeight: 1, fontWeight: 400, color: input.palette.textSecondary }}>
                {suffix}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", marginTop: 20, fontSize: 18, lineHeight: 1.35, fontWeight: 400, color: input.palette.textSecondary }}>
            {input.metric?.helper ?? getMetricInterpretation(input.metric)}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function ActivityHighlightCard(input: {
  palette: ReportPalette;
  metric: ReportMetric | null;
  insight?: string;
  sportLabel: string;
}) {
  return (
    <Panel palette={input.palette} padding={24} subtle>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 15, fontWeight: 600, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
            Destaque da sessão
          </div>
          <div style={{ display: "flex", marginLeft: 12 }}>
            <Pill palette={input.palette} value={input.sportLabel} background={input.palette.accentWash} color={input.palette.accentStrong} border={input.palette.accentSoft} />
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 16, fontSize: 48, lineHeight: 1.05, fontWeight: 500, color: input.palette.textPrimary }}>
          {input.metric?.value ?? "—"}
        </div>

        <div style={{ display: "flex", marginTop: 8, fontSize: 18, fontWeight: 500, color: input.palette.textSecondary }}>
          {input.metric?.label ?? "Métrica principal"}
        </div>

        <div style={{ display: "flex", marginTop: 16, fontSize: 19, lineHeight: 1.34, fontWeight: 400, color: input.palette.textSecondary }}>
          {cleanNarrative(input.insight ?? getMetricInterpretation(input.metric))}
        </div>

        <div style={{ display: "flex", marginTop: "auto", width: "100%", height: 10, borderRadius: 999, backgroundColor: input.palette.accentWash }}>
          <div style={{ display: "flex", width: "62%", height: 10, borderRadius: 999, backgroundColor: input.palette.accent }} />
        </div>
      </div>
    </Panel>
  );
}

export function MetricPanel(input: { metric: ReportMetric; palette: ReportPalette; compact?: boolean }) {
  const tone = input.metric.tone ?? "neutral";
  const borderColor = tone === "warning"
    ? withOpacity(input.palette.warning, 0.22)
    : tone === "accent"
      ? input.palette.accentSoft
      : input.palette.border;
  const backgroundColor = tone === "warning"
    ? input.palette.warningSoft
    : tone === "accent"
      ? input.palette.accentWash
      : input.palette.surfaceMuted;
  const valueColor = tone === "warning"
    ? input.palette.warning
    : tone === "accent"
      ? input.palette.accentStrong
      : input.palette.textPrimary;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: input.compact ? 134 : 156,
        padding: 18,
        borderRadius: 22,
        border: `1px solid ${borderColor}`,
        backgroundColor,
      }}
    >
      <div style={{ display: "flex", fontSize: 14, fontWeight: 500, color: input.palette.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {input.metric.label}
      </div>
      <div style={{ display: "flex", marginTop: 12, fontSize: input.compact ? 34 : 38, lineHeight: 1.05, fontWeight: 500, color: valueColor }}>
        {input.metric.value}
      </div>
      {input.metric.helper ? (
        <div style={{ display: "flex", marginTop: 10, fontSize: 15, lineHeight: 1.28, fontWeight: 400, color: input.palette.textMuted }}>
          {input.metric.helper}
        </div>
      ) : null}
    </div>
  );
}

export function DailyTrendCard(input: {
  chart?: ReportChart;
  palette: ReportPalette;
  chartPalette: ChartPalette;
}) {
  const points = (input.chart?.data ?? []).slice(0, 6);

  return (
    <Panel palette={input.palette} padding={22} subtle>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 14, fontWeight: 500, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 0.9 }}>
              Gráfico do dia
            </div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 18, lineHeight: 1.25, fontWeight: 500, color: input.palette.textPrimary }}>
              {input.chart?.title ?? "Leituras-chave do dia"}
            </div>
          </div>
          <Pill palette={input.palette} value="Daily" background={input.palette.accentWash} color={input.palette.accentStrong} border={input.palette.accentSoft} />
        </div>

        {points.length ? (
          <div style={{ display: "flex", width: "100%", marginTop: 16, justifyContent: "space-between" }}>
            {points.map((point, index) => (
              <div key={`${point.label}-${index}`} style={{ display: "flex", flexDirection: "column", width: `${100 / points.length}%`, paddingRight: index === points.length - 1 ? 0 : 6 }}>
                <div style={{ display: "flex", fontSize: 12, fontWeight: 500, color: input.palette.textMuted, textTransform: "uppercase" }}>
                  {point.label}
                </div>
                <div style={{ display: "flex", marginTop: 4, fontSize: 16, fontWeight: 500, color: input.palette.textPrimary }}>
                  {point.formattedValue ?? String(point.value)}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: "flex", width: "100%", flex: 1, marginTop: 18 }}>
          <LineInsightChart points={points} palette={input.palette} chartPalette={input.chartPalette} />
        </div>

        {input.chart?.note ? (
          <div style={{ display: "flex", marginTop: 14, fontSize: 15, lineHeight: 1.32, fontWeight: 400, color: input.palette.textMuted }}>
            {cleanNarrative(input.chart.note)}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function ActivityChartCard(input: {
  chart?: ReportChart;
  palette: ReportPalette;
  chartPalette: ChartPalette;
  frame: ReportFrame;
}) {
  const points = (input.chart?.data ?? []).slice(0, 6);

  return (
    <Panel palette={input.palette} padding={22} subtle>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 470 }}>
            <div style={{ display: "flex", fontSize: 14, fontWeight: 500, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 0.9 }}>
              Gráfico da sessão
            </div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 18, lineHeight: 1.25, fontWeight: 500, color: input.palette.textPrimary }}>
              {input.chart?.title ?? "Leitura visual da atividade"}
            </div>
          </div>
          <Pill palette={input.palette} value={getSportBadgeLabel(input.frame)} background={input.palette.accentWash} color={input.palette.accentStrong} border={input.palette.accentSoft} />
        </div>

        <div style={{ display: "flex", width: "100%", flex: 1, marginTop: 18 }}>
          <BarInsightChart points={points} palette={input.palette} chartPalette={input.chartPalette} />
        </div>

        {input.chart?.note ? (
          <div style={{ display: "flex", marginTop: 14, fontSize: 15, lineHeight: 1.32, fontWeight: 400, color: input.palette.textMuted }}>
            {cleanNarrative(input.chart.note)}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function RecommendationCard(input: {
  palette: ReportPalette;
  title: string;
  items: string[];
  insight?: string;
}) {
  return (
    <Panel palette={input.palette} padding={22} subtle>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", fontSize: 14, fontWeight: 500, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 0.9 }}>
          {input.title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
          {input.items.slice(0, 3).map((item, index) => (
            <div key={`${item}-${index}`} style={{ display: "flex", alignItems: "flex-start", marginTop: index === 0 ? 0 : 16 }}>
              <div style={{ display: "flex", width: 14, height: 14, borderRadius: 999, marginTop: 5, backgroundColor: input.palette.accent, flexShrink: 0 }} />
              <div style={{ display: "flex", marginLeft: 12, fontSize: 18, lineHeight: 1.34, fontWeight: 400, color: input.palette.textSecondary }}>
                {item}
              </div>
            </div>
          ))}
        </div>

        {input.insight ? (
          <div style={{ display: "flex", marginTop: "auto", fontSize: 15, lineHeight: 1.3, fontWeight: 400, color: input.palette.textMuted }}>
            {cleanNarrative(input.insight)}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function SportFocusCard(input: {
  palette: ReportPalette;
  title: string;
  items: string[];
  detail?: string;
  warning?: boolean;
}) {
  return (
    <Panel palette={input.palette} padding={22} subtle>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div style={{ display: "flex", fontSize: 14, fontWeight: 500, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 0.9 }}>
          {input.title}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
          {input.items.slice(0, 3).map((item, index) => (
            <div
              key={`${item}-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                minHeight: 56,
                paddingLeft: 14,
                paddingRight: 14,
                borderRadius: 16,
                border: `1px solid ${input.warning ? withOpacity(input.palette.warning, 0.18) : input.palette.border}`,
                backgroundColor: input.warning ? input.palette.warningSoft : input.palette.surfaceMuted,
                marginTop: index === 0 ? 0 : 12,
              }}
            >
              <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, backgroundColor: input.warning ? input.palette.warning : input.palette.accent, flexShrink: 0 }} />
              <div style={{ display: "flex", marginLeft: 10, fontSize: 16, lineHeight: 1.28, fontWeight: 400, color: input.palette.textSecondary }}>
                {item}
              </div>
            </div>
          ))}
        </div>

        {input.detail ? (
          <div style={{ display: "flex", marginTop: "auto", fontSize: 15, lineHeight: 1.3, fontWeight: 400, color: input.palette.textMuted }}>
            {input.detail}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function FooterRibbon(input: {
  palette: ReportPalette;
  brand: ReportBrandAssets;
  text: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        minHeight: 68,
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 18,
        paddingLeft: 18,
        paddingRight: 18,
        borderRadius: 18,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.palette.footerSurface,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", width: 710 }}>
        <div style={{ display: "flex", width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: input.palette.accentWash, color: input.palette.accentStrong, fontSize: 15, fontWeight: 500 }}>
          i
        </div>
        <div style={{ display: "flex", marginLeft: 10, fontSize: 15, lineHeight: 1.3, fontWeight: 400, color: input.palette.textSecondary }}>
          {input.text}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
        <img src={input.brand.logoMarkSrc} alt="Monograma Ryvano" width={34} height={34} />
      </div>
    </div>
  );
}

export function DailyReadinessGauge(input: {
  score: number;
  from: string;
  to: string;
  size?: number;
}) {
  const size = input.size ?? 150;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * input.score) / 100;

  return (
    <div style={{ display: "flex", width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="daily-readiness-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={input.from} />
            <stop offset="100%" stopColor={input.to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E6ECF3" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#daily-readiness-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 38, lineHeight: 1, fontWeight: 800, color: "#0F172A" }}>
            {input.score > 0 ? input.score : "—"}
          </div>
          <div style={{ display: "flex", marginLeft: 4, marginBottom: 5, fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>
            /100
          </div>
        </div>
      </div>
    </div>
  );
}

export function DailyBatterySegments(input: { toneColor: string; score: number }) {
  const segments = 12;
  const filled = Math.round((clampPercentage(input.score) / 100) * segments);

  return (
    <div style={{ display: "flex", width: "100%" }}>
      {Array.from({ length: segments }).map((_, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            flex: 1,
            height: 12,
            marginLeft: index === 0 ? 0 : 4,
            borderRadius: 4,
            backgroundColor: index < filled ? input.toneColor : "#E6ECF3",
            opacity: index < filled ? Math.max(0.76, 1 - index * 0.025) : 1,
          }}
        />
      ))}
    </div>
  );
}

export function DailyWhatsappMetricCard(input: {
  metric: DailyWhatsappMetricCardData;
  theme: DailyWhatsappTheme;
  palette: ReportPalette;
}) {
  const tone = getDailyToneColors(input.metric.tone ?? "neutral");

  return (
    <Panel palette={input.palette} padding={20}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            width: 38,
            height: 38,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: input.theme.soft,
            color: input.theme.accent,
            fontSize: input.metric.icon === "battery" ? 15 : 18,
            fontWeight: 800,
          }}
        >
          {getDailyMetricIcon(input.metric.icon)}
        </div>
        <div style={{ display: "flex", marginLeft: 12, fontSize: 12, lineHeight: 1.3, fontWeight: 800, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 0.9 }}>
          {input.metric.label}
        </div>
      </div>

      {input.metric.type === "score" ? (
        <>
          <div style={{ display: "flex", marginTop: 18, alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 40, lineHeight: 1, fontWeight: 800, color: input.palette.textPrimary }}>
              {input.metric.value.split("/")[0] ?? input.metric.value}
            </div>
            <div style={{ display: "flex", marginLeft: 6, marginBottom: 4, fontSize: 16, fontWeight: 700, color: "#94A3B8" }}>
              /100
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 15, color: input.palette.textSecondary }}>
            {input.metric.helper ?? "Leitura do sono regenerativo"}
          </div>
          <div style={{ display: "flex", width: 344, height: 8, marginTop: 16, borderRadius: 999, backgroundColor: "#E6ECF3", overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                width: `${clampPercentage(input.metric.score)}%`,
                height: 8,
                borderRadius: 999,
                backgroundColor: input.theme.accent,
              }}
            />
          </div>
        </>
      ) : null}

      {input.metric.type === "battery" ? (
        <>
          <div style={{ display: "flex", marginTop: 18, alignItems: "baseline" }}>
            <div style={{ display: "flex", fontSize: 38, lineHeight: 1, fontWeight: 800, color: input.palette.textPrimary }}>
              {input.metric.from ?? "—"}
            </div>
            <div style={{ display: "flex", marginLeft: 10, marginRight: 10, fontSize: 20, color: "#CBD5E1" }}>→</div>
            <div style={{ display: "flex", fontSize: 38, lineHeight: 1, fontWeight: 800, color: input.palette.textPrimary }}>
              {input.metric.to ?? "—"}
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 15, color: input.palette.textSecondary }}>
            {input.metric.helper ?? "Reserva energética do dia"}
          </div>
          <div style={{ display: "flex", width: 344, marginTop: 16 }}>
            <DailyBatterySegments toneColor={input.theme.accent} score={input.metric.to ?? 0} />
          </div>
        </>
      ) : null}

      {input.metric.type === "badge" ? (
        <>
          <div style={{ display: "flex", marginTop: 18, alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 40, lineHeight: 1, fontWeight: 800, color: input.palette.textPrimary }}>
              {input.metric.value.split(" ")[0] ?? input.metric.value}
            </div>
            <div style={{ display: "flex", marginLeft: 6, marginBottom: 4, fontSize: 16, fontWeight: 700, color: "#94A3B8" }}>
              {input.metric.value.split(" ").slice(1).join(" ")}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              alignSelf: "flex-start",
              marginTop: 14,
              paddingLeft: 12,
              paddingRight: 12,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: 999,
              backgroundColor: tone.background,
              color: tone.text,
              fontSize: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.8,
            }}
          >
            <div style={{ display: "flex", width: 8, height: 8, borderRadius: 999, marginRight: 8, backgroundColor: tone.dot }} />
            {input.metric.helper ?? getDailyToneLabel(input.metric.tone)}
          </div>
        </>
      ) : null}
    </Panel>
  );
}
