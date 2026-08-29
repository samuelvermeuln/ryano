import type { AthleteDailyReadinessTemplateData } from "@/lib/reports/types";
import { escapeSvg } from "@/lib/reports/utils/escape-svg";
import { getSportTheme } from "@/lib/reports/sport-themes";

// Canvas: proporção vertical para WhatsApp/Instagram stories
const W = 800;
const H = 1120;

/**
 * Template de Prontidão Diária do Atleta
 *
 * Layout idêntico à imagem de referência:
 *   ┌─────────────────────────────────────────────┐
 *   │ LOGO RYVANO        RELATÓRIO SPORT | BADGE  │  header
 *   ├──────────────┬──────────────────────────────┤
 *   │ Foto + Nome  │ Prontidão 72/100 + gauge      │  hero
 *   │ + Equipe     │ badge status + descrição      │
 *   ├──────────────┴──────────────────────────────┤
 *   │ RESUMO DE DESEMPENHO DO DIA                 │  title
 *   │ subtítulo                                   │
 *   ├──────┬──────────┬──────────────┬────────────┤
 *   │ SONO │ BATTERY  │ VFC NOTURNA  │ FC REPOUSO │  metrics
 *   │ 87/100│ 38→88   │ 73 ms        │ 50 bpm     │
 *   │ 7h56m │ RESERVA │ ●BALANCEADA  │ ●NORMAL    │
 *   │ ──── │ ████████│              │            │
 *   ├──────┴──────────┴──────────────┴────────────┤
 *   │ ⭐ RECOMENDAÇÃO DO DIA           [ilustração]│  reco
 *   │ ✔ item 1                                    │
 *   │ ✔ item 2                                    │
 *   │ ✔ item 3                                    │
 *   ├─────────────────────────────────────────────┤
 *   │ ® DADOS QUE GUIAM. DESEMPENHO QUE EVOLUI.  │  footer
 *   └─────────────────────────────────────────────┘
 */
export function renderAthleteDailyReadinessTemplate(
  data: AthleteDailyReadinessTemplateData
): string {
  const t = getSportTheme(data.sport);
  const year = new Date().getFullYear();

  const sections = [
    svgOpen(),
    defs(t),
    bg(),
    sectionHeader(t, data.reportType),
    sectionHero(data, t),
    sectionTitle(data),
    sectionMetrics(data.metrics, t),
    sectionRecommendations(data.recommendations, t),
    sectionFooter(data.athlete.team, year),
    svgClose(),
  ];

  return sections.join("\n");
}

// ─── SVG wrapper ───────────────────────────────────────────────────────────

function svgOpen() {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  xmlns="http://www.w3.org/2000/svg"
  font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">`;
}

function svgClose() {
  return `</svg>`;
}

// ─── Defs ───────────────────────────────────────────────────────────────────

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
  <filter id="shadow" x="-5%" y="-5%" width="110%" height="120%">
    <feDropShadow dx="0" dy="3" stdDeviation="8" flood-color="#00000012"/>
  </filter>
  <clipPath id="avatarClip"><circle cx="36" cy="36" r="30"/></clipPath>
</defs>`;
}

// ─── Background ─────────────────────────────────────────────────────────────

function bg() {
  return `<!-- bg -->
<rect width="${W}" height="${H}" fill="#F0F4FB"/>
<!-- gear decorativo top-right -->
<circle cx="730" cy="60" r="55" fill="none" stroke="#D1D9EF" stroke-width="2" opacity="0.5"/>
<circle cx="730" cy="60" r="42" fill="none" stroke="#D1D9EF" stroke-width="1" opacity="0.4"/>
<!-- gear decorativo bottom-left -->
<circle cx="80" cy="${H - 80}" r="60" fill="none" stroke="#D1D9EF" stroke-width="2" opacity="0.4"/>`;
}

// ─── Header ─────────────────────────────────────────────────────────────────

function sectionHeader(t: ReturnType<typeof getSportTheme>, reportType: string) {
  const label = escapeSvg(reportType || t.reportLabel);
  return `<!-- header -->
