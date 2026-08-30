import type {
  PostActivityReportTemplateData,
  PostActivitySingleData,
  PostActivityMultiData,
  PostActivityLeg,
  PostActivityLegActivity,
  PostActivityLegTransition,
  PostActivitySplit,
  PostActivityStat,
  PostActivitySecondaryMetric,
} from "@/lib/reports/types";
import { escapeSvg } from "@/lib/reports/utils/escape-svg";
import { POST_ACTIVITY_ART } from "./post-activity-report-art";
import { SPORT_THEMES, LEG_THEMES, COMBO_THEMES, TONES, type ActivityTheme } from "./post-activity-themes";
import { lucideIcon, METRIC_ICON_MAP } from "./post-activity-report-icons";

// Canvas — proporção vertical premium para WhatsApp
const W = 800;
const H = 1240;

/**
 * Template SVG do relatório pós-atividade — replica pixel a pixel o exemplo JSX.
 *
 * Suporta dois cenários:
 *  - variant: "single" — corrida / natacao / ciclismo / surf
 *  - variant: "multi"  — swimrun (2 pernas) / triatlo (3 pernas)
 */
export function renderPostActivityReportTemplate(
  data: PostActivityReportTemplateData
): string {
  const isMulti = data.variant === "multi";
  const theme = isMulti
    ? COMBO_THEMES[data.combo] ?? COMBO_THEMES.triatlo
    : SPORT_THEMES[data.sport] ?? SPORT_THEMES.natacao;

  return [
    svgOpen(),
    defs(theme),
    background(theme),
    sectionHeader(theme, data.athlete),
    sectionAthlete(theme, data),
    sectionHeroStats(theme, isMulti ? data.totalStats : data.heroStats),
    isMulti
      ? sectionLegs(theme, data.legs)
      : sectionSplits(theme, data.splitLabel, data.splitUnit, data.splits),
    sectionSecondaryMetrics(theme, data.secondaryMetrics),
    sectionFooter(theme),
    svgClose(),
  ].join("\n");
}

// ─── SVG wrapper ──────────────────────────────────────────────────────────────

function svgOpen(): string {
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
  xmlns="http://www.w3.org/2000/svg"
  font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">`;
}

function svgClose(): string {
  return `</svg>`;
}

// ─── Defs ─────────────────────────────────────────────────────────────────────

function defs(t: ActivityTheme): string {
  return `<defs>
  <linearGradient id="pa-grad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${t.from}"/>
    <stop offset="100%" stop-color="${t.to}"/>
  </linearGradient>
  <linearGradient id="pa-grad-h" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${t.from}"/>
    <stop offset="100%" stop-color="${t.to}"/>
  </linearGradient>
  <linearGradient id="pa-bg" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#FAFBFD"/>
    <stop offset="100%" stop-color="#F1F4F9"/>
  </linearGradient>
  <filter id="pa-shadow" x="-5%" y="-5%" width="115%" height="130%">
    <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#00000010"/>
  </filter>
  <clipPath id="pa-athlete-photo"><circle cx="48" cy="48" r="24"/></clipPath>
</defs>`;
}

// ─── Background ───────────────────────────────────────────────────────────────

function background(t: ActivityTheme): string {
  return `<!-- background -->
<rect width="${W}" height="${H}" fill="url(#pa-bg)"/>
<!-- blur decorativo (blob top-right) -->
<circle cx="${W - 60}" cy="60" r="140" fill="${t.to}" opacity="0.15"/>`;
}

// ─── Header (logo + badge sport) ──────────────────────────────────────────────

