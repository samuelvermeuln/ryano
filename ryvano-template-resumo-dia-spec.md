# Ryvano — Especificação do Template “Resumo do Dia”

> **Objetivo:** replicar fielmente o layout da imagem de referência, preservando posição, proporção, hierarquia visual, espaçamento e comportamento dos elementos.
>
> **Formato canônico:** SVG 1024 × 1536 px.
>
> Para geração de imagem no backend, montar o relatório em **SVG** e rasterizar com **Sharp**. Não usar layout responsivo/reflow para a versão de exportação; escalar o SVG inteiro proporcionalmente.

---

## 1. Regras obrigatórias

1. Canvas fixo: **1024 × 1536 px**.
2. `viewBox="0 0 1024 1536"`.
3. Fundo claro, quase branco.
4. Margem externa principal: **56 px**.
5. Cards com borda discreta e sombra muito suave.
6. Azul Ryvano apenas como destaque; evitar excesso de cor.
7. O nome do atleta é pequeno. O título principal é **“Resumo do dia”**.
8. Não mostrar:
   - `RYVANO x GARMIN`
   - `DAILY`
   - textos institucionais longos
   - dados repetidos sem função
9. A logo oficial da Ryvano deve ficar no topo esquerdo.
10. Data no topo direito.
11. A página deve respirar: não reduzir gaps para “caber mais dados”.
12. Para exportar em outro tamanho, escalar **todo o SVG uniformemente**. Não recalcular cards individualmente.

---

# 2. Canvas

```ts
const WIDTH = 1024;
const HEIGHT = 1536;
```

```svg
<svg
  width="1024"
  height="1536"
  viewBox="0 0 1024 1536"
  xmlns="http://www.w3.org/2000/svg"
>
```

### Fundo

```css
background: #FAFBFE;
```

Pode existir um gradiente praticamente imperceptível:

```svg
<linearGradient id="pageBg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#FFFFFF"/>
  <stop offset="100%" stop-color="#F8FAFE"/>
</linearGradient>
```

---

# 3. Sistema visual

## Cores

```ts
export const colors = {
  background: "#FAFBFE",
  card: "#FFFFFF",
  textPrimary: "#111827",
  textSecondary: "#4B5563",
  textMuted: "#6B7280",
  border: "#E2E6EE",
  grid: "#E9EDF4",
  ryvanoBlue: "#0C56EF",
  ryvanoBlueDark: "#0848D4",
  ryvanoBlueSoft: "#EEF3FF",
  green: "#45B649",
  greenSoft: "#EEF9F0",
  grayBar: "#B8BEC8",
};
```

### Azul principal

A referência usa aproximadamente:

```css
#0C56EF
```

Não usar azul como fundo de grandes áreas.

---

# 4. Tipografia

Fonte recomendada:

```css
font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
```

Para ficar mais próximo da referência:

```css
font-feature-settings: "tnum" 1, "ss01" 1;
font-variant-numeric: tabular-nums;
```

| Elemento | Size | Weight | Cor |
|---|---:|---:|---|
| Nome atleta | 17 px | 400 | `#374151` |
| Título “Resumo do dia” | 38 px | 500 | `#111827` |
| Descrição | 17 px | 400 | `#4B5563` |
| Label Prontidão | 18 px | 500 | `#374151` |
| Valor 72 | 60 px | 500 | `#0C56EF` |
| `/100` prontidão | 31 px | 400 | `#4B5563` |
| Labels dos cards | 14–15 px | 500 | `#374151` |
| Valor card | 39–43 px | 400–500 | `#111827` |
| Unidade | 24–26 px | 400 | `#4B5563` |
| Título de gráfico | 15 px | 500 | `#374151` |
| Eixos | 13 px | 400 | `#667085` |
| Recomendação | 16 px | 400 | `#374151` |

Evitar `font-weight: 700` nos números.

---

# 5. Grade geral

```text
Canvas
1024 × 1536

Margem esquerda: 56 px
Margem direita: 56 px

Área útil:
912 px
```

### Colunas dos gráficos

```text
coluna esquerda: 447 px
gap:             20 px
coluna direita:  445 px
```