<g transform="translate(0,0)">
  <!-- logo bg -->
  <rect x="20" y="18" width="160" height="44" rx="10" fill="#0F172A"/>
  <!-- R icon -->
  <text x="38" y="47" font-size="22" font-weight="900" fill="url(#grad)">R</text>
  <!-- RYVANO -->
  <text x="56" y="43" font-size="16" font-weight="800" fill="white">RYVANO</text>
  <text x="56" y="56" font-size="9" font-weight="400" fill="#94A3B8" letter-spacing="1">ESPORTS DATA</text>

  <!-- badge relatório -->
  <rect x="298" y="18" width="470" height="44" rx="10" fill="white" filter="url(#shadow)"/>
  <text x="316" y="45" font-size="13" font-weight="700" fill="#334155">${label.split("|")[0]?.trim() ?? label}</text>
  ${
    label.includes("|")
      ? `<text x="${316 + measureText(label.split("|")[0]?.trim() ?? "", 13, 700) + 8}" y="45"
             font-size="13" font-weight="700" fill="url(#grad)">| ${escapeSvg(label.split("|")[1]?.trim() ?? "PERFORMANCE")}</text>`
      : ""
  }

  <!-- sport emoji box -->
  <rect x="726" y="18" width="54" height="44" rx="8" fill="url(#grad)"/>
  <text x="753" y="47" text-anchor="middle" font-size="22">${t.badgeEmoji}</text>
</g>`;
}

// ─── Hero (atleta + prontidão) ────────────────────────────────────────────

function sectionHero(data: AthleteDailyReadinessTemplateData, t: ReturnType<typeof getSportTheme>) {
  const { athlete, readiness, date } = data;
  const readinessBg = readinessBgColor(readiness.tone);
  const readinessDot = t.colorAccent;
  const initial = (athlete.name.charAt(0) ?? "A").toUpperCase();

  return `<!-- hero row -->
<g transform="translate(0,80)">

  <!-- athlete card -->
  <rect x="20" y="0" width="220" height="190" rx="18" fill="white" filter="url(#shadow)"/>
  <!-- avatar -->
  <circle cx="56" cy="42" r="30" fill="${t.colorSoft}"/>
  <text x="56" y="50" text-anchor="middle" font-size="24" font-weight="800" fill="${t.colorAccent}">${initial}</text>
  <!-- name -->
  <text x="100" y="32" font-size="12" font-weight="700" fill="#94A3B8" letter-spacing="1">ATLETA</text>
  <text x="100" y="50" font-size="16" font-weight="800" fill="#0F172A">${escapeSvg(athlete.name)}</text>
  <!-- team -->
  <text x="100" y="66" font-size="11" font-weight="700" fill="${t.colorAccent}">EQUIPE: ${escapeSvg(athlete.team.toUpperCase())}</text>
  <!-- descrição breve -->
  <text x="30" y="110" font-size="11" fill="#64748B">Principais métricas de</text>
  <text x="30" y="126" font-size="11" fill="#64748B">performance e prontidão</text>
  <text x="30" y="142" font-size="11" fill="#64748B">para competição</text>

  <!-- readiness card -->
  <rect x="254" y="0" width="526" height="190" rx="18" fill="white" filter="url(#shadow)"/>

  <!-- data -->
  <text x="278" y="28" font-size="11" fill="#94A3B8">📅 ${escapeSvg(date)}</text>

  <!-- PRONTIDÃO label -->
  <text x="278" y="52" font-size="11" font-weight="700" fill="#64748B" letter-spacing="1.5">PRONTIDÃO</text>

  <!-- score grande -->
  <text x="278" y="105" font-size="52" font-weight="900" fill="url(#grad)">${readiness.score}</text>
  <text x="${278 + scoreWidth(readiness.score)}" y="88" font-size="20" font-weight="500" fill="#94A3B8">/100</text>

  <!-- badge status -->
  <rect x="278" y="116" width="${badgeWidth(readiness.statusLabel)}" height="26" rx="13" fill="${readinessBg}"/>
  <circle cx="294" cy="129" r="5" fill="${readinessDot}"/>
  <text x="304" y="133" font-size="11" font-weight="700" fill="#1E293B">${escapeSvg(readiness.statusLabel)}</text>

  <!-- descrição -->
  ${wrapText(readiness.description, 278, 157, 290, 13, "#475569", 2)}

  <!-- gauge arc -->
  ${gaugeArc(660, 110, 70, readiness.score, t)}
