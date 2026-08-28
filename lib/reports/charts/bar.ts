import { scaleBand, scaleLinear } from "d3-scale";

import type { ChartPoint } from "@/lib/reports/types";
import { escapeSvg } from "@/lib/reports/utils/escape-svg";

export function renderBarChart(input: {
  points: ChartPoint[];
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const points = input.points.filter((point) => Number.isFinite(point.value));

  if (!points.length) {
    return "";
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const xScale = scaleBand<string>()
    .domain(points.map((point) => point.label))
    .range([input.x, input.x + input.width])
    .padding(0.28);
  const yScale = scaleLinear()
    .domain([0, maxValue])
    .range([input.y + input.height, input.y]);
  const grid = [0, 0.5, 1]
    .map((step) => {
      const value = maxValue * step;
      const lineY = yScale(value);

      return `<line x1="${input.x}" y1="${lineY}" x2="${input.x + input.width}" y2="${lineY}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
    })
    .join("");
  const bars = points
    .map((point) => {
      const barX = xScale(point.label) ?? input.x;
      const barY = yScale(point.value);
      const barHeight = Math.max(10, input.y + input.height - barY);
      const fill = point.tone === "warning"
        ? "url(#warningBarGradient)"
        : point.tone === "neutral"
          ? "rgba(255,255,255,0.22)"
          : "url(#barGradient)";
      const centerX = barX + xScale.bandwidth() / 2;

      return [
        point.formattedValue
          ? `<text x="${centerX}" y="${Math.max(input.y + 18, barY - 12)}" font-family="RyvanoReportFont, Arial, sans-serif" font-size="18" font-weight="600" text-anchor="middle" fill="rgba(255,255,255,0.92)">${escapeSvg(point.formattedValue)}</text>`
          : "",
        `<rect x="${barX}" y="${barY}" width="${xScale.bandwidth()}" height="${barHeight}" rx="20" fill="${fill}" />`,
        `<text x="${centerX}" y="${input.y + input.height + 28}" font-family="RyvanoReportFont, Arial, sans-serif" font-size="20" text-anchor="middle" fill="rgba(255,255,255,0.72)">${escapeSvg(point.label)}</text>`,
      ].join("");
    })
    .join("");

  return `${grid}${bars}`;
}
