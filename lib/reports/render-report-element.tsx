/* eslint-disable @next/next/no-img-element */

import type { ReactNode } from "react";

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

  return (
    <PageShell palette={palette}>
      {variant === "mist" ? (
        <MistLayout frame={frame} palette={palette} brand={brand} />
      ) : variant === "sunrise" ? (
        <SunriseLayout frame={frame} palette={palette} brand={brand} />
      ) : (
        <PearlLayout frame={frame} palette={palette} brand={brand} />
      )}
    </PageShell>
  );
}

function PageShell(input: {
  palette: ReportPalette;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        display: "flex",
        backgroundColor: input.palette.pageBackground,
        fontFamily: "Geist, Arial, sans-serif",
        color: input.palette.textPrimary,
        padding: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: 18,
          borderRadius: 42,
          border: `1px solid ${input.palette.border}`,
          backgroundColor: input.palette.shellBackground,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            padding: 22,
            borderRadius: 34,
            border: `1px solid ${input.palette.border}`,
            backgroundColor: input.palette.surface,
          }}
        >
          {input.children}
        </div>
      </div>
    </div>
  );
}

function PearlLayout(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  const metrics = input.frame.metrics ?? [];

  return (
    <>
      <HeroPearl frame={input.frame} palette={input.palette} brand={input.brand} />
      <FamilySignatureBar frame={input.frame} palette={input.palette} brand={input.brand} />
      <NarrativeCard frame={input.frame} palette={input.palette} />
      {metrics.length ? <MetricGrid metrics={metrics} palette={input.palette} columns={3} /> : null}
      {input.frame.checklist?.length ? (
        <ChecklistSection items={input.frame.checklist} palette={input.palette} tone={input.frame.status} />
      ) : null}
      {input.frame.chart ? <ChartSection chart={input.frame.chart} palette={input.palette} /> : null}
      <FooterSection frame={input.frame} palette={input.palette} brand={input.brand} />
    </>
  );
}

function MistLayout(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  const metrics = input.frame.metrics ?? [];
  const spotlight = metrics[0] ?? null;
  const remainingMetrics = spotlight ? metrics.slice(1) : metrics;

  return (
    <>
      <div style={{ display: "flex", width: "100%", alignItems: "stretch" }}>
        <div style={{ display: "flex", width: spotlight ? "70%" : "100%", paddingRight: spotlight ? 12 : 0 }}>
          <HeroMist frame={input.frame} palette={input.palette} brand={input.brand} />
        </div>
        {spotlight ? (
          <div style={{ display: "flex", width: "30%", paddingLeft: 12 }}>
            <MetricSpotlight metric={spotlight} palette={input.palette} label="Spotlight" />
          </div>
        ) : null}
      </div>
      <FamilySignatureBar frame={input.frame} palette={input.palette} brand={input.brand} />
      <NarrativeCard frame={input.frame} palette={input.palette} />
      {remainingMetrics.length ? <MetricGrid metrics={remainingMetrics} palette={input.palette} columns={2} /> : null}
      {input.frame.chart ? <ChartSection chart={input.frame.chart} palette={input.palette} /> : null}
      {input.frame.checklist?.length ? (
        <ChecklistSection items={input.frame.checklist} palette={input.palette} tone={input.frame.status} compact />
      ) : null}
      <FooterSection frame={input.frame} palette={input.palette} brand={input.brand} />
    </>
  );
}

function SunriseLayout(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  const metrics = input.frame.metrics ?? [];
  const spotlightMetrics = metrics.slice(0, 2);
  const remainingMetrics = metrics.slice(2);

  return (
    <>
      <HeroSunrise frame={input.frame} palette={input.palette} brand={input.brand} />
      <FamilySignatureBar frame={input.frame} palette={input.palette} brand={input.brand} />
      {spotlightMetrics.length ? (
        <div style={{ display: "flex", width: "100%", marginTop: 16 }}>
          {spotlightMetrics.map((metric, index) => (
            <div
              key={`${metric.label}-${index}`}
              style={{
                display: "flex",
                width: spotlightMetrics.length === 1 ? "100%" : "50%",
                paddingLeft: index === 0 ? 0 : 8,
                paddingRight: index === 0 && spotlightMetrics.length > 1 ? 8 : 0,
              }}
            >
              <MetricSpotlight metric={metric} palette={input.palette} label={index === 0 ? "Primary" : "Secondary"} />
            </div>
          ))}
        </div>
      ) : null}
      <NarrativeCard frame={input.frame} palette={input.palette} />
      {input.frame.chart ? <ChartSection chart={input.frame.chart} palette={input.palette} emphasized /> : null}
      {remainingMetrics.length ? <MetricGrid metrics={remainingMetrics} palette={input.palette} columns={2} dense /> : null}
      {input.frame.checklist?.length ? (
        <ChecklistSection items={input.frame.checklist} palette={input.palette} tone={input.frame.status} cardItems />
      ) : null}
      <FooterSection frame={input.frame} palette={input.palette} brand={input.brand} />
    </>
  );
}