</g>`;
}

// ─── Title ───────────────────────────────────────────────────────────────────

function sectionTitle(data: AthleteDailyReadinessTemplateData) {
  return `<!-- title -->
<g transform="translate(0,290)">
  <text x="20" y="42" font-size="30" font-weight="900" fill="#0F172A">RESUMO DE DESEMPENHO DO DIA</text>
  <text x="20" y="66" font-size="13" fill="#64748B">Principais métricas de performance e prontidão para competição</text>
</g>`;
}

// ─── Metrics (4 cards horizontais) ─────────────────────────────────────────

function sectionMetrics(
  metrics: AthleteDailyReadinessTemplateData["metrics"],
  t: ReturnType<typeof getSportTheme>
) {
  const CARD_W = 178;
  const CARD_H = 190;
  const GAP = 9;
  const Y = 380;

  // garante 4 slots: sleep, battery, hrv, hr
  const slots = metrics.slice(0, 4);

  return `<!-- metrics -->
<g transform="translate(0,${Y})">
  ${slots
    .map((m, i) => {
      const x = 20 + i * (CARD_W + GAP);
      return metricCard(m, x, 0, CARD_W, CARD_H, t);
    })
    .join("\n")}
</g>`;
}

function metricCard(
  m: AthleteDailyReadinessTemplateData["metrics"][0],
  x: number,
  y: number,
  w: number,
  h: number,
  t: ReturnType<typeof getSportTheme>
): string {
  const iconEmoji = metricIconEmoji(m.icon);
  const abbrev = metricAbbrev(m.icon);

  let valueBlock = "";
  let subBlock = "";
  let extraBlock = "";

  if (m.type === "sleep" && m.value !== undefined) {
    // 87/100
    valueBlock = `<text x="${x + 14}" y="${y + 112}" font-size="32" font-weight="900" fill="#0F172A">${m.value}<tspan font-size="16" fill="#94A3B8">/100</tspan></text>`;
    // 7h 56min
    subBlock = `<text x="${x + 14}" y="${y + 132}" font-size="12" fill="#64748B">${escapeSvg(m.sub ?? "")}</text>`;
    // barra de progresso
    const pct = Math.max(0, Math.min(100, m.value));
    const barW = w - 28;
    extraBlock = `
      <rect x="${x + 14}" y="${y + 148}" width="${barW}" height="7" rx="4" fill="#E5E7EB"/>
      <rect x="${x + 14}" y="${y + 148}" width="${Math.round((pct / 100) * barW)}" height="7" rx="4" fill="url(#gradH)"/>`;
  } else if (m.type === "battery" && m.from !== undefined && m.to !== undefined) {
    // 38 → 88
    valueBlock = `<text x="${x + 14}" y="${y + 112}" font-size="28" font-weight="900" fill="url(#grad)">${m.from}<tspan font-size="18" fill="#94A3B8"> → </tspan>${m.to}</text>`;
    subBlock = `<text x="${x + 14}" y="${y + 130}" font-size="10" font-weight="700" fill="#64748B" letter-spacing="0.5">RESERVA ENERGÉTICA</text>`;
    // segmentos de bateria
    const totalSegs = 10;
    const filledSegs = Math.round((m.to / 100) * totalSegs);
    const segW = Math.floor((w - 28 - (totalSegs - 1) * 3) / totalSegs);
    extraBlock = Array.from({ length: totalSegs })
      .map((_, i) => {
        const sx = x + 14 + i * (segW + 3);
        const filled = i < filledSegs;
        return `<rect x="${sx}" y="${y + 148}" width="${segW}" height="10" rx="2" fill="${filled ? t.colorAccent : "#E5E7EB"}"/>`;
      })
      .join("");
  } else if ((m.type === "badge" || m.type === "sleep") && m.value !== undefined) {
    // 73 ms  ou  50 bpm
    valueBlock = `<text x="${x + 14}" y="${y + 112}" font-size="32" font-weight="900" fill="#0F172A">${m.value}<tspan font-size="16" fill="#94A3B8"> ${escapeSvg(m.unit ?? "")}</tspan></text>`;
    if (m.statusLabel) {
      const dotColor = toneDotColor(m.tone);
      const labelBg = toneLabelBg(m.tone);
      const labelW = m.statusLabel.length * 8 + 28;
      subBlock = `
        <rect x="${x + 14}" y="${y + 126}" width="${labelW}" height="22" rx="11" fill="${labelBg}"/>
        <circle cx="${x + 25}" cy="${y + 137}" r="4" fill="${dotColor}"/>
        <text x="${x + 33}" y="${y + 141}" font-size="10" font-weight="700" fill="#1E293B">${escapeSvg(m.statusLabel)}</text>`;
    }
  }

  return `<!-- metric card ${m.icon} -->
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="white" filter="url(#shadow)"/>
<!-- icon -->
<circle cx="${x + 26}" cy="${y + 26}" r="16" fill="${t.colorSoft}"/>
<text x="${x + 26}" y="${y + 32}" text-anchor="middle" font-size="14">${iconEmoji}</text>
<!-- abbrev -->
<text x="${x + 46}" y="${y + 22}" font-size="10" font-weight="700" fill="${t.colorAccent}">${abbrev}</text>
<!-- label -->
<text x="${x + 46}" y="${y + 35}" font-size="10" font-weight="600" fill="#64748B" letter-spacing="0.3">${escapeSvg(m.label)}</text>
${valueBlock}
${subBlock}
${extraBlock}`;
}

