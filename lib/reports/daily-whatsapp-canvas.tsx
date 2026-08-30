import type { DailyGarminSummaryTemplateData } from "@/lib/reports/types";

import {
  cleanFooter,
  cleanNarrative,
  clampPercentage,
  getInitials,
  getReportMetricByLabels,
  parseScoreValue,
  withOpacity,
} from "./render-report-helpers";
import {
  DailyReadinessGauge,
  DailyWhatsappMetricCard,
  FooterRibbon,
  ReportPage,
} from "./render-report-components";
import { Panel, Pill } from "./render-report-primitives";
import {
  getDailyToneColors,
  getDailyWhatsappMetricCards,
  getDailyWhatsappPalette,
  getDailyWhatsappRecommendations,
  getDailyWhatsappTheme,
} from "./render-report-frame";
import type { ReportBrandAssets } from "./render-report-types";

export function DailyGarminSummaryWhatsappCanvas(input: {
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
          <div style={{ display: "flex", width: 304, minHeight: 236, marginRight: 16 }}>
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
                      value=""
                      background={theme.soft}
                      color={theme.accent}
                      border={withOpacity(theme.accent, 0.16)}
                    />
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <div style={{ display: "flex", width: 644, minHeight: 236 }}>
            <Panel palette={palette} padding={24}>
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", width: 426, marginRight: 18 }}>
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

                <DailyReadinessGauge score={readinessScore} from={theme.from} to={theme.to} size={136} />
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
                width: 474,
                marginRight: index === 0 ? 16 : 0,
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
                width: 474,
                marginRight: index === 0 ? 16 : 0,
              }}
            >
              <DailyWhatsappMetricCard metric={metric} theme={theme} palette={palette} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", width: "100%", minHeight: 324, marginTop: 16, flex: 1 }}>
          <Panel palette={palette} padding={24}>
            <div style={{ display: "flex", width: "100%", height: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", width: 620, paddingRight: 20 }}>
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
                      fontSize: 16,
                      fontWeight: 800,
                    }}
                  >
                    R
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
                          fontSize: 10,
                          fontWeight: 800,
                        }}
                      >
                        {index + 1}
                      </div>
                      <div style={{ display: "flex", flex: 1, fontSize: 20, lineHeight: 1.42, color: palette.textSecondary }}>
                        {item}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", marginLeft: "auto", width: 228, alignItems: "flex-end", justifyContent: "flex-end" }}>
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
                        width: 64,
                        height: 64,
                        marginLeft: index === 0 ? 0 : 8,
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
