/* eslint-disable @next/next/no-img-element */

import type { ReactNode } from "react";

import type {
  DailyGarminSummaryTemplateData,
  ReportChart,
  ReportMetric,
  ReportRequest,
  ReportTheme,
  ReportThemeSport,
  ReportThemeVariant,
} from "@/lib/reports/types";

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1620;

type ReportFamily = NonNullable<ReportTheme["family"]>;

type ReportFrame = {
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

type ReportBrandAssets = {
  logoPrincipalSrc: string;
  logoMarkSrc: string;
};

type ReportPalette = {
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

type ChartPalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  neutral: string;
  fill: string;
};

type DailyWhatsappTheme = {
  label: string;
  from: string;
  to: string;
  accent: string;
  soft: string;
};

export function renderReportElement(request: ReportRequest, brand: ReportBrandAssets) {
  if (request.template === "daily-garmin-summary") {
    return <DailyGarminSummaryWhatsappCanvas data={request.data} brand={brand} />;
  }

  const frame = toReportFrame(request);
  const palette = getReportPalette(frame);

  if (frame.family === "daily") {
    return <DailyReportCanvas frame={frame} palette={palette} brand={brand} />;
  }

  if (frame.family === "activity") {
    return <ActivityReportCanvas frame={frame} palette={palette} brand={brand} />;
  }

  return <OperationalReportCanvas frame={frame} palette={palette} brand={brand} />;
}

function DailyGarminSummaryWhatsappCanvas(input: {
  data: DailyGarminSummaryTemplateData;
  brand: ReportBrandAssets;
}) {
  const theme = getDailyWhatsappTheme(input.data.theme?.sport ?? "default");
  const palette = getDailyWhatsappPalette(theme);
  const readinessMetric = getReportMetricByLabels(input.data.metrics, ["prontidao"]);
  const readinessTone = getDailyToneColors(input.data.visual?.readinessTone ?? readinessMetric?.tone ?? "neutral");
  const readinessScore = clampPercentage(input.data.visual?.readinessScore ?? parseScoreValue(readinessMetric?.value));
  const recommendations = getDailyWhatsappRecommendations(input.data);
  const metricCards = getDailyWhatsappMetricCards(input.data);
  const footerParts = [cleanFooter(input.data.footer), cleanFooter(input.data.cta)].filter(Boolean);
  const footerText = footerParts.length ? footerParts.join(" · ") : "Dados que guiam. Performance que evolui.";
  const overview = cleanNarrative(input.data.overview) || "Principais métricas de performance e prontidão para orientar sua decisão do dia.";

  return (
    <ReportPage palette={palette}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
        <div
          style={{
            position: "absolute",
            top: -48,
            right: -36,
            width: 220,
            height: 220,
            borderRadius: 999,
            backgroundColor: withOpacity(theme.to, 0.14),
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 318,
            left: -54,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: withOpacity(theme.from, 0.1),
          }}
        />

        <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
          <img src={input.brand.logoPrincipalSrc} alt="Logo Ryvano" width={176} height={34} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingLeft: 18,
              paddingRight: 10,
              paddingTop: 10,
              paddingBottom: 10,
              borderRadius: 999,
              border: `1px solid ${palette.border}`,
              backgroundColor: "#FFFFFF",
            }}
          >
            <div style={{ display: "flex", fontSize: 13, fontWeight: 800, color: palette.textSecondary, textTransform: "uppercase", letterSpacing: 0.9 }}>
              {input.data.reportType ?? "RELATÓRIO PERFORMANCE"}
            </div>
            <div style={{ display: "flex", marginLeft: 10, marginRight: 10, fontSize: 13, color: "#CBD5E1" }}>|</div>
            <div style={{ display: "flex", fontSize: 13, fontWeight: 800, color: theme.accent, textTransform: "uppercase", letterSpacing: 0.9 }}>
              {theme.label}
            </div>
            <div
              style={{
                display: "flex",
                width: 34,
                height: 34,
                marginLeft: 12,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.soft,
                color: theme.accent,
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {theme.label.slice(0, 1)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", width: "100%", marginTop: 24 }}>
          <div style={{ display: "flex", width: 344, minHeight: 236, marginRight: 16 }}>
            <Panel palette={palette} padding={24}>
              <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
                {input.data.athleteImage ? (
                  <img
                    src={input.data.athleteImage}
                    alt={input.data.athleteName}
                    width={78}
                    height={78}
                    style={{
                      display: "flex",
                      width: 78,
                      height: 78,
                      borderRadius: 999,
                      objectFit: "cover",
                      border: `3px solid ${withOpacity(theme.accent, 0.2)}`,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      width: 78,
                      height: 78,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.soft,
                      color: theme.accent,
                      fontSize: 28,
                      fontWeight: 800,
                      border: `3px solid ${withOpacity(theme.accent, 0.2)}`,
                    }}
                  >
                    {getInitials(input.data.athleteName)}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", marginLeft: 16, flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 11, fontWeight: 700, color: palette.textMuted, textTransform: "uppercase", letterSpacing: 1.1 }}>
                    Atleta
                  </div>
                  <div style={{ display: "flex", marginTop: 6, fontSize: 30, lineHeight: 1.05, fontWeight: 800, color: palette.textPrimary }}>
                    {input.data.athleteName}
                  </div>
                  <div style={{ display: "flex", marginTop: 12 }}>
                    <Pill
                      palette={palette}
                      value="GARMIN + RYVANO"
                      background={theme.soft}
                      color={theme.accent}
                      border={withOpacity(theme.accent, 0.16)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", marginTop: 18, fontSize: 16, lineHeight: 1.45, color: palette.textSecondary }}>
                Leitura premium do dia com foco em recuperação, prontidão e sinais fisiológicos-chave antes do treino.
              </div>
            </Panel>
          </div>

          <div style={{ display: "flex", flex: 1, minHeight: 236 }}>
            <Panel palette={palette} padding={26}>
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", width: 500, marginRight: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", fontSize: 12, fontWeight: 600, color: palette.textMuted, textTransform: "uppercase", letterSpacing: 0.9 }}>
                    <div
                      style={{
                        display: "flex",
                        width: 22,
                        height: 22,
                        marginRight: 8,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 999,
                        backgroundColor: theme.soft,
                        color: theme.accent,
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      D
                    </div>
                    {input.data.dateLabel}
                  </div>
                  <div style={{ display: "flex", marginTop: 14, fontSize: 14, fontWeight: 800, color: palette.textMuted, textTransform: "uppercase", letterSpacing: 1.2 }}>
                    Prontidão
                  </div>
                  <div style={{ display: "flex", marginTop: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 14,
                        paddingRight: 14,
                        paddingTop: 9,
                        paddingBottom: 9,
                        borderRadius: 999,
                        backgroundColor: readinessTone.background,
                        color: readinessTone.text,
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          marginRight: 8,
                          backgroundColor: readinessTone.dot,
                        }}
                      />
                      {input.data.visual?.readinessLabel ?? "RECUPERAÇÃO MODERADA"}
                    </div>
                  </div>
                  <div style={{ display: "flex", marginTop: 16, fontSize: 18, lineHeight: 1.45, color: palette.textSecondary }}>
                    {input.data.visual?.readinessDescription ?? overview}
                  </div>
                </div>

                <DailyReadinessGauge score={readinessScore} from={theme.from} to={theme.to} />
              </div>
            </Panel>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 20 }}>
          <div style={{ display: "flex", fontSize: 46, lineHeight: 1.02, fontWeight: 800, color: palette.textPrimary, textTransform: "uppercase" }}>
            Resumo de desempenho do dia
          </div>
          <div style={{ display: "flex", marginTop: 10, maxWidth: 690, fontSize: 19, lineHeight: 1.45, color: palette.textSecondary }}>
            {overview}
          </div>
        </div>

        <div style={{ display: "flex", width: "100%", marginTop: 22 }}>
          {metricCards.slice(0, 2).map((metric, index) => (
            <div
              key={`${metric.label}-${index}`}
              style={{
                display: "flex",
                width: "50%",
                paddingRight: index === 0 ? 8 : 0,
                paddingLeft: index === 1 ? 8 : 0,
              }}
            >
              <DailyWhatsappMetricCard metric={metric} theme={theme} palette={palette} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", width: "100%", marginTop: 16 }}>
          {metricCards.slice(2, 4).map((metric, index) => (
            <div
              key={`${metric.label}-${index + 2}`}
              style={{
                display: "flex",
                width: "50%",
                paddingRight: index === 0 ? 8 : 0,
                paddingLeft: index === 1 ? 8 : 0,
              }}
            >
              <DailyWhatsappMetricCard metric={metric} theme={theme} palette={palette} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", width: "100%", minHeight: 324, marginTop: 16, flex: 1 }}>
          <Panel palette={palette} padding={24}>
            <div style={{ display: "flex", width: "100%", height: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", width: 660, paddingRight: 20 }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      width: 38,
                      height: 38,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.soft,
                      color: theme.accent,
                      fontSize: 18,
                      fontWeight: 800,
                    }}
                  >
                    ★
                  </div>
                  <div style={{ display: "flex", marginLeft: 12, fontSize: 16, fontWeight: 800, color: palette.textPrimary, textTransform: "uppercase", letterSpacing: 1.1 }}>
                    Recomendação do dia
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
                  {recommendations.map((item, index) => (
                    <div key={`${item}-${index}`} style={{ display: "flex", width: "100%", marginTop: index === 0 ? 0 : 14, alignItems: "flex-start" }}>
                      <div
                        style={{
                          display: "flex",
                          width: 18,
                          height: 18,
                          marginTop: 2,
                          marginRight: 10,
                          borderRadius: 999,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: theme.soft,
                          color: theme.accent,
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        ✓
                      </div>
                      <div style={{ display: "flex", flex: 1, fontSize: 20, lineHeight: 1.42, color: palette.textSecondary }}>
                        {item}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", marginLeft: "auto", width: 260, alignItems: "flex-end", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  {[
                    { label: theme.label.slice(0, 3).toUpperCase(), color: theme.accent },
                    { label: "VFC", color: theme.to },
                    { label: "SONO", color: theme.from },
                  ].map((item, index) => (
                    <div
                      key={`${item.label}-${index}`}
                      style={{
                        display: "flex",
                        width: 72,
                        height: 72,
                        marginLeft: index === 0 ? 0 : 10,
                        borderRadius: 999,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: item.color,
                        color: "#FFFFFF",
                        fontSize: item.label.length > 3 ? 11 : 13,
                        fontWeight: 800,
                        letterSpacing: 0.8,
                      }}
                    >
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <FooterRibbon palette={palette} brand={input.brand} text={footerText} />
      </div>
    </ReportPage>
  );
}

type DailyWhatsappMetricCardData = {
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

function DailyWhatsappMetricCard(input: {
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
          <div style={{ display: "flex", width: "100%", height: 8, marginTop: 16, borderRadius: 999, backgroundColor: "#E6ECF3", overflow: "hidden" }}>
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
          <div style={{ display: "flex", width: "100%", marginTop: 16 }}>
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

function DailyReadinessGauge(input: {
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

function DailyBatterySegments(input: { toneColor: string; score: number }) {
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

function DailyReportCanvas(input: {
  frame: ReportFrame;
  palette: ReportPalette;
  brand: ReportBrandAssets;
}) {
  const readinessMetric = getPrimaryMetric(input.frame.metrics);
  const secondaryMetrics = input.frame.metrics.filter((metric) => metric !== readinessMetric).slice(0, 4);
  const checklist = input.frame.checklist.length ? input.frame.checklist.slice(0, 3) : buildDailyChecklist(input.frame.metrics);
  const chartPalette = getChartPalette(input.frame, input.palette);
  const supportMetrics = secondaryMetrics.slice(0, 2);

  return (
    <ReportPage palette={input.palette}>
      <HeaderBar
        palette={input.palette}
        brand={input.brand}
        metaLabel="Data"
        metaValue={input.frame.dateLabel}
      />

      <div style={{ display: "flex", width: "100%", marginTop: 34 }}>
        <div style={{ display: "flex", width: 360, minHeight: 246, marginRight: 18 }}>
          <IntroCard
            palette={input.palette}
            athleteName={input.frame.athleteName}
            athleteImage={input.frame.athleteImage}
            title={input.frame.title}
            narrative={input.frame.narrative ?? "Visão integrada da sua condição física e recuperação."}
            accentLabel="Resumo diário"
          />
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 246 }}>
          <ReadinessCard metric={readinessMetric} palette={input.palette} />
        </div>
      </div>

      {secondaryMetrics.length ? (
        <div style={{ display: "flex", width: "100%", marginTop: 18 }}>
          {secondaryMetrics.map((metric, index) => (
            <div
              key={`${metric.label}-${index}`}
              style={{
                display: "flex",
                width: `${100 / secondaryMetrics.length}%`,
                paddingLeft: index === 0 ? 0 : 7,
                paddingRight: index === secondaryMetrics.length - 1 ? 0 : 7,
              }}
            >
              <MetricPanel metric={metric} palette={input.palette} compact={false} />
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", width: "100%", marginTop: 18 }}>
        <div style={{ display: "flex", width: 560, minHeight: 372, marginRight: 18 }}>
          <DailyTrendCard chart={input.frame.chart} palette={input.palette} chartPalette={chartPalette} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 372 }}>
          <div style={{ display: "flex", width: "100%", minHeight: 372 }}>
            <RecommendationCard
              palette={input.palette}
              title="Recomendação do dia"
              items={checklist}
              insight={input.frame.insight}
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", width: "100%", marginTop: 18, flex: 1 }}>
        <div style={{ display: "flex", width: 560, marginRight: 18 }}>
          <SportFocusCard
            palette={input.palette}
            title="Leitura clínica rápida"
            items={[
              "Prontidão como métrica síntese para modular carga e intensidade.",
              "Sono, VFC e frequência cardíaca ajudam a contextualizar recuperação.",
              "Use este resumo como triagem antes da decisão final de treino.",
            ]}
            detail={cleanNarrative(input.frame.footer)}
          />
        </div>

        <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
          {supportMetrics.map((metric, index) => (
            <div key={`${metric.label}-${index}`} style={{ display: "flex", width: "100%", marginTop: index === 0 ? 0 : 14 }}>
              <MetricPanel metric={metric} palette={input.palette} compact />
            </div>
          ))}
          <div style={{ display: "flex", flex: 1, marginTop: supportMetrics.length ? 14 : 0 }}>
            <SportFocusCard
              palette={input.palette}
              title="Leitura operacional"
              items={[
                "Card segue modelo visual do resumo diário Ryvano.",
                "Fundo claro, bordas suaves e azul Ryvano como destaque principal.",
                "Dados organizados para leitura rápida dentro do WhatsApp.",
              ]}
            />
          </div>
        </div>
      </div>

      <FooterRibbon palette={input.palette} brand={input.brand} text={getFooterText(input.frame)} />
    </ReportPage>
  );
}

function ActivityReportCanvas(input: {
  frame: ReportFrame;
  palette: ReportPalette;
  brand: ReportBrandAssets;
}) {
  const chartPalette = getChartPalette(input.frame, input.palette);
  const metrics = input.frame.metrics.slice(0, 6);
  const primaryMetric = metrics[0] ?? null;
  const topMetrics = metrics.slice(0, 4);
  const lowerMetrics = metrics.slice(4, 6);
  const checklist = input.frame.checklist.slice(0, 3);
  const sportLabel = getSportBadgeLabel(input.frame);

  return (
    <ReportPage palette={input.palette}>
      <HeaderBar
        palette={input.palette}
        brand={input.brand}
        metaLabel="Sessão"
        metaValue={input.frame.dateLabel}
        badge={sportLabel}
      />

      <div style={{ display: "flex", width: "100%", marginTop: 34 }}>
        <div style={{ display: "flex", width: 510, minHeight: 246, marginRight: 18 }}>
          <IntroCard
            palette={input.palette}
            athleteName={input.frame.athleteName}
            athleteImage={input.frame.athleteImage}
            title={input.frame.title}
            narrative={input.frame.narrative ?? "Síntese visual da sessão com foco nas métricas que mais movem sua performance."}
            accentLabel={sportLabel}
          />
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 246 }}>
          <ActivityHighlightCard
            palette={input.palette}
            metric={primaryMetric}
            insight={input.frame.insight}
            sportLabel={sportLabel}
          />
        </div>
      </div>

      {topMetrics.length ? (
        <div style={{ display: "flex", width: "100%", marginTop: 18 }}>
          {topMetrics.map((metric, index) => (
            <div
              key={`${metric.label}-${index}`}
              style={{
                display: "flex",
                width: `${100 / topMetrics.length}%`,
                paddingLeft: index === 0 ? 0 : 7,
                paddingRight: index === topMetrics.length - 1 ? 0 : 7,
              }}
            >
              <MetricPanel metric={metric} palette={input.palette} compact={false} />
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", width: "100%", marginTop: 18 }}>
        <div style={{ display: "flex", width: 640, minHeight: 382, marginRight: 18 }}>
          <ActivityChartCard chart={input.frame.chart} palette={input.palette} chartPalette={chartPalette} frame={input.frame} />
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 382 }}>
          <SportFocusCard
            palette={input.palette}
            title="Leituras rápidas"
            items={checklist.length ? checklist : buildActivityChecklist(input.frame)}
            detail={cleanNarrative(input.frame.insight ?? input.frame.footer)}
          />
        </div>
      </div>

      <div style={{ display: "flex", width: "100%", marginTop: 18, flex: 1 }}>
        <div style={{ display: "flex", width: 640, marginRight: 18 }}>
          <SportFocusCard
            palette={input.palette}
            title="Leitura técnica da modalidade"
            items={[
              `Paleta do gráfico adaptada para ${sportLabel.toLowerCase()}.`,
              "Hierarquia visual prioriza métrica principal, gráfico e interpretação rápida.",
              "Template segue família visual do resumo Ryvano com adaptação por esporte.",
            ]}
            detail={cleanNarrative(input.frame.footer)}
          />
        </div>

        <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
          {lowerMetrics.map((metric, index) => (
            <div key={`${metric.label}-${index}`} style={{ display: "flex", width: "100%", marginTop: index === 0 ? 0 : 14 }}>
              <MetricPanel metric={metric} palette={input.palette} compact />
            </div>
          ))}
          <div style={{ display: "flex", flex: 1, marginTop: lowerMetrics.length ? 14 : 0 }}>
            <SportFocusCard
              palette={input.palette}
              title="Padrão visual"
              items={[
                "Fundo claro e premium para facilitar leitura no WhatsApp.",
                "Cores do gráfico trocam conforme a modalidade praticada.",
                "Layout menos rígido, mais editorial e com melhor ocupação vertical.",
              ]}
            />
          </div>
        </div>
      </div>

      <FooterRibbon palette={input.palette} brand={input.brand} text={getFooterText(input.frame)} />
    </ReportPage>
  );
}

function OperationalReportCanvas(input: {
  frame: ReportFrame;
  palette: ReportPalette;
  brand: ReportBrandAssets;
}) {
  const checklist = input.frame.checklist.slice(0, 3);
  const metrics = input.frame.metrics.slice(0, 3);
  const chartPalette = getChartPalette(input.frame, input.palette);

  return (
    <ReportPage palette={input.palette}>
      <HeaderBar
        palette={input.palette}
        brand={input.brand}
        metaLabel={input.frame.family === "reconnect" ? "Integração" : "Status"}
        metaValue={input.frame.badge}
      />

      <div style={{ display: "flex", width: "100%", marginTop: 24 }}>
        <div style={{ display: "flex", width: input.frame.chart ? 560 : 640, marginRight: 18 }}>
          <IntroCard
            palette={input.palette}
            athleteName={input.frame.athleteName}
            athleteImage={input.frame.athleteImage}
            title={input.frame.title}
            narrative={input.frame.narrative ?? "Atualização operacional pronta para leitura rápida no WhatsApp."}
            accentLabel={input.frame.status === "warning" ? "Ação necessária" : "Status atualizado"}
            warning={input.frame.status === "warning"}
          />
        </div>

        <div style={{ display: "flex", flex: 1 }}>
          <SportFocusCard
            palette={input.palette}
            title={input.frame.status === "warning" ? "Próximos passos" : "Leituras rápidas"}
            items={checklist.length ? checklist : buildActivityChecklist(input.frame)}
            detail={cleanNarrative(input.frame.insight ?? input.frame.footer)}
            warning={input.frame.status === "warning"}
          />
        </div>
      </div>

      {metrics.length ? (
        <div style={{ display: "flex", width: "100%", marginTop: 18 }}>
          {metrics.map((metric, index) => (
            <div
              key={`${metric.label}-${index}`}
              style={{
                display: "flex",
                width: `${100 / metrics.length}%`,
                paddingLeft: index === 0 ? 0 : 7,
                paddingRight: index === metrics.length - 1 ? 0 : 7,
              }}
            >
              <MetricPanel metric={metric} palette={input.palette} compact />
            </div>
          ))}
        </div>
      ) : null}

      {input.frame.chart ? (
        <div style={{ display: "flex", width: "100%", marginTop: 18, flex: 1 }}>
          <ActivityChartCard chart={input.frame.chart} palette={input.palette} chartPalette={chartPalette} frame={input.frame} />
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1 }} />
      )}

      <FooterRibbon palette={input.palette} brand={input.brand} text={getFooterText(input.frame)} />
    </ReportPage>
  );
}

function ReportPage(input: { palette: ReportPalette; children: ReactNode }) {
  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        display: "flex",
        backgroundColor: input.palette.pageBackground,
        padding: 36,
        fontFamily: 'Geist, Inter, "Helvetica Neue", Arial, sans-serif',
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

function HeaderBar(input: {
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

function IntroCard(input: {
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

function ReadinessCard(input: { metric: ReportMetric | null; palette: ReportPalette }) {
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

function ActivityHighlightCard(input: {
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

function MetricPanel(input: { metric: ReportMetric; palette: ReportPalette; compact?: boolean }) {
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

function DailyTrendCard(input: {
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

function ActivityChartCard(input: {
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

function RecommendationCard(input: {
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

function SportFocusCard(input: {
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

function FooterRibbon(input: {
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

function Panel(input: {
  palette: ReportPalette;
  children: ReactNode;
  padding: number;
  subtle?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        borderRadius: 24,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.subtle ? input.palette.surfaceStrong : input.palette.surfaceMuted,
        padding: input.padding,
      }}
    >
      {input.children}
    </div>
  );
}

function Pill(input: {
  palette: ReportPalette;
  value: string;
  background: string;
  color: string;
  border: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 8,
        paddingBottom: 8,
        borderRadius: 999,
        border: `1px solid ${input.border}`,
        backgroundColor: input.background,
        fontSize: 13,
        fontWeight: 600,
        color: input.color,
        textTransform: "uppercase",
        letterSpacing: 0.8,
      }}
    >
      {input.value}
    </div>
  );
}

function LineInsightChart(input: {
  points: ReportChart["data"];
  palette: ReportPalette;
  chartPalette: ChartPalette;
}) {
  if (!input.points.length) {
    return <ChartEmptyState palette={input.palette} label="Sem dados suficientes para traçar linha do dia." />;
  }

  const width = 500;
  const height = 180;
  const paddingLeft = 22;
  const paddingRight = 18;
  const paddingTop = 18;
  const paddingBottom = 18;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const maxValue = Math.max(...input.points.map((point) => point.value), 1);
  const step = input.points.length === 1 ? 0 : plotWidth / (input.points.length - 1);
  const coordinates = input.points.map((point, index) => ({
    x: paddingLeft + step * index,
    y: paddingTop + plotHeight - (point.value / maxValue) * plotHeight,
  }));

  return (
    <div
      style={{
        display: "flex",
        width: width,
        height: height,
        position: "relative",
        overflow: "hidden",
        borderRadius: 18,
        backgroundColor: input.palette.surfaceMuted,
      }}
    >
      {[0.25, 0.5, 0.75, 1].map((stepValue) => {
        const y = paddingTop + plotHeight - plotHeight * stepValue;
        return (
          <div
            key={stepValue}
            style={{
              position: "absolute",
              left: paddingLeft,
              top: y,
              width: width - paddingLeft - paddingRight,
              height: 1,
              backgroundColor: input.palette.grid,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: paddingLeft,
          top: paddingTop + plotHeight * 0.32,
          width: width - paddingLeft - paddingRight,
          height: plotHeight * 0.72,
          borderTopLeftRadius: 180,
          borderTopRightRadius: 180,
          backgroundColor: input.chartPalette.fill,
        }}
      />

      {coordinates.slice(0, -1).map((coordinate, index) => {
        const next = coordinates[index + 1];

        if (!next) {
          return null;
        }

        const deltaX = next.x - coordinate.x;
        const deltaY = next.y - coordinate.y;
        const length = Math.sqrt(deltaX ** 2 + deltaY ** 2);
        const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

        return (
          <div
            key={`${coordinate.x}-${coordinate.y}-${next.x}-${next.y}`}
            style={{
              position: "absolute",
              left: coordinate.x,
              top: coordinate.y - 2,
              width: length,
              height: 4,
              borderRadius: 999,
              backgroundColor: input.chartPalette.primary,
              transformOrigin: "0 50%",
              transform: `rotate(${angle}deg)`,
            }}
          />
        );
      })}

      {coordinates.map((coordinate, index) => (
        <div
          key={`${coordinate.x}-${coordinate.y}-${index}`}
          style={{
            position: "absolute",
            left: coordinate.x - (index === coordinates.length - 1 ? 9 : 6),
            top: coordinate.y - (index === coordinates.length - 1 ? 9 : 6),
            width: index === coordinates.length - 1 ? 18 : 12,
            height: index === coordinates.length - 1 ? 18 : 12,
            borderRadius: 999,
            backgroundColor: "#FFFFFF",
            border: `3px solid ${index === coordinates.length - 1 ? input.chartPalette.secondary : input.chartPalette.primary}`,
          }}
        />
      ))}
    </div>
  );
}

function BarInsightChart(input: {
  points: ReportChart["data"];
  palette: ReportPalette;
  chartPalette: ChartPalette;
}) {
  if (!input.points.length) {
    return <ChartEmptyState palette={input.palette} label="Sem dados suficientes para gerar gráfico da sessão." />;
  }

  const maxValue = Math.max(...input.points.map((point) => point.value), 1);

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "flex-end" }}>
      {input.points.map((point, index) => {
        const fill = getPointBarColor(point, index, input.chartPalette, input.palette);
        const chipFill = point.tone === "warning"
          ? input.palette.warningSoft
          : point.tone === "neutral"
            ? input.palette.surfaceMuted
            : withOpacity(fill, 0.12);
        const barHeight = Math.max(24, Math.round((point.value / maxValue) * 146));

        return (
          <div
            key={`${point.label}-${index}`}
            style={{
              display: "flex",
              flexDirection: "column",
              width: `${100 / input.points.length}%`,
              height: "100%",
              paddingLeft: index === 0 ? 0 : 8,
              paddingRight: index === input.points.length - 1 ? 0 : 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 36,
                paddingLeft: 8,
                paddingRight: 8,
                borderRadius: 16,
                border: `1px solid ${withOpacity(fill, 0.18)}`,
                backgroundColor: chipFill,
                fontSize: 13,
                fontWeight: 600,
                color: input.palette.textPrimary,
                textAlign: "center",
              }}
            >
              {point.formattedValue ?? String(point.value)}
            </div>
            <div style={{ display: "flex", width: "100%", flex: 1, alignItems: "flex-end", marginTop: 14 }}>
              <div style={{ display: "flex", width: "100%", height: 154, alignItems: "flex-end", borderBottom: `1px solid ${input.palette.grid}` }}>
                <div
                  style={{
                    display: "flex",
                    width: "100%",
                    height: barHeight,
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    backgroundColor: fill,
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", textAlign: "center", marginTop: 10, fontSize: 13, lineHeight: 1.2, fontWeight: 500, color: input.palette.textMuted }}>
              {point.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChartEmptyState(input: { palette: ReportPalette; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 20,
        border: `1px dashed ${input.palette.border}`,
        backgroundColor: input.palette.surfaceMuted,
        fontSize: 15,
        fontWeight: 400,
        color: input.palette.textMuted,
        textAlign: "center",
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      {input.label}
    </div>
  );
}

function toReportFrame(request: ReportRequest): ReportFrame {
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
    case "post-activity-report":
      return {
        athleteName: request.data.athleteName,
        athleteImage: request.data.athleteImage,
        title: request.data.activityLabel,
        dateLabel: request.data.occurredAtLabel,
        narrative: request.data.summary,
        insight: request.data.insight,
        metrics: request.data.metrics,
        checklist: request.data.chips,
        chart: request.data.chart,
        footer: request.data.footer,
        status: "default",
        badge: request.data.activityLabel,
        family: request.data.theme?.family ?? "activity",
        theme: request.data.theme ?? { family: "activity", sport: request.data.sport ?? "default", variant: "pearl" },
      };
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
    default:
      return assertNever(request);
  }
}

function getReportPalette(frame: ReportFrame): ReportPalette {
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

function getChartPalette(frame: ReportFrame, palette: ReportPalette): ChartPalette {
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

function getAccentColor(
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

function getPrimaryMetric(metrics: ReportMetric[]) {
  return metrics.find((metric) => normalizeLabel(metric.label).includes("prontid")) ?? metrics[0] ?? null;
}

function getPointBarColor(
  point: ReportChart["data"][number],
  index: number,
  chartPalette: ChartPalette,
  palette: ReportPalette,
) {
  if (point.tone === "warning") {
    return palette.warning;
  }

  if (point.tone === "neutral") {
    return chartPalette.neutral;
  }

  const cycle = [chartPalette.primary, chartPalette.secondary, chartPalette.tertiary];
  return cycle[index % cycle.length] ?? chartPalette.primary;
}

function splitMetricValue(value: string) {
  const slashIndex = value.indexOf("/");

  if (slashIndex === -1) {
    return [value, ""] as const;
  }

  return [value.slice(0, slashIndex), value.slice(slashIndex)] as const;
}

function getMetricInterpretation(metric: ReportMetric | null | undefined) {
  if (!metric) {
    return "Leitura principal pronta para interpretação.";
  }

  if (metric.tone === "warning") {
    return "Leitura abaixo da faixa ideal no momento.";
  }

  if (metric.tone === "accent") {
    return "Leitura consistente para sustentar boa tomada de decisão.";
  }

  return "Leitura intermediária, pedindo contexto antes de ajustar carga.";
}

function buildDailyChecklist(metrics: ReportMetric[]) {
  const readiness = metrics.find((metric) => normalizeLabel(metric.label).includes("prontid"));
  const sleep = metrics.find((metric) => normalizeLabel(metric.label).includes("sleep") || normalizeLabel(metric.label).includes("sono"));
  const battery = metrics.find((metric) => normalizeLabel(metric.label).includes("battery"));

  return [
    readiness?.tone === "warning"
      ? "Priorize recuperação e evite intensidade alta se a percepção subjetiva confirmar fadiga."
      : readiness?.tone === "accent"
        ? "Pode avançar com sessão moderada se sensação corporal e agenda do dia estiverem favoráveis."
        : "Prefira carga controlada e reavalie resposta ao longo do dia.",
    sleep?.tone === "warning"
      ? "Sono pede atenção antes de aumentar carga, principalmente em treino-chave."
      : "Recuperação noturna trouxe base útil para decisões mais seguras no treino.",
    battery?.tone === "warning"
      ? "Monitore energia percebida e reduza volume se houver queda ao longo do dia."
      : "Observe energia, sinais musculares e resposta cardiovascular para refinar a sessão.",
  ];
}

function buildActivityChecklist(frame: ReportFrame) {
  return [
    `Modalidade em foco: ${getSportBadgeLabel(frame)}.`,
    "Use este card para leitura rápida antes de abrir análise detalhada.",
    "Compare sensação subjetiva com as métricas centrais da sessão.",
  ];
}

function getSportBadgeLabel(frame: ReportFrame) {
  const sport = frame.theme.sport ?? "default";

  if (sport === "open-water") {
    return "Águas abertas";
  }

  if (sport === "mtb") {
    return "MTB";
  }

  if (sport === "trail-run") {
    return "Trail run";
  }

  if (sport === "stand-up-paddle") {
    return "Stand up paddle";
  }

  if (sport === "crossfit") {
    return "CrossFit";
  }

  if (sport === "gym") {
    return "Força";
  }

  if (sport === "football") {
    return "Futebol";
  }

  if (sport === "futsal") {
    return "Futsal";
  }

  if (sport === "basketball") {
    return "Basquete";
  }

  if (sport === "volleyball") {
    return "Vôlei";
  }

  if (sport === "tennis") {
    return "Tênis";
  }

  if (sport === "padel") {
    return "Padel";
  }

  if (sport === "rowing") {
    return "Remo";
  }

  if (sport === "kayak") {
    return "Caiaque";
  }

  if (sport === "swim") {
    return "Natação";
  }

  if (sport === "bike") {
    return "Bike";
  }

  if (sport === "run") {
    return "Corrida";
  }

  if (sport === "walking") {
    return "Caminhada";
  }

  if (sport === "hiking") {
    return "Hiking";
  }

  if (sport === "triathlon") {
    return "Triathlon";
  }

  if (sport === "duathlon") {
    return "Duathlon";
  }

  if (sport === "aquathlon") {
    return "Aquathlon";
  }

  if (sport === "surf") {
    return "Surf";
  }

  return frame.family === "activity" ? "Performance" : "Ryvano";
}

function getFooterText(frame: ReportFrame) {
  const cleaned = cleanFooter(frame.footer);

  if (cleaned) {
    return cleaned;
  }

  if (frame.family === "daily") {
    return "Dados que guiam. Performance que evolui.";
  }

  if (frame.family === "activity") {
    return "Leitura visual premium da sessão com foco no que realmente importa.";
  }

  if (frame.family === "warning") {
    return "Atualização operacional pronta para ação com leitura rápida e clara.";
  }

  if (frame.family === "reconnect") {
    return "Reconexão orientada para restaurar integração e continuidade dos relatórios.";
  }

  return "Mesmo motor visual dos cards reais para validar renderização e mídia final.";
}

function cleanNarrative(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function cleanFooter(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const cleaned = value
    .replace(/https?:\/\/\S+/g, "")
    .replace(/Painel completo:/gi, "")
    .replace(/Conferir integração:/gi, "")
    .replace(/Acesso direto para revalidar integração:/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

function getDailyWhatsappTheme(sport: ReportThemeSport) {
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

function getDailyWhatsappPalette(theme: DailyWhatsappTheme): ReportPalette {
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

function getDailyWhatsappMetricCards(data: DailyGarminSummaryTemplateData): DailyWhatsappMetricCardData[] {
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

function getDailyWhatsappRecommendations(data: DailyGarminSummaryTemplateData) {
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

function getDailyToneColors(tone: ReportMetric["tone"] | undefined) {
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

function getDailyToneLabel(tone: ReportMetric["tone"] | undefined) {
  if (tone === "accent") {
    return "ÓTIMA";
  }

  if (tone === "warning") {
    return "ATENÇÃO";
  }

  return "BALANCEADA";
}

function getDailyMetricIcon(icon: DailyWhatsappMetricCardData["icon"]) {
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

function getReportMetricByLabels(metrics: ReportMetric[], labels: string[]) {
  return metrics.find((metric) => labels.some((label) => normalizeLabel(metric.label).includes(label)));
}

function parseScoreValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const match = value.match(/(\d{1,3})/);

  return match ? clampPercentage(Number(match[1])) : 0;
}

function parseBodyBatteryRange(value: string | null | undefined) {
  if (!value) {
    return { from: null, to: null };
  }

  const matches = value.match(/\d+/g)?.map(Number) ?? [];

  if (matches.length >= 2) {
    return { from: matches[0], to: matches[1] };
  }

  if (matches.length === 1) {
    return { from: null, to: matches[0] };
  }

  return { from: null, to: null };
}

function formatBadgeValue(value: number | null | undefined, unit: string) {
  return value === null || value === undefined ? "—" : `${Math.round(value)} ${unit}`;
}

function clampPercentage(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (!parts.length) {
    return "RY";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function normalizeLabel(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function withOpacity(hex: string, opacity: number) {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized.split("").map((value) => `${value}${value}`).join("")
    : normalized;
  const red = Number.parseInt(safe.slice(0, 2), 16);
  const green = Number.parseInt(safe.slice(2, 4), 16);
  const blue = Number.parseInt(safe.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function assertNever(value: never): never {
  throw new Error(`Template não suportado: ${JSON.stringify(value)}`);
}