// ─── Recommendations ────────────────────────────────────────────────────────

function sectionRecommendations(recommendations: string[], t: ReturnType<typeof getSportTheme>) {
  const Y = 590;
  const CARD_H = 230;

  return `<!-- recommendations -->
<g transform="translate(0,${Y})">
  <rect x="20" y="0" width="760" height="${CARD_H}" rx="18" fill="white" filter="url(#shadow)"/>

  <!-- icon + título -->
  <circle cx="46" cy="30" r="18" fill="${t.colorSoft}"/>
  <text x="46" y="36" text-anchor="middle" font-size="16">⭐</text>
  <text x="72" y="36" font-size="13" font-weight="800" fill="#0F172A" letter-spacing="0.5">RECOMENDAÇÃO DO DIA</text>

  ${recommendations
    .slice(0, 3)
    .map((rec, i) => {
      const ry = 68 + i * 52;
      const lines = splitLines(rec, 46);
      return `<!-- rec ${i + 1} -->
<circle cx="42" cy="${ry}" r="9" fill="url(#grad)"/>
<text x="42" y="${ry + 4}" text-anchor="middle" font-size="9" font-weight="800" fill="white">✔</text>
<text x="60" y="${ry + 4}" font-size="13" fill="#475569">${escapeSvg(lines[0] ?? "")}</text>
${lines[1] ? `<text x="60" y="${ry + 20}" font-size="13" fill="#475569">${escapeSvg(lines[1])}</text>` : ""}`;
    })
    .join("\n")}

  <!-- ilustração placeholder (círculos decorativos) -->
  <circle cx="660" cy="${CARD_H / 2}" r="70" fill="${t.colorSoft}" opacity="0.6"/>
  <circle cx="700" cy="${CARD_H / 2 - 20}" r="40" fill="${t.colorFrom}" opacity="0.15"/>
  <text x="660" y="${CARD_H / 2 + 8}" text-anchor="middle" font-size="48">${t.badgeEmoji}</text>
</g>`;
}

// ─── Footer ─────────────────────────────────────────────────────────────────

function sectionFooter(team: string, year: number) {
  return `<!-- footer -->
<g transform="translate(0,${H - 54})">
  <rect x="0" y="0" width="${W}" height="54" fill="#F0F4FB"/>
  <!-- R icon pequeno -->
  <circle cx="24" cy="27" r="12" fill="url(#grad)" opacity="0.2"/>
  <text x="24" y="32" text-anchor="middle" font-size="11" font-weight="900" fill="url(#grad)">R</text>
  <text x="42" y="32" font-size="11" fill="#64748B">DADOS QUE GUIAM. DESEMPENHO QUE EVOLUI. © RYVANO ${year}</text>
</g>`;
}

// ─── Helpers SVG ────────────────────────────────────────────────────────────

