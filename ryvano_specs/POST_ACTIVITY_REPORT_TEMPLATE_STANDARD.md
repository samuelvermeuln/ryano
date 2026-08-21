# Post-activity report standard

## Goal
Define one canonical structure for:
- WhatsApp post-activity delivery
- `Veja na prática` landing demo
- future app/admin previews

Single source of truth avoids drift between:
- real message sent after sync
- marketing/demo visualization
- future operational previews

## Canonical template
Single source of truth:
- `lib/post-activity-report-template.ts`

This file now concentrates:
- report type
- rendering limits
- weekly summary cadence
- helper functions used by WhatsApp and landing

Main type:

```ts
export type PostActivityReportTemplate = {
  label: string;
  summary: string;
  insight: string;
  metrics: readonly { label: string; value: string }[];
  chips: readonly string[];
  weeklyTotalLabel?: string;
  weeklyComparison?: string;
  userReply?: string;
  assistantFollowUp?: string;
};
```

## Required blocks
### 1. `label`
Human sport label shown as report header.
Examples:
- `Corrida`
- `Ciclismo`
- `Natação`
- `Triathlon`

### 2. `summary`
Short sentence saying what happened.
Rules:
- 1 sentence
- readable on mobile
- no internal jargon if avoidable
- should work both in WhatsApp and landing

Example:
- `Treino registrado com 8,4 km · 44:31.`

### 3. `insight`
Single highlight.
Rules:
- 1 main takeaway only
- no fake coaching
- no medical claims
- no unsupported prediction

Example:
- `Ritmo médio de 5:18 /km com FC média de 151 bpm.`

### 4. `metrics`
Top metrics shown first.
Rules:
- max 4 metrics in canonical template
- mobile landing may show only first 2 or 3
- order must follow sport relevance

Default priority by sport:
- swim: distância, tempo, ritmo médio, FC média
- bike: distância, tempo, velocidade média, potência média
- run: distância, tempo, ritmo médio, FC média
- fallback: tempo, distância, FC média, elevação

### 5. `chips`
Quick secondary readings.
Rules:
- max 3 in canonical template
- mobile landing may show only first 2
- use only real available metrics

Examples:
- `Cadência 168 rpm`
- `Elevação 124 m`
- `Potência 228 W`

## Optional blocks
### `weeklyTotalLabel`
Compact weekly volume summary.
Example:
- `3h 28min`

### `weeklyComparison`
Compact weekly comparison.
Example:
- `+6% em relação à semana anterior`

## Central rules
Code source:
- `POST_ACTIVITY_REPORT_RULES` in `lib/post-activity-report-template.ts`

Current canonical rules:
- max 4 primary metrics
- max 3 chips
- mobile landing max 3 primary metrics
- mobile landing max 2 chips
- `Leitura da semana` appears only on Sunday
- outside Sunday, message must stay focused on daily executed workout

Helper functions:
- `shouldIncludeWeeklySummary()`
- `getPostActivityReportView()`

### `userReply`
Illustrative reply for landing/demo only.
Not required for production send.

### `assistantFollowUp`
Illustrative second response for landing/demo only.
Not required for production send.

## Channel rendering rules
### WhatsApp real delivery
Current renderer:
- `renderPostActivityWhatsappText()` in `lib/post-activity-report-template.ts`

Format order:
1. greeting
2. title `Relatório pós-atividade`
3. report header `${label} concluída.`
4. summary
5. `Métricas principais`
6. `Destaque`
7. `Leituras rápidas`

Rules:
- plain text only
- no emoji
- no markdown dependency
- compact blocks with line breaks
- must still read well on narrow screens
- `Leitura da semana` only appears when `shouldIncludeWeeklySummary()` returns `true`

### Landing — `Veja na prática`
Current demo source:
- `components/landing-athlete-data.ts`

Rules:
- same canonical fields must exist
- landing may enrich with:
  - weekly charts
  - consistency cards
  - illustrative conversation
- enrichment cannot contradict canonical fields
- if it is not Sunday, landing must prioritize daily reading instead of weekly summary

### Landing mobile
Rules:
- show less density
- prefer 2–3 primary metrics
- show 2 chips max
- on Sunday, weekly read may appear
- outside Sunday, prioritize summary + insight + daily metrics only
- avoid dense charts when text becomes cramped

## Current implementation points
### Shared template
- `lib/post-activity-report-template.ts`

### Real report builder
- `server/services/report-builder.ts`

### Real send flow
- `server/services/garmin-service.ts`

### Landing fixtures
- `components/landing-athlete-data.ts`

### Landing visualization
- `components/landing-whatsapp-phone.tsx`
- `components/landing-athlete-carousel.tsx`

## How to use
### Build from real activity
```ts
import { buildPostActivityReportTemplate } from "@/server/services/report-builder";

const report = buildPostActivityReportTemplate({ activity });
```

### Render to WhatsApp text
```ts
import { renderPostActivityWhatsappText } from "@/lib/post-activity-report-template";

const text = renderPostActivityWhatsappText({
  athleteName: user.name,
  occurredAt: activity.startedAt,
  report,
});
```

### Use in landing/app preview
```ts
const preview = {
  ...report,
  weeklyTotalLabel: "3h 28min",
  weeklyComparison: "+6% em relação à semana anterior",
  userReply: "Fica muito mais fácil comparar ritmo e FC.",
  assistantFollowUp: "Ritmo médio de 5:18 /km e FC média de 151 bpm.",
};
```

## Content constraints
Always:
- honest
- concise
- sport-specific when data exists
- no fake metrics
- no future promises
- no unsupported recommendations
- no mention of provider internals in user-facing text

Never:
- claim analysis not derived from available fields
- inflate precision
- overload WhatsApp with too many blocks
- let landing demo diverge from production structure

## Next evolution
When historical aggregation becomes real for production reports, extend same template instead of inventing a second format.
Preferred path:
1. keep canonical `PostActivityReportTemplate`
2. add optional historical blocks
3. render lighter subset in WhatsApp
4. render richer subset in landing/app preview
