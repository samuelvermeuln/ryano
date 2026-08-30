import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AthleteDailyReadinessTemplateData } from "@/lib/reports/types";
import { escapeSvg } from "@/lib/reports/utils/escape-svg";
import { getSportTheme } from "@/lib/reports/sport-themes";

const W = 800;
const H = 900;

// Logo embutida em data URI — carregada uma vez na inicialização do módulo
let _logoPrincipalDataUri: string | null = null;
function getLogoPrincipalDataUri(): string {
  if (!_logoPrincipalDataUri) {
    try {
      const buffer = readFileSync(join(process.cwd(), "public", "logo-principal.png"));
      _logoPrincipalDataUri = `data:image/png;base64,${buffer.toString("base64")}`;
    } catch {
      _logoPrincipalDataUri = ""; // fallback silencioso
    }
  }
  return _logoPrincipalDataUri;
}

export function renderAthleteDailyReadinessTemplate(
  data: AthleteDailyReadinessTemplateData
): string {
  const t = getSportTheme(data.sport);
  const year = new Date().getFullYear();

  return [
    svgOpen(),
    defs(t),
    bg(),
    sectionHeader(t, data.reportType),
    sectionHero(data, t),
    sectionTitle(),
    sectionMetrics(data.metrics, t),
    sectionRecommendations(data.recommendations, t),
    sectionFooter(year),
    svgClose(),
  ].join("\n");
}

// ─── SVG wrapper ─────────────────────────────────────────────────────────────

function svgOpen() {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  xmlns="http://www.w3.org/2000/svg"
  font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">`;
}
function svgClose() { return `</svg>`; }

// ─── Defs ─────────────────────────────────────────────────────────────────────

function defs(t: ReturnType<typeof getSportTheme>) {
  return `<defs>
  <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${t.colorFrom}"/>
    <stop offset="100%" stop-color="${t.colorTo}"/>
  </linearGradient>
  <linearGradient id="gradH" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${t.colorFrom}"/>
    <stop offset="100%" stop-color="${t.colorTo}"/>
  </linearGradient>
  <filter id="shadow" x="-5%" y="-5%" width="115%" height="130%">
    <feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#00000012"/>
  </filter>
  <!-- clip para card atleta -->
  <clipPath id="clipAthleteCard">
    <rect x="20" y="80" width="218" height="190" rx="18"/>
  </clipPath>
  <!-- clip para card readiness -->
  <clipPath id="clipReadinessCard">
    <rect x="254" y="80" width="526" height="190" rx="18"/>
  </clipPath>
  <!-- clip para cada métrica (definidos dinamicamente via transform) -->
  <clipPath id="clipM0"><rect x="20"   y="380" width="178" height="190" rx="16"/></clipPath>
  <clipPath id="clipM1"><rect x="207"  y="380" width="178" height="190" rx="16"/></clipPath>
  <clipPath id="clipM2"><rect x="394"  y="380" width="178" height="190" rx="16"/></clipPath>
  <clipPath id="clipM3"><rect x="581"  y="380" width="178" height="190" rx="16"/></clipPath>
</defs>`;
}

// ─── Background ───────────────────────────────────────────────────────────────

function bg() {
  return `<rect width="${W}" height="${H}" fill="#F0F4FB"/>
<circle cx="730" cy="60" r="55" fill="none" stroke="#D1D9EF" stroke-width="2" opacity="0.4"/>
<circle cx="80" cy="${H - 80}" r="60" fill="none" stroke="#D1D9EF" stroke-width="2" opacity="0.3"/>`;
}

// ─── Header ───────────────────────────────────────────────────────────────────

