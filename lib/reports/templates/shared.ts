import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ReportChart, ReportMetric } from "@/lib/reports/types";
import { renderBarChart } from "@/lib/reports/charts/bar";
import { renderLineChart } from "@/lib/reports/charts/line";
import { escapeSvg } from "@/lib/reports/utils/escape-svg";

const WIDTH = 1080;
const HEIGHT = 1080;
const PADDING = 60;
const REPORT_FONT_FAMILY = "RyvanoReportFont";

let embeddedFontFaceCss: string | null = null;

export function renderPremiumReport(input: {
  eyebrow: string;
  title: string;
  subtitle: string;
  narrative?: string;
  metrics?: ReportMetric[];
  chart?: ReportChart | null;
  checklist?: string[];
  footer?: string;
  status?: "default" | "warning";
}) {
  const metrics = input.metrics ?? [];
  const checklist = input.checklist ?? [];
  const chart = input.chart ?? null;
  const status = input.status ?? "default";
  const accentGradient = status === "warning" ? "warningHeaderGradient" : "headerGradient";
  const footerY = chart ? 1006 : 980;

  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg" font-family="${REPORT_FONT_FAMILY}, Arial, sans-serif">
  ${renderDefs()}
  <rect width="${WIDTH}" height="${HEIGHT}" rx="48" fill="url(#pageBackground)" />
  <circle cx="180" cy="132" r="180" fill="rgba(112,147,255,0.08)" />
  <circle cx="920" cy="240" r="220" fill="rgba(64,113,247,0.06)" />
  <circle cx="860" cy="920" r="240" fill="rgba(255,255,255,0.03)" />
  <rect x="24" y="24" width="${WIDTH - 48}" height="${HEIGHT - 48}" rx="42" fill="rgba(5, 9, 18, 0.55)" stroke="rgba(255,255,255,0.08)" />
  <g>
    <rect x="${PADDING}" y="${PADDING}" width="${WIDTH - PADDING * 2}" height="220" rx="36" fill="url(#${accentGradient})" />
    <rect x="${PADDING}" y="${PADDING}" width="${WIDTH - PADDING * 2}" height="220" rx="36" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.10)" />
    <text x="${PADDING + 38}" y="${PADDING + 54}" font-family="${REPORT_FONT_FAMILY}, Arial, sans-serif" font-size="22" font-weight="600" fill="rgba(233,240,255,0.72)" letter-spacing="3">${escapeSvg(input.eyebrow.toUpperCase())}</text>
    ${renderTextBlock({
      x: PADDING + 38,
      y: PADDING + 102,
      width: 840,
      lines: wrapText(input.title, 26, 2),
      fontSize: 42,
      lineHeight: 52,
      fill: "#F6F9FF",
      fontWeight: 700,
    })}
    ${renderTextBlock({
      x: PADDING + 38,
      y: PADDING + 176,
      width: 840,
      lines: wrapText(input.subtitle, 48, 2),
      fontSize: 24,
      lineHeight: 32,
      fill: "rgba(233,240,255,0.82)",
      fontWeight: 500,
    })}
    <g>
      <rect x="826" y="88" width="194" height="56" rx="18" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)" />
      <text x="923" y="123" font-family="${REPORT_FONT_FAMILY}, Arial, sans-serif" font-size="20" font-weight="700" text-anchor="middle" fill="#F6F9FF">RYVANO WHATSAPP</text>
    </g>
  </g>
  ${input.narrative ? renderNarrative(input.narrative) : ""}
  ${metrics.length ? renderMetrics(metrics, chart ? 350 : 324) : ""}
  ${checklist.length ? renderChecklist(checklist, metrics.length ? 612 : 350) : ""}
  ${chart ? renderChartCard(chart, checklist.length ? 734 : 700) : ""}
  ${input.footer ? renderFooter(input.footer, footerY) : ""}
</svg>`;
}

function renderDefs() {
  return `
