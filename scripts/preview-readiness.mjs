#!/usr/bin/env node
/**
 * Preview em tempo real de qualquer template SVG do ryvano.
 *
 * Uso:
 *   npm run preview:readiness:watch
 *   npm run preview:readiness:watch -- --template athlete-daily-readiness
 *   npm run preview:readiness:watch -- --template garmin-daily-sync-check
 *   npm run preview:readiness:watch -- --template post-activity-report
 *   npm run preview:readiness:watch -- --template garmin-reconnect
 *   npm run preview:readiness:watch -- --template evolution-media-diagnostic
 *   npm run preview:readiness:watch -- --sport natacao
 *   npm run preview:readiness:watch -- --sport corrida --template athlete-daily-readiness
 *
 * Abre: http://localhost:4999  (recarrega automaticamente ao salvar --watch)
 */

import { createServer } from "node:http";
import { watch, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RUNNER = path.join(ROOT, "scripts/.preview-runner.tmp.ts");
const PORT = 4999;

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const WATCH_MODE    = args.includes("--watch");
const TEMPLATE_ARG  = args.find((_, i) => args[i - 1] === "--template") ?? "athlete-daily-readiness";
const SPORT_ARG     = args.find((_, i) => args[i - 1] === "--sport") ?? "triathlon";

// ─── Dados mock por template ──────────────────────────────────────────────────

const MOCKS = {

  "post-activity-report": (sport = "corrida") => {
    // Modalidade única — variante default
    if (sport === "swimrun" || sport === "triatlo") {
      // Multi-sport
      const legs = sport === "triatlo"
        ? [
            { type: "activity", sport: "natacao",  distance: "750 m", time: "14:30", pace: "1'56\"/100m" },
            { type: "transition", label: "T1", time: "1:45" },
            { type: "activity", sport: "ciclismo", distance: "20 km", time: "35:10", pace: "34,1 km/h" },
            { type: "transition", label: "T2", time: "1:02" },
            { type: "activity", sport: "corrida",  distance: "5 km",  time: "22:40", pace: "4'32\"/km" },
          ]
        : [
            { type: "activity", sport: "natacao", distance: "1.200 m", time: "22:40", pace: "1'53\"/100m" },
            { type: "transition", label: "T1", time: "1:15" },
            { type: "activity", sport: "corrida", distance: "6,8 km",  time: "38:20", pace: "5'38\"/km" },
          ];
      return {
        variant: "multi",
        combo: sport,
        title: sport === "triatlo" ? "Triathlon Sprint — Prova Completa" : "Swimrun Ilha Grande — Etapa",
        place: sport === "triatlo" ? "Complexo Esportivo Ibirapuera" : "Enseada Verde",
        timeLabel: "Hoje, 07:00",
        athlete: { name: "Carlos Silva", photoUrl: "https://i.pravatar.cc/300?img=13" },
        totalStats: [
          { label: "TEMPO TOTAL",      value: "1:15:07", unit: "" },
          { label: "DISTÂNCIA TOTAL",  value: "25,75",   unit: "km" },
          { label: "TRANSIÇÃO",        value: "2:47",    unit: "" },
          { label: "CALORIAS",         value: "980",     unit: "kcal" },
        ],
        legs,
        secondaryMetrics: [
          { icon: "heart",      label: "FC MÉDIA GERAL", value: "156", unit: "bpm" },
          { icon: "heartpulse", label: "FC MÁXIMA",      value: "179", unit: "bpm" },
          { icon: "mountain",   label: "ELEVAÇÃO",       value: "+210", unit: "m" },
          { icon: "flame",      label: "CALORIAS",       value: "980",  unit: "kcal" },
        ],
      };
    }

    // Modalidade única
    const singleSports = {
      corrida: {
        title: "Corrida Longa de Domingo",
        place: "Parque Ibirapuera",
        heroStats: [
          { label: "DISTÂNCIA",  value: "8.42",   unit: "km" },
          { label: "TEMPO",      value: "42:15",  unit: "" },
          { label: "PACE MÉDIO", value: "5'01\"", unit: "/km" },
          { label: "ELEVAÇÃO",   value: "+68",    unit: "m" },
        ],
        splits: [
          { label: "Km 1", value: "5:15", seconds: 315 },
          { label: "Km 2", value: "5:05", seconds: 305 },
          { label: "Km 3", value: "4:58", seconds: 298 },
          { label: "Km 4", value: "4:55", seconds: 295 },
          { label: "Km 5", value: "4:52", seconds: 292 },
          { label: "Km 6", value: "4:58", seconds: 298 },
          { label: "Km 7", value: "5:02", seconds: 302 },
          { label: "Km 8", value: "5:10", seconds: 310 },
        ],
        splitLabel: "Parciais (km)",
        splitUnit: "/km",
        secondaryMetrics: [
          { icon: "heart",      label: "FC MÉDIA",  value: "152", unit: "bpm" },
          { icon: "heartpulse", label: "FC MÁXIMA", value: "171", unit: "bpm" },
          { icon: "trending",   label: "CADÊNCIA",  value: "172", unit: "spm" },
          { icon: "flame",      label: "CALORIAS",  value: "612", unit: "kcal" },
        ],
      },
      natacao: {
        title: "Nado Matinal — Técnica e Resistência",
        place: "Piscina Aquático Clube",
        heroStats: [
          { label: "DISTÂNCIA",    value: "2.400",  unit: "m" },
          { label: "TEMPO",        value: "45:12",  unit: "" },
          { label: "RITMO MÉDIO",  value: "1'53\"", unit: "/100m" },
          { label: "CALORIAS",     value: "520",    unit: "kcal" },
        ],
        splits: [
          { label: "400m 1", value: "7:20", seconds: 440 },
          { label: "400m 2", value: "7:24", seconds: 444 },
          { label: "400m 3", value: "7:28", seconds: 448 },
          { label: "400m 4", value: "7:34", seconds: 454 },
          { label: "400m 5", value: "7:40", seconds: 460 },
          { label: "400m 6", value: "7:46", seconds: 466 },
        ],
        splitLabel: "Parciais (400m)",
        splitUnit: "/400m",
        secondaryMetrics: [
          { icon: "heart",      label: "FC MÉDIA",       value: "138", unit: "bpm" },
          { icon: "heartpulse", label: "FC MÁXIMA",      value: "162", unit: "bpm" },
          { icon: "gauge",      label: "SWOLF MÉDIO",    value: "38",  unit: "" },
          { icon: "trending",   label: "BRAÇADAS/VOLTA", value: "14",  unit: "" },
        ],
      },
      ciclismo: {
        title: "Pedal Longo de Estrada",
        place: "Serra da Cantareira",
        heroStats: [
          { label: "DISTÂNCIA",  value: "42.5", unit: "km" },
          { label: "TEMPO",      value: "1:18:30", unit: "" },
          { label: "VEL. MÉDIA", value: "32.5",  unit: "km/h" },
          { label: "ELEVAÇÃO",   value: "+410", unit: "m" },
        ],
        splits: [
          { label: "5km 1", value: "9:10", seconds: 550 },
          { label: "5km 2", value: "9:05", seconds: 545 },
          { label: "5km 3", value: "8:58", seconds: 538 },
          { label: "5km 4", value: "8:50", seconds: 530 },
          { label: "5km 5", value: "9:15", seconds: 555 },
          { label: "5km 6", value: "9:20", seconds: 560 },
          { label: "5km 7", value: "8:55", seconds: 535 },
          { label: "5km 8", value: "9:02", seconds: 542 },
        ],
        splitLabel: "Parciais (5km)",
        splitUnit: "/5km",
        secondaryMetrics: [
          { icon: "heart",      label: "FC MÉDIA",        value: "141", unit: "bpm" },
          { icon: "heartpulse", label: "FC MÁXIMA",       value: "165", unit: "bpm" },
          { icon: "trending",   label: "POTÊNCIA MÉDIA",  value: "210", unit: "W" },
          { icon: "flame",      label: "CALORIAS",        value: "890", unit: "kcal" },
        ],
      },
      surf: {
        title: "Sessão de Surf — Praia do Rosa",
        place: "Praia do Rosa",
        heroStats: [
          { label: "TEMPO",      value: "1:30:00", unit: "" },
          { label: "ONDAS",      value: "12",      unit: "" },
          { label: "PICO",       value: "1.8",     unit: "m" },
          { label: "CALORIAS",   value: "420",     unit: "kcal" },
        ],
        splits: [
          { label: "Set 1", value: "4:20", seconds: 260 },
          { label: "Set 2", value: "4:10", seconds: 250 },
          { label: "Set 3", value: "4:25", seconds: 265 },
          { label: "Set 4", value: "4:15", seconds: 255 },
        ],
        splitLabel: "Sets (duração)",
        splitUnit: "/set",
        secondaryMetrics: [
          { icon: "heart",      label: "FC MÉDIA",  value: "128", unit: "bpm" },
          { icon: "heartpulse", label: "FC MÁXIMA", value: "158", unit: "bpm" },
          { icon: "gauge",      label: "TEMPO EM PÉ", value: "72", unit: "%" },
          { icon: "flame",      label: "CALORIAS",  value: "420", unit: "kcal" },
        ],
      },
    };

    const cfg = singleSports[sport] ?? singleSports.corrida;

    return {
      variant: "single",
      sport: sport in singleSports ? sport : "corrida",
      ...cfg,
      timeLabel: "Hoje, 06:15",
      athlete: { name: "Marina Costa", photoUrl: "https://i.pravatar.cc/300?img=47" },
    };
  },

  "athlete-daily-readiness": (sport = "triathlon") => ({
    sport,
    reportType: `RELATÓRIO ${sport.toUpperCase()} | PERFORMANCE`,
    date: "29 AGO 2026",
    athlete: { name: "CARLOS 'IRON' SILVA", team: "T-PRO TRIATHLON" },
    readiness: {
      score: 72,
      statusLabel: "RECUPERAÇÃO MODERADA",
      tone: "moderate",
      description: "Bom estado geral para treino moderado hoje.",
    },
    metrics: [
      { type: "sleep",   icon: "moon",    label: "SONO REGENERATIVO",      value: 87, sub: "7h 56min", tone: "good" },
      { type: "battery", icon: "battery", label: "BODY BATTERY ENERGÉTICA", from: 38, to: 88 },
      { type: "badge",   icon: "hrv",     label: "VFC NOTURNA",             value: 73, unit: " ms",  statusLabel: "BALANCEADA", tone: "good" },
      { type: "badge",   icon: "hr",      label: "FC REPOUSO",              value: 50, unit: " bpm", statusLabel: "NORMAL",     tone: "moderate" },
    ],
    recommendations: [
      "Treino de corrida/ciclismo de baixa/média intensidade recomendado.",
      "Excelente recuperação noturna.",
      "Monitorar carga muscular se houver fadiga.",
    ],
  }),

  "garmin-daily-sync-check": () => ({
    athleteName: "Carlos Silva",
    athleteImage: null,
    dateLabel: "29 AGO 2026",
    title: "Leituras do dia ainda pendentes",
    message: "Seu Garmin ainda não sincronizou todas as métricas de recuperação. Aguardando HRV, sono e body battery.",
    checklist: [
      "Mantenha o relógio carregado e próximo ao celular.",
      "Abra o app Garmin Connect para forçar sincronização.",
      "Volte mais tarde para ver seu relatório completo.",
    ],
    footer: "Ryvano enviará o resumo assim que os dados chegarem.",
    theme: { family: "daily", sport: "default", variant: "pearl" },
  }),

  "garmin-reconnect": () => ({
    athleteName: "Carlos Silva",
    athleteImage: null,
    title: "Reconexão necessária",
    message: "Sua conta Garmin precisa ser reconectada para continuar recebendo os relatórios diários.",
    checklist: [
      "Acesse o painel Ryvano e vá em Integrações.",
      "Clique em Reconectar Garmin e siga os passos.",
      "Notificações voltarão automaticamente após a reconexão.",
    ],
    footer: "Seus dados anteriores estão preservados.",
    theme: { family: "reconnect", sport: "default", variant: "pearl" },
  }),

  "evolution-media-diagnostic": () => ({
    title: "Diagnóstico de Mídia Evolution",
    subtitle: "Verificação de envio WhatsApp",
    message: "Teste de diagnóstico de envio de mídia via Evolution API. Verificando variantes de payload suportadas.",
    metrics: [
      { label: "Variante ativa",    value: "flat-media-data-uri", tone: "accent"  },
      { label: "Tamanho da imagem", value: "1,2 MB",              tone: "neutral" },
      { label: "Tentativas",        value: "3",                   tone: "neutral" },
    ],
    chart: {
      title: "Latência por variante (ms)",
      type: "bar",
      data: [
        { label: "data-uri",   value: 340 },
        { label: "raw-base64", value: 280 },
        { label: "nested",     value: 410 },
      ],
    },
    footer: "Diagnóstico automático — Ryvano Admin",
    status: "default",
    theme: { family: "diagnostic", sport: "default", variant: "pearl" },
  }),
};

// ─── Geração do SVG ──────────────────────────────────────────────────────────

function buildRunner(template, sport) {
  const mockFn = MOCKS[template];
  if (!mockFn) throw new Error(`Template desconhecido: "${template}". Disponíveis: ${Object.keys(MOCKS).join(", ")}`);

  const mockObj = mockFn(sport);
  const data = JSON.stringify(mockObj, null, 2);
  if (process.env.DEBUG_MOCK) {
    process.stderr.write(`\n[DEBUG MOCK ${template}/${sport}] keys: ${Object.keys(mockObj).join(",")}\n`);
    if (mockObj.athlete) process.stderr.write(`[DEBUG athlete] ${JSON.stringify(mockObj.athlete)}\n`);
  }
  const templatePath = path.join(ROOT, "lib/reports/templates", template).replace(/\\/g, "/");

  // Templates SVG puros — renderizam diretamente
  const svgTemplates = {
    "athlete-daily-readiness": "renderAthleteDailyReadinessTemplate",
    "post-activity-report":    "renderPostActivityReportTemplate",
  };

  const svgFnName = svgTemplates[template];
  if (svgFnName) {
    return `
import { ${svgFnName} } from ${JSON.stringify(templatePath)};
const data = ${data} as any;
process.stdout.write(${svgFnName}(data));
`;
  }

  // Demais: geração via generateReport (PNG → base64 embutido em SVG para exibição)
  const generateReportPath = path.join(ROOT, "lib/reports/generate-report").replace(/\\/g, "/");
  return `
import { generateReport } from ${JSON.stringify(generateReportPath)};
const request = { template: ${JSON.stringify(template)}, data: ${data} } as any;
generateReport(request).then(buf => {
  const b64 = buf.toString("base64");
  const svg = \`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1620" viewBox="0 0 1080 1620">
    <image width="1080" height="1620" href="data:image/png;base64,\${b64}"/>
  </svg>\`;
  process.stdout.write(svg);
}).catch(e => { process.stderr.write(e.message); process.exit(1); });
`;
}

function generateSvg(template, sport) {
  const runner = buildRunner(template, sport);
  writeFileSync(RUNNER, runner, "utf-8");
  try {
    return execSync(`npx tsx --tsconfig tsconfig.json ${JSON.stringify(RUNNER)}`, {
      cwd: ROOT, encoding: "utf-8", timeout: 20000,
    });
  } finally {
    if (!process.env.KEEP_TMP) { try { unlinkSync(RUNNER); } catch {} }
  }
}

// ─── Estado + servidor ────────────────────────────────────────────────────────

let currentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100"><rect width="800" height="100" fill="#f8fafc"/><text x="20" y="55" font-size="14" fill="#64748b" font-family="monospace">Gerando preview...</text></svg>`;
let sseClients = [];
let currentTemplate = TEMPLATE_ARG;
let currentSport = SPORT_ARG;

function regen(template = currentTemplate, sport = currentSport) {
  currentTemplate = template;
  currentSport = sport;
  try {
    process.stdout.write(`⟳  [${template}${template === "athlete-daily-readiness" ? ` / ${sport}` : ""}] Gerando... `);
    currentSvg = generateSvg(template, sport);
    console.log(`✅ ${currentSvg.length} bytes`);
    sseClients.forEach(r => { try { r.write("data: reload\n\n"); } catch {} });
  } catch (err) {
    const msg = (err.stderr ?? err.message ?? "Erro").split("\n").slice(0, 3).join(" | ").substring(0, 200);
    console.error(`\n❌ ${msg}`);
    currentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="120"><rect width="800" height="120" fill="#fef2f2" rx="12"/><text x="20" y="40" font-size="13" fill="#dc2626" font-family="monospace">❌ Erro ao compilar</text><text x="20" y="65" font-size="10" fill="#7f1d1d" font-family="monospace">${msg.replace(/&/g,"&amp;").replace(/</g,"&lt;").substring(0,160)}</text></svg>`;
    sseClients.forEach(r => { try { r.write("data: reload\n\n"); } catch {} });
  }
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function buildHtml() {
  const templates = Object.keys(MOCKS);
  const sports = ["triathlon","corrida","natacao","ciclismo","swimrun","surf","triatlo","run","bike","swim","default"];
  const tplOptions = templates.map(t => `<option value="${t}"${t === currentTemplate ? " selected" : ""}>${t}</option>`).join("");
  const sptOptions = sports.map(s => `<option value="${s}"${s === currentSport ? " selected" : ""}>${s}</option>`).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Preview — ${currentTemplate}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0f172a;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:20px 16px;font-family:monospace}
    .toolbar{display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
    select,button{padding:8px 14px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:13px;cursor:pointer;font-family:monospace}
    button{background:url(#) #6366f1;border-color:#6366f1;color:white;font-weight:700}
    button:hover{background:#4f46e5}
    .dot{width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block}
    .dot.err{background:#ef4444}
    #status{color:#64748b;font-size:12px}
    img{max-width:800px;width:100%;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);background:white}
    label{color:#64748b;font-size:12px}
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="dot" id="dot"></span>
    <label>Template: <select id="tpl">${tplOptions}</select></label>
    <label>Sport: <select id="spt">${sptOptions}</select></label>
    <button onclick="apply()">▶ Aplicar</button>
    <span id="status">conectando...</span>
  </div>
  <img src="/preview.svg?t=0" id="img" alt="preview"/>
  <script>
    const img = document.getElementById('img');
    const status = document.getElementById('status');
    const dot = document.getElementById('dot');
    const src = new EventSource('/events');
    src.onopen = () => { dot.className='dot'; status.textContent='conectado — salve para recarregar'; };
    src.onmessage = () => { img.src='/preview.svg?t='+Date.now(); status.textContent='atualizado '+new Date().toLocaleTimeString('pt-BR'); };
    src.onerror = () => { dot.className='dot err'; status.textContent='conexão perdida'; };

    function apply() {
      const tpl = document.getElementById('tpl').value;
      const spt = document.getElementById('spt').value;
      fetch('/switch?template='+encodeURIComponent(tpl)+'&sport='+encodeURIComponent(spt));
    }
    // Aplicar ao mudar o select também
    document.getElementById('tpl').addEventListener('change', apply);
    document.getElementById('spt').addEventListener('change', apply);
  </script>
</body>
</html>`;
}

// ─── Servidor ─────────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(buildHtml());
  } else if (url.pathname === "/preview.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    res.end(currentSvg);
  } else if (url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    res.write("data: connected\n\n");
    sseClients.push(res);
    req.on("close", () => { sseClients = sseClients.filter(c => c !== res); });
  } else if (url.pathname === "/switch") {
    const tpl = url.searchParams.get("template") ?? currentTemplate;
    const spt = url.searchParams.get("sport") ?? currentSport;
    res.writeHead(200); res.end("ok");
    console.log(`\n🔀 Trocando para: ${tpl} / ${spt}`);
    setImmediate(() => regen(tpl, spt));
  } else {
    res.writeHead(404); res.end();
  }
});

