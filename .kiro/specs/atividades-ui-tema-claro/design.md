# Design — UI de Atividades, Contraste no Tema Claro e Tema Padrão

## Visão geral

Este design cobre cinco mudanças de UI, todas de escopo frontend
(`components/**`, `app/**`, `lib/theme.ts`, `app/globals.css`), sem alteração
de schema, de API ou de contratos de provider:

1. Um novo **Mapeamento Visual de Provider** (ícone de marca + cor de
   destaque por `ProviderId`), consumido pelo Selo de Origem em
   `ActivitiesBrowser` e `ActivityVisualDashboard`.
2. Correção de contraste no Tema Claro para as classes de cor fixa e clara
   (`text-cyan-200`, `text-emerald-200`, etc.) usadas em Ícones de Modalidade,
   `heroStats` e em outras Telas do Sistema, estendendo o padrão de override
   `[data-theme="light"] .text-*` já existente em `app/globals.css`.
3. Mais cor nos 4 Cartões de Resumo da Tela de Atividades.
4. Troca do tema padrão de `"dark"` para `"light"` em `lib/theme.ts`.
5. Remoção de emoji Unicode como ícone funcional (`onboarding-wizard.tsx`,
   `profile-experience.tsx`) e aumento do `NavIcon` da sidebar
   (`app-shell.tsx`).

Este design não introduz módulos novos em `modules/garmin` ou
`modules/strava`, não altera capabilities, e não toca em OAuth, webhooks ou
qualquer contrato de provider — por isso o checklist de docs oficiais do
`AGENTS.md` (Strava/Garmin) não se aplica a este spec. O único ponto que toca
`modules/shared/integrations` é puramente de apresentação (ícone/cor), e
respeita a regra "core não conhece provider": o novo mapeamento vive no
catálogo compartilhado, indexado por `ProviderId`, sem `if (provider ===
"STRAVA")` em nenhum componente.

## Investigação de código (achados relevantes)

- `modules/shared/integrations/catalog/index.ts` já é a fonte única de
  `ProviderDefinition[]` (`PROVIDERS`), com `getProviderDefinition(id)` e
  `isProviderEnabled(id)`. É o lugar natural para o novo mapeamento visual,
  pois já é importado por `activities-browser`/`activity-visual-dashboard`
  indiretamente (via `getProviderLabel`/`getActivityVisualData`) e por
  `integrations-hub.tsx`.
- **Duplicação confirmada**: `components/integrations/integrations-hub.tsx`
  (linha ~1382) e `components/profile/onboarding-wearable-step.tsx` (linha
  ~30) definem, cada um, um `providerIconMap: Record<ProviderId, string>`
  idêntico (`simple-icons:garmin`, `simple-icons:strava`, `simple-icons:polar`,
  `simple-icons:coros`, `simple-icons:suunto`, `simple-icons:fitbit`), com
  fallback `"simple-icons:googlefit"`. Nenhum dos dois lida com cor — só ícone.
  Decisão de design abaixo.
- `components/activities/activities-browser.tsx`: o Selo de Origem é o
  `<span className="theme-pill-neutral ...">` com `<IconDeviceWatch size={13}
  />` + `activity.origin.label`, dentro do cartão de atividade (por volta da
  linha 520). `activity.origin` só tem `{ label: string }` — não carrega
  `ProviderId`, então o tipo precisa ganhar o id do provider para o Selo de
  Origem poder aplicar o Mapeamento Visual.
- `components/activities/activity-visual-dashboard.tsx`: o Selo de Origem é o
  `<StatusPill label={provider} tone="neutral" />` (linha ~161).
  `ActivityVisualDashboardProps.provider` também é só `string` (o
  `providerLabel` já resolvido em `app/app/atividades/[id]/page.tsx`) — mesma
  lacuna de tipo.
- `getSportIconShellClass` (`activities-browser.tsx`) e `buildBaseHeroStats`/
  `buildHeroStats` (`modules/shared/activities/presentation/
  get-activity-visual-data.ts` e `modules/garmin/application/activities/
  garmin-activity-details.ts`) usam `text-cyan-200`, `text-emerald-200`,
  `text-orange-200`, `text-teal-200`, `text-amber-200`, `text-violet-200`,
  `text-fuchsia-200` — nenhuma dessas tem override `[data-theme="light"]` em
  `app/globals.css` hoje (só `.text-rose-200` tem, na linha 569).
- `app/globals.css` já estabelece o padrão: overrides `[data-theme="light"]
  .text-<cor>-<peso>` agrupam classes com contraste semelhante e mapeiam para
  uma cor sólida em `oklch()` com luminosidade baixa (~0.38–0.44) e chroma
  moderado, preservando a identidade de matiz (ex.: `.text-emerald-300` /
  `.text-cyan-300` compartilham override porque são "família verde-azulada").
  Vou seguir exatamente esse padrão, e não migrar para tokens semânticos —
  ver seção de decisão abaixo.
- `lib/theme.ts` define `DEFAULT_THEME = "dark"` e é consumido tanto pelo
  script inline (`getThemeInitScript`, injetado em `app/layout.tsx` via
  `dangerouslySetInnerHTML`) quanto — presumivelmente — por outros pontos que
  leem a constante em runtime React (ex.: `components/theme-toggle.tsx`, não
  lido neste ciclo mas irrelevante à mudança: ele já lê de `localStorage`/DOM,
  não da constante, então a troca do valor de `DEFAULT_THEME` é suficiente).
- `components/app-shell.tsx`: `NavIcon` renderiza `<svg width="18" height="18"
  ...>` dentro de um `motion.div` com `h-12 w-12` (48px) — folga de 30px em
  cada eixo, suficiente para crescer sem tocar a borda do contêiner.
