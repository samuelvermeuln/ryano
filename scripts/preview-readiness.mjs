#!/usr/bin/env node
/**
 * Preview em tempo real do template athlete-daily-readiness.
 *
 * Uso:
 *   node scripts/preview-readiness.mjs          (gera uma vez)
 *   node scripts/preview-readiness.mjs --watch  (regenera ao salvar)
 *
 * Abre: http://localhost:4999
 * Ao salvar qualquer arquivo em lib/reports/templates/ o browser recarrega.
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
const WATCH_MODE = process.argv.includes("--watch");

// ─── Dados mock ───────────────────────────────────────────────────────────────

const MOCK = {
  sport: "triathlon",
  reportType: "RELATÓRIO TRIATHLON | PERFORMANCE",
  date: "29 AGO 2026",
  athlete: { name: "SAMUEL", team: "RYVANO ESPORTS DATA" },
  readiness: {
    score: 75,
    statusLabel: "BOA RECUPERAÇÃO",
    tone: "good",
    description: "Estado geral positivo para treino de qualidade com carga bem distribuída ao longo do dia.",
  },
  metrics: [
    { type: "sleep",   icon: "moon",    label: "SONO REGENERATIVO",      value: 86, sub: "7h 42min",   tone: "good" },
    { type: "battery", icon: "battery", label: "BODY BATTERY ENERGÉTICA", from: 22, to: 82 },
    { type: "badge",   icon: "hrv",     label: "VFC NOTURNA",             value: 62, unit: " ms",  statusLabel: "BALANCEADA", tone: "good" },
    { type: "badge",   icon: "hr",      label: "FC REPOUSO",              value: 50, unit: " bpm", statusLabel: "NORMAL",     tone: "moderate" },
  ],
  recommendations: [
    "Bom momento para treino de qualidade com intensidade controlada e execução técnica limpa.",
    "Recuperação noturna forte, bom sinal para sustentar consistência no treino planejado.",
    "VFC equilibrada hoje, sinal favorável de adaptação ao treinamento recente.",
  ],
};

// ─── Geração do SVG ──────────────────────────────────────────────────────────

function generateSvg() {
  const templatePath = path.join(ROOT, "lib/reports/templates/athlete-daily-readiness").replace(/\\/g, "/");
  const runner = `
import { renderAthleteDailyReadinessTemplate } from ${JSON.stringify(templatePath)};
const data = ${JSON.stringify(MOCK, null, 2)} as any;
process.stdout.write(renderAthleteDailyReadinessTemplate(data));
`;
  writeFileSync(RUNNER, runner, "utf-8");
  try {
    return execSync(`npx tsx --tsconfig tsconfig.json ${JSON.stringify(RUNNER)}`, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 15000,
    });
  } finally {
    try { unlinkSync(RUNNER); } catch {}
  }
}

// ─── Estado global ────────────────────────────────────────────────────────────

let currentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100">
  <rect width="800" height="100" fill="#f8fafc"/>
  <text x="20" y="55" font-size="16" fill="#64748b" font-family="monospace">Gerando preview...</text>
</svg>`;
let sseClients = [];

function regen() {
  try {
    process.stdout.write("⟳  Gerando SVG... ");
    currentSvg = generateSvg();
    console.log(`✅ ${currentSvg.length} bytes`);
    sseClients.forEach(res => { try { res.write("data: reload\n\n"); } catch {} });
  } catch (err) {
    const msg = err.message?.split("\n").slice(0, 3).join(" | ") ?? "Erro desconhecido";
    console.error(`\n❌ ${msg}`);
    currentSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="160">
      <rect width="800" height="160" fill="#fef2f2" rx="12"/>
      <text x="20" y="40" font-size="14" fill="#dc2626" font-family="monospace">❌ Erro ao compilar template</text>
      <text x="20" y="70" font-size="11" fill="#7f1d1d" font-family="monospace">${msg.substring(0, 120)}</text>
    </svg>`;
    sseClients.forEach(res => { try { res.write("data: reload\n\n"); } catch {} });
  }
}

// ─── HTML wrapper com auto-reload via SSE ────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Preview — Readiness Template</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0f172a;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px;
      font-family: monospace;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
      color: #64748b;
      font-size: 13px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; display: inline-block; }
    .dot.error { background: #ef4444; }
    #status { color: #94a3b8; }
    img {
      max-width: 800px;
      width: 100%;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      background: white;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="dot" id="dot"></span>
    <span>athlete-daily-readiness preview</span>
    <span id="status">conectando...</span>
  </div>
  <img src="/preview.svg?t=0" id="img" alt="preview"/>
  <script>
    const img = document.getElementById('img');
    const status = document.getElementById('status');
    const dot = document.getElementById('dot');
    const src = new EventSource('/events');

    src.onopen = () => {
      status.textContent = 'conectado — salve o template para recarregar';
    };
    src.onmessage = () => {
      const t = Date.now();
      img.src = '/preview.svg?t=' + t;
      status.textContent = 'atualizado ' + new Date().toLocaleTimeString('pt-BR');
    };
    src.onerror = () => {
      dot.className = 'dot error';
      status.textContent = 'conexão perdida';
    };
  </script>
</body>
</html>`;

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = req.url?.split("?")[0];

  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  } else if (url === "/preview.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    res.end(currentSvg);
  } else if (url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write("data: connected\n\n");
    sseClients.push(res);
    req.on("close", () => { sseClients = sseClients.filter(c => c !== res); });
  } else {
    res.writeHead(404);
    res.end();
  }
});

// ─── Watch ────────────────────────────────────────────────────────────────────

function startWatch() {
  const dirs = [
    path.join(ROOT, "lib/reports/templates"),
    path.join(ROOT, "lib/reports/sport-themes.ts"),
    path.join(ROOT, "lib/reports/utils"),
  ];
  let debounce = null;
  dirs.forEach(p => {
    try {
      watch(p, { recursive: true }, (_, filename) => {
        if (!filename || filename.endsWith(".tmp.ts")) return;
        if (!filename.match(/\.(ts|tsx)$/)) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          console.log(`\n📝 ${filename} modificado`);
          regen();
        }, 400);
      });
    } catch {}
  });
  console.log("👀 Monitorando lib/reports/templates/ — salve para recarregar\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

regen();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n🌐 http://localhost:${PORT}  ← abra no browser`);
  if (WATCH_MODE) startWatch();
  else console.log("   (use --watch para recarregar ao salvar)\n");
});