// ─── Watch ─────────────────────────────────────────────────────────────────────

function startWatch() {
  const dirs = [
    path.join(ROOT, "lib/reports/templates"),
    path.join(ROOT, "lib/reports/sport-themes.ts"),
    path.join(ROOT, "lib/reports/utils"),
    path.join(ROOT, "lib/reports/render-report-types.ts"),
    path.join(ROOT, "lib/reports/render-report-helpers.ts"),
    path.join(ROOT, "lib/reports/render-report-frame.ts"),
    path.join(ROOT, "lib/reports/render-report-primitives.tsx"),
    path.join(ROOT, "lib/reports/render-report-components.tsx"),
    path.join(ROOT, "lib/reports/render-report-canvases.tsx"),
    path.join(ROOT, "lib/reports/daily-whatsapp-canvas.tsx"),
  ];
  let debounce = null;
  dirs.forEach(p => {
    try {
      watch(p, { recursive: true }, (_, filename) => {
        if (!filename || filename.includes(".tmp.")) return;
        if (!filename.match(/\.(ts|tsx)$/)) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log(`\n📝 ${filename}`);
          regen();
        }, 350);
      });
    } catch {}
  });
  console.log("👀 Monitorando lib/reports/ — salve para recarregar\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

regen();
server.listen(PORT, "127.0.0.1", () => {
  const available = Object.keys(MOCKS).join(", ");
  console.log(`\n🌐 http://localhost:${PORT}`);
  console.log(`📋 Templates disponíveis: ${available}`);
  console.log(`🎨 Template atual: ${TEMPLATE_ARG} / sport: ${SPORT_ARG}`);
  if (WATCH_MODE) startWatch();
  else console.log("   (use --watch para recarregar ao salvar)\n");
});