- `components/profile/onboarding-wizard.tsx` linha 340: `{step.complete ? "✓"
  : step.number}` dentro de um `motion.span` que já anima
  entrada/saída (`AnimatePresence`) — a troca por ícone precisa preservar essa
  transição.
- `components/profile/profile-experience.tsx`: dois usos de `"✓ "` como
  prefixo de texto (linha ~440, feedback de CEP; linha ~682, helper de
  `MetricCard`), ambos condicionados a `tone === "success"` e já ao lado de
  onde um `icon?: ReactNode` já existe em componentes vizinhos (`IconCheck` já
  é importado e usado em outros pontos do mesmo arquivo, ex. linha 150).
- `components/landing-whatsapp-phone.tsx` usa `"✓✓"` com `className="text-
  [#53bdeb]"` para simular os tiques de leitura do WhatsApp — Requisito 7.7
  isenta esse caso; nenhuma mudança de código necessária ali.
- Confirmei também, por grep amplo (`text-<cor>-100|200|300` sem override em
  `app/globals.css`), que a lista de arquivos do Requisito 6 é precisa quanto
  às classes citadas (`text-cyan-200`, `text-amber-200/90`, `text-rose-200`,
  `text-sky-300`, `text-violet-300`, `text-emerald-300`, `text-indigo-300`) e
  que `components/admin/history-cleanup-panel.tsx` e
  `components/admin/whatsapp-report-preview-panel.tsx` usam
  `text-amber-200/90` (mesma família que precisa de override).
  `components/admin/message-delivery-panel.tsx` usa `text-rose-200` (já
  cobertA) e `text-emerald-100`/`text-rose-100`/`text-amber-100` (já cobertos
  por overrides existentes) — só a instância de `text-rose-200` na linha 693 é
  nova a confirmar contra o override já existente (mesma classe, já
  coberta). Não há classe nova sem cobertura nesse arquivo.

## Arquitetura

### Mapeamento Visual de Provider

**Decisão**: o mapeamento vive em `modules/shared/integrations/catalog/`,
como um novo arquivo `visual.ts`, e não dentro de `ProviderDefinition`
(`index.ts`). Motivos:

- `ProviderDefinition` descreve *o que* um provider é/faz (nome,
  disponibilidade, capabilities) para decisões de produto/policy. Ícone e cor
  são puramente de apresentação, e misturar os dois faria com que qualquer
  componente que importa `PROVIDERS` para lógica de negócio (ex.:
  `hasCapability`) também carregasse metadata de UI. Separar os arquivos
  mantém `catalog/index.ts` focado e `catalog/visual.ts` importável isoladamente
  por client components (`"use client"`) sem trazer nada supérfluo.
- Resolve a duplicação identificada em `integrations-hub.tsx` e
  `onboarding-wearable-step.tsx`: os dois `providerIconMap` locais são
  substituídos por um único `getProviderVisual(providerId)` importado do
  catálogo. Isso satisfaz a regra do projeto de não haver lógica
  provider-specific fora de `modules/<provider>/` — hoje esses dois
  componentes têm um mapeamento `ProviderId -> ícone` hardcoded, que é
  exatamente o tipo de mapa que deve viver no catálogo central.

```ts
// modules/shared/integrations/catalog/visual.ts

import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * Identificador de ícone de marca no formato usado por `@iconify/react`
 * (ex.: "simple-icons:strava"), consistente com o uso existente em
 * integrations-hub.tsx e onboarding-wearable-step.tsx.
 */
export type ProviderIconId = string;

export interface ProviderVisual {
  /** Ícone de marca (@iconify/react, coleção simple-icons). */
  icon: ProviderIconId;
  /**
   * Cor de destaque do provider, como classe utilitária Tailwind de texto
   * (aplicada ao ícone e ao texto do Selo de Origem). Reaproveita classes já
   * cobertas por overrides `[data-theme="light"]` em app/globals.css.
   */
  textClassName: string;
  /** Classe utilitária de fundo (tom translúcido) do Selo de Origem. */
  backgroundClassName: string;
  /** Classe utilitária de borda do Selo de Origem. */
  borderClassName: string;
}

const PROVIDER_VISUALS: Readonly<Record<ProviderId, ProviderVisual>> = {
  GARMIN: {
    icon: "simple-icons:garmin",
    textClassName: "text-cyan-200",
    backgroundClassName: "bg-cyan-400/10",
    borderClassName: "border-cyan-300/20",
  },
  STRAVA: {
    icon: "simple-icons:strava",
    textClassName: "text-orange-200",
    backgroundClassName: "bg-orange-400/10",
    borderClassName: "border-orange-300/20",
  },
  POLAR: {
    icon: "simple-icons:polar",
    textClassName: "text-sky-300",
    backgroundClassName: "bg-sky-300/10",
    borderClassName: "border-sky-300/20",
  },
  COROS: {
    icon: "simple-icons:coros",
    textClassName: "text-emerald-300",
    backgroundClassName: "bg-emerald-300/10",
    borderClassName: "border-emerald-300/20",
  },
  SUUNTO: {
    icon: "simple-icons:suunto",
    textClassName: "text-indigo-300",
    backgroundClassName: "bg-sky-300/10",
    borderClassName: "border-sky-300/20",
  },
  FITBIT: {
    icon: "simple-icons:fitbit",
    textClassName: "text-emerald-200",
    backgroundClassName: "bg-emerald-400/10",
    borderClassName: "border-emerald-300/20",
  },
};

/** Fallback usado quando um `provider` não tem entrada no mapeamento (Requisito 1.5). */
const DEFAULT_PROVIDER_VISUAL: ProviderVisual = {
  icon: "simple-icons:googlefit",
  textClassName: "text-foreground/82",
  backgroundClassName: "bg-white/8",
  borderClassName: "border-white/10",
};

/**
 * Resolve o Mapeamento Visual de Provider para um `ProviderId`.
 *
 * Nunca lança e nunca retorna `undefined`: providers sem entrada (futuros
 * providers adicionados ao catálogo sem visual definido ainda) recebem o
 * fallback padrão, preservando o rótulo textual do provider (Requisito 1.5).
 */
export function getProviderVisual(providerId: string): ProviderVisual {
  return PROVIDER_VISUALS[providerId as ProviderId] ?? DEFAULT_PROVIDER_VISUAL;
}
```