function sectionHeader(t: ActivityTheme, athlete: { name: string }): string {
  const _ = athlete; // reservado
  // Logo à esquerda: quadrado accent com "R" branco
  const LOGO_X = 32;
  const LOGO_Y = 32;
  const LOGO_SIZE = 38;

  // Badge à direita: pill branco com badges + label + "Concluída"
  // Largura calculada pelo conteúdo
  const badgePillH = 40;
  const badgePillY = 32;
  const badgesW = t.badges.length * 22 + (t.badges.length - 1) * 6; // largura dos círculos badge com overlap negativo
  const labelPx = t.label.length * 7.5;
  const doneW = 88; // "✓ Concluída" pill
  const badgeContentW = badgesW + 12 + labelPx + 10 + doneW + 28;
  const BADGE_W = badgeContentW;
  const BADGE_X = W - 32 - BADGE_W;

  return `<!-- header -->
<!-- logo mark: quadrado accent com R -->
<rect x="${LOGO_X}" y="${LOGO_Y}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" rx="10" fill="${t.accent}"/>
<text x="${LOGO_X + LOGO_SIZE / 2}" y="${LOGO_Y + 27}" text-anchor="middle" font-size="22" font-weight="900" fill="white">R</text>
<!-- brand -->
<text x="${LOGO_X + LOGO_SIZE + 12}" y="${LOGO_Y + 20}" font-size="18" font-weight="900" fill="#0F172A">RYVANO</text>
<text x="${LOGO_X + LOGO_SIZE + 12}" y="${LOGO_Y + 34}" font-size="9" font-weight="700" fill="#94A3B8" letter-spacing="2">RYVANO ESPORTS DATA</text>

<!-- badge sport pill à direita -->
<rect x="${BADGE_X}" y="${badgePillY}" width="${BADGE_W}" height="${badgePillH}" rx="20" fill="white" filter="url(#pa-shadow)"/>
${renderBadgesStack(t, BADGE_X + 14, badgePillY + badgePillH / 2)}
<text x="${BADGE_X + 14 + badgesW + 12}" y="${badgePillY + badgePillH / 2 + 4}" font-size="11" font-weight="800" fill="#334155" letter-spacing="1">${escapeSvg(t.label.toUpperCase())}</text>
<!-- pill "Concluída" verde -->
<rect x="${BADGE_X + BADGE_W - 100}" y="${badgePillY + 8}" width="88" height="24" rx="12" fill="#DCFCE7"/>
${lucideAt("check-circle-2", BADGE_X + BADGE_W - 92, badgePillY + 14, 12, "#16A34A", 3)}
<text x="${BADGE_X + BADGE_W - 74}" y="${badgePillY + 24}" font-size="10" font-weight="700" fill="#16A34A">Concluída</text>`;
}