### Linha de métricas

```text
card 1: 215 px
gap:     18 px
card 2: 213 px
gap:     18 px
card 3: 213 px
gap:     18 px
card 4: 217 px
```

Não usar `space-between` se isso alterar a geometria.

---

# 6. Mapa de posições

| Bloco | X | Y | W | H |
|---|---:|---:|---:|---:|
| Header / logo | 56 | 61 | 205 | 58 |
| Data | 820 | 78 | 148 | 30 |
| Intro atleta | 56 | 191 | 360 | 180 |
| Card prontidão | 483 | 146 | 485 | 277 |
| Métrica Sono | 56 | 447 | 215 | 298 |
| Métrica Body Battery | 289 | 447 | 213 | 298 |
| Métrica VFC | 520 | 447 | 213 | 298 |
| Métrica FC repouso | 751 | 447 | 217 | 298 |
| Gráfico Body Battery | 56 | 767 | 447 | 333 |
| Gráfico VFC | 523 | 767 | 445 | 333 |
| Gráfico Sono/Prontidão | 56 | 1122 | 447 | 290 |
| Recomendação | 523 | 1122 | 445 | 290 |
| Footer | 56 | 1437 | 912 | 67 |

> Tolerância visual máxima: **±2 px**.

---

# 7. Header

## Logo Ryvano

```ts
x = 56
y = 64
width = 194
height = 48
```

Usar **o SVG oficial da logo Ryvano**.

```svg
<image
  href="/branding/ryvano-logo.svg"
  x="56"
  y="64"
  width="194"
  height="48"
  preserveAspectRatio="xMinYMid meet"
/>
```

Não simular a logo digitando “RYVANO”.

## Data

```ts
iconX = 823
iconY = 82
iconSize = 18

textX = 858
textY = 80
fontSize = 16
fontWeight = 500
```

Texto:

```text
28 AGO 2025
```

---

# 8. Introdução

```ts
x = 56
y = 192
width = 360
```

## Nome

Ícone usuário:

```ts
x = 58
y = 194
size = 20
```

Nome:

```ts
x = 93
y = 196
fontSize = 17
fontWeight = 400
```

```text
Samuel
```

**Não aumentar o nome.**

## Título

```ts
x = 56
y = 233
fontSize = 39
lineHeight = 46
fontWeight = 500
```

```text
Resumo do dia
```

## Descrição

```ts
x = 56
y = 294
width = 330
fontSize = 17
lineHeight = 25
```

```text
Visão integrada da sua condição física e
recuperação.
```

## Linha azul

```ts
x = 56
y = 369
width = 51
height = 2
```

---

# 9. Card principal — Prontidão

```ts
x = 483
y = 146
width = 485
height = 277
radius = 20
```

```css
fill: #FFFFFF;
stroke: #E2E6EE;
stroke-width: 1;
```

### Linha vertical azul

```ts
x = 483
y = 178
width = 3
height = 216
radius = 2
```

### Label

```ts
x = 516
y = 182
fontSize = 18
fontWeight = 500
```

```text
PRONTIDÃO
```

### Valor

```ts
valueX = 516
valueY = 217
valueFontSize = 60
valueWeight = 500

suffixX = 585
suffixY = 239
suffixFontSize = 31
```

```text
72/100
```

### Status pill

```ts
x = 502
y = 291
width = 223
height = 37
radius = 19
```

```css
fill: #EEF3FF;
```

Dot:

```ts
cx = 518
cy = 309
r = 5
```

Texto:

```ts
x = 531
y = 301
fontSize = 14
fontWeight = 500
```

```text
RECUPERAÇÃO MODERADA
```

### Insight

```ts
x = 510
y = 350
fontSize = 16
lineHeight = 25
```

```text
Bom estado geral para treino
moderado hoje.
```

---

# 10. Gauge semicircular

Área:

```ts
x = 770
y = 229
width = 170
height = 123

cx = 850
cy = 314
r = 73
```

Trilho:

```css
stroke: #DDE2EA;
stroke-width: 9;
stroke-linecap: round;
fill: none;
```

Progresso:

```css
stroke: #0C56EF;
stroke-width: 9;
stroke-linecap: round;
fill: none;
```

Ponteiro:

```css
stroke: #9AA3B2;
stroke-width: 2;
```

Centro:

```ts
r = 6
fill = "#46505F"
```

Labels:

```text
0                         100
```

---

# 11. Linha de métricas

```ts
y = 447
height = 298
radius = 20
padding = 20
```

## Sono

```ts
x = 56
y = 447
w = 215
h = 298
```

Ícone:

```ts
x = 77
y = 477
size = 56
```

Label:

```ts
x = 146
y = 498
fontSize = 14
```

Valor:

```ts
x = 79
y = 565
fontSize = 41
```

```text
87/100
```

Tempo:

```ts
x = 79
y = 625
fontSize = 17
```

```text
7h 56min
```

Sparkline:

```ts
x1 = 80
x2 = 250
yBase = 689
height = 37
```

---

## Body Battery

```ts
x = 289
y = 447
w = 213
h = 298
```

Ícone:

```ts
x = 309
y = 477
size = 56
```

Label:

```ts
x = 376
y = 498
fontSize = 14
```

Valor:

```ts
x = 310
y = 565
fontSize = 39
```

```text
38 → 88
```

Progress bar:

```ts
x = 309
y = 680
width = 151
height = 6
radius = 3
progressWidth = 119
```

---

## VFC Noturna

```ts
x = 520
y = 447
w = 213
h = 298
```

Conteúdo:

```text
VFC NOTURNA
73 ms
● BALANCEADA
```

Sparkline:

```ts
x = 540
y = 684
width = 173
height = 36
```

---

## FC Repouso

```ts
x = 751
y = 447
w = 217
h = 298
```

Conteúdo:

```text
FC REPOUSO
50 bpm
● NORMAL
```

Sparkline na mesma escala visual do VFC.

---

# 12. Gráfico — Body Battery ao longo do dia

Card:

```ts
x = 56
y = 767
w = 447
h = 333
radius = 20
```

Título:

```ts
x = 124
y = 796
fontSize = 15
```

```text
BODY BATTERY AO LONGO DO DIA
```

Plot:

```ts
x = 109
y = 849
w = 377
h = 166
```

Eixos:

```text
Y: 100 / 50 / 0
X: 00 / 06 / 12 / 18 / 24
```

Dados visuais:

```ts
const bodyBattery = [
  { hour: 0, value: 52 },
  { hour: 1, value: 47 },
  { hour: 2, value: 41 },
  { hour: 3, value: 38 },
  { hour: 4, value: 29 },
  { hour: 5, value: 23 },
  { hour: 6, value: 17 },
  { hour: 7, value: 14 },
  { hour: 8, value: 15 },
  { hour: 9, value: 18 },
  { hour: 10, value: 25 },
  { hour: 11, value: 33 },
  { hour: 12, value: 40 },
  { hour: 13, value: 48 },
  { hour: 14, value: 58 },
  { hour: 15, value: 67 },
  { hour: 16, value: 74 },
  { hour: 17, value: 79 },
  { hour: 18, value: 83 },
  { hour: 19, value: 86 },
  { hour: 20, value: 84 },
  { hour: 21, value: 88 },
  { hour: 22, value: 85 },
  { hour: 23, value: 88 },
  { hour: 24, value: 88 },
];
```

Linha:

```css
stroke: #0C56EF;
stroke-width: 2.5;
stroke-linejoin: round;
stroke-linecap: round;
```

Área:

```svg
<linearGradient id="bodyBatteryArea" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#0C56EF" stop-opacity=".16"/>
  <stop offset="100%" stop-color="#0C56EF" stop-opacity="0"/>
</linearGradient>
```

---

# 13. Gráfico — VFC / Recuperação 7 dias

Card:

```ts
x = 523
y = 767
w = 445
h = 333
```

Plot:

```ts
x = 598
y = 850
w = 338
h = 166
```

Dados:

```ts
const hrv7d = [35, 35, 45, 52, 57, 60, 71];
const days = ["S", "T", "Q", "Q", "S", "S", "D"];
```

Linha:

```css
stroke: #0C56EF;
stroke-width: 2;
```

Pontos:

```css
fill: #FFFFFF;
stroke: #0C56EF;
stroke-width: 2;
```

Último dia:

```ts
circleRadius = 18
fill = "#EEF3FF"
textFill = "#0C56EF"
```

---

# 14. Gráfico — Sono e Prontidão

Card:

```ts
x = 56
y = 1122
w = 447
h = 290
```

Plot:

```ts
x = 111
y = 1214
w = 365
h = 137
```

Título:

```text
SONO E PRONTIDÃO (7 DIAS)
```

Legenda:

```text
● Sono (h)   ● Prontidão (/100)
```

Dados:

```ts
const sono = [82, 86, 85, 63, 100, 91, 83];
const prontidao = [65, 65, 65, 78, 72, 69, 64];
const days = ["S", "T", "Q", "Q", "S", "S", "D"];
```

Cores:

```ts
sono = "#0C56EF";
prontidao = "#B8BEC8";
```

Bars:

```ts
blueWidth = 10
grayWidth = 10
seriesGap = 4
```

---

# 15. Recomendação do dia

Card:

```ts
x = 523
y = 1122
w = 445
h = 290
```

Ícone:

```ts
x = 549
y = 1144
size = 41
```

Título:

```ts
x = 597
y = 1155
fontSize = 15
```

```text
RECOMENDAÇÃO DO DIA
```

Itens:

```text
Pode treinar em intensidade moderada.
Boa recuperação durante a noite.
Monitorar carga se houver fadiga muscular.
```

Posições:

```ts
item1 = { circle: [563, 1238], textX: 590, textY: 1230 }
item2 = { circle: [563, 1292], textX: 590, textY: 1284 }
item3 = { circle: [563, 1346], textX: 590, textY: 1338 }
```

Check:

```ts
r = 12
fill = "#0C56EF"
```

---

# 16. Footer

```ts
x = 56
y = 1437
w = 912
h = 67
radius = 18
```

```css
fill: #F6F8FC;
```

Conteúdo:

```text
ⓘ   Dados que guiam.  Performance que evolui.
```

```ts
y = 1471
fontSize = 15
```

`Performance` em azul.

---

# 17. Bordas e sombras

Cards:

```css
stroke: #E2E6EE;
stroke-width: 1px;
```

Sombra:

```svg
<filter id="cardShadow" x="-20%" y="-20%" width="140%" height="160%">
  <feDropShadow
    dx="0"
    dy="8"
    stdDeviation="12"
    flood-color="#111827"
    flood-opacity="0.035"
  />
</filter>
```

Não usar glassmorphism.

---

# 18. Ícones

Padrão:

- outline
- `stroke-width: 1.8–2.1`
- azul Ryvano
- mesma linguagem visual em toda a página

Biblioteca sugerida:

```ts
lucide-react
```

Ícones:

```ts
UserRound
CalendarDays
Moon
BatteryMedium
HeartPulse
Heart
BatteryCharging
ChartNoAxesColumnIncreasing
Star
CircleCheck
Info
```

Na exportação SVG, converter os ícones diretamente para `<path>`.

---

# 19. Estrutura recomendada

```text
src/
└── reports/
    └── daily/
        ├── DailyReport.tsx
        ├── DailyReportSvg.tsx
        ├── components/
        │   ├── Header.tsx
        │   ├── Intro.tsx
        │   ├── ReadinessCard.tsx
        │   ├── MetricCard.tsx
        │   ├── BodyBatteryChart.tsx
        │   ├── HrvChart.tsx
        │   ├── SleepReadinessChart.tsx
        │   ├── RecommendationCard.tsx
        │   └── Footer.tsx
        ├── report-layout.ts
        ├── report-theme.ts
        └── types.ts
```

---

# 20. Layout tokens — fonte de verdade