Consumo pelos dois componentes de atividades (Requisitos 1 e 2):

- `activity.origin` (tipo de `ActivitiesBrowserProps`) ganha o campo
  `providerId: string` além de `label: string`. `app/app/atividades/
  page.tsx` (`buildActivityCard`) passa a preencher `origin: { label:
  getProviderLabel(activity.provider), providerId: activity.provider }`.
- Dentro de `ActivitiesBrowser`, o Selo de Origem passa a ser renderizado por
  uma função `renderOriginBadge(origin)` que chama `getProviderVisual(origin.
  providerId)`, troca `<IconDeviceWatch size={13} />` pelo ícone do
  Mapeamento Visual (via `@iconify/react`, já uma dependência do projeto — ver
  decisão de biblioteca abaixo) e troca `theme-pill-neutral` pelas três
  classes (`textClassName`/`backgroundClassName`/`borderClassName`) do
  `ProviderVisual`, mantendo o mesmo layout (`rounded-full border px-2.5 py-1
  text-[11px] ...`).
- `ActivityVisualDashboardProps` ganha `providerId: string` (novo prop, ao
  lado de `provider: string` que continua sendo o rótulo textual já
  resolvido). `app/app/atividades/[id]/page.tsx` passa `providerId={visualData.
  provider}` (o `Activity.provider` bruto, ex. `"STRAVA"`) além do
  `provider={providerLabel}` já existente.
- `StatusPill` ganha uma variante: quando renderizado para o Selo de Origem,
  em vez de `tone: "neutral" | "success"`, passa a aceitar também `visual:
  ProviderVisual` (novo prop opcional) e, quando presente, usa `visual.icon`
  + as três classes do mapeamento em vez do `theme-pill-neutral` genérico.
  Isso resolve a paridade exigida pelo Requisito 2.3: os dois componentes
  chamam a mesma função `getProviderVisual`, garantindo ícone/cor idênticos.

```ts
// Alteração de tipo em ActivitiesBrowserProps (activities-browser.tsx)
groups: Array<{
  label: string;
  items: Array<{
    // ...campos existentes
    origin: {
      label: string;
      providerId: string; // novo — Requisitos 1.2, 1.3, 2.1, 2.2
    };
    // ...
  }>;
}>;
```

**Reaproveitamento em `integrations-hub.tsx` e `onboarding-wearable-step.
tsx`**: os dois `providerIconMap` locais são removidos; `ProviderMark`
(`integrations-hub.tsx`) e o uso equivalente em `onboarding-wearable-step.
tsx` passam a chamar `getProviderVisual(provider).icon` em vez de indexar o
mapa local. Isso não é exigido pelos Requisitos 1–8 diretamente, mas elimina
a duplicação identificada na investigação sem mudar o comportamento visual
atual desses dois componentes (eles hoje só usam o ícone, nunca a cor) — é
uma consequência natural de centralizar o mapeamento no catálogo, não uma
mudança de escopo funcional.

**Por que `@iconify/react` e não `@tabler/icons-react` para o ícone de
marca**: os ícones de marca dos providers (logo Garmin, logo Strava) só
existem na coleção `simple-icons`, disponível via Iconify. `@tabler/
icons-react` é uma biblioteca de ícones genéricos (sem logos de marca) e já é
usada no projeto para os Ícones de Modalidade e de Navegação. Ambas as
bibliotecas já são dependências diretas do projeto (confirmado em `package.
json` implicitamente pelo uso em `integrations-hub.tsx` e
`activities-browser.tsx`), então nenhuma dependência nova é introduzida.

### Estratégia de correção de contraste no Tema Claro

**Decisão**: estender o padrão de override `[data-theme="light"] .text-*`
já estabelecido em `app/globals.css`, e não migrar para tokens semânticos de
cor (CSS custom properties tipo `--sport-swimming-*`, que já existem mas só
são usadas por `lib/sports.ts`/relatórios, não pelos componentes de UI web
deste spec).

Justificativa:

- O arquivo já tem ~15 blocos desse padrão exato, cobrindo `text-emerald-100`,
  `text-amber-100`, `text-rose-100`, `text-sky-100`, `text-emerald-300`/
  `text-green-300`/`text-cyan-300` (agrupados), `text-sky-300`/`text-indigo-
  300`/`text-violet-300` (agrupados), `text-rose-300`/`text-amber-300`/
  `text-orange-300` (agrupados), e `text-rose-200`. Adicionar os overrides
  faltantes é uma mudança de 1 arquivo, sem tocar em nenhum componente
  React, e sem risco de quebrar o Tema Escuro (o seletor `[data-theme="light"]`
  é aditivo).
   - Migrar para tokens semânticos exigiria (a) inventar um novo conjunto de
   variáveis (`--icon-swim`, `--icon-run`, etc.), (b) editar todo componente
   que hoje usa `text-cyan-200` etc. para usar a nova classe/token, e (c)
   ainda assim precisar de um valor por tema — ou seja, o mesmo trabalho de
   mapear tema→cor, só que com uma camada de indireção adicional e
   maior risco de regressão (qualquer componente esquecido continua com o
   bug). Não há um requisito que peça a criação de um design system de
   tokens; o Requisito 3.4 e o 6.2 pedem explicitamente para seguir "o padrão
   de sobrescrita `[data-theme="light"]` já usado em `app/globals.css`".
