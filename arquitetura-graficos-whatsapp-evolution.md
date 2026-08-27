# Geração de Gráficos para WhatsApp com SVG, D3 e Sharp

## Objetivo

Criar um mecanismo no projeto **Next.js** capaz de gerar gráficos dinamicamente a partir de dados da aplicação e enviá-los como **imagem pelo WhatsApp utilizando a Evolution API**.

A solução não utilizará navegador headless, screenshot de página HTML, Puppeteer ou Playwright.

A imagem será construída diretamente em **SVG** e posteriormente convertida para **PNG** utilizando o **Sharp**.

---

## Tecnologias

Serão utilizadas as seguintes bibliotecas:

```bash
npm install sharp d3-scale d3-shape
```

### `d3-scale`

Responsável por calcular escalas do gráfico.

Exemplos:

- posição dos pontos no eixo X;
- altura das barras;
- limites mínimo e máximo;
- distribuição proporcional dos valores;
- conversão de valores reais em coordenadas dentro do SVG.

Exemplo:

```ts
import { scaleLinear } from "d3-scale";

const yScale = scaleLinear()
  .domain([0, 100])
  .range([500, 0]);
```

---

### `d3-shape`

Responsável por criar formas e caminhos SVG.

Será usado principalmente para:

- gráficos de linha;
- gráficos de área;
- curvas;
- paths SVG;
- outras formas baseadas nos dados.

Exemplo:

```ts
import { line, curveMonotoneX } from "d3-shape";

const lineGenerator = line<{ x: number; y: number }>()
  .x((item) => item.x)
  .y((item) => item.y)
  .curve(curveMonotoneX);
```

O resultado será um `path` que poderá ser inserido diretamente dentro do SVG.

---

### `sharp`

Responsável por transformar o SVG final em uma imagem PNG.

Exemplo:

```ts
import sharp from "sharp";

const png = await sharp(Buffer.from(svg))
  .png()
  .toBuffer();
```

O resultado será um `Buffer` contendo a imagem pronta para ser enviada para a Evolution API.

---

# Arquitetura

O fluxo será:

```text
Banco de dados / API
        ↓
Dados do relatório
        ↓
Template do gráfico
        ↓
d3-scale
        ↓
d3-shape
        ↓
SVG
        ↓
Sharp
        ↓
PNG
        ↓
Evolution API
        ↓
WhatsApp
```

---

# Por que gerar SVG diretamente

A aplicação não precisa renderizar uma página web para gerar o gráfico.

Em vez disso, o backend cria uma string SVG.

Exemplo simplificado:

```ts
const svg = `
<svg
  width="1080"
  height="1080"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    width="1080"
    height="1080"
    fill="#ffffff"
  />

  <text
    x="60"
    y="80"
    font-size="42"
    font-weight="700"
    fill="#111827"
  >
    Relatório de Vendas
  </text>

  <rect
    x="100"
    y="300"
    width="120"
    height="400"
    rx="16"
    fill="#6366f1"
  />
</svg>
`;
```

Esse SVG será montado dinamicamente de acordo com os dados.

---

# Vantagens dessa abordagem

## Performance

Não será necessário iniciar Chromium para gerar cada imagem.

Isso reduz:

- consumo de memória;
- consumo de CPU;
- tempo de geração;
- dependências do container;
- complexidade de deploy.

---

## Escalabilidade

A geração poderá ocorrer completamente no backend.

Exemplo:

```text
100 usuários
      ↓
100 conjuntos de dados
      ↓
100 SVGs
      ↓
Sharp
      ↓
100 PNGs
      ↓
Evolution API
```

A abordagem é adequada para geração de muitos relatórios.

---

## Templates reutilizáveis

Os gráficos devem ser implementados como templates.

Estrutura sugerida:

```text
src/
└── lib/
    └── reports/
        ├── generate-report.ts
        ├── types.ts
        │
        ├── templates/
        │   ├── sales-summary.ts
        │   ├── sales-daily.ts
        │   ├── financial.ts
        │   ├── ranking.ts
        │   ├── line-chart.ts
        │   └── bar-chart.ts
        │
        ├── charts/
        │   ├── line.ts
        │   ├── bar.ts
        │   └── area.ts
        │
        └── utils/
            ├── format-currency.ts
            ├── format-number.ts
            └── escape-svg.ts
```

---

# Interface dos dados

Criar uma interface padronizada para os relatórios.

```ts
export interface ReportMetric {
  label: string;
  value: string | number;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ReportData {
  title: string;

  subtitle?: string;

  metrics?: ReportMetric[];

  chart?: {
    type: "line" | "bar" | "area";
    data: ChartPoint[];
  };
}
```