function sectionHeader(t: ReturnType<typeof getSportTheme>, reportType: string) {
  const raw = reportType || t.reportLabel;
  const parts = raw.split("|");
  const left = escapeSvg(parts[0]?.trim() ?? raw);
  const right = parts[1] ? escapeSvg(parts[1].trim()) : null;

  // Logo: 866×288 → escala para altura 44px dentro do rect 160×44
  // Proporção: 44 * (866/288) = ~132px de largura
  const logoUri = getLogoPrincipalDataUri();
  const logoH = 44;
  const logoW = Math.round(logoH * (866 / 288)); // ~132px

  return `<!-- header -->
  <rect x="20" y="18" width="${logoW + 16}" height="44" rx="10" fill="#F0F4FB"/>
  ${logoUri
    ? `<image x="20" y="18" width="${logoW + 16}" height="44" href="${logoUri}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="38" y="47" font-size="16" font-weight="800" fill="white">RYVANO</text>`
  }

  <rect x="${logoW + 52}" y="18" width="${W - logoW - 52 - 16 - 64}" height="44" rx="10" fill="white" filter="url(#shadow)"/>
  <text x="${logoW + 68}" y="45" font-size="12" font-weight="700" fill="#334155">${left}${right ? ` <tspan fill="url(#grad)">
  | ${right}</tspan>` : ""}</text>

  <rect x="${W - 74}" y="18" width="54" height="44" rx="8" fill="url(#grad)"/>
  <text x="${W - 47}" y="47" text-anchor="middle" font-size="22">${t.badgeEmoji}</text>`;
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function sectionHero(data: AthleteDailyReadinessTemplateData, t: ReturnType<typeof getSportTheme>) {
  const { athlete, readiness, date } = data;
  const initial = (athlete.name.charAt(0) ?? "A").toUpperCase();
  const readinessBg = readinessBgColor(readiness.tone);

  // trunca nome e equipe para evitar overflow
  const name = truncate(athlete.name, 12);
  const team = truncate(athlete.team.toUpperCase(), 16);

  // descrição: max 2 linhas de ~38 chars dentro do card (excluindo área do gauge)
  const descLines = wrapLines(readiness.description, 38, 2);

  return `<!-- hero -->
<!-- athlete card bg -->
<rect x="20" y="80" width="218" height="190" rx="18" fill="white" filter="url(#shadow)"/>
<!-- avatar -->
<circle cx="56" cy="122" r="28" fill="${t.colorSoft}"/>
<text x="56" y="130" text-anchor="middle" font-size="22" font-weight="800" fill="${t.colorAccent}">${initial}</text>
<!-- atleta label -->
<text x="96" y="110" font-size="10" font-weight="700" fill="#94A3B8" letter-spacing="1.5">ATLETA</text>
<!-- nome — clip garante que não vaza -->
<text x="96" y="126" font-size="15" font-weight="800" fill="#0F172A" clip-path="url(#clipAthleteCard)">${escapeSvg(name)}</text>
<!-- equipe -->
<text x="96" y="142" font-size="10" font-weight="700" fill="${t.colorAccent}" clip-path="url(#clipAthleteCard)">EQUIPE: ${escapeSvg(team)}</text>
<!-- desc -->
<text x="30" y="184" font-size="11" fill="#64748B">Principais métricas de</text>
<text x="30" y="200" font-size="11" fill="#64748B">performance e prontidão</text>
<text x="30" y="216" font-size="11" fill="#64748B">para competição</text>

<!-- readiness card bg -->
<rect x="254" y="80" width="526" height="190" rx="18" fill="white" filter="url(#shadow)"/>
<!-- data -->
<text x="272" y="106" font-size="11" fill="#94A3B8">📅 ${escapeSvg(date)}</text>
<!-- label -->
<text x="272" y="126" font-size="11" font-weight="700" fill="#64748B" letter-spacing="1.5">PRONTIDÃO</text>

<!-- badge status — abaixo do label PRONTIDÃO -->
<rect x="272" y="136" width="${badgeWidth(readiness.statusLabel)}" height="26" rx="13" fill="${readinessBg}"/>
<circle cx="286" cy="149" r="5" fill="${t.colorAccent}"/>
<text x="296" y="153" font-size="11" font-weight="700" fill="#1E293B">${escapeSvg(readiness.statusLabel)}</text>
<!-- descrição — abaixo do badge -->
${descLines.map((l, i) => `<text x="272" y="${174 + i * 18}" font-size="12" fill="#475569">${escapeSvg(l)}</text>`).join("\n")}