- Escolha de valores de cor: sigo a mesma fórmula já usada nos overrides
  existentes — luminosidade baixa (`L` entre 0.38–0.46 em `oklch()`) sobre o
  fundo claro do tema (`--background: oklch(0.985 0.008 95)`), preservando o
  matiz (`H`) da classe original para manter a associação visual (ex.:
  `text-cyan-200` continua "azul-ciano", só que escuro o bastante para
  contraste ≥ 3:1). Verificação de contraste: com `L ≈ 0.42` sobre um fundo de
  `L ≈ 0.97–0.99` (o `--background` do tema claro, ou o branco quase puro dos
  cartões `bg-white/[0.045]`/`bg-black/10` já com override próprio), a razão
  de contraste (fórmula WCAG relativa a luminância, não a `L` do OKLCH
  diretamente — validado por amostragem manual, não por ferramenta neste
  documento) fica na faixa 4.5:1–6:1 para os overrides já existentes no
  arquivo (`.text-rose-200` → `oklch(0.42 0.15 22)`), então replicar o mesmo
  `L` para as classes novas atende com margem ao mínimo de 3:1 do Requisito
  3.1/3.2/6.1. Ver "Riscos" para a ressalva sobre validação real com
  ferramenta de contraste.

Overrides novos a adicionar em `app/globals.css` (mesma seção dos existentes,
por volta da linha 569, junto ao bloco de `.text-rose-200`):

```css
[data-theme="light"] .text-cyan-200 {
  color: oklch(0.42 0.12 220);
}

[data-theme="light"] .text-emerald-200 {
  color: oklch(0.4 0.12 160);
}

[data-theme="light"] .text-orange-200 {
  color: oklch(0.46 0.15 45);
}

[data-theme="light"] .text-teal-200 {
  color: oklch(0.4 0.1 180);
}

[data-theme="light"] .text-amber-200,
[data-theme="light"] .text-amber-200\/90 {
  color: oklch(0.46 0.13 75);
}

[data-theme="light"] .text-violet-200 {
  color: oklch(0.44 0.15 290);
}

[data-theme="light"] .text-fuchsia-200 {
  color: oklch(0.44 0.16 330);
}
```

Essas 7 classes cobrem: `getSportIconShellClass` (Ícones de Modalidade —
Requisito 3.1, 3.5), `buildBaseHeroStats`/`buildHeroStats` (`heroStats` —
Requisito 3.2), e `text-amber-200/90` usado em
`history-cleanup-panel.tsx`/`whatsapp-report-preview-panel.tsx` (Requisito
6.1/6.2). As classes já listadas no Requisito 6 que **já têm** override
(`text-sky-300`, `text-violet-300`, `text-emerald-300`, `text-indigo-300`,
`text-rose-200`) não precisam de nova regra — confirmado por grep contra
`app/globals.css` linhas 360–377 e 569–572. Nenhuma mudança é necessária para
o Tema Escuro (Requisito 6.3): os overrides só entram em vigor sob o seletor
`[data-theme="light"]`.

O Selo de Origem (Requisito 3.3) herda automaticamente esse mesmo tratamento
porque `getProviderVisual` usa classes de cor já cobertas pelos overrides
existentes (`text-cyan-200`, `text-sky-300`, `text-emerald-300`,
`text-indigo-300`) ou pelos novos acima (`text-orange-200`, `text-emerald-
200`) — nenhuma classe nova exclusiva de provider precisa de override
adicional.

### Estratégia de cor nos Cartões de Resumo

**Decisão**: cada um dos 4 cartões (`summaryCards` em `app/app/atividades/
page.tsx`, renderizados por `ActivitiesBrowser`) ganha uma cor de destaque
fixa por `key` (não por valor — a cor não deve mudar conforme o número
sobe/desce, só a associação indicador→cor é fixa), substituindo o ícone
neutro `bg-black/10 text-foreground/84` por uma variante colorida por
indicador, reaproveitando classes já cobertas pelo padrão de override:

| `key` | Indicador | Classe de fundo do ícone | Classe de texto do ícone |
| --- | --- | --- | --- |
| `activities` | Atividades | `bg-sky-300/10` | `text-sky-300` |
| `distance` | Distância total | `bg-emerald-300/10` | `text-emerald-300` |
| `duration` | Tempo em atividade | `bg-amber-300/10` | `text-amber-300` |
| `active-days` | Dias com treino | `bg-violet-300/10` | (novo override — ver abaixo) |

As três primeiras linhas reaproveitam classes de fundo já cobertas por
overrides existentes (`bg-sky-300/10`, `bg-emerald-300/8`/`10`,
`bg-amber-300/8`/`10` — linhas 398–419 de `app/globals.css`) e classes de
texto já cobertas (`text-sky-300`, `text-emerald-300`, `text-amber-300`).
`bg-violet-300/10` não tem override hoje — adiciono um, seguindo o mesmo
padrão dos `bg-*-300/10` já existentes:

```css
[data-theme="light"] .bg-violet-300\/8,
[data-theme="light"] .bg-violet-300\/10 {
  background-color: oklch(0.9 0.06 290 / 0.6);
}
```

O valor/label numérico (`card.value`, `card.label`, `card.subtitle`,
`card.comparison`) continua em `text-foreground` / `text-foreground/*`,
inalterado — só o ícone circular do topo do cartão ganha cor, preservando a
legibilidade dos números (Requisito 4.3). Implementação: `renderSummaryIcon`
e o `<div className="mb-4 flex h-11 w-11 ... bg-black/10 text-foreground/84">`
em `ActivitiesBrowser` passam a receber a classe de cor do indicador via um
novo helper `getSummaryCardAccentClass(card.key)` (mesmo padrão de função
`switch` já usado por `getSportIconShellClass`).