---

# Exemplo de chamada

```ts
const report = await generateReport({
  template: "sales-daily",

  data: {
    title: "Vendas de Hoje",

    subtitle: "27/08/2026",

    metrics: [
      {
        label: "Faturamento",
        value: "R$ 45.900",
      },
      {
        label: "Vendas",
        value: 183,
      },
      {
        label: "Ticket médio",
        value: "R$ 250,82",
      },
    ],

    chart: {
      type: "line",

      data: [
        { label: "08h", value: 10 },
        { label: "10h", value: 32 },
        { label: "12h", value: 55 },
        { label: "14h", value: 48 },
        { label: "16h", value: 78 },
      ],
    },
  },
});
```

O retorno de `generateReport` deve ser um `Buffer`.

```ts
Buffer
```

Esse buffer representa a imagem PNG final.

---

# Gerador principal

Exemplo:

```ts
import sharp from "sharp";

import { salesDailyTemplate } from "./templates/sales-daily";

export async function generateReport(params: {
  template: string;
  data: any;
}) {
  let svg: string;

  switch (params.template) {
    case "sales-daily":
      svg = salesDailyTemplate(params.data);
      break;

    default:
      throw new Error(
        `Template não encontrado: ${params.template}`
      );
  }

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}
```

---

# Exemplo de gráfico de barras

Utilizar `d3-scale` para calcular automaticamente o tamanho das barras.

```ts
import {
  scaleBand,
  scaleLinear,
} from "d3-scale";

const width = 900;
const height = 450;

const data = [
  { label: "Jan", value: 12000 },
  { label: "Fev", value: 18000 },
  { label: "Mar", value: 15000 },
  { label: "Abr", value: 26000 },
];

const x = scaleBand()
  .domain(data.map((item) => item.label))
  .range([0, width])
  .padding(0.25);

const y = scaleLinear()
  .domain([
    0,
    Math.max(...data.map((item) => item.value)),
  ])
  .range([height, 0]);
```

Depois gerar as barras:

```ts
const bars = data
  .map((item) => {
    const barX = x(item.label) ?? 0;

    const barY = y(item.value);

    const barHeight = height - barY;

    return `
      <rect
        x="${barX}"
        y="${barY}"
        width="${x.bandwidth()}"
        height="${barHeight}"
        rx="12"
        fill="#6366f1"
      />
    `;
  })
  .join("");
```

---

# Exemplo de gráfico de linha

Para gráficos de linha utilizar `d3-shape`.

```ts
import { scaleLinear } from "d3-scale";

import {
  line,
  curveMonotoneX,
} from "d3-shape";

const data = [
  { x: 0, value: 10 },
  { x: 1, value: 32 },
  { x: 2, value: 55 },
  { x: 3, value: 48 },
  { x: 4, value: 78 },
];

const xScale = scaleLinear()
  .domain([0, data.length - 1])
  .range([0, 900]);

const yScale = scaleLinear()
  .domain([
    0,
    Math.max(...data.map((item) => item.value)),
  ])
  .range([450, 0]);

const path = line<(typeof data)[number]>()
  .x((item) => xScale(item.x))
  .y((item) => yScale(item.value))
  .curve(curveMonotoneX)(data);
```

Dentro do SVG:

```ts
const chart = `
  <path
    d="${path}"
    fill="none"
    stroke="#6366f1"
    stroke-width="6"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
`;
```

---

# Tamanho da imagem

Utilizar inicialmente:

```text
1080 x 1080
```

Isso facilita a visualização dentro do WhatsApp.

Para relatórios mais horizontais também poderá existir:

```text
1200 x 675
```

O template deverá controlar suas próprias dimensões.

---

# Layout sugerido

Exemplo:

```text
┌────────────────────────────────────────┐
│                                        │
│  VENDAS DE HOJE                        │
│  Atualizado às 16:00                   │
│                                        │
│  R$ 45.900       183        R$ 250     │
│  Faturamento      Vendas     Ticket     │
│                                        │
│                                        │
│              ╭──────────╮              │
│          ╭───╯          ╰──╮           │
│      ╭───╯                 ╰────       │
│  ────╯                                 │
│                                        │
│  08h    10h    12h    14h    16h       │
│                                        │
│                              SUA MARCA │
└────────────────────────────────────────┘
```

---

# Evolution API

A Evolution API será responsável somente pelo transporte da imagem até o WhatsApp.

O fluxo será separado em duas responsabilidades:

```text
Report Service
    ↓
gera PNG

WhatsApp Service
    ↓
envia PNG pela Evolution API
```

