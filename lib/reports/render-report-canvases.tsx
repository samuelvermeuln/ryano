import {
  buildActivityChecklist,
  buildDailyChecklist,
  cleanNarrative,
  getFooterText,
  getPrimaryMetric,
  getSportBadgeLabel,
} from "./render-report-helpers";
import {
  ActivityChartCard,
  ActivityHighlightCard,
  DailyTrendCard,
  FooterRibbon,
  HeaderBar,
  IntroCard,
  MetricPanel,
  ReadinessCard,
  RecommendationCard,
  ReportPage,
  SportFocusCard,
} from "./render-report-components";
import { getChartPalette } from "./render-report-frame";
import type { ReportBrandAssets, ReportFrame, ReportPalette } from "./render-report-types";

export function DailyReportCanvas(input: {
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

export function ActivityReportCanvas(input: {
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

export function OperationalReportCanvas(input: {
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
