import type { ReactNode } from "react";

import type { ReportChart } from "@/lib/reports/types";

import { getPointBarColor, withOpacity } from "./render-report-helpers";
import type { ChartPalette, ReportPalette } from "./render-report-types";

export function Panel(input: {
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
        overflow: "hidden",
      }}
    >
      {input.children}
    </div>
  );
}

export function Pill(input: {
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

export function LineInsightChart(input: {
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

export function BarInsightChart(input: {
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

export function ChartEmptyState(input: { palette: ReportPalette; label: string }) {
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