<!-- gauge — cy=175 = centro vertical do card (y=80 + height=190 / 2) -->
${gaugeArc(660, 175, 62, readiness.score, t)}
<!-- score dentro do gauge: centralizado em cx=660, cy=175 -->
<text x="660" y="169" text-anchor="middle" font-size="32" font-weight="900" fill="url(#grad)">${readiness.score}</text>
<text x="660" y="188" text-anchor="middle" font-size="13" fill="#94A3B8">/100</text>`;
}

// ─── Title ────────────────────────────────────────────────────────────────────

function sectionTitle() {
  return `<!-- title -->
<text x="20" y="336" font-size="28" font-weight="900" fill="#0F172A">RESUMO DE DESEMPENHO DO DIA</text>
<text x="20" y="358" font-size="13" fill="#64748B">Principais métricas de performance e prontidão para competição</text>`;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function sectionMetrics(
  metrics: AthleteDailyReadinessTemplateData["metrics"],
  t: ReturnType<typeof getSportTheme>
) {
  const CARD_W = 178;
  const CARD_H = 160;
  const GAP = 9;
  const START_X = 20;
  const Y = 380;

  return metrics.slice(0, 4).map((m, i) => {
    const x = START_X + i * (CARD_W + GAP);
    return metricCard(m, x, Y, CARD_W, CARD_H, i, t);
  }).join("\n");
}

function metricCard(
  m: AthleteDailyReadinessTemplateData["metrics"][0],
  x: number,
  y: number,
  w: number,
  h: number,
  idx: number,
  t: ReturnType<typeof getSportTheme>
): string {
  const iconEmoji = metricIconEmoji(m.icon);
  const clipId = `clipM${idx}`;

  // label: max 2 linhas de ~18 chars (largura ~160px a fonte 10)
  const labelLines = wrapLines(m.label, 18, 2);


  // Y do valor: começa após o header (ícone + label), alinhado quando label tem 1 ou 2 linhas
  // 1 linha → valor em y+96; 2 linhas → valor em y+108 (13px a mais por linha extra)
  const valueY = y + 80 + (labelLines.length - 1) * 3;


  let valueBlock = "";
  let subBlock = "";
  let extraBlock = "";

  if (m.type === "sleep" && m.value !== undefined) {
    const pct = Math.max(0, Math.min(100, m.value));
    const barW = w - 28;
    valueBlock = `<text x="${x + 14}" y="${valueY}" font-size="30" font-weight="900" fill="#0F172A">${m.value}<tspan font-size="14" fill="#94A3B8">/100</tspan></text>`;
    subBlock   = `<text x="${x + 14}" y="${valueY + 18}" font-size="11" fill="#64748B">${escapeSvg(m.sub ?? "")}</text>`;
    extraBlock = `<rect x="${x+14}" y="${valueY+33}" width="${barW}" height="6" rx="3" fill="#E5E7EB"/>