function HeroPearl(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        borderRadius: 34,
        border: `1px solid ${input.palette.heroBorder}`,
        backgroundColor: input.palette.heroBackground,
        padding: 28,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <HeroWatermark src={input.brand.logoMarkSrc} />
      <div style={{ display: "flex", width: "100%", position: "relative", zIndex: 1 }}>
        <AccentRail palette={input.palette} />
        <div style={{ display: "flex", flexDirection: "column", width: 716 }}>
          <HeroText frame={input.frame} palette={input.palette} />
        </div>
        <HeroBadges frame={input.frame} palette={input.palette} brand={input.brand} />
      </div>
    </div>
  );
}

function HeroMist(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        borderRadius: 34,
        border: `1px solid ${input.palette.heroBorder}`,
        backgroundColor: input.palette.heroBackground,
        padding: 28,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <HeroWatermark src={input.brand.logoMarkSrc} align="top-right" />
      <div style={{ display: "flex", flexDirection: "column", width: "100%", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
          <ReportPill background={input.palette.accentWash} border={input.palette.heroBorder} color={input.palette.accentStrong}>
            {input.frame.eyebrow}
          </ReportPill>
          <BrandMarkBadge palette={input.palette} src={input.brand.logoMarkSrc} />
        </div>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 8,
            borderRadius: 999,
            marginTop: 18,
            backgroundColor: input.palette.accent,
          }}
        />
        <div style={{ display: "flex", marginTop: 18 }}>
          <BrandPrincipalInline src={input.brand.logoPrincipalSrc} />
        </div>
        <div style={{ display: "flex", marginTop: 18 }}>
          <HeroText frame={input.frame} palette={input.palette} />
        </div>
      </div>
    </div>
  );
}

function HeroSunrise(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        borderRadius: 36,
        border: `1px solid ${input.palette.heroBorder}`,
        backgroundColor: input.palette.heroBackground,
        padding: 28,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <HeroWatermark src={input.brand.logoMarkSrc} align="bottom-right" large />
      <div style={{ display: "flex", width: "100%", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 670 }}>
          <ReportPill background={input.palette.brandBackground} border={input.palette.brandBorder} color={input.palette.accentStrong}>
            {input.frame.eyebrow}
          </ReportPill>
          <div style={{ display: "flex", marginTop: 20 }}>
            <HeroText frame={input.frame} palette={input.palette} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto", width: 250 }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              minHeight: 120,
              borderRadius: 28,
              border: `1px solid ${input.palette.heroBorder}`,
              backgroundColor: input.palette.accentWash,
              padding: 18,
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: input.palette.textMuted, textTransform: "uppercase" }}>
              Theme
            </div>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: input.palette.accentStrong, lineHeight: 1.2 }}>
              {input.frame.badge}
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 12 }}>
            <BrandPrincipalBadge palette={input.palette} src={input.brand.logoPrincipalSrc} />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroText(input: { frame: ReportFrame; palette: ReportPalette }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div
        style={{
          display: "flex",
          fontSize: 44,
          lineHeight: 1.14,
          fontWeight: 800,
          color: input.palette.textPrimary,
        }}
      >
        {input.frame.title}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 16,
          fontSize: 24,
          lineHeight: 1.34,
          fontWeight: 500,
          color: input.palette.textSecondary,
        }}
      >
        {input.frame.subtitle}
      </div>
    </div>
  );
}