### Mudança do tema padrão

`lib/theme.ts`:

```ts
export const DEFAULT_THEME = "light" as const;
```

Impacto no script de inicialização (`getThemeInitScript`, `app/layout.tsx`):
nenhuma mudança de código é necessária além da constante — o script já lê
`defaultTheme` da constante interpolada via `JSON.stringify(DEFAULT_THEME)` e
já cai no `catch` (falha do `localStorage`/JS) usando a mesma constante
(Requisito 5.4 — script indisponível/falho já cai no padrão, que passa a ser
`"light"`). O fluxo:

```text
Página carrega
  → script inline executa antes do primeiro paint
  → lê localStorage["ryvano-theme"]
      → valor válido ("dark" | "light") → usa esse valor (Requisito 5.3)
      → ausente/invalido → usa DEFAULT_THEME = "light" (Requisito 5.1, 5.2)
  → seta document.documentElement.dataset.theme
  → catch (localStorage indisponível) → usa DEFAULT_THEME = "light" (Requisito 5.4)
```

`ThemeToggle` (persistência ao alternar manualmente) não precisa de mudança:
ele já grava em `localStorage` sob `THEME_STORAGE_KEY` sempre que o usuário
alterna, e essa gravação é o que garante que a Preferência de Tema Salva
sempre tenha prioridade sobre `DEFAULT_THEME` (Requisito 5.3, 5.5, 5.6) — o
código de leitura em `isValidTheme`/`stored` não muda.

### Estratégia de substituição de emoji por ícone

**`components/profile/onboarding-wizard.tsx`** (Requisito 7.3): o
`motion.span` na linha 340 troca `{step.complete ? "✓" : step.number}` por
`{step.complete ? <IconCheck size={14} stroke={2.4} /> : step.number}`,
importando `IconCheck` de `@tabler/icons-react` (biblioteca já usada nesse
mesmo arquivo, ex. `IconActivityHeartbeat`, `IconUser`). O `AnimatePresence`
com `key={step.complete ? \`${step.id}-done\` : \`${step.id}-number\`}` e as
`initial`/`animate`/`exit` variants de escala/rotação continuam idênticas —
elas animam o filho do `motion.span`, que passa a ser um ícone em vez de um
caractere, sem precisar de ajuste de layout (ambos são elementos inline
pequenos dentro do mesmo contêiner de 11×11).

**`components/profile/profile-experience.tsx`** (Requisito 7.4): dois
pontos, ambos já com `tone === "success"` disponível como condição:

1. Linha ~440 (`postalFeedback`): a `<p>` atual concatena texto puro
   (`"✓ " + message`). Vira:
   ```tsx
   <p className={`flex items-center gap-1.5 ${postalFeedback.tone === "success" ? "text-emerald-300" : "text-amber-300"}`}>
     {postalFeedback.tone === "success" ? <IconCheck size={14} /> : null}
     {postalFeedback.message}
   </p>
   ```
2. Linha ~682 (`MetricCard` helper, prop `helperTone`): mesma transformação,
   trocando o prefixo `"✓ "` por `<IconCheck size={12} />` dentro de um
   `<span className="inline-flex items-center gap-1">`.

`IconCheck` já é importado nesse arquivo (linha 13), então não é necessário
adicionar um novo import — só reutilizar o símbolo nos dois pontos.
`components/profile/security-experience.tsx` (que compartilha o mesmo padrão
visual de `helperTone`/`tone`, conforme a investigação) não tem uso de `"✓ "`
textual — não precisa de mudança para o Requisito 7.

**Exceções (Requisito 7.5, 7.6, 7.7)**: nenhuma mudança em `lib/reports/**`,
`app/actions/integrations.ts` (mensagens WhatsApp) ou
`components/landing-whatsapp-phone.tsx` (mockup dos tiques `"✓✓"`).

### Estratégia de aumento do ícone de navegação da sidebar

**Decisão**: aumentar `NavIcon` de `18x18px` para `24x24px` (não 22px).

Justificativa: o contêiner (`h-12 w-12` = 48px) tem 30px de folga em cada
eixo com o ícone atual de 18px (padding efetivo de 15px por lado). Um SVG de
24px ainda deixa 12px de padding por lado — visualmente confortável e
consistente com o tamanho já usado para os Ícones de Modalidade dentro dos
Cartões de Atividade (`renderSportIcon`, todos com `size={24}` em
`@tabler/icons-react`) e para os ícones dos Cartões de Resumo
(`renderSummaryIcon`, também `size={20}`–ish em contêineres de 44px). Manter
`24px` cria uma escala consistente com o resto do produto em vez de escolher
um valor arbitrário só para a sidebar. `22px` funcionaria também, mas não
alinha com nenhum outro tamanho já em uso no código; `24px` sim.

Implementação (Requisito 8.1, 8.2, 8.3, 8.4): troca apenas os atributos
`width="18" height="18"` por `width="24" height="24"` no `<svg>` de `NavIcon`
(`components/app-shell.tsx`). O `viewBox="0 0 24 24"` já é `24x24`, então
todos os `<path>`/`<circle>` internos (definidos em coordenadas do viewBox)
escalam proporcionalmente sem qualquer ajuste (Requisito 8.2 — a proporção é
preservada porque só a dimensão de renderização do `<svg>` muda, não o
`viewBox` nem os paths). O `<svg>` já está dentro de um `motion.div` com
`grid h-12 w-12 place-items-center` — centralização automática via grid, sem
mudança de CSS necessária (Requisito 8.3). O rótulo de texto (`<p
className="truncate text-sm ...">{item.label}</p>`) está em um bloco irmão,
fora do contêiner do ícone — aumentar o ícone não reduz o espaço disponível
para o texto, que continua com sua própria `motion.div` de largura animada
(Requisito 8.4).

