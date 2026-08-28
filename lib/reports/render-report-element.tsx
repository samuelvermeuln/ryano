/* eslint-disable @next/next/no-img-element */

import type {
  ReportChart,
  ReportMetric,
  ReportRequest,
  ReportTheme,
  ReportThemeSport,
  ReportThemeVariant,
} from "@/lib/reports/types";

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1080;
const CONTENT_WIDTH = 980;

type ReportFamily = NonNullable<ReportTheme["family"]>;

type ReportFrame = {
  eyebrow: string;
  title: string;
  subtitle: string;
  narrative?: string;
  metrics?: ReportMetric[];
  checklist?: string[];
  chart?: ReportChart;
  footer?: string;
  status: "default" | "warning";
  badge: string;
  family: ReportFamily;
  theme?: ReportTheme;
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
  heroBackground: string;
  heroBorder: string;
  border: string;
  accent: string;
  accentWash: string;
  accentSoft: string;
  accentStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  warning: string;
  warningSoft: string;
  neutralSoft: string;
  track: string;
  trackStrong: string;
  brandBackground: string;
  brandBorder: string;
};

export function renderReportElement(request: ReportRequest, brand: ReportBrandAssets) {
  const frame = toReportFrame(request);
  const variant = frame.theme?.variant ?? "pearl";
  const palette = getReportPalette(frame);
  const metrics = (frame.metrics ?? []).slice(0, 6);
  const metricRows = chunk(metrics, 3);
  const checklist = (frame.checklist ?? []).slice(0, 3);
  const signature = getFamilySignature(frame);

  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        display: "flex",
        backgroundColor: palette.pageBackground,
        fontFamily: "Geist, Arial, sans-serif",
        color: palette.textPrimary,
        padding: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          borderRadius: 42,
          border: `1px solid ${palette.border}`,
          backgroundColor: palette.shellBackground,
          padding: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            borderRadius: 34,
            border: `1px solid ${palette.border}`,
            backgroundColor: palette.surface,
            padding: 22,
          }}
        >
          <HeroCard frame={frame} palette={palette} brand={brand} variant={variant} />

          <SectionCard palette={palette} height={92} marginTop={14}>
            <div style={{ display: "flex", alignItems: "center", width: 54, justifyContent: "center" }}>
              <BrandMarkBadge palette={palette} src={brand.logoMarkSrc} size={46} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 14, width: 680 }}>
              <div style={{ display: "flex", fontSize: 14, fontWeight: 800, color: palette.accentStrong, textTransform: "uppercase", letterSpacing: 1.2 }}>
                {signature.kicker}
              </div>
              <div style={{ display: "flex", marginTop: 6, fontSize: 21, fontWeight: 800, lineHeight: 1.2, color: palette.textPrimary }}>
                {signature.title}
              </div>
              <div style={{ display: "flex", marginTop: 4, fontSize: 15, fontWeight: 500, lineHeight: 1.28, color: palette.textMuted }}>
                {signature.detail}
              </div>
            </div>
            <div style={{ display: "flex", marginLeft: "auto", alignItems: "center" }}>
              <ReportPill background={palette.accentWash} border={palette.heroBorder} color={palette.accentStrong}>
                {signature.pill}
              </ReportPill>
            </div>
          </SectionCard>

          {frame.narrative ? (
            <SectionCard palette={palette} height={104} marginTop={14}>
              <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                <div style={{ display: "flex", fontSize: 15, fontWeight: 800, color: palette.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                  Resumo rápido
                </div>
                <div style={{ display: "flex", marginTop: 10, fontSize: 22, lineHeight: 1.32, fontWeight: 500, color: palette.textSecondary }}>
                  {frame.narrative}
                </div>
              </div>
            </SectionCard>
          ) : null}

          {metricRows.length ? (
            <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 14 }}>
              {metricRows.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} style={{ display: "flex", width: "100%", marginTop: rowIndex === 0 ? 0 : 12 }}>
                  {row.map((metric, columnIndex) => (
                    <div
                      key={`${metric.label}-${columnIndex}`}
                      style={{
                        display: "flex",
                        width: `${100 / row.length}%`,
                        paddingLeft: columnIndex === 0 ? 0 : 6,
                        paddingRight: columnIndex === row.length - 1 ? 0 : 6,
                      }}
                    >
                      <MetricCard metric={metric} palette={palette} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {checklist.length ? (
            <SectionCard palette={palette} height={118} marginTop={14}>
              <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                <div style={{ display: "flex", fontSize: 15, fontWeight: 800, color: palette.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                  {frame.status === "warning" ? "Próximas ações" : "Leituras rápidas"}
                </div>
                <div style={{ display: "flex", width: "100%", marginTop: 14 }}>
                  {checklist.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      style={{
                        display: "flex",
                        width: `${100 / checklist.length}%`,
                        paddingLeft: index === 0 ? 0 : 6,
                        paddingRight: index === checklist.length - 1 ? 0 : 6,
                      }}
                    >
                      <ChecklistCard item={item} palette={palette} />
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          ) : null}

          {frame.chart ? <ChartCard chart={frame.chart} palette={palette} marginTop={14} /> : null}

          <div style={{ display: "flex", flex: 1 }} />

          <div style={{ display: "flex", width: "100%", alignItems: "flex-end", marginTop: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", width: 690 }}>
              {frame.footer ? (
                <div style={{ display: "flex", fontSize: 17, lineHeight: 1.32, fontWeight: 500, color: palette.textMuted }}>
                  {frame.footer}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", marginLeft: "auto", alignItems: "center" }}>
              <BrandMarkBadge palette={palette} src={brand.logoMarkSrc} size={48} />
              <div style={{ display: "flex", marginLeft: 14 }}>
                <BrandPrincipalInline src={brand.logoPrincipalSrc} width={164} height={30} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroCard(input: {
  frame: ReportFrame;
  palette: ReportPalette;
  brand: ReportBrandAssets;
  variant: ReportThemeVariant;
}) {
  const watermarkSize = input.variant === "sunrise" ? 238 : input.variant === "mist" ? 208 : 220;

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        minHeight: 182,
        borderRadius: 34,
        border: `1px solid ${input.palette.heroBorder}`,
        backgroundColor: input.palette.heroBackground,
        padding: 24,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          right: input.variant === "mist" ? -18 : -8,
          top: input.variant === "mist" ? -24 : "auto",
          bottom: input.variant === "mist" ? "auto" : -24,
          opacity: 0.07,
        }}
      >
        <img src={input.brand.logoMarkSrc} alt="Monograma Ryvano" width={String(watermarkSize)} height={String(watermarkSize)} />
      </div>

      <div style={{ display: "flex", width: "100%", position: "relative", zIndex: 1 }}>
        {input.variant === "pearl" ? <AccentRail palette={input.palette} /> : null}

        <div style={{ display: "flex", flexDirection: "column", width: input.variant === "sunrise" ? 640 : 700 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <ReportPill background={input.palette.accentWash} border={input.palette.heroBorder} color={input.palette.accentStrong}>
              {input.frame.eyebrow}
            </ReportPill>
            {input.variant === "mist" ? (
              <div style={{ display: "flex", marginLeft: 12 }}>
                <BrandPrincipalInline src={input.brand.logoPrincipalSrc} width={150} height={28} />
              </div>
            ) : null}
          </div>

          {input.variant === "mist" ? (
            <div
              style={{
                display: "flex",
                width: CONTENT_WIDTH - 350,
                height: 8,
                borderRadius: 999,
                marginTop: 18,
                backgroundColor: input.palette.accent,
              }}
            />
          ) : null}

          <div style={{ display: "flex", marginTop: input.variant === "mist" ? 20 : 18, fontSize: 46, lineHeight: 1.12, fontWeight: 800, color: input.palette.textPrimary }}>
            {input.frame.title}
          </div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 24, lineHeight: 1.32, fontWeight: 500, color: input.palette.textSecondary }}>
            {input.frame.subtitle}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto", alignItems: "flex-end", width: input.variant === "sunrise" ? 250 : 214 }}>
          {input.variant === "sunrise" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                minHeight: 114,
                borderRadius: 26,
                border: `1px solid ${input.palette.heroBorder}`,
                backgroundColor: input.palette.accentWash,
                padding: 18,
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", fontSize: 14, fontWeight: 800, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                Tema do card
              </div>
              <div style={{ display: "flex", fontSize: 24, lineHeight: 1.16, fontWeight: 800, color: input.palette.accentStrong }}>
                {input.frame.badge}
              </div>
            </div>
          ) : (
            <ReportPill background={input.palette.accentWash} border={input.palette.heroBorder} color={input.palette.accentStrong}>
              {input.frame.badge}
            </ReportPill>
          )}

          <div style={{ display: "flex", marginTop: 12 }}>
            {input.variant === "mist" ? (
              <BrandMarkBadge palette={input.palette} src={input.brand.logoMarkSrc} size={54} />
            ) : (
              <BrandPrincipalBadge palette={input.palette} src={input.brand.logoPrincipalSrc} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard(input: {
  palette: ReportPalette;
  height: number;
  marginTop?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        minHeight: input.height,
        marginTop: input.marginTop ?? 0,
        borderRadius: 28,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.palette.surfaceMuted,
        padding: 18,
      }}
    >
      {input.children}
    </div>
  );
}

function MetricCard(input: {
  metric: ReportMetric;
  palette: ReportPalette;
}) {
  const backgroundColor = input.metric.tone === "warning"
    ? input.palette.warningSoft
    : input.metric.tone === "neutral"
      ? input.palette.neutralSoft
      : input.palette.accentWash;
  const borderColor = input.metric.tone === "warning"
    ? input.palette.warning
    : input.metric.tone === "neutral"
      ? input.palette.border
      : input.palette.heroBorder;
  const valueColor = input.metric.tone === "warning" ? input.palette.warning : input.palette.textPrimary;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: 136,
        borderRadius: 24,
        border: `1px solid ${borderColor}`,
        backgroundColor,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", fontSize: 17, fontWeight: 800, color: input.palette.textSecondary }}>
        {input.metric.label}
      </div>
      <div style={{ display: "flex", marginTop: 12, fontSize: 30, lineHeight: 1.12, fontWeight: 800, color: valueColor }}>
        {input.metric.value}
      </div>
      {input.metric.helper ? (
        <div style={{ display: "flex", marginTop: 10, fontSize: 15, lineHeight: 1.24, fontWeight: 500, color: input.palette.textMuted }}>
          {input.metric.helper}
        </div>
      ) : null}
    </div>
  );
}

function ChecklistCard(input: {
  item: string;
  palette: ReportPalette;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: 62,
        borderRadius: 22,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.palette.surface,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, backgroundColor: input.palette.accent, flexShrink: 0 }} />
        <div style={{ display: "flex", marginLeft: 10, fontSize: 18, lineHeight: 1.22, fontWeight: 600, color: input.palette.textSecondary }}>
          {input.item}
        </div>
      </div>
    </div>
  );
}

function ChartCard(input: {
  chart: ReportChart;
  palette: ReportPalette;
  marginTop?: number;
}) {
  const points = input.chart.data.slice(0, 5);
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: 214,
        marginTop: input.marginTop ?? 0,
        borderRadius: 30,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.palette.surfaceStrong,
        padding: 20,
      }}
    >
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 730 }}>
          <div style={{ display: "flex", fontSize: 15, fontWeight: 800, color: input.palette.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
            Gráfico do card
          </div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 22, lineHeight: 1.2, fontWeight: 800, color: input.palette.textPrimary }}>
            {input.chart.title}
          </div>
          {input.chart.note ? (
            <div style={{ display: "flex", marginTop: 6, fontSize: 15, lineHeight: 1.28, fontWeight: 500, color: input.palette.textMuted }}>
              {input.chart.note}
            </div>
          ) : null}
        </div>
        <ReportPill background={input.palette.accentWash} border={input.palette.heroBorder} color={input.palette.accentStrong}>
          {input.chart.type === "line" ? "Daily insight" : "Sport focus"}
        </ReportPill>
      </div>

      <div style={{ display: "flex", width: "100%", marginTop: 18, alignItems: "flex-end" }}>
        {points.map((point, index) => {
          const barColor = point.tone === "warning"
            ? input.palette.warning
            : point.tone === "neutral"
              ? input.palette.trackStrong
              : input.palette.accent;
          const barHeight = Math.max(22, Math.round((point.value / maxValue) * 86));

          return (
            <div
              key={`${point.label}-${index}`}
              style={{
                display: "flex",
                flexDirection: "column",
                width: `${100 / points.length}%`,
                paddingLeft: index === 0 ? 0 : 6,
                paddingRight: index === points.length - 1 ? 0 : 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  width: "100%",
                  minHeight: 34,
                  borderRadius: 999,
                  border: `1px solid ${input.palette.border}`,
                  backgroundColor: point.tone === "warning"
                    ? input.palette.warningSoft
                    : point.tone === "neutral"
                      ? input.palette.neutralSoft
                      : input.palette.accentWash,
                  fontSize: 16,
                  fontWeight: 800,
                  color: input.palette.textPrimary,
                }}
              >
                {point.formattedValue ?? String(point.value)}
              </div>
              <div style={{ display: "flex", width: "100%", height: 96, alignItems: "flex-end", marginTop: 10 }}>
                <div
                  style={{
                    display: "flex",
                    width: "100%",
                    height: barHeight,
                    borderRadius: 18,
                    backgroundColor: barColor,
                  }}
                />
              </div>
              <div style={{ display: "flex", marginTop: 10, justifyContent: "center", textAlign: "center", fontSize: 16, lineHeight: 1.18, fontWeight: 700, color: input.palette.textSecondary }}>
                {point.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BrandPrincipalBadge(input: { palette: ReportPalette; src: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 56,
        minWidth: 200,
        paddingLeft: 18,
        paddingRight: 18,
        borderRadius: 18,
        border: `1px solid ${input.palette.brandBorder}`,
        backgroundColor: input.palette.brandBackground,
      }}
    >
      <img src={input.src} alt="Logo Ryvano" width="154" height="28" />
    </div>
  );
}

function BrandMarkBadge(input: { palette: ReportPalette; src: string; size?: number }) {
  const size = input.size ?? 56;
  const icon = Math.round(size * 0.44);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 18,
        border: `1px solid ${input.palette.heroBorder}`,
        backgroundColor: input.palette.accentWash,
      }}
    >
      <img src={input.src} alt="Monograma Ryvano" width={String(icon)} height={String(icon)} />
    </div>
  );
}

function BrandPrincipalInline(input: { src: string; width?: number; height?: number }) {
  return <img src={input.src} alt="Logo Ryvano" width={String(input.width ?? 160)} height={String(input.height ?? 30)} />;
}

function AccentRail(input: { palette: ReportPalette }) {
  return (
    <div
      style={{
        display: "flex",
        width: 10,
        borderRadius: 999,
        marginRight: 18,
        backgroundColor: input.palette.accent,
      }}
    />
  );
}

function ReportPill(input: {
  background: string;
  border: string;
  color: string;
  children: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 8,
        paddingBottom: 8,
        borderRadius: 999,
        border: `1px solid ${input.border}`,
        backgroundColor: input.background,
        fontSize: 15,
        fontWeight: 800,
        color: input.color,
        textTransform: "uppercase",
      }}
    >
      {input.children}
    </div>
  );
}

function toReportFrame(request: ReportRequest): ReportFrame {
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
        status: "default",
        badge: "Daily Garmin",
        family: request.data.theme?.family ?? "daily",
        theme: request.data.theme,
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
        status: "default",
        badge: request.data.activityLabel,
        family: request.data.theme?.family ?? "activity",
        theme: request.data.theme ?? { family: "activity", sport: request.data.sport ?? "default" },
      };
    case "garmin-daily-sync-check":
      return {
        eyebrow: "Acompanhamento Garmin",
        title: request.data.title,
        subtitle: `${request.data.athleteName} · ${request.data.dateLabel}`,
        narrative: request.data.message,
        checklist: request.data.checklist,
        footer: request.data.footer,
        status: "warning",
        badge: "Leituras pendentes",
        family: request.data.theme?.family ?? "warning",
        theme: request.data.theme,
      };
    case "garmin-reconnect":
      return {
        eyebrow: "Integração Garmin",
        title: request.data.title,
        subtitle: request.data.athleteName,
        narrative: request.data.message,
        checklist: request.data.checklist,
        footer: request.data.footer,
        status: "warning",
        badge: "Ação necessária",
        family: request.data.theme?.family ?? "reconnect",
        theme: request.data.theme,
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
        badge: "Teste interno",
        family: request.data.theme?.family ?? "diagnostic",
        theme: request.data.theme,
      };
    default:
      return assertNever(request);
  }
}