function HeroBadges(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto", alignItems: "flex-end" }}>
      <ReportPill background={input.palette.accentWash} border={input.palette.heroBorder} color={input.palette.accentStrong}>
        {input.frame.badge}
      </ReportPill>
      <div style={{ display: "flex", marginTop: 12 }}>
        <BrandPrincipalBadge palette={input.palette} src={input.brand.logoPrincipalSrc} />
      </div>
    </div>
  );
}

function FamilySignatureBar(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  const signature = getFamilySignature(input.frame);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        marginTop: 16,
        padding: 18,
        borderRadius: 24,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.palette.surfaceMuted,
        alignItems: "center",
      }}
    >
      <BrandMarkBadge palette={input.palette} src={input.brand.logoMarkSrc} />
      <div style={{ display: "flex", flexDirection: "column", marginLeft: 14, width: 650 }}>
        <div style={{ display: "flex", fontSize: 16, fontWeight: 800, color: input.palette.accentStrong, textTransform: "uppercase", letterSpacing: 1.1 }}>
          {signature.kicker}
        </div>
        <div style={{ display: "flex", marginTop: 6, fontSize: 22, fontWeight: 700, lineHeight: 1.26, color: input.palette.textPrimary }}>
          {signature.title}
        </div>
        <div style={{ display: "flex", marginTop: 4, fontSize: 16, fontWeight: 500, lineHeight: 1.3, color: input.palette.textMuted }}>
          {signature.detail}
        </div>
      </div>
      <div style={{ display: "flex", marginLeft: "auto", gap: 10 }}>
        <ReportPill background={input.palette.accentWash} border={input.palette.heroBorder} color={input.palette.accentStrong}>
          {signature.pill}
        </ReportPill>
      </div>
    </div>
  );
}

function HeroWatermark(input: {
  src: string;
  align?: "top-right" | "bottom-right";
  large?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        right: input.large ? -22 : -10,
        top: input.align === "top-right" ? -26 : "auto",
        bottom: input.align === "top-right" ? "auto" : -30,
        opacity: 0.08,
      }}
    >
      <img src={input.src} alt="Monograma decorativo" width={input.large ? "260" : "220"} height={input.large ? "260" : "220"} />
    </div>
  );
}

function AccentRail(input: { palette: ReportPalette }) {
  return (
    <div
      style={{
        display: "flex",
        width: 10,
        marginRight: 20,
        borderRadius: 999,
        backgroundColor: input.palette.accent,
      }}
    />
  );
}

function NarrativeCard(input: { frame: ReportFrame; palette: ReportPalette }) {
  if (!input.frame.narrative) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        marginTop: 16,
        padding: 24,
        borderRadius: 28,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.palette.surfaceMuted,
        fontSize: 24,
        lineHeight: 1.34,
        fontWeight: 500,
        color: input.palette.textSecondary,
      }}
    >
      {input.frame.narrative}
    </div>
  );
}

function MetricGrid(input: {
  metrics: ReportMetric[];
  palette: ReportPalette;
  columns: 2 | 3;
  dense?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: "100%", marginTop: 16 }}>
      {input.metrics.map((metric, index) => (
        <MetricCard
          key={`${metric.label}-${index}`}
          metric={metric}
          palette={input.palette}
          width={input.columns === 3 ? "33.3333%" : "50%"}
          dense={input.dense}
          index={index}
        />
      ))}
    </div>
  );
}

