import type { ReportChart, ReportMetric, ReportRequest } from "@/lib/reports/types";

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1080;

export function renderReportElement(request: ReportRequest) {
  const frame = toReportFrame(request);
  const palette = frame.status === "warning"
    ? {
        accent: "#D88A32",
        accentSoft: "#F6C27A",
        panelBorder: "#5C3C1C",
        panelBackground: "#25170D",
      }
    : {
        accent: "#5B84FF",
        accentSoft: "#9DB8FF",
        panelBorder: "#24365F",
        panelBackground: "#121B30",
      };

  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#060A13",
        color: "#F6F9FF",
        fontFamily: "Geist, Arial, sans-serif",
        padding: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          borderRadius: 40,
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "#0D1322",
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            borderRadius: 34,
            border: "1px solid rgba(255,255,255,0.10)",
            backgroundColor: palette.panelBackground,
            padding: 32,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", width: 760 }}>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 2,
                color: "rgba(233,240,255,0.76)",
                textTransform: "uppercase",
              }}
            >
              {frame.eyebrow}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 22,
                fontSize: 44,
                lineHeight: 1.18,
                fontWeight: 700,
                color: "#F6F9FF",
              }}
            >
              {frame.title}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 24,
                lineHeight: 1.35,
                fontWeight: 500,
                color: "rgba(233,240,255,0.82)",
              }}
            >
              {frame.subtitle}
            </div>
          </div>

          <div style={{ display: "flex", flex: 1, justifyContent: "flex-end" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 56,
                paddingLeft: 20,
                paddingRight: 20,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.16)",
                backgroundColor: "rgba(255,255,255,0.08)",
                fontSize: 20,
                fontWeight: 700,
                color: "#F6F9FF",
              }}
            >
              RYVANO WHATSAPP
            </div>
          </div>
        </div>

        {frame.narrative ? (
          <div
            style={{
              display: "flex",
              marginTop: 20,
              width: "100%",
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,0.06)",
              backgroundColor: "rgba(255,255,255,0.04)",
              padding: 24,
              fontSize: 24,
              lineHeight: 1.35,
              fontWeight: 500,
              color: "rgba(235,240,249,0.90)",
            }}
          >
            {frame.narrative}
          </div>
        ) : null}

        {frame.metrics?.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", width: "100%", marginTop: 18 }}>
            {frame.metrics.map((metric, index) => (
              <MetricCard
                key={`${metric.label}-${index}`}
                metric={metric}
                status={frame.status}
              />
            ))}
          </div>
        ) : null}

        {frame.checklist?.length ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              marginTop: 18,
              borderRadius: 30,
              border: "1px solid rgba(255,255,255,0.06)",
              backgroundColor: "rgba(255,255,255,0.03)",
              padding: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 21,
                fontWeight: 600,
                color: "rgba(229,236,248,0.84)",
                marginBottom: 12,
              }}
            >
              Checklist operacional
            </div>
            {frame.checklist.map((item, index) => (
              <div key={`${item}-${index}`} style={{ display: "flex", alignItems: "center", marginTop: index === 0 ? 0 : 14 }}>
                <div
                  style={{
                    display: "flex",
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    backgroundColor: palette.accentSoft,
                    marginRight: 14,
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    fontSize: 22,
                    lineHeight: 1.3,
                    fontWeight: 600,
                    color: "rgba(235,240,249,0.90)",
                  }}
                >
                  {item}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {frame.chart ? (
          <ChartSection chart={frame.chart} status={frame.status} />
        ) : null}

        <div style={{ display: "flex", flex: 1 }} />

        {frame.footer ? (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 18 }}>
            <div
              style={{
                display: "flex",
                fontSize: 18,
                lineHeight: 1.35,
                fontWeight: 500,
                color: "rgba(229,236,248,0.62)",
              }}
            >
              {frame.footer}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 16,
                width: "100%",
                justifyContent: "flex-end",
                fontSize: 16,
                fontWeight: 700,
                color: "rgba(229,236,248,0.34)",
              }}
            >
              RYVANO PERFORMANCE INTELLIGENCE
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard(input: {
  metric: ReportMetric;
  status: "default" | "warning";
}) {
  const border = input.metric.tone === "warning"
    ? "rgba(246,194,122,0.30)"
    : "rgba(255,255,255,0.08)";
  const backgroundColor = input.metric.tone === "warning"
    ? "rgba(246,194,122,0.10)"
    : "rgba(255,255,255,0.04)";

  return (
    <div
      style={{
        display: "flex",
        width: "33.3333%",
        paddingRight: 14,
        paddingBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          minHeight: 122,
          borderRadius: 28,
          border: `1px solid ${border}`,
          backgroundColor,
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 20,
            fontWeight: 600,
            color: "rgba(229,236,248,0.74)",
          }}
        >
          {input.metric.label}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 30,
            lineHeight: 1.2,
            fontWeight: 700,
            color: "#FFFFFF",
          }}
        >
          {input.metric.value}
        </div>
        {input.metric.helper ? (
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 16,
              lineHeight: 1.25,
              fontWeight: 500,
              color: "rgba(229,236,248,0.56)",
            }}
          >
            {input.metric.helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChartSection(input: {
  chart: ReportChart;
  status: "default" | "warning";
}) {
  const maxValue = Math.max(...input.chart.data.map((point) => point.value), 1);
  const accent = input.status === "warning" ? "#D88A32" : "#5B84FF";
  const accentSoft = input.status === "warning" ? "rgba(246,194,122,0.28)" : "rgba(95,132,255,0.28)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginTop: 18,
        borderRadius: 34,
        border: "1px solid rgba(255,255,255,0.06)",
        backgroundColor: "rgba(255,255,255,0.03)",
        padding: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 21,
          fontWeight: 600,
          color: "rgba(229,236,248,0.84)",
        }}
      >
        {input.chart.title}
      </div>
      {input.chart.note ? (
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 15,
            lineHeight: 1.3,
            fontWeight: 500,
            color: "rgba(229,236,248,0.54)",
          }}
        >
          {input.chart.note}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 20 }}>
        {input.chart.data.map((point, index) => {
          const widthPercent = Math.max(8, Math.round((point.value / maxValue) * 100));
          const barColor = point.tone === "warning"
            ? "#D88A32"
            : point.tone === "neutral"
              ? "rgba(255,255,255,0.26)"
              : accent;
          const valueLabel = point.formattedValue ?? String(point.value);

          return (
            <div key={`${point.label}-${index}`} style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: index === 0 ? 0 : 18 }}>
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                <div
                  style={{
                    display: "flex",
                    fontSize: 20,
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.76)",
                  }}
                >
                  {point.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#FFFFFF",
                  }}
                >
                  {valueLabel}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: 18,
                  marginTop: 10,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: `${widthPercent}%`,
                    height: "100%",
                    borderRadius: 999,
                    backgroundColor: barColor,
                    boxShadow: `0 0 0 1px ${accentSoft}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toReportFrame(request: ReportRequest) {
  switch (request.template) {
    case "daily-garmin-summary":
      return {
        eyebrow: "Ryvano x Garmin",
        title: `Resumo fisiológico de ${request.data.athleteName}`,
        subtitle: request.data.dateLabel,
        narrative: request.data.overview,
        metrics: request.data.metrics,
        chart: request.data.chart,
        footer: `${request.data.footer} ${request.data.cta}`.trim(),
        status: "default" as const,
      };
    case "post-activity-report":
      return {
        eyebrow: "Ryvano performance",
        title: `${request.data.activityLabel} finalizada`,
        subtitle: `${request.data.athleteName} · ${request.data.occurredAtLabel}`,
        narrative: `${request.data.summary} ${request.data.insight}`.trim(),
        metrics: request.data.metrics,
        checklist: request.data.chips,
        chart: request.data.chart,
        footer: [request.data.footer, request.data.cta].filter(Boolean).join(" "),
        status: "default" as const,
      };
    case "garmin-daily-sync-check":
      return {
        eyebrow: "Acompanhamento Garmin",
        title: request.data.title,
        subtitle: `${request.data.athleteName} · ${request.data.dateLabel}`,
        narrative: request.data.message,
        checklist: request.data.checklist,
        footer: request.data.footer,
        status: "warning" as const,
      };
    case "garmin-reconnect":
      return {
        eyebrow: "Integração Garmin",
        title: request.data.title,
        subtitle: request.data.athleteName,
        narrative: request.data.message,
        checklist: request.data.checklist,
        footer: request.data.footer,
        status: "warning" as const,
      };
    case "evolution-media-diagnostic":
      return {
        eyebrow: "Evolution diagnostics",
        title: request.data.title,
        subtitle: request.data.subtitle,
        narrative: request.data.message,
        metrics: request.data.metrics,
        chart: request.data.chart,
        footer: request.data.footer,
        status: request.data.status ?? "default",
      };
    default:
      return assertNever(request);
  }
}

function assertNever(value: never): never {
  throw new Error(`Template não suportado: ${JSON.stringify(value)}`);
}
