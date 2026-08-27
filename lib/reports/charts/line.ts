import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";

import type { ChartPoint } from "@/lib/reports/types";
import { escapeSvg } from "@/lib/reports/utils/escape-svg";

export function renderLineChart(input: {
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
  const minValue = Math.min(...points.map((point) => point.value), 0);
  const xScale = scaleLinear()
    .domain([0, Math.max(points.length - 1, 1)])
    .range([input.x, input.x + input.width]);
  const yScale = scaleLinear()
    .domain([minValue, maxValue])
    .range([input.y + input.height, input.y]);
  const path = line<ChartPoint>()
    .x((point, index) => xScale(index))
    .y((point) => yScale(point.value))
    .curve(curveMonotoneX)(points) ?? "";
  const areaBaseY = input.y + input.height;
  const areaPath = `${path} L ${input.x + input.width} ${areaBaseY} L ${input.x} ${areaBaseY} Z`;
  const grid = [0, 0.5, 1]
    .map((step) => {
      const value = minValue + (maxValue - minValue) * step;
      const lineY = yScale(value);
      return `<line x1="${input.x}" y1="${lineY}" x2="${input.x + input.width}" y2="${lineY}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
    })
    .join("");
  const dots = points
    .map((point, index) => {
      const cx = xScale(index);
      const cy = yScale(point.value);
      return [
        point.formattedValue
          ? `<text x="${cx}" y="${Math.max(input.y + 14, cy - 18)}" font-size="17" font-weight="600" text-anchor="middle" fill="rgba(255,255,255,0.92)">${escapeSvg(point.formattedValue)}</text>`
          : "",
        `<circle cx="${cx}" cy="${cy}" r="14" fill="rgba(124,156,255,0.18)" />`,
        `<circle cx="${cx}" cy="${cy}" r="7" fill="#EAF2FF" />`,
        `<text x="${cx}" y="${areaBaseY + 28}" font-size="20" text-anchor="middle" fill="rgba(255,255,255,0.72)">${escapeSvg(point.label)}</text>`,
      ].join("");
    })
    .join("");

  return [
    grid,
    `<path d="${areaPath}" fill="url(#lineAreaGradient)" />`,
    `<path d="${path}" fill="none" stroke="url(#lineGradient)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />`,
    dots,
  ].join("");
}