<rect x="${x+14}" y="${valueY+33}" width="${Math.round((pct/100)*barW)}" height="6" rx="3" fill="url(#gradH)"/>`;

  } else if (m.type === "battery" && m.from !== undefined && m.to !== undefined) {
    const totalSegs = 10;
    const filledSegs = Math.round((m.to / 100) * totalSegs);
    const segW = Math.floor((w - 28 - (totalSegs - 1) * 3) / totalSegs);
    valueBlock = `<text x="${x+14}" y="${valueY}" font-size="26" font-weight="900" fill="url(#grad)">${m.from}<tspan font-size="16" fill="#94A3B8"> → </tspan>${m.to}</text>`;
    subBlock   = `<text x="${x+14}" y="${valueY+17}" font-size="9" font-weight="700" fill="#64748B" letter-spacing="0.5">RESERVA ENERGÉTICA</text>`;
    extraBlock = Array.from({ length: totalSegs }).map((_, i) => {
      const sx = x + 14 + i * (segW + 3);
      return `<rect x="${sx}" y="${valueY+33}" width="${segW}" height="9" rx="2" fill="${i < filledSegs ? t.colorAccent : "#E5E7EB"}"/>`;
    }).join("");

  } else if (m.value !== undefined) {
    // badge (hrv, hr)
    const dotColor = toneDotColor(m.tone);
    const labelBg  = toneLabelBg(m.tone);
    const slLabel  = m.statusLabel ? truncate(m.statusLabel, 12) : "";
    const slWidth  = slLabel.length * 8 + 24;
    valueBlock = `<text x="${x+14}" y="${valueY}" font-size="30" font-weight="900" fill="#0F172A">${m.value}<tspan font-size="14" fill="#94A3B8"> ${escapeSvg(m.unit ?? "")}</tspan></text>`;
    if (slLabel) {
      subBlock = `<rect x="${x+14}" y="${valueY+13}" width="${slWidth}" height="22" rx="11" fill="${labelBg}"/>
<circle cx="${x+24}" cy="${valueY+24}" r="4" fill="${dotColor}"/>
<text x="${x+32}" y="${valueY+28}" font-size="10" font-weight="700" fill="#1E293B">${escapeSvg(slLabel)}</text>`;
    }
  }

  return `<!-- metric ${m.icon} -->
<!-- [ALTURA DO CARD] width="${w}" height="${h}" — ajuste h em sectionMetrics (CARD_H) para mudar a altura de todos os cards -->
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="white" filter="url(#shadow)"/>
<!-- [BG DO ÍCONE] círculo de fundo do ícone — cx/cy/r controlam posição e tamanho, fill usa colorSoft do tema -->
<circle cx="${x+24}" cy="${y+24}" r="15" fill="${t.colorSoft}"/>
<!-- [ÍCONE] emoji centralizado sobre o bg — font-size controla tamanho visual do emoji -->
<text x="${x+24}" y="${y+30}" text-anchor="middle" font-size="13">${iconEmoji}</text>
<!-- [LABEL] texto do label — wrapLines(m.label, 18, 2) quebra em até 2 linhas de 18 chars; y cresce 13px por linha -->
${labelLines.map((l, li) =>
  `<text x="${x+44}" y="${y + 9 + (li+1)*13}" font-size="9" font-weight="600" fill="#64748B" clip-path="url(#${clipId})">${escapeSvg(l)}</text>`
).join("\n")}
<!-- [VALOR] bloco de valor principal — valueY = y+96 + (labelLines.length-1)*13 para alinhar independente de quantas linhas o label tem -->
${valueBlock}
<!-- [SUB / BADGE] texto auxiliar ou badge de status abaixo do valor (offsets relativos a valueY) -->
${subBlock}
<!-- [EXTRA] barra de progresso (sleep) ou segmentos de bateria (battery) — também relativos a valueY -->
${extraBlock}`;
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function sectionRecommendations(recommendations: string[], t: ReturnType<typeof getSportTheme>) {
  const Y = 592;
  const CARD_H = 240;

  const items = recommendations.slice(0, 3).map((rec, i) => {
    const ry = Y + 66 + i * 56;
    const lines = wrapLines(rec, 48, 2);
    return `<circle cx="42" cy="${ry}" r="9" fill="url(#grad)"/>
<text x="42" y="${ry+4}" text-anchor="middle" font-size="9" font-weight="800" fill="white">✔</text>
${lines.map((l, li) => `<text x="60" y="${ry + li*17}" font-size="13" fill="#475569">${escapeSvg(l)}</text>`).join("\n")}`;
  }).join("\n");

  return `<!-- recommendations -->
<rect x="20" y="${Y}" width="760" height="${CARD_H}" rx="18" fill="white" filter="url(#shadow)"/>
<circle cx="46" cy="${Y+30}" r="18" fill="${t.colorSoft}"/>
<text x="46" y="${Y+36}" text-anchor="middle" font-size="16">⭐</text>
<text x="72" y="${Y+36}" font-size="13" font-weight="800" fill="#0F172A">RECOMENDAÇÃO DO DIA</text>
${items}
<!-- deco -->
<circle cx="660" cy="${Y + CARD_H/2}" r="68" fill="${t.colorSoft}" opacity="0.55"/>
<text x="660" y="${Y + CARD_H/2 + 10}" text-anchor="middle" font-size="44">${t.badgeEmoji}</text>`;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function sectionFooter(year: number) {
  return `<!-- footer -->
<rect x="0" y="${H - 50}" width="${W}" height="50" fill="#F0F4FB"/>
<circle cx="24" cy="${H-25}" r="11" fill="url(#grad)" opacity="0.2"/>
<text x="24" y="${H-21}" text-anchor="middle" font-size="10" font-weight="900" fill="url(#grad)">R</text>
<text x="40" y="${H-21}" font-size="11" fill="#64748B">DADOS QUE GUIAM. DESEMPENHO QUE EVOLUI. © RYVANO ${year}</text>`;
}

// ─── Gauge ────────────────────────────────────────────────────────────────────

/**
 * Arco estilo velocímetro — 270° começando às 7 horas (225° a partir de 0° = direita)
 * O ponto 0° (direita) é o leste, crescendo no sentido horário.
 * Start: 225° = sudoeste   End: 495° = sudeste (= 135°)
 */
function gaugeArc(
  cx: number,
  cy: number,
  r: number,
  score: number,
  t: ReturnType<typeof getSportTheme>
): string {
  // Coordenadas do arco de track (270° de 225° até 135° = passando pelo topo)
  const startDeg = 225;
  const endDeg   = 135; // 225 + 270 = 495 mod 360 = 135
  const toRad    = (d: number) => (d * Math.PI) / 180;

  const trackSx = cx + r * Math.cos(toRad(startDeg));
  const trackSy = cy + r * Math.sin(toRad(startDeg));
  const trackEx = cx + r * Math.cos(toRad(endDeg));
  const trackEy = cy + r * Math.sin(toRad(endDeg));

  // Ponto final do arco de preenchimento
  const pct        = Math.max(0, Math.min(100, score)) / 100;
  const fillEndDeg = startDeg + pct * 270;
  const fillEx     = cx + r * Math.cos(toRad(fillEndDeg));
  const fillEy     = cy + r * Math.sin(toRad(fillEndDeg));
  const largeArc   = pct * 270 > 180 ? 1 : 0;

  // Ponto de início (mesmo para os dois arcos)
  const sx = trackSx;
  const sy = trackSy;

  return `<!-- gauge track -->
<path d="M ${fmt(trackSx)} ${fmt(trackSy)} A ${r} ${r} 0 1 1 ${fmt(trackEx)} ${fmt(trackEy)}"
      fill="none" stroke="#E2E8F0" stroke-width="10" stroke-linecap="round"/>
<!-- gauge fill -->
${pct > 0 ? `<path d="M ${fmt(sx)} ${fmt(sy)} A ${r} ${r} 0 ${largeArc} 1 ${fmt(fillEx)} ${fmt(fillEy)}"
      fill="none" stroke="url(#grad)" stroke-width="10" stroke-linecap="round"/>` : ""}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Arredonda para 2 casas decimais, evita notação científica */
function fmt(n: number): string { return n.toFixed(2); }

/** Trunca texto para nunca vazar além de maxLen chars */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 1) + "…";
}

/** Quebra texto em linhas respeitando espaços */
function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (lines.length >= maxLines) break;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = truncate(word, maxChars);
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function readinessBgColor(tone: string): string {
  return ({ good: "#DCFCE7", moderate: "#EEF2FF", warn: "#FEF3C7", bad: "#FEE2E2" } as Record<string, string>)[tone] ?? "#EEF2FF";
}

function toneDotColor(tone: string | undefined): string {
  return ({ good: "#22C55E", warn: "#F59E0B", bad: "#F59E0B" } as Record<string, string>)[tone ?? ""] ?? "#6366F1";
}

function toneLabelBg(tone: string | undefined): string {
  return ({ good: "#DCFCE7", warn: "#FEF3C7", bad: "#FEE2E2" } as Record<string, string>)[tone ?? ""] ?? "#EEF2FF";
}

function metricIconEmoji(icon: string): string {
  return ({ moon: "🌙", battery: "⚡", hrv: "💓", hr: "❤️" } as Record<string, string>)[icon] ?? "●";
}

function badgeWidth(label: string): number {
  return Math.max(110, label.length * 9 + 28);
}
