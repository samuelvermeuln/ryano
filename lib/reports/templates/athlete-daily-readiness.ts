import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AthleteDailyReadinessTemplateData } from "@/lib/reports/types";
import { escapeSvg } from "@/lib/reports/utils/escape-svg";
import { getSportTheme } from "@/lib/reports/sport-themes";

const W = 800;
const H = 1124;

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
    svgClose(),
  ].join("\n");
}

// ─── SVG wrapper ─────────────────────────────────────────────────────────────

function svgOpen() {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  xmlns="http://www.w3.org/2000/svg"
  font-family="Geist">`;
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
  <!-- clip para card atleta (não mais usado no hero, mantido por segurança) -->
  <clipPath id="clipAthleteCard">
    <rect x="20" y="80" width="760" height="190" rx="18"/>
  </clipPath>
  <!-- clip para card readiness -->
  <clipPath id="clipReadinessCard">
    <rect x="20" y="80" width="760" height="190" rx="18"/>
  </clipPath>
  <!-- clips para métricas — grid 2x2: col0 x=20, col1 x=404, rows y=470 e y=638 -->
  <clipPath id="clipM0"><rect x="20"  y="470" width="376" height="160" rx="16"/></clipPath>
  <clipPath id="clipM1"><rect x="404" y="470" width="376" height="160" rx="16"/></clipPath>
  <clipPath id="clipM2"><rect x="20"  y="638" width="376" height="160" rx="16"/></clipPath>
  <clipPath id="clipM3"><rect x="404" y="638" width="376" height="160" rx="16"/></clipPath>
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
  const left  = escapeSvg(parts[0]?.trim() ?? raw);
  const right = parts[1] ? escapeSvg(parts[1].trim()) : null;

  // Logo PNG: 866×288 → altura 52px → largura proporcional ~156px
  const logoUri = getLogoPrincipalDataUri();
  const logoH = 52;
  const logoW = Math.round(logoH * (866 / 288)); // ~156px

  // Badge: largura baseada no conteúdo (não estica até a borda)
  // Estimativa: left ~8px/char + separador + right ~8px/char + padding + ícone
  const leftPx  = left.length * 8;
  const rightPx = right ? right.length * 8 + 28 : 0; // "| " + texto
  const BADGE_W = leftPx + rightPx + 70; // 70 = padding esq+dir + ícone ≋
  const BADGE_X = W - BADGE_W - 20;      // alinha à direita com 20px de margem

  return `<!-- header -->
<!-- logo PNG -->
<rect x="20" y="14" width="${logoW + 16}" height="${logoH}" rx="12" fill="${t.colorSoft}"/>
${logoUri
  ? `<image x="20" y="14" width="${logoW + 16}" height="${logoH}" href="${logoUri}" preserveAspectRatio="xMidYMid meet"/>`
  : `<rect x="28" y="21" width="38" height="38" rx="9" fill="url(#grad)"/>
<text x="47" y="46" text-anchor="middle" font-size="22" font-weight="900" fill="white">R</text>
<text x="76" y="38" font-size="15" font-weight="800" fill="#0F172A">RYVANO</text>
<text x="76" y="53" font-size="9" font-weight="500" fill="#94A3B8" letter-spacing="1">RYVANO ESPORTS DATA</text>`
}

<!-- badge: left text | right text + marca vetorial -->
<rect x="${BADGE_X}" y="14" width="${BADGE_W}" height="${logoH}" rx="26" fill="white" filter="url(#shadow)"/>
<text x="${BADGE_X + 24}" y="${14 + logoH/2 + 5}" font-size="13" font-weight="700" fill="#334155">${left}</text>
${right ? `<text x="${BADGE_X + 30 + left.length * 7 + 10}" y="${14 + logoH/2 + 5}" font-size="13" font-weight="700" fill="${t.colorAccent}"> | ${right}</text>` : ""}
<path d="M ${BADGE_X + BADGE_W - 35} 31 q 7 -8 14 0 q 7 8 14 0 M ${BADGE_X + BADGE_W - 35} 38 q 7 -8 14 0 q 7 8 14 0" fill="none" stroke="${t.colorAccent}" stroke-width="2" stroke-linecap="round"/>`;
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function sectionHero(data: AthleteDailyReadinessTemplateData, t: ReturnType<typeof getSportTheme>) {
  const { athlete, readiness, date } = data;
  const initial = (athlete.name.charAt(0) ?? "A").toUpperCase();
  const readinessBg = readinessBgColor(readiness.tone);
  const descLine = wrapLines(readiness.description, 60, 1)[0] ?? "";

  // ── Card atleta: y=88, height=80, full-width
  const AY = 88;

  // ── Card readiness: y=182, height=190, full-width
  const RY = 182;
  const RH = 190;
  const gaugeCx = 670;
  const gaugeCy = RY + RH / 2;  // 277
  const gaugeR  = 75;

  return `<!-- card atleta — linha simples -->
<rect x="20" y="${AY}" width="760" height="80" rx="16" fill="white" filter="url(#shadow)"/>
<!-- avatar -->
<circle cx="60" cy="${AY+40}" r="28" fill="${t.colorSoft}"/>
<text x="60" y="${AY+48}" text-anchor="middle" font-size="22" font-weight="800" fill="${t.colorAccent}">${initial}</text>
<!-- nome e equipe -->
<text x="104" y="${AY+33}" font-size="17" font-weight="800" fill="#0F172A">${escapeSvg(athlete.name)}</text>
<text x="104" y="${AY+54}" font-size="11" font-weight="700" fill="${t.colorAccent}">EQUIPE: ${escapeSvg(athlete.team.toUpperCase())}</text>

<!-- card readiness — full-width com score + gauge -->
<rect x="20" y="${RY}" width="760" height="${RH}" rx="18" fill="white" filter="url(#shadow)"/>
<!-- date icon + data -->
<rect x="40" y="${RY+15}" width="12" height="12" rx="2" fill="none" stroke="#94A3B8" stroke-width="1.4"/>
<path d="M43 ${RY+13}v4 M49 ${RY+13}v4 M40 ${RY+20}h12" fill="none" stroke="#94A3B8" stroke-width="1.4" stroke-linecap="round"/>
<text x="58" y="${RY+26}" font-size="11" fill="#94A3B8">${escapeSvg(date)}</text>
<!-- label PRONTIDÃO -->
<text x="40" y="${RY+48}" font-size="12" font-weight="700" fill="#64748B" letter-spacing="1.5">PRONTIDÃO</text>
<!-- score grande -->
<text x="40" y="${RY+110}" font-size="56" font-weight="900" fill="url(#grad)">${readiness.score}<tspan font-size="22" fill="#94A3B8" dx="4">/100</tspan></text>
<!-- badge status -->
<rect x="40" y="${RY+120}" width="${badgeWidth(readiness.statusLabel)}" height="28" rx="14" fill="${readinessBg}"/>
<circle cx="56" cy="${RY+134}" r="5" fill="${t.colorAccent}"/>
<text x="66" y="${RY+138}" font-size="11" font-weight="700" fill="#1E293B">${escapeSvg(readiness.statusLabel)}</text>
<!-- descrição -->
<text x="40" y="${RY+166}" font-size="12" fill="#475569">${escapeSvg(descLine)}</text>
<!-- gauge à direita -->
${gaugeArc(gaugeCx, gaugeCy, gaugeR, readiness.score, t)}`;
}

// ─── Title ────────────────────────────────────────────────────────────────────

function sectionTitle() {
  // Readiness termina em y=182+190=372 → título em y=400
  return `<!-- title -->
<text x="20" y="404" font-size="28" font-weight="900" fill="#0F172A">RESUMO DE</text>
<text x="20" y="436" font-size="28" font-weight="900" fill="#0F172A">DESEMPENHO DO DIA</text>
<text x="20" y="456" font-size="12" fill="#64748B">Principais métricas de performance e prontidão para competição</text>`;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

function sectionMetrics(
  metrics: AthleteDailyReadinessTemplateData["metrics"],
  t: ReturnType<typeof getSportTheme>
) {
  // Grid 2×2: 2 colunas, 2 linhas
  const CARD_W = 376;   // (760 - gap) / 2
  const CARD_H = 160;
  const GAP    = 8;
  const START_X = 20;
  const START_Y = 470;  // abaixo do título (y=456 + ~14px)

  return metrics.slice(0, 4).map((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = START_X + col * (CARD_W + GAP);
    const y = START_Y + row * (CARD_H + GAP);
    return metricCard(m, x, y, CARD_W, CARD_H, i, t);
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
<!-- [ÍCONE] SVG vetorial para não depender de glyphs emoji indisponíveis -->
${metricIconSvg(m.icon, x + 24, y + 24, t.colorAccent)}
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
  const Y = 810;
  // 3 itens × 36px + header 52px + footer 44px + padding 20px = ~240px
  const CARD_H = 240;
  const ICON_X = 44;
  const TEXT_X = 66;

  // circleCy = centro vertical da área de itens (entre header e footer)
  const itemsAreaCy = Y + 52 + (3 * 36) / 2;
  const circles = [556, 614, 672];

  const items = recommendations.slice(0, 3).map((rec, i) => {
    const ry = Y + 68 + i * 36;
    const line = wrapLines(rec, 52, 1)[0] ?? "";
    return `<circle cx="${ICON_X}" cy="${ry}" r="11" fill="none" stroke="${t.colorAccent}" stroke-width="1.8"/>
<path d="M${ICON_X-5} ${ry} l4 4 l7 -8" fill="none" stroke="${t.colorAccent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<text x="${TEXT_X}" y="${ry+4}" font-size="13" fill="#475569">${escapeSvg(line)}</text>`;
  }).join("\n");

  const circleEls = circles.map((x, index) =>
    `<circle cx="${x}" cy="${itemsAreaCy}" r="24" fill="${t.colorAccent}" opacity="0.85"/>
${sportMarkSvg(index, x, itemsAreaCy)}`
  ).join("\n");

  // Footer dentro do card — faixa cinza clara na parte inferior
  const footerY = Y + CARD_H - 44;
  const yr = new Date().getFullYear();

  return `<!-- recommendations -->
<rect x="20" y="${Y}" width="760" height="${CARD_H}" rx="18" fill="white" filter="url(#shadow)"/>
<!-- header -->
<circle cx="${ICON_X}" cy="${Y+28}" r="17" fill="${t.colorSoft}"/>
<path d="M${ICON_X} ${Y+18} l3 7 l8 .6 l-6 5 l2 8 l-7 -4 l-7 4 l2 -8 l-6 -5 l8 -.6z" fill="${t.colorAccent}"/>
<text x="70" y="${Y+33}" font-size="13" font-weight="800" fill="#0F172A" letter-spacing="0.5">RECOMENDAÇÃO DO DIA</text>
<!-- itens -->
${items}
<!-- círculos de esporte -->
${circleEls}
<!-- footer dentro do card -->
<rect x="21" y="${footerY}" width="758" height="43" rx="0" fill="#F8FAFC"/>
<path d="M21,${footerY} h758 v25 q0,18 -18,18 h-722 q-18,0 -18,-18 z" fill="#F8FAFC"/>
<circle cx="${W/2 - 118}" cy="${footerY+22}" r="11" fill="${t.colorAccent}" opacity="0.2"/>
<text x="${W/2 - 118}" y="${footerY+26}" text-anchor="middle" font-size="10" font-weight="900" fill="${t.colorAccent}">R</text>
<text x="${W/2 - 99}" y="${footerY+26}" font-size="11" fill="#94A3B8">DADOS QUE GUIAM. DESEMPENHO QUE EVOLUI. © RYVANO ${yr}</text>`;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function sectionFooter(year: number) {
  // Card reco termina em 810+228=1038 → footer centralizado em 1060
  const FY = 1062;
  return `<!-- footer -->
<circle cx="${W/2 - 120}" cy="${FY}" r="12" fill="url(#grad)" opacity="0.18"/>
<text x="${W/2 - 120}" y="${FY+4}" text-anchor="middle" font-size="10" font-weight="900" fill="url(#grad)">R</text>
<text x="${W/2 - 100}" y="${FY+4}" font-size="11" fill="#94A3B8">DADOS QUE GUIAM. DESEMPENHO QUE EVOLUI. © RYVANO ${year}</text>`;
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

function metricIconSvg(icon: string, x: number, y: number, color: string): string {
  switch (icon) {
    case "moon":
      return `<path d="M${x+5} ${y-9} a10 10 0 1 0 5 18 a8 8 0 1 1 -5 -18" fill="${color}"/>`;
    case "battery":
      return `<rect x="${x-9}" y="${y-6}" width="17" height="12" rx="2" fill="none" stroke="${color}" stroke-width="2"/><path d="M${x+8} ${y-3}h3v6h-3z M${x-5} ${y}h9" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
    case "hrv":
      return `<path d="M${x-10} ${y+1} h6 l3 -6 l4 12 l3 -6 h8" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    case "hr":
      return `<path d="M${x} ${y+9} C${x-18} ${y-2} ${x-9} ${y-12} ${x} ${y-5} C${x+9} ${y-12} ${x+18} ${y-2} ${x} ${y+9}z" fill="${color}"/>`;
    default:
      return `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`;
  }
}

function sportMarkSvg(index: number, x: number, y: number): string {
  if (index === 0) return `<path d="M${x-12} ${y+3} q6 -10 12 0 q6 10 12 0" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>`;
  if (index === 1) return `<path d="M${x-9} ${y+6} h18 M${x} ${y-7} v13 M${x-6} ${y-2} h12" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>`;
  return `<path d="M${x-8} ${y-7} l16 14 M${x+8} ${y-7} l-16 14" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>`;
}

function badgeWidth(label: string): number {
  return Math.max(110, label.length * 9 + 28);
}