function MetricCard(input: {
  metric: ReportMetric;
  palette: ReportPalette;
  width: string;
  dense?: boolean;
  index: number;
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
  const labelColor = input.metric.tone === "warning" ? input.palette.warning : input.palette.textSecondary;

  return (
    <div
      style={{
        display: "flex",
        width: input.width,
        paddingLeft: input.index % (input.width === "50%" ? 2 : 3) === 0 ? 0 : 6,
        paddingRight: input.index % (input.width === "50%" ? 2 : 3) === (input.width === "50%" ? 1 : 2) ? 0 : 6,
        paddingBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          minHeight: input.dense ? 130 : 144,
          padding: input.dense ? 20 : 22,
          borderRadius: 26,
          border: `1px solid ${borderColor}`,
          backgroundColor,
        }}
      >
        <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: labelColor }}>
          {input.metric.label}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 14,
            fontSize: input.dense ? 28 : 31,
            lineHeight: 1.14,
            fontWeight: 800,
            color: input.palette.textPrimary,
          }}
        >
          {input.metric.value}
        </div>
        {input.metric.helper ? (
          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontSize: 16,
              lineHeight: 1.25,
              fontWeight: 500,
              color: input.palette.textMuted,
            }}
          >
            {input.metric.helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricSpotlight(input: {
  metric: ReportMetric;
  palette: ReportPalette;
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: 100,
        padding: 22,
        borderRadius: 30,
        border: `1px solid ${input.palette.heroBorder}`,
        backgroundColor: input.palette.accentWash,
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: input.palette.textMuted, textTransform: "uppercase" }}>
        {input.label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
        <div style={{ display: "flex", fontSize: 18, fontWeight: 700, color: input.palette.textSecondary }}>
          {input.metric.label}
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 34, fontWeight: 800, color: input.palette.accentStrong, lineHeight: 1.1 }}>
          {input.metric.value}
        </div>
        {input.metric.helper ? (
          <div style={{ display: "flex", marginTop: 8, fontSize: 15, fontWeight: 500, color: input.palette.textMuted }}>
            {input.metric.helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChecklistSection(input: {
  items: string[];
  palette: ReportPalette;
  tone: "default" | "warning";
  compact?: boolean;
  cardItems?: boolean;
}) {
  if (input.cardItems) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", width: "100%", marginTop: 16 }}>
        {input.items.map((item, index) => (
          <div
            key={`${item}-${index}`}
            style={{
              display: "flex",
              width: "33.3333%",
              paddingLeft: index % 3 === 0 ? 0 : 6,
              paddingRight: index % 3 === 2 ? 0 : 6,
              paddingBottom: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                minHeight: 118,
                padding: 20,
                borderRadius: 24,
                border: `1px solid ${input.palette.border}`,
                backgroundColor: input.palette.surfaceMuted,
              }}
            >
              <div style={{ display: "flex", width: 14, height: 14, borderRadius: 999, backgroundColor: input.palette.accent, marginBottom: 14 }} />
              <div style={{ display: "flex", fontSize: 21, fontWeight: 600, lineHeight: 1.28, color: input.palette.textSecondary }}>
                {item}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginTop: 16,
        padding: input.compact ? 22 : 24,
        borderRadius: 28,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.palette.surfaceMuted,
      }}
    >
      <div style={{ display: "flex", fontSize: 21, fontWeight: 800, color: input.palette.textPrimary }}>
        {input.tone === "warning" ? "Ações recomendadas" : "Leituras rápidas"}
      </div>
      {input.items.map((item, index) => (
        <div key={`${item}-${index}`} style={{ display: "flex", width: "100%", alignItems: "center", marginTop: input.compact ? 12 : 14 }}>
          <div
            style={{
              display: "flex",
              width: 14,
              height: 14,
              borderRadius: 999,
              marginRight: 14,
              backgroundColor: input.palette.accent,
              flexShrink: 0,
            }}
          />
          <div style={{ display: "flex", fontSize: input.compact ? 20 : 22, fontWeight: 600, lineHeight: 1.28, color: input.palette.textSecondary }}>
            {item}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartSection(input: {
  chart: ReportChart;
  palette: ReportPalette;
  emphasized?: boolean;
}) {
  const maxValue = Math.max(...input.chart.data.map((point) => point.value), 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        marginTop: 16,
        padding: input.emphasized ? 26 : 24,
        borderRadius: 30,
        border: `1px solid ${input.palette.border}`,
        backgroundColor: input.palette.surfaceMuted,
      }}
    >
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: input.palette.textPrimary }}>
          {input.chart.title}
        </div>
        <ReportPill background={input.palette.accentWash} border={input.palette.heroBorder} color={input.palette.accentStrong}>
          {input.chart.type === "line" ? "daily insight" : "sport focus"}
        </ReportPill>
      </div>
      {input.chart.note ? (
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 16,
            lineHeight: 1.3,
            fontWeight: 500,
            color: input.palette.textMuted,
          }}
        >
          {input.chart.note}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 18 }}>
        {input.chart.data.map((point, index) => {
          const fill = point.tone === "warning"
            ? input.palette.warning
            : point.tone === "neutral"
              ? input.palette.trackStrong
              : input.palette.accent;
          const valueBackground = point.tone === "warning"
            ? input.palette.warningSoft
            : point.tone === "neutral"
              ? input.palette.neutralSoft
              : input.palette.accentWash;
          const widthPercent = Math.max(10, Math.round((point.value / maxValue) * 100));

          return (
            <div key={`${point.label}-${index}`} style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: index === 0 ? 0 : 16 }}>
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", fontSize: 20, fontWeight: 700, color: input.palette.textSecondary }}>
                  <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, marginRight: 10, backgroundColor: fill, flexShrink: 0 }} />
                  {point.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    paddingLeft: 12,
                    paddingRight: 12,
                    paddingTop: 7,
                    paddingBottom: 7,
                    borderRadius: 999,
                    border: `1px solid ${input.palette.border}`,
                    backgroundColor: valueBackground,
                    fontSize: 18,
                    fontWeight: 700,
                    color: input.palette.textPrimary,
                  }}
                >
                  {point.formattedValue ?? String(point.value)}
                </div>
              </div>
              <div style={{ display: "flex", width: "100%", height: input.chart.type === "line" ? 16 : 18, marginTop: 10, borderRadius: 999, backgroundColor: input.palette.track }}>
                <div style={{ display: "flex", width: `${widthPercent}%`, height: "100%", borderRadius: 999, backgroundColor: fill }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FooterSection(input: { frame: ReportFrame; palette: ReportPalette; brand: ReportBrandAssets }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 16 }}>
      <div style={{ display: "flex", flex: 1 }} />
      {input.frame.footer ? (
        <div style={{ display: "flex", width: "100%", fontSize: 18, lineHeight: 1.35, fontWeight: 500, color: input.palette.textMuted }}>
          {input.frame.footer}
        </div>
      ) : null}
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <BrandMarkBadge palette={input.palette} src={input.brand.logoMarkSrc} />
        <BrandPrincipalInline src={input.brand.logoPrincipalSrc} />
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

function BrandMarkBadge(input: { palette: ReportPalette; src: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 56,
        height: 56,
        borderRadius: 18,
        border: `1px solid ${input.palette.heroBorder}`,
        backgroundColor: input.palette.accentWash,
      }}
    >
      <img src={input.src} alt="Monograma Ryvano" width="24" height="24" />
    </div>
  );
}

function BrandPrincipalInline(input: { src: string }) {
  return <img src={input.src} alt="Logo Ryvano" width="160" height="30" />;
}

function getFamilySignature(frame: ReportFrame) {
  if (frame.family === "daily") {
    return {
      kicker: "Daily signature",
      title: "Boletim visual de recuperação com leitura premium diária",
      detail: "Prontidão, sono, VFC e energia em composição clara, elegante e fácil de consumir no WhatsApp.",
      pill: "Daily",
    };
  }

  if (frame.family === "activity") {
    return {
      kicker: "Sport signature",
      title: `Composição premium adaptada para ${frame.badge.toLowerCase()}`,
      detail: "Paleta, hierarquia e foco visual mudam conforme modalidade para evitar repetição engessada no dia a dia.",
      pill: "Sport-specific",
    };
  }

  if (frame.family === "warning") {
    return {
      kicker: "Alert signature",
      title: "Alerta operacional com prioridade de leitura e ação",
      detail: "Contraste, hierarquia e checklist direto para acelerar entendimento sem perder refinamento visual.",
      pill: "Action needed",
    };
  }

  if (frame.family === "reconnect") {
    return {
      kicker: "Reconnect signature",
      title: "Fluxo visual de reconexão com clareza e alto padrão",
      detail: "Mensagem mais orientada, premium e objetiva para reduzir atrito no retorno da integração.",
      pill: "Reconnect",
    };
  }

  return {
    kicker: "Diagnostic signature",
    title: "Diagnóstico interno de mídia, fonte e renderização",
    detail: "Template técnico com mesma base visual para validar estabilidade do pipeline sem perder consistência de marca.",
    pill: "Internal test",
  };
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
        fontSize: 16,
        fontWeight: 700,
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
  family: NonNullable<ReportTheme["family"]>,
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

function assertNever(value: never): never {
  throw new Error(`Template não suportado: ${JSON.stringify(value)}`);
}