function getFamilySignature(frame: ReportFrame) {
  if (frame.family === "daily") {
    return {
      kicker: "Daily signature",
      title: "Boletim premium de recuperação com alta densidade de leitura",
      detail: "Resumo visual diário com métricas, gráfico e contexto clínico em composição clara para WhatsApp.",
      pill: "Daily",
    };
  }

  if (frame.family === "activity") {
    return {
      kicker: "Sport signature",
      title: `Leitura visual adaptada para ${frame.badge.toLowerCase()}`,
      detail: "Paleta, foco e estrutura mudam por modalidade para evitar repetição rígida e valorizar contexto esportivo.",
      pill: "Sport-specific",
    };
  }

  if (frame.family === "warning") {
    return {
      kicker: "Alert signature",
      title: "Alerta operacional claro, premium e orientado à ação",
      detail: "Card de exceção com prioridade para entendimento rápido e próximos passos sem perder refinamento visual.",
      pill: "Action needed",
    };
  }

  if (frame.family === "reconnect") {
    return {
      kicker: "Reconnect signature",
      title: "Reconexão guiada com comunicação direta e padrão executivo",
      detail: "Fluxo visual pensado para restaurar integração com clareza, confiança e baixa fricção.",
      pill: "Reconnect",
    };
  }

  return {
    kicker: "Diagnostic signature",
    title: "Diagnóstico técnico de mídia, fonte e renderização",
    detail: "Mesmo motor visual dos cards reais, útil para validar pipeline e qualidade final de envio.",
    pill: "Internal test",
  };
}