Não colocar regras de geração dos gráficos dentro do serviço do WhatsApp.

---

# Serviço da Evolution API

Estrutura sugerida:

```text
src/
└── lib/
    └── whatsapp/
        ├── evolution-client.ts
        ├── send-image.ts
        └── types.ts
```

Exemplo conceitual:

```ts
export async function sendReportToWhatsApp({
  number,
  image,
  caption,
}: {
  number: string;
  image: Buffer;
  caption?: string;
}) {
  // converter ou enviar o arquivo
  // no formato esperado pela Evolution API

  // chamada HTTP para a Evolution API
}
```

A implementação exata do request deve seguir a versão da Evolution API utilizada no projeto.

---

# Separação de responsabilidades

Evitar:

```ts
generateChartAndSendWhatsApp();
```

Preferir:

```ts
const image = await generateReport({
  template: "sales-daily",
  data,
});

await sendImage({
  number,
  image,
  caption: "Relatório de vendas",
});
```

Dessa forma o gerador de imagem poderá futuramente ser utilizado também para:

- e-mail;
- download;
- PDF;
- armazenamento;
- dashboard;
- notificações;
- outras integrações.

---

# Endpoint Next.js

Pode existir um endpoint para gerar o relatório.

```text
POST /api/reports/generate
```

Exemplo:

```ts
import { generateReport } from "@/lib/reports/generate-report";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();

  const image = await generateReport({
    template: body.template,
    data: body.data,
  });

  return new Response(image, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
```

---

# Endpoint de envio

Também poderá existir:

```text
POST /api/whatsapp/report
```

Fluxo:

```text
Request
   ↓
buscar dados
   ↓
generateReport()
   ↓
Buffer PNG
   ↓
Evolution API
   ↓
WhatsApp
```

Exemplo conceitual:

```ts
export async function POST(request: Request) {
  const body = await request.json();

  const image = await generateReport({
    template: body.template,
    data: body.data,
  });

  await sendReportToWhatsApp({
    number: body.number,
    image,
    caption: body.caption,
  });

  return Response.json({
    success: true,
  });
}
```

---

# Cache

Caso o mesmo relatório seja enviado várias vezes, considerar cachear a imagem.

Uma chave de cache pode ser baseada em:

```text
template
+
dados
+
período
+
cliente
```

Exemplo:

```text
reports:sales-daily:customer-123:2026-08-27
```

---

# Armazenamento

Não é obrigatório salvar todos os PNGs.

O fluxo padrão pode ser:

```text
gera SVG
   ↓
gera Buffer PNG
   ↓
envia
   ↓
descarta Buffer
```

Caso seja necessário histórico:

```text
gera PNG
   ↓
S3 / MinIO / Storage
   ↓
Evolution API
```

---

# Segurança

Dados recebidos para geração do SVG precisam ser escapados antes de serem inseridos diretamente no XML.

Criar uma função como:

```ts
export function escapeSvg(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
```

Utilizar principalmente em:

- título;
- subtítulo;
- nome de clientes;
- labels;
- legendas;
- textos provenientes de usuários.

---

# Não utilizar

Para essa implementação inicial, evitar:

```text
Puppeteer
Playwright
html2canvas
screenshots de páginas
Chromium
canvas no navegador
```

O gráfico deve ser gerado diretamente como SVG.

---

# Resultado esperado

A implementação deverá permitir:

```ts
const image = await generateReport({
  template: "financial",
  data: financialData,
});

await evolution.sendImage({
  number: "5527999999999",
  image,
  caption: "📊 Relatório financeiro",
});
```

Fluxo final:

```text
Dados
  ↓
d3-scale
  ↓
d3-shape
  ↓
SVG
  ↓
Sharp
  ↓
PNG
  ↓
Evolution API
  ↓
WhatsApp
```

---

# Resumo técnico

A solução deverá seguir os seguintes princípios:

1. **Next.js** será responsável pela aplicação e endpoints.
2. **d3-scale** será usado para escalas e posicionamento dos elementos.
3. **d3-shape** será usado para geração dos paths dos gráficos.
4. O gráfico será construído diretamente em **SVG**.
5. **Sharp** converterá o SVG para **PNG**.
6. A imagem será mantida preferencialmente em memória como `Buffer`.
7. A **Evolution API** será responsável pelo envio da imagem pelo WhatsApp.
8. A geração do gráfico deve ficar desacoplada da integração com WhatsApp.
9. Templates diferentes poderão compartilhar os mesmos componentes de gráficos.
10. A solução não deverá depender de navegador headless para gerar as imagens.