## Componentes e interfaces (resumo de assinaturas alteradas)

```ts
// modules/shared/integrations/catalog/visual.ts (novo)
export interface ProviderVisual {
  icon: string;
  textClassName: string;
  backgroundClassName: string;
  borderClassName: string;
}
export function getProviderVisual(providerId: string): ProviderVisual;

// components/activities/activities-browser.tsx (alterado)
export type ActivitiesBrowserProps = {
  // ...
  groups: Array<{
    label: string;
    items: Array<{
      // ...
      origin: { label: string; providerId: string }; // + providerId
      // ...
    }>;
  }>;
};

// components/activities/activity-visual-dashboard.tsx (alterado)
type ActivityVisualDashboardProps = {
  // ...
  provider: string;      // rótulo textual (inalterado)
  providerId: string;    // novo — para resolver o Mapeamento Visual
  // ...
};
```

## Modelo de dados

Nenhuma migração de banco de dados é necessária. `Activity.provider` (já
existente, tipo `WearableProvider`) é a única fonte de dado consumida pelo
Mapeamento Visual — ele já chega normalizado até os componentes (`activity.
provider` em `app/app/atividades/page.tsx`, `visualData.provider` em
`get-activity-visual-data.ts`). O `ProviderVisual` é dado estático,
in-memory, definido em código.

## Correctness Properties

Este spec é predominantemente CSS/apresentação (mapeamento estático
`ProviderId -> ícone/cor`, troca de valor de constante, troca de dimensão de
SVG, troca de string por componente de ícone). Não há parser, serializer,
transformação de dados de entrada variável, nem lógica algorítmica cujo
comportamento varie de forma rica com o input — os "inputs" relevantes
(`ProviderId`, `sportTone`, `ThemeName`) são enumerações pequenas e fechadas,
mais bem cobertas por testes de exemplo (um caso por valor do enum) do que por
geração aleatória. Avaliando os Requisitos 1–8 pelas perguntas de
qualificação para PBT:

- **Requisito 1/2** (Mapeamento Visual de Provider): o domínio de entrada é
  `ProviderId` (6 valores fixos, hoje) + o caso de fallback. Isso é
  testável de forma completa e exaustiva com testes de exemplo (um por
  provider + um para um id desconhecido), sem ganho de 100 iterações
  aleatórias sobre 7 exemplos exaustivos.
- **Requisito 3/6** (contraste): contraste real (WCAG) não é computável a
  partir das classes Tailwind sem um cálculo de luminância relativa
  implementado à parte — isso é validação de design/CSS, não lógica de
  negócio testável por PBT. Ver "Riscos" abaixo.
- **Requisito 4** (cor dos Cartões de Resumo): mapeamento fixo `key -> classe`
  sobre 4 chaves conhecidas — testável por exemplo.
- **Requisito 5** (tema padrão): `ThemeName` tem exatamente 2 valores
  (`"dark" | "light"`); a lógica de prioridade (salvo > padrão > fallback de
  erro) é melhor expressa como 3 exemplos concretos (sem storage, com storage
  válido, com storage inválido/exceção) do que como uma propriedade
  universal.
- **Requisito 7** (emoji): verificação de que um componente não renderiza um
  caractere específico é um teste de snapshot/exemplo, não uma propriedade.
- **Requisito 8** (tamanho do ícone): valor fixo (24px), testável por
  exemplo/snapshot.