<defs>
  <style type="text/css"><![CDATA[
    ${getEmbeddedFontCss()}
    text, tspan {
      font-family: '${REPORT_FONT_FAMILY}', Arial, sans-serif;
      font-kerning: normal;
      text-rendering: geometricPrecision;
    }
  ]]></style>
  <linearGradient id="pageBackground" x1="64" y1="32" x2="1020" y2="1080" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#101A2D" />
    <stop offset="0.52" stop-color="#0D1322" />
    <stop offset="1" stop-color="#060A13" />
  </linearGradient>
  <linearGradient id="headerGradient" x1="60" y1="60" x2="1020" y2="320" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#273A66" />
    <stop offset="0.55" stop-color="#314A82" />
    <stop offset="1" stop-color="#1B2745" />
  </linearGradient>
  <linearGradient id="warningHeaderGradient" x1="60" y1="60" x2="1020" y2="320" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#6B4320" />
    <stop offset="0.55" stop-color="#8D5A2A" />
    <stop offset="1" stop-color="#4C2F14" />
  </linearGradient>
  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9DB8FF" />
    <stop offset="1" stop-color="#4F79F6" />
  </linearGradient>
  <linearGradient id="warningBarGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F6C27A" />
    <stop offset="1" stop-color="#D88A32" />
  </linearGradient>
  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#9FC4FF" />
    <stop offset="1" stop-color="#5B84FF" />
  </linearGradient>
  <linearGradient id="lineAreaGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="rgba(95,132,255,0.28)" />
    <stop offset="1" stop-color="rgba(95,132,255,0.02)" />
  </linearGradient>