function getReportPalette(frame: ReportFrame): ReportPalette {
  const theme = frame.theme ?? {};
  const variant = theme.variant ?? "pearl";
  const family = frame.family;
  const sport = theme.sport ?? "default";
  const accent = getAccentColor(family, sport, variant);

  if (variant === "mist") {
    return {
      pageBackground: family === "reconnect" ? "#FFF6F4" : family === "warning" ? "#FFF8EF" : "#F4FBFA",
      shellBackground: "#EDF7F5",
      surface: "#FFFFFF",
      surfaceMuted: "#F8FCFC",
      surfaceStrong: "#F5FBFA",
      heroBackground: family === "reconnect" ? "#FFF1EE" : family === "warning" ? "#FFF6E8" : "#EEF9F7",
      heroBorder: family === "reconnect" ? "#F2CFC7" : family === "warning" ? "#F0D8AD" : withOpacity(accent, 0.22),
      border: "#DCE8E7",
      accent,
      accentWash: withOpacity(accent, 0.10),
      accentSoft: withOpacity(accent, 0.16),
      accentStrong: accent,
      textPrimary: "#102132",
      textSecondary: "#314557",
      textMuted: "#697A8B",
      warning: "#C88321",
      warningSoft: "#FFF2DE",
      neutralSoft: "#F1F5F7",
      track: "#E4EFF0",
      trackStrong: "#B8C7CD",
      brandBackground: "#FFFFFF",
      brandBorder: "#D7E5E3",
    };
  }

  if (variant === "sunrise") {
    return {
      pageBackground: family === "reconnect" ? "#FFF6F2" : family === "warning" ? "#FFF7EE" : "#FFF8F2",
      shellBackground: "#FFF1E6",
      surface: "#FFFFFF",
      surfaceMuted: "#FFF9F4",
      surfaceStrong: "#FFF6EE",
      heroBackground: family === "reconnect" ? "#FFECE5" : family === "warning" ? "#FFF1DB" : "#FFF0E3",
      heroBorder: family === "reconnect" ? "#F1CDC0" : family === "warning" ? "#EECFA3" : withOpacity(accent, 0.20),
      border: "#EBDCD1",
      accent,
      accentWash: withOpacity(accent, 0.10),
      accentSoft: withOpacity(accent, 0.16),
      accentStrong: accent,
      textPrimary: "#201F24",
      textSecondary: "#4E4B53",
      textMuted: "#7D7174",
      warning: "#C67D18",
      warningSoft: "#FFF1DC",
      neutralSoft: "#F5F0EA",
      track: "#EFE4DB",
      trackStrong: "#C9BAAE",
      brandBackground: "#FFFFFF",
      brandBorder: "#E8D8CB",
    };
  }

  return {
    pageBackground: family === "reconnect" ? "#FDF5F4" : family === "warning" ? "#FBF7EF" : "#F5F7FB",
    shellBackground: "#EEF2F8",
    surface: "#FFFFFF",
    surfaceMuted: "#F8FAFD",
    surfaceStrong: "#F6F8FC",
    heroBackground: family === "reconnect" ? "#FDEEEE" : family === "warning" ? "#FBF1DE" : "#EEF3FF",
    heroBorder: family === "reconnect" ? "#E8C7C3" : family === "warning" ? "#E9D2A7" : withOpacity(accent, 0.18),
    border: "#E0E7F0",
    accent,
    accentWash: withOpacity(accent, 0.10),
    accentSoft: withOpacity(accent, 0.16),
    accentStrong: accent,
    textPrimary: "#111827",
    textSecondary: "#344054",
    textMuted: "#6B7280",
    warning: "#C67A1E",
    warningSoft: "#FFF2DF",
    neutralSoft: "#F3F5F8",
    track: "#E9EEF5",
    trackStrong: "#B8C2CF",
    brandBackground: "#FFFFFF",
    brandBorder: "#DFE7F3",
  };
}

function getAccentColor(
  family: ReportFamily,
  sport: ReportThemeSport,
  variant: ReportThemeVariant,
) {
  if (family === "warning") {
    return variant === "mist" ? "#B97B22" : variant === "sunrise" ? "#CA8B2E" : "#BE8127";
  }

  if (family === "reconnect") {
    return variant === "mist" ? "#C65F50" : variant === "sunrise" ? "#D06C5F" : "#C5544B";
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

function chunk<T>(items: T[], size: number) {
  const rows: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }

  return rows;
}

function assertNever(value: never): never {
  throw new Error(`Template não suportado: ${JSON.stringify(value)}`);
}