Por isso, **a seção de Correctness Properties é omitida** — nenhum critério
de aceitação deste spec passou a barreira "para todo input X, a propriedade
P(X) vale" de forma que justifique geração aleatória sobre testes de exemplo
exaustivos. A ferramenta de prework não foi executada, conforme a regra do
workflow ("se PBT não aplicável, pular Correctness Properties e não rodar
prework").

## Tratamento de erros

- **`getProviderVisual` com `providerId` desconhecido ou vazio** (Requisito
  1.5): retorna `DEFAULT_PROVIDER_VISUAL` (ícone `simple-icons:googlefit`,
  cores neutras). Nunca lança, nunca retorna `undefined`. O rótulo textual do
  Selo de Origem (`origin.label`, já resolvido por `getProviderLabel`)
  continua sendo exibido normalmente — o fallback só afeta ícone/cor, não o
  texto.
- **Novo provider adicionado ao catálogo sem entrada em `PROVIDER_VISUALS`**
  (Requisito 1.6): cai no mesmo fallback acima até que uma entrada seja
  adicionada a `visual.ts`; nenhum componente (`ActivitiesBrowser`,
  `ActivityVisualDashboard`, `integrations-hub.tsx`,
  `onboarding-wearable-step.tsx`) precisa de alteração para reconhecer o novo
  provider, pois todos leem por `getProviderVisual(providerId)`.
- **Script de inicialização de tema falha** (Requisito 5.4): já tratado pelo
  bloco `catch` existente em `getThemeInitScript`, que aplica `DEFAULT_THEME`
  — sem mudança de lógica, só do valor da constante.
- **`localStorage` indisponível/JS desabilitado**: o atributo `data-theme` no
  `<html>` só é setado pelo script inline; sem JavaScript, nenhum atributo é
  setado e o CSS de `:root` (tema escuro, hoje) é o que se aplica — isso é uma
  limitação pré-existente do mecanismo de tema (baseado em atributo setado
  via JS, não em `prefers-color-scheme`) que este spec não resolve, pois o
  Requisito 5.4 fala apenas do caso "script falha" (exceção em runtime), não
  do caso "JS desabilitado no navegador" enquanto tecnicamente distinto. Ver
  "Riscos".

## Estratégia de testes

Sem Correctness Properties, a estratégia é 100% baseada em testes unitários
e de integração (vitest, já usado no projeto — confirmado pelo design de
referência `integracoes-modulares`):

- **`getProviderVisual`** (`modules/shared/integrations/catalog/visual.test.
  ts`, novo): um exemplo por `ProviderId` do catálogo atual (GARMIN, STRAVA,
  POLAR, COROS, SUUNTO, FITBIT) verificando que cada um retorna um `icon`
  não-vazio e classes não-vazias; um exemplo para um id desconhecido
  (`"UNKNOWN" as ProviderId`) verificando que retorna exatamente
  `DEFAULT_PROVIDER_VISUAL`; um exemplo verificando que dois providers
  distintos (ex. GARMIN vs STRAVA) retornam `icon` e `textClassName`
  diferentes entre si (cobre Requisito 1.4 de forma direta).
- **`lib/theme.ts`**: teste existente (se houver) ou novo, verificando
  `DEFAULT_THEME === "light"` e que `getThemeInitScript()` inclui esse valor
  interpolado.
- **Componentes React** (`ActivitiesBrowser`, `ActivityVisualDashboard`):
  testes de exemplo (React Testing Library, se já configurado no projeto —
  a confirmar; caso contrário, testes unitários das funções puras extraídas
  como `renderOriginBadge`/`getSummaryCardAccentClass` sem montar o componente
  inteiro) garantindo que o Selo de Origem de dois providers diferentes
  produz `className`s diferentes.
- **Onboarding wizard / profile experience**: teste de exemplo garantindo que
  o texto renderizado não contém o caractere `"✓"` (verificação direta do
  Requisito 7.2/7.3/7.4) e que o ícone `IconCheck` é renderizado no estado de
  sucesso/conclusão.
- **Verificação manual de contraste** (não automatizável sem ferramenta
  dedicada): após aplicar os overrides de `app/globals.css`, validar
  visualmente cada combinação `sportTone` × Tema Claro e cada `heroStat` ×
  Tema Claro, idealmente com uma ferramenta de contraste (ex. DevTools do
  navegador) antes de considerar o Requisito 3/6 encerrado — ver "Riscos".
- **Build/typecheck**: `npm run build` após as mudanças de tipo em
  `ActivitiesBrowserProps`/`ActivityVisualDashboardProps` (novos campos
  `providerId` são obrigatórios nos dois call sites existentes,
  `app/app/atividades/page.tsx` e `app/app/atividades/[id]/page.tsx` — o
  typecheck do Next pega qualquer call site esquecido).

## Rastreabilidade (Requisitos → Design)

| Requisito | Elemento do design |
| --- | --- |
| 1.1 | `ProviderVisual` + `PROVIDER_VISUALS` em `modules/shared/integrations/catalog/visual.ts` |
| 1.2 | Selo de Origem em `ActivitiesBrowser` passa a usar `getProviderVisual(origin.providerId).icon` via `@iconify/react`, substituindo `IconDeviceWatch` |
| 1.3 | Selo de Origem em `ActivitiesBrowser` aplica `textClassName`/`backgroundClassName`/`borderClassName` do `ProviderVisual`, substituindo `theme-pill-neutral` |
| 1.4 | Teste de exemplo garantindo `icon`/`textClassName` distintos entre GARMIN e STRAVA; `origin.providerId` por atividade garante que cada cartão resolve seu próprio provider |
| 1.5 | `DEFAULT_PROVIDER_VISUAL` como fallback de `getProviderVisual`; `origin.label` (rótulo textual) inalterado |
| 1.6 | `getProviderVisual` centralizado no catálogo — novo provider só exige entrada em `PROVIDER_VISUALS`, nenhuma mudança em `ActivitiesBrowser` |
| 2.1 | `ActivityVisualDashboardProps.providerId` + `StatusPill` com `visual` prop, exibindo `ProviderVisual.icon` |
| 2.2 | Mesma alteração de `StatusPill`, aplicando as classes de cor do `ProviderVisual` |
| 2.3 | Ambos os componentes chamam a mesma função `getProviderVisual`, garantindo paridade |
| 3.1 | Novos overrides `[data-theme="light"]` para `text-cyan-200`/`text-emerald-200`/`text-orange-200`/`text-teal-200`/`text-amber-200`/`text-violet-200` (usados por `getSportIconShellClass`) |
| 3.2 | Mesmos overrides cobrem `text-cyan-200`/`text-fuchsia-200`/`text-emerald-200` usados por `buildBaseHeroStats`/`buildHeroStats` |
| 3.3 | Selo de Origem usa classes já cobertas por overrides (existentes ou novos) — herda contraste automaticamente |
| 3.4 | Todos os overrides novos seguem exatamente o padrão `[data-theme="light"] .text-*` já presente em `app/globals.css` |
| 3.5 | Cada `sportTone` mantém uma classe de matiz distinta (`cyan`/`emerald`/`orange`/`teal`/`amber`/`violet`) tanto no override novo quanto no valor original — a distinção visual entre modalidades é preservada |
| 4.1 | `getSummaryCardAccentClass(card.key)` substitui `bg-black/10 text-foreground/84` por cor não-neutra por indicador |
| 4.2 | Tabela de 4 cores distintas (`sky`/`emerald`/`amber`/`violet`) por `key` |
| 4.3 | Só o ícone do Cartão de Resumo muda de cor; `value`/`label`/`subtitle`/`comparison` continuam em `text-foreground`/`text-foreground/*` |
| 5.1, 5.2 | `DEFAULT_THEME = "light"` em `lib/theme.ts` |
| 5.3 | Lógica de leitura de `localStorage` em `getThemeInitScript` inalterada — preferência salva sempre tem prioridade |
| 5.4 | Bloco `catch` existente em `getThemeInitScript` aplica `DEFAULT_THEME`, agora `"light"` |
| 5.5, 5.6 | `ThemeToggle` inalterado — continua gravando em `localStorage` e oferecendo as duas opções |
| 6.1, 6.2 | Overrides novos cobrem `text-cyan-200` e `text-amber-200`/`text-amber-200\/90` (usados em `history-cleanup-panel.tsx`, `whatsapp-report-preview-panel.tsx`); classes já cobertas (`text-sky-300`, `text-violet-300`, `text-emerald-300`, `text-indigo-300`, `text-rose-200`) confirmadas por grep contra `app/globals.css` |
| 6.3 | Overrides são aditivos sob `[data-theme="light"]`; nenhuma regra do Tema Escuro é alterada |
| 6.4 | Seção "Investigação de código" documenta os arquivos confirmados; nenhuma lista é tratada como exaustiva no código (o override é por classe CSS, não por arquivo) |
| 7.1, 7.2 | Substituições pontuais por `IconCheck` (`@tabler/icons-react`) nos dois componentes citados |
| 7.3 | `onboarding-wizard.tsx`: `{step.complete ? <IconCheck size={14} stroke={2.4} /> : step.number}` |
| 7.4 | `profile-experience.tsx`: dois pontos (`postalFeedback`, `MetricCard`) trocam prefixo `"✓ "` por `<IconCheck />` |
| 7.5, 7.6, 7.7 | Nenhuma mudança em `lib/reports/**`, `app/actions/integrations.ts`, `components/landing-whatsapp-phone.tsx` — exceções confirmadas e respeitadas |
| 8.1 | `NavIcon`: `width="18" height="18"` → `width="24" height="24"` |
| 8.2 | `viewBox="0 0 24 24"` inalterado — proporção preservada automaticamente |
| 8.3 | Contêiner `h-12 w-12` com `grid place-items-center` inalterado — centralização automática, 12px de padding remanescente por lado |
| 8.4 | Rótulo de texto em bloco irmão separado, fora do contêiner do ícone — não afetado |

## Riscos e decisões de trade-off

- **Risco de regressão visual ao mudar o tema padrão (Requisito 5)**: usuários
  sem preferência salva (a maioria dos usuários novos, e qualquer usuário
  existente que nunca usou o `ThemeToggle`) passam a ver a aplicação inteira
  no Tema Claro pela primeira vez. Isso expõe imediatamente qualquer classe de
  cor sem override `[data-theme="light"]` que a investigação deste spec não
  tenha capturado (a lista do Requisito 6 é "evidência", não exaustiva, por
  definição do próprio requisito). Mitigação: a correção de contraste
  (Requisito 3/6) precisa ser implementada e verificada visualmente **antes**
  de mudar `DEFAULT_THEME`, mesmo que os dois sejam specs/requisitos
  separados — a ordem de implementação na tasks.md deve refletir essa
  dependência (contraste primeiro, tema padrão depois), embora ambos possam
  ser desenvolvidos em paralelo e apenas o merge/deploy final precise respeitar
  a ordem.
- **3:1 mínimo (Requisito 3/6) vs. WCAG real**: o requisito define 3:1 como
  limiar (adequado para ícones/elementos gráficos conforme WCAG 2.1 critério
  1.4.11, "Non-text Contrast"), mas texto pequeno normalmente exige 4.5:1
  (critério 1.4.3). Os `heroStats` e Selos de Origem são texto, não só ícone —
  usar apenas 3:1 como meta pode deixar esses textos tecnicamente "aprovados"
  pelo requisito, mas ainda abaixo do padrão WCAG completo para texto. Este
  design segue o limiar definido no requisito (3:1) por ser o que foi
  explicitamente pedido, mas os valores de `oklch()` propostos (`L ≈ 0.4–0.46`)
  foram escolhidos com margem acima de 3:1 justamente para reduzir esse risco.
  Nenhuma ferramenta de contraste foi executada neste design — recomendo
  validação com DevTools (Chrome/Firefox têm calculadora de contraste
  integrada) durante a implementação, antes de marcar as tasks de CSS como
  concluídas. Como apontado nas regras deste projeto, validação completa de
  WCAG exige também teste manual com tecnologia assistiva, o que está fora do
  escopo deste spec.
- **Cores de provider vs. identidade de marca real**: `textClassName:
  "text-orange-200"` para Strava é uma aproximação (o laranja da marca Strava
  é mais próximo de `#FC4C02`) escolhida por reaproveitar uma classe Tailwind
  já presente no projeto (`getSportCardClass` já usa `border-orange-400/18`
  para `sportTone: "run"`) em vez de introduzir uma cor hexadecimal nova sem
  override de tema. Se o usuário preferir cores de marca exatas por provider,
  isso exigiria valores `oklch()`/hex customizados por provider (não apenas
  classes Tailwind existentes) e um override de tema dedicado por provider —
  troca simples de fazer depois, mas fora do escopo deste design por não ter
  sido pedido explicitamente nos Requisitos 1/2 (que falam de "cor de
  destaque", não de "cor de marca oficial").
- **Duplicação de `providerIconMap` fora do escopo formal do spec**: a
  centralização em `integrations-hub.tsx`/`onboarding-wearable-step.tsx` não é
  exigida por nenhum Requisito 1–8, mas é consequência direta de colocar o
  Mapeamento Visual no catálogo. Risco: se o usuário só queria a mudança em
  `/app/atividades` e prefere não tocar em `/app/integracoes` e no onboarding
  nesta spec, essa parte pode ser removida do design sem afetar os
  Requisitos 1–8 (bastaria manter os dois `providerIconMap` locais como estão
  e criar `getProviderVisual` só para os dois componentes de atividades). Meu
  julgamento é que a duplicação encontrada é exatamente o tipo de coisa que o
  catálogo central deveria evitar, e o risco de regressão é baixo (só ícone,
  mesmo valor), mas aviso aqui para confirmação do usuário antes das tasks.