</defs>`;
}

function getEmbeddedFontCss() {
  if (embeddedFontFaceCss !== null) {
    return embeddedFontFaceCss;
  }

  try {
    const fontPath = join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf");
    const fontBase64 = readFileSync(fontPath).toString("base64");
    embeddedFontFaceCss = [400, 500, 600, 700, 800]
      .map((fontWeight) => `
        @font-face {
          font-family: '${REPORT_FONT_FAMILY}';
          src: url(data:font/ttf;base64,${fontBase64}) format('truetype');
          font-style: normal;
          font-weight: ${fontWeight};
        }
      `)
      .join("\n");
  } catch {
    embeddedFontFaceCss = "";
  }

  return embeddedFontFaceCss;
}

function renderNarrative(value: string) {
  return `
  <g>
    <rect x="${PADDING}" y="300" width="${WIDTH - PADDING * 2}" height="96" rx="28" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" />
    ${renderTextBlock({
      x: PADDING + 28,
      y: 338,
      width: WIDTH - PADDING * 2 - 56,
      lines: wrapText(value, 86, 2),
      fontSize: 24,
      lineHeight: 32,
      fill: "rgba(235,240,249,0.88)",
      fontWeight: 500,
    })}
  </g>`;
}

function renderMetrics(metrics: ReportMetric[], startY: number) {
  const columns = 3;
  const cardWidth = 280;
  const cardHeight = 122;
  const gapX = 30;
  const gapY = 22;
  const startX = PADDING;

  return metrics.map((metric, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + column * (cardWidth + gapX);
    const y = startY + row * (cardHeight + gapY);
    const border = metric.tone === "warning" ? "rgba(246,194,122,0.28)" : "rgba(255,255,255,0.08)";
    const glow = metric.tone === "warning" ? "rgba(246,194,122,0.10)" : "rgba(255,255,255,0.04)";

    return `
  <g>
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="28" fill="${glow}" stroke="${border}" />
    <text x="${x + 24}" y="${y + 34}" font-family="${REPORT_FONT_FAMILY}, Arial, sans-serif" font-size="20" font-weight="600" fill="rgba(229,236,248,0.72)">${escapeSvg(metric.label)}</text>
    ${renderTextBlock({
      x: x + 24,
      y: y + 74,
      width: cardWidth - 48,
      lines: wrapText(metric.value, 16, 2),
      fontSize: 28,
      lineHeight: 34,
      fill: "#FFFFFF",
      fontWeight: 700,
    })}
    ${metric.helper ? renderMetricHelper(metric.helper, x + 24, y + 106, cardWidth - 48) : ""}
  </g>`;
  }).join("");
}

function renderMetricHelper(value: string, x: number, y: number, width: number) {
  return renderTextBlock({
    x,
    y,
    width,
    lines: wrapText(value, 28, 1),
    fontSize: 16,
    lineHeight: 20,
    fill: "rgba(229,236,248,0.54)",
    fontWeight: 500,
  });
}

function renderChecklist(items: string[], startY: number) {
  return `
  <g>
    <rect x="${PADDING}" y="${startY}" width="${WIDTH - PADDING * 2}" height="110" rx="30" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" />
    ${items.slice(0, 3).map((item, index) => {
      const x = PADDING + 34 + index * 310;
      return `
      <circle cx="${x}" cy="${startY + 42}" r="8" fill="#F6C27A" />
      ${renderTextBlock({
        x: x + 18,
        y: startY + 34,
        width: 250,
        lines: wrapText(item, 28, 2),
        fontSize: 20,
        lineHeight: 24,
        fill: "rgba(235,240,249,0.88)",
        fontWeight: 600,
      })}`;
    }).join("")}
  </g>`;
}

function renderChartCard(chart: ReportChart, y: number) {
  const chartX = PADDING;
  const cardWidth = WIDTH - PADDING * 2;
  const cardHeight = 276;
  const plotX = chartX + 28;
  const plotY = y + 62;
  const plotWidth = cardWidth - 56;
  const plotHeight = 150;
  const renderer = chart.type === "bar" ? renderBarChart : renderLineChart;

  return `
  <g>
    <rect x="${chartX}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="34" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" />
    <text x="${chartX + 28}" y="${y + 36}" font-family="${REPORT_FONT_FAMILY}, Arial, sans-serif" font-size="21" font-weight="600" fill="rgba(229,236,248,0.80)">${escapeSvg(chart.title)}</text>
    ${chart.note ? renderTextBlock({
      x: chartX + 28,
      y: y + 54,
      width: cardWidth - 56,
      lines: wrapText(chart.note, 64, 2),
      fontSize: 15,
      lineHeight: 18,
      fill: "rgba(229,236,248,0.50)",
      fontWeight: 500,
    }) : ""}
    ${renderer({ points: chart.data, x: plotX, y: plotY, width: plotWidth, height: plotHeight })}
  </g>`;
}

function renderFooter(value: string, y: number) {
  return [
    renderTextBlock({
      x: PADDING,
      y,
      width: WIDTH - PADDING * 2,
      lines: wrapText(value, 88, 2),
      fontSize: 18,
      lineHeight: 24,
      fill: "rgba(229,236,248,0.56)",
      fontWeight: 500,
    }),
    `<text x="${WIDTH - PADDING}" y="${Math.min(1040, y + 44)}" font-family="${REPORT_FONT_FAMILY}, Arial, sans-serif" font-size="16" font-weight="700" text-anchor="end" fill="rgba(229,236,248,0.34)">RYVANO PERFORMANCE INTELLIGENCE</text>`,
  ].join("");
}

function renderTextBlock(input: {
  x: number;
  y: number;
  width: number;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  fill: string;
  fontWeight: number;
}) {
  return `<text x="${input.x}" y="${input.y}" font-family="${REPORT_FONT_FAMILY}, Arial, sans-serif" font-size="${input.fontSize}" font-weight="${input.fontWeight}" fill="${input.fill}">${input.lines.map((line, index) => `<tspan x="${input.x}" y="${input.y + index * input.lineHeight}" font-family="${REPORT_FONT_FAMILY}, Arial, sans-serif">${escapeSvg(line)}</tspan>`).join("")}</text>`;
}

function wrapText(value: string, maxChars: number, maxLines: number) {
  const words = value.trim().split(/\s+/).flatMap((word) => splitLongToken(word, maxChars));
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = "";
    }

    if (lines.length === maxLines) {
      return truncateLines(lines, maxChars);
    }
  }

  if (current) {
    lines.push(current);
  }

  return truncateLines(lines, maxChars, maxLines);
}

function splitLongToken(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return [value];
  }

  const parts: string[] = [];

  for (let index = 0; index < value.length; index += maxChars) {
    parts.push(value.slice(index, index + maxChars));
  }

  return parts;
}

function truncateLines(lines: string[], maxChars: number, maxLines = lines.length) {
  const limited = lines.slice(0, maxLines);
  const overflow = lines.length > maxLines;

  if (!overflow) {
    return limited;
  }

  const lastIndex = limited.length - 1;
  const trimmed = limited[lastIndex].slice(0, Math.max(0, maxChars - 1)).trimEnd();
  limited[lastIndex] = `${trimmed}…`;
  return limited;
}