/** Arco de gauge estilo velocímetro (270°, de -225° a 45°) */
function gaugeArc(
  cx: number,
  cy: number,
  r: number,
  score: number,
  t: ReturnType<typeof getSportTheme>
): string {
  const pct = Math.max(0, Math.min(100, score)) / 100;
  // arco total: 270°, começa em 135° (canto inferior esquerdo)
  const startAngle = 135 * (Math.PI / 180);
  const totalAngle = 270 * (Math.PI / 180);
  const endAngle = startAngle + pct * totalAngle;

  const sx = cx + r * Math.cos(startAngle);
  const sy = cy + r * Math.sin(startAngle);
  const ex = cx + r * Math.cos(endAngle);
  const ey = cy + r * Math.sin(endAngle);

  const largeArc = pct * 270 > 180 ? 1 : 0;

  // Track (cinza)
  const tsx = cx + r * Math.cos(startAngle);
  const tsy = cy + r * Math.sin(startAngle);
  const tex = cx + r * Math.cos(startAngle + totalAngle);
  const tey = cy + r * Math.sin(startAngle + totalAngle);

  return `<!-- gauge -->
<path d="M ${tsx} ${tsy} A ${r} ${r} 0 1 1 ${tex} ${tey}"
      fill="none" stroke="#E2E8F0" stroke-width="10" stroke-linecap="round"/>
<path d="M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}"
      fill="none" stroke="url(#grad)" stroke-width="10" stroke-linecap="round"/>`;
}

/** Cor de fundo do badge de status de prontidão */
function readinessBgColor(tone: string): string {
  switch (tone) {
    case "good": return "#DCFCE7";
    case "moderate": return "#EEF2FF";
    case "warn": return "#FEF3C7";
    case "bad": return "#FEE2E2";
    default: return "#EEF2FF";
  }
}

/** Cor do dot de status de métrica */
function toneDotColor(tone: string | undefined): string {
  switch (tone) {
    case "good": return "#22C55E";
    case "warn":
    case "bad": return "#F59E0B";
    default: return "#6366F1";
  }
}

/** Cor de fundo do badge de status de métrica */
function toneLabelBg(tone: string | undefined): string {
  switch (tone) {
    case "good": return "#DCFCE7";
    case "warn":
    case "bad": return "#FEF3C7";
    default: return "#EEF2FF";
  }
}

/** Emoji do ícone da métrica */
function metricIconEmoji(icon: string): string {
  const map: Record<string, string> = {
    moon: "🌙",
    battery: "⚡",
    hrv: "💓",
    hr: "❤️",
  };
  return map[icon] ?? "●";
}

/** Abreviação da métrica para exibir ao lado do ícone */
function metricAbbrev(icon: string): string {
  const map: Record<string, string> = {
    moon: "Z",
    battery: "BB",
    hrv: "V",
    hr: "FC",
  };
  return map[icon] ?? "";
}

/** Quebra texto em linhas com limite de chars */
function splitLines(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const idx = text.lastIndexOf(" ", maxChars);
  if (idx === -1) return [text.substring(0, maxChars), text.substring(maxChars)];
  return [text.substring(0, idx), text.substring(idx + 1)];
}

/** Gera elementos <text> com quebra de linha simples */
function wrapText(
  text: string,
  x: number,
  y: number,
  maxChars: number,
  fontSize: number,
  fill: string,
  maxLines: number
): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    if (lines.length >= maxLines) break;
    if ((current + " " + w).trim().length <= maxChars) {
      current = (current + " " + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines
    .map((line, i) => `<text x="${x}" y="${y + i * (fontSize + 4)}" font-size="${fontSize}" fill="${fill}">${escapeSvg(line)}</text>`)
    .join("\n");
}

/** Estimativa de largura de score para posicionar /100 */
function scoreWidth(score: number): number {
  return score >= 100 ? 100 : score >= 10 ? 72 : 42;
}

/** Largura do badge de status */
function badgeWidth(label: string): number {
  return Math.max(120, label.length * 9 + 30);
}

/** Estimativa grosseira de largura de texto */
function measureText(text: string, size: number, weight: number): number {
  const avgCharWidth = size * (weight >= 700 ? 0.65 : 0.55);
  return Math.round(text.length * avgCharWidth);
}