/** Empilha os badges do sport com overlap negativo (-space-x-1.5) */
function renderBadgesStack(t: ActivityTheme, x: number, cy: number): string {
  const R = 11;
  return t.badges
    .map((key, i) => {
      const cx = x + R + i * (R * 2 - 6); // overlap negativo de 6px
      const href = POST_ACTIVITY_ART[key];
      return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="white"/>
<image x="${cx - R}" y="${cy - R}" width="${R * 2}" height="${R * 2}" href="${href}" clip-path="circle(${R}px at ${R}px ${R}px)" preserveAspectRatio="xMidYMid slice"/>`;
    })
    .join("\n");
}

// ─── Athlete card (foto + nome + título + hora + local + ilustrações) ────────

function sectionAthlete(t: ActivityTheme, data: PostActivityReportTemplateData): string {
  const { athlete, title, timeLabel, place } = data;
  const CX = 32;
  const CY = 100;
  const CW = W - 64;
  const CH = 108;

  const photoR = 26;
  const photoCx = CX + 20 + photoR;
  const photoCy = CY + CH / 2;
  const infoX = photoCx + photoR + 16;

  // Área de ilustrações à direita (ocupa 30% da largura interna)
  const illustrationsX = CX + CW - 160;
  const illustrationsY = CY + 16;

  return `<!-- athlete card -->
<rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="18" fill="white" filter="url(#pa-shadow)"/>

<!-- foto do atleta -->
${renderAthletePhoto(athlete, photoCx, photoCy, photoR, t)}

<!-- nome + título + meta -->
<text x="${infoX}" y="${CY + 30}" font-size="12" font-weight="700" fill="#64748B">${escapeSvg(athlete.name)}</text>
<text x="${infoX}" y="${CY + 54}" font-size="17" font-weight="900" fill="#0F172A">${escapeSvg(truncate(title, 48))}</text>
<!-- meta line: relógio + timeLabel + pin + place -->
${lucideAt("clock", infoX, CY + 66, 12, "#94A3B8", 2)}
<text x="${infoX + 16}" y="${CY + 76}" font-size="11" font-weight="600" fill="#94A3B8">${escapeSvg(timeLabel)}</text>
${
  place
    ? lucideAt("map-pin", infoX + 16 + timeLabel.length * 6 + 12, CY + 66, 12, "#94A3B8", 2) +
      `<text x="${infoX + 16 + timeLabel.length * 6 + 28}" y="${CY + 76}" font-size="11" font-weight="600" fill="#94A3B8">${escapeSvg(place)}</text>`
    : ""
}

<!-- ilustrações à direita -->
${renderIllustrations(t, illustrationsX, illustrationsY, 60)}`;
}

/** Renderiza a foto do atleta em círculo com anel de accent */
function renderAthletePhoto(
  athlete: { name: string; photoUrl?: string | null },
  cx: number,
  cy: number,
  r: number,
  t: ActivityTheme
): string {
  const ringOuter = r + 4;
  const ringInner = r + 2;
  const initial = (athlete.name?.charAt(0) ?? "A").toUpperCase();

  // Fundo do ring accent + anel branco
  const ring = `<circle cx="${cx}" cy="${cy}" r="${ringOuter}" fill="${t.accent}" opacity="0.4"/>
<circle cx="${cx}" cy="${cy}" r="${ringInner}" fill="white"/>`;

  if (athlete.photoUrl) {
    return `${ring}
<image x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" href="${athlete.photoUrl}" clip-path="circle(${r}px at ${r}px ${r}px)" preserveAspectRatio="xMidYMid slice"/>`;
  }
  // fallback: círculo com inicial
  return `${ring}
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${t.soft}"/>
<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="20" font-weight="800" fill="${t.accent}">${initial}</text>`;
}

/** Renderiza as ilustrações do sport (WebP em base64) empilhadas com opacidade decrescente */
function renderIllustrations(t: ActivityTheme, x: number, y: number, size: number): string {
  return t.illustrations
    .map((key, i) => {
      const href = POST_ACTIVITY_ART[key];
      const opacity = 1 - i * 0.1;
      const xi = x + i * 28; // offset horizontal
      return `<image x="${xi}" y="${y}" width="${size}" height="${size}" href="${href}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`;
    })
    .join("\n");
}

// ─── HeroStatBar (4 stats horizontais) ────────────────────────────────────────

function sectionHeroStats(t: ActivityTheme, stats: PostActivityStat[]): string {
  const CX = 32;
  const CY = 228;
  const CW = W - 64;
  const CH = 88;
  const numStats = Math.min(stats.length, 4);
  const cellW = CW / numStats;

  return `<!-- hero stat bar -->
<rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="18" fill="white" filter="url(#pa-shadow)"/>
${stats
  .slice(0, 4)
  .map((s, i) => {
    const x = CX + i * cellW;
    const cellCx = x + cellW / 2;
    // Divider vertical (exceto última cell)
    const divider =
      i < numStats - 1
        ? `<line x1="${x + cellW}" y1="${CY + 16}" x2="${x + cellW}" y2="${CY + CH - 16}" stroke="#F1F5F9" stroke-width="1"/>`
        : "";
    return `${divider}
<!-- stat ${i + 1} -->
<text x="${cellCx}" y="${CY + 42}" text-anchor="middle" font-size="24" font-weight="900" fill="#0F172A">${escapeSvg(s.value)}<tspan font-size="11" font-weight="700" fill="${t.accent}" dx="2">${escapeSvg(s.unit)}</tspan></text>
<text x="${cellCx}" y="${CY + 66}" text-anchor="middle" font-size="10" font-weight="700" fill="#94A3B8" letter-spacing="1">${escapeSvg(s.label)}</text>`;
  })
  .join("\n")}`;
}

// ─── Splits (modalidade única) ────────────────────────────────────────────────

function sectionSplits(
  t: ActivityTheme,
  splitLabel: string,
  splitUnit: string,
  splits: PostActivitySplit[]
): string {
  const CX = 32;
  const CY = 336;
  const CW = W - 64;
  // altura dinâmica: header 44 + linhas
  const rowH = 30;
  const CH = 24 + 20 + splits.length * rowH + 24;

  // cálculos para as barras
  const secs = splits.map((s) => s.seconds);
  const fastest = Math.min(...secs);
  const slowest = Math.max(...secs);
  const avg = secs.reduce((a, b) => a + b, 0) / secs.length;
  const range = Math.max(1, slowest - fastest);

  const splitRows = splits
    .map((s, i) => {
      const rowY = CY + 60 + i * rowH;
      const widthPct = 35 + (65 * (slowest - s.seconds)) / range;
      const barW = ((CW - 32 - 60 - 90 - 60) * widthPct) / 100;
      const barX = CX + 20 + 60;
      const delta = fmtDelta(s.seconds, avg);
      const deltaW = delta.text.length * 7 + 14;

      return `<!-- split ${i + 1} -->
<text x="${CX + 20}" y="${rowY + 4}" font-size="11" font-weight="700" fill="#64748B">${escapeSvg(s.label)}</text>
<rect x="${barX}" y="${rowY - 5}" width="${CW - 32 - 60 - 90 - 60}" height="10" rx="5" fill="#F1F5F9"/>
<rect x="${barX}" y="${rowY - 5}" width="${barW}" height="10" rx="5" fill="url(#pa-grad-h)"/>
<text x="${barX + (CW - 32 - 60 - 90 - 60) + 12}" y="${rowY + 4}" font-size="12" font-weight="900" fill="#0F172A">${escapeSvg(s.value)}</text>
<rect x="${CX + CW - 20 - deltaW}" y="${rowY - 8}" width="${deltaW}" height="18" rx="9" fill="${delta.tone.bg}"/>
<text x="${CX + CW - 20 - deltaW / 2}" y="${rowY + 4}" text-anchor="middle" font-size="10" font-weight="800" fill="${delta.tone.text}">${escapeSvg(delta.text)}</text>`;
    })
    .join("\n");

  return `<!-- splits -->
<rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="18" fill="white" filter="url(#pa-shadow)"/>
<!-- splits header -->
<text x="${CX + 20}" y="${CY + 30}" font-size="11" font-weight="800" fill="#334155" letter-spacing="1">${escapeSvg(splitLabel.toUpperCase())}</text>
<text x="${CX + CW - 20}" y="${CY + 30}" text-anchor="end" font-size="10" font-weight="600" fill="#94A3B8">MIN:SEG ${escapeSvg(splitUnit)}</text>
${splitRows}`;
}

/** Calcula o delta de tempo do split vs. média, com tom (fast/slow/neutral) */
function fmtDelta(sec: number, avg: number) {
  const d = Math.round(sec - avg);
  if (Math.abs(d) < 1) return { text: "média", tone: TONES.neutral };
  const sign = d > 0 ? "+" : "-";
  const abs = Math.abs(d);
  const text = `${sign}${abs}s`;
  return d < 0 ? { text, tone: TONES.fast } : { text, tone: TONES.slow };
}

// ─── Legs (provas combinadas) ─────────────────────────────────────────────────

function sectionLegs(t: ActivityTheme, legs: PostActivityLeg[]): string {
  const CX = 32;
  const CY = 336;

  // Renderiza cada linha em ordem, computando y dinamicamente
  let cy = CY;

  // Título "Etapas da Atividade"
  const title = `<text x="${CX}" y="${cy + 20}" font-size="11" font-weight="800" fill="#334155" letter-spacing="1">ETAPAS DA ATIVIDADE</text>`;
  cy += 34;

  let legIndex = 0;
  const rows: string[] = [];

  for (const leg of legs) {
    if (leg.type === "transition") {
      rows.push(renderTransitionRow(leg, CX, cy, W - 64));
      cy += 40;
    } else {
      legIndex += 1;
      rows.push(renderLegRow(leg, legIndex, CX, cy, W - 64));
      cy += 76;
    }
  }

  return `<!-- legs section -->
${title}
${rows.join("\n")}`;
}

function renderLegRow(
  leg: PostActivityLegActivity,
  index: number,
  x: number,
  y: number,
  w: number
): string {
  const theme = LEG_THEMES[leg.sport] ?? LEG_THEMES.corrida;
  const H = 68;
  const badgeR = 18;
  const badgeCx = x + 24 + badgeR;
  const badgeCy = y + H / 2;

  return `<!-- leg row (${leg.sport}) -->
<rect x="${x}" y="${y}" width="${w}" height="${H}" rx="16" fill="white" filter="url(#pa-shadow)"/>
<!-- accent left border -->
<rect x="${x}" y="${y}" width="4" height="${H}" rx="2" fill="${theme.accent}"/>
<!-- badge circle -->
<circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="${theme.soft}"/>
<image x="${badgeCx - 15}" y="${badgeCy - 15}" width="30" height="30" href="${POST_ACTIVITY_ART[theme.badge]}" clip-path="circle(15px at 15px 15px)" preserveAspectRatio="xMidYMid slice"/>
<!-- text -->
<text x="${badgeCx + badgeR + 14}" y="${y + 26}" font-size="10" font-weight="900" fill="#94A3B8">${String(index).padStart(2, "0")}</text>
<text x="${badgeCx + badgeR + 30}" y="${y + 26}" font-size="13" font-weight="900" fill="#0F172A">${escapeSvg(theme.label)}</text>
<!-- metrics -->
<text x="${badgeCx + badgeR + 14}" y="${y + 48}" font-size="11" fill="#64748B">
<tspan font-weight="800" fill="#1E293B">${escapeSvg(leg.distance)}</tspan>
<tspan dx="18">Tempo: <tspan font-weight="800" fill="#1E293B">${escapeSvg(leg.time)}</tspan></tspan>
<tspan dx="18">Ritmo: <tspan font-weight="800" fill="${theme.accent}">${escapeSvg(leg.pace)}</tspan></tspan>
</text>`;
}

function renderTransitionRow(
  leg: PostActivityLegTransition,
  x: number,
  y: number,
  w: number
): string {
  const H = 32;
  const iconCx = x + 24 + 18;
  const iconCy = y + H / 2;

  // Padrão tracejado no meio
  const centerX = iconCx + 22;
  const centerW = w - (centerX - x) - 4;

  return `<!-- transition row -->
<!-- ícone circular ↔ -->
<circle cx="${iconCx}" cy="${iconCy}" r="14" fill="#F1F5F9"/>
${lucideAt("arrow-right-left", iconCx - 7, iconCy - 7, 14, "#94A3B8", 2.4)}
<!-- linha tracejada com pills -->
<rect x="${centerX}" y="${y + 6}" width="${centerW}" height="${H - 12}" rx="10" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="4 6"/>
<rect x="${centerX + 10}" y="${y + 10}" width="${leg.label.length * 8 + 100}" height="${H - 20}" rx="6" fill="white"/>
<text x="${centerX + 20}" y="${y + H / 2 + 4}" font-size="10.5" font-weight="700" fill="#64748B">${escapeSvg(leg.label)} · Transição</text>
<rect x="${centerX + centerW - 60}" y="${y + 10}" width="52" height="${H - 20}" rx="6" fill="white"/>
<text x="${centerX + centerW - 34}" y="${y + H / 2 + 4}" text-anchor="middle" font-size="11" font-weight="900" fill="#334155">${escapeSvg(leg.time)}</text>`;
}

// ─── Secondary metrics (grid 2x2 ou 4x1) ──────────────────────────────────────

function sectionSecondaryMetrics(
  t: ActivityTheme,
  metrics: PostActivitySecondaryMetric[]
): string {
  const CX = 32;
  const CW = W - 64;
  const gap = 12;
  const cardW = (CW - gap * 3) / 4;
  const cardH = 68;

  // Y dinâmico — depende do que veio antes. Para simplificar, colocar em Y=1064
  // (isso pode ser recalculado; por enquanto fixo bem abaixo)
  const CY = H - 190;

  return `<!-- secondary metrics -->
${metrics
  .slice(0, 4)
  .map((m, i) => {
    const x = CX + i * (cardW + gap);
    const iconBgCx = x + 22;
    const iconBgCy = CY + cardH / 2;
    const iconR = 18;
    const iconName = METRIC_ICON_MAP[m.icon] ?? "heart";
    const infoX = iconBgCx + iconR + 12;

    return `<rect x="${x}" y="${CY}" width="${cardW}" height="${cardH}" rx="16" fill="white" filter="url(#pa-shadow)"/>
<circle cx="${iconBgCx}" cy="${iconBgCy}" r="${iconR}" fill="${t.soft}"/>
${lucideAt(iconName, iconBgCx - 8, iconBgCy - 8, 16, t.accent, 2.3)}
<text x="${infoX}" y="${CY + 30}" font-size="16" font-weight="900" fill="#0F172A">${escapeSvg(m.value)}<tspan font-size="9" font-weight="700" fill="#94A3B8" dx="2">${escapeSvg(m.unit)}</tspan></text>
<text x="${infoX}" y="${CY + 50}" font-size="9" font-weight="700" fill="#94A3B8" letter-spacing="1">${escapeSvg(m.label)}</text>`;
  })
  .join("\n")}`;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function sectionFooter(t: ActivityTheme): string {
  const year = new Date().getFullYear();
  const FY = H - 60;
  const centerX = W / 2;

  // Logo pequeno + texto centralizado
  const brandText = `DADOS QUE GUIAM. DESEMPENHO QUE EVOLUI. © RYVANO ${year}`;
  const textW = brandText.length * 5.5;
  const logoSize = 16;
  const totalW = logoSize + 8 + textW;
  const startX = centerX - totalW / 2;

  return `<!-- footer -->
<rect x="${startX}" y="${FY}" width="${logoSize}" height="${logoSize}" rx="4" fill="${t.accent}"/>
<text x="${startX + logoSize / 2}" y="${FY + 12}" text-anchor="middle" font-size="10" font-weight="900" fill="white">R</text>
<text x="${startX + logoSize + 8}" y="${FY + 12}" font-size="10" font-weight="600" fill="#94A3B8">${brandText}</text>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Renderiza um ícone lucide numa posição x,y como <g transform="translate()"> */
function lucideAt(
  name: Parameters<typeof lucideIcon>[0],
  x: number,
  y: number,
  size: number,
  color: string,
  strokeWidth = 2
): string {
  return `<g transform="translate(${x},${y})">${lucideIcon(name, { size, color, strokeWidth })}</g>`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 1) + "…";
}