```ts
export const DAILY_REPORT_LAYOUT = {
  canvas: {
    width: 1024,
    height: 1536,
  },

  margin: 56,

  header: {
    logo: { x: 56, y: 64, w: 194, h: 48 },
    date: { x: 822, y: 80 },
  },

  intro: {
    x: 56,
    y: 192,
    w: 360,
  },

  readiness: {
    x: 483,
    y: 146,
    w: 485,
    h: 277,
    radius: 20,
  },

  metrics: {
    y: 447,
    h: 298,
    cards: [
      { x: 56,  w: 215 },
      { x: 289, w: 213 },
      { x: 520, w: 213 },
      { x: 751, w: 217 },
    ],
  },

  charts: {
    topY: 767,
    topH: 333,
    left:  { x: 56,  w: 447 },
    right: { x: 523, w: 445 },

    bottomY: 1122,
    bottomH: 290,
  },

  footer: {
    x: 56,
    y: 1437,
    w: 912,
    h: 67,
    radius: 18,
  },
} as const;
```

---

# 21. SVG raiz recomendado

```tsx
export function DailyReportSvg() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1024"
      height="1536"
      viewBox="0 0 1024 1536"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* gradients / shadows */}
      </defs>

      <rect width="1024" height="1536" fill="#FAFBFE" />

      <Header />
      <Intro />
      <ReadinessCard />
      <MetricCards />
      <BodyBatteryChart />
      <HrvChart />
      <SleepReadinessChart />
      <RecommendationCard />
      <Footer />
    </svg>
  );
}
```

---

# 22. Sharp

```ts
import sharp from "sharp";

const svg = renderDailyReportSvg(data);

const buffer = await sharp(Buffer.from(svg))
  .png({
    quality: 100,
    compressionLevel: 9,
  })
  .toBuffer();
```

Se for necessário exportar em 1080 px de largura:

```ts
const scale = 1080 / 1024;
const outputHeight = Math.round(1536 * scale);
// 1620
```

Resultado:

```text
1080 × 1620
```

Não recortar para 1080 × 1350 se o objetivo for manter exatamente esta composição.

---

# 23. D3

Usar D3 apenas para escalas e paths:

```ts
import { scaleLinear, scalePoint } from "d3-scale";
import { line, area, curveMonotoneX } from "d3-shape";
```

Curva:

```ts
curveMonotoneX
```

---

# 24. Critérios de aceite

- [ ] Canvas 1024 × 1536.
- [ ] Logo Ryvano em x=56.
- [ ] Sem “Garmin”.
- [ ] Sem “Daily”.
- [ ] Nome Samuel pequeno.
- [ ] “Resumo do dia” é o título principal.
- [ ] Prontidão tem destaque moderado.
- [ ] 4 métricas na mesma linha.
- [ ] 4 cards com altura idêntica.
- [ ] Dois gráficos lado a lado.
- [ ] Gráfico de Sono x Prontidão no bloco inferior esquerdo.
- [ ] Recomendação no bloco inferior direito.
- [ ] Gap de aproximadamente 20 px entre blocos grandes.
- [ ] Nenhum texto encosta nas bordas.
- [ ] Nenhum gráfico toca a borda do card.
- [ ] Azul usado apenas para foco e dados.
- [ ] Verde apenas para estado positivo/normal.
- [ ] Sem gradientes chamativos.
- [ ] Sem badges desnecessários.
- [ ] Sem texto explicativo redundante.
- [ ] Footer discreto.
- [ ] Toda exportação é feita por escala proporcional do SVG.

---

# 25. Regra principal do produto

A composição deve parecer um **produto esportivo premium**, e não um dashboard administrativo.

A Ryvano deve traduzir os dados nesta sequência:

```text
MÉTRICA
↓
TENDÊNCIA
↓
DECISÃO
```

Exemplo:

```text
VFC: 73 ms
↓
Tendência estável
↓
Carga moderada permitida
```

O espaço em branco faz parte do design e não deve ser preenchido apenas para “aproveitar espaço”.

---

# 26. Referência final

Este documento corresponde ao layout final desta conversa:

```text
Tema: claro
Formato: vertical
Logo: Ryvano no topo esquerdo
Nome Samuel: pequeno
Prontidão: destaque moderado
Métricas: 4 cards
Gráficos: 3
Recomendação: 1 card
Footer: discreto
```

**Usar este arquivo como fonte de verdade para a geometria do template.**
