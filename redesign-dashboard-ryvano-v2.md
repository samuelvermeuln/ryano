# Ryvano — Redesign visual do Dashboard

> **Objetivo:** transformar a área de dados do dashboard em uma experiência premium, clara e atraente para clientes, inspirada na organização visual do Apple Health — **sem copiar a interface** e **sem alterar sidebar ou header**.

---

## 1. Regra principal

### NÃO ALTERAR

Os seguintes elementos devem permanecer exatamente como estão hoje:

- Sidebar desktop
- Header
- Navegação
- Avatar
- Logo
- Menu lateral
- Comportamento de collapse da sidebar
- Mobile dock
- Estrutura do `AppShell`

O redesign começa **somente dentro de `<main>` / área de conteúdo da página**.

### PODE ALTERAR

Dentro da área principal:

- estrutura dos cards;
- cores;
- hierarquia;
- espaçamento;
- tipografia;
- ícones;
- gráficos;
- microinterações;
- estados vazios;
- apresentação das métricas;
- ordem das informações;
- motion.

---

# 2. Problema atual

Hoje os dados estão corretos, porém a experiência visual apresenta alguns problemas:

1. quase todos os cards possuem o mesmo peso visual;
2. há pouca diferenciação entre métricas importantes e informações técnicas;
3. quase não existe uso de cor;
4. os números aparecem sem contexto visual;
5. a página parece uma listagem de dados e não um produto premium;
6. não existe sensação de movimento ou resposta;
7. `SYNCED_36`, timestamps e dados técnicos competem visualmente com métricas importantes;
8. estados sem dados usam `—`, o que transmite sensação de informação incompleta;
9. dados extras em JSON bruto não são apropriados para o cliente final;
10. a evolução semanal atual é funcional, porém pouco visual.

O novo design deve fazer o usuário entender a situação **em poucos segundos**.

---

# 3. Princípio visual

A referência deve ser usada principalmente para:

- hierarquia visual;
- leveza;
- uso de cards;
- organização por categoria;
- visualização rápida;
- pequenos gráficos;
- cores semânticas;
- números grandes;
- sensação de produto premium.

## Resultado esperado

A sensação deve ser:

**saúde + performance + tecnologia + simplicidade**

Evitar:

- dashboard corporativo genérico;
- excesso de glassmorphism;
- cards idênticos;
- gradientes fortes em tudo;
- neon;
- excesso de texto;
- animações chamativas;
- dashboards com aparência de painel administrativo.

---

# 4. Linguagem visual

## Cards

Os cards devem ter aparência mais limpa e sofisticada.

Características:

```txt
border-radius: 20–24px
padding: 18–24px
border: sutil
background: superfície clara/translúcida
shadow: muito leve
```

Cada card pode utilizar uma pequena cor de destaque.

Exemplo:

- ícone colorido;
- linha superior;
- glow leve;
- badge;
- progress ring;
- sparkline;
- mini área de gráfico.

Não preencher todos os cards com cores fortes.

---

# 5. Sistema de cores

As cores devem indicar significado.

| Categoria | Cor |
|---|---|
| Atividade | laranja / coral |
| Frequência cardíaca | vermelho / rosa |
| Sono | azul / índigo |
| Recuperação | verde / turquesa |
| Body Battery | verde |
| HRV | violeta |
| Movimento | azul-ciano |
| Natação | azul |
| Alertas | âmbar |
| Sucesso / conectado | verde |
| Erro | vermelho |

### Regra

Usar cor principalmente em:

- ícones;
- gráficos;
- indicadores;
- badges;
- números-chave;
- pequenos fundos com baixa opacidade.

Nunca depender somente da cor para transmitir estado.

---

# 6. Estrutura ideal do Dashboard

A nova área deve seguir esta ordem:

```txt
Dashboard
│
├── 1. Resumo / saudação
│
├── 2. Métricas principais do dia
│   ├── Prontidão
│   ├── Body Battery
│   ├── Frequência cardíaca
│   ├── Sono
│   ├── HRV
│   └── Movimento
│
├── 3. Insight principal
│
├── 4. Resumo do período
│
├── 5. Evolução
│
├── 6. Atividade recente
│
└── 7. Dados técnicos
```

---

# 7. Topo do conteúdo

Manter:

- saudação;
- período;
- filtro.

Melhorar a composição.

## Exemplo

```txt
Olá, Samuel

Seu desempenho nos últimos 30 dias

Você completou 8 atividades.
Sua semana mais ativa foi a de 16/08.
```

O texto principal deve ser curto.

O usuário precisa entender rapidamente:

- quantos treinos realizou;
- como está sua recuperação;
- como está sua evolução.

---

# 8. Métricas principais

## Layout desktop

Preferência:

```txt
┌──────────────────────┬──────────────────────┐
│ Prontidão            │ Body Battery         │
│ card grande          │ card grande          │
├──────────────┬───────┼──────────────┬───────┤
│ FC repouso   │ Sono  │ HRV          │ Movimento
└──────────────┴───────┴──────────────┴───────┘
```

Não precisa seguir exatamente essa proporção, mas alguns cards devem possuir maior destaque.

---

# 9. Card — Prontidão

Dados atuais:

```txt
60 / 100
MODERATE
```

Apresentação ideal:

```txt
Prontidão

60
Moderada

Seu corpo apresenta uma condição razoável
para treinar hoje.

[ progress ring ]
```

### Visual

- progress ring ou gauge;
- número grande;
- status traduzido;
- cor baseada no valor.

### Faixas sugeridas

```txt
0–39    baixa
40–69   moderada
70–84   boa
85–100  excelente
```

Usar somente se a regra já puder ser aplicada de forma consistente no produto.

---

# 10. Card — Body Battery

Dados atuais:

```txt
55–100
```

Não mostrar somente a faixa.

Mostrar visualmente:

```txt
Body Battery

100
máximo do dia

55
mínimo

[ mini gráfico de energia ]
```

Idealmente usar uma linha ou área.

Exibir uma pequena legenda:

```txt
Energia disponível ao longo do dia
```

---

# 11. Card — Frequência cardíaca

Dados atuais:

```txt
51 bpm em repouso
```

Apresentação:

```txt
♥ Frequência cardíaca

51 bpm
em repouso

[ sparkline ]
```

Se houver histórico:

```txt
↓ 3 bpm comparado à média
```

Somente mostrar comparação quando existir dado real.

Nunca inventar tendência.

---

# 12. Card — Sono

Hoje não existe score disponível.

Não mostrar:

```txt
—
```

Mostrar:

```txt
Sono

Sem dados de sono

Use seu dispositivo durante a noite
para acompanhar recuperação e qualidade do sono.
```

Visual:

- ícone de lua;
- tom azul;
- estado vazio elegante.

---

# 13. Card — HRV

Dados atuais:

```txt
BALANCED
```

Mostrar:

```txt
HRV

Equilibrado

Sua variabilidade está dentro
do intervalo esperado.
```

Se não existir valor numérico, não inventar.

O status pode ter badge violeta.

---

# 14. Card — Movimento

Agrupar:

```txt
1.339 passos
1,1 km
13 kcal
```

Transformar em um card único:

```txt
Movimento hoje

1.339
passos

1,1 km       13 kcal
distância    ativas

[ progress / mini barras ]
```

---

# 15. Insight principal

Criar um card de insight automático.

Ele deve interpretar dados disponíveis sem inventar informações.

Exemplo com os dados atuais:

```txt
Destaque

Sua semana de maior volume foi 16/08,
com 3 atividades e aproximadamente 1h40 de treino.
```

Outro exemplo:

```txt
Recuperação

Sua prontidão está moderada hoje.
Considere ajustar a intensidade do treino conforme sua sensação.
```

Evitar linguagem médica.

Não fazer diagnóstico.

---

# 16. Resumo do período

Dados atuais:

```txt
8 atividades
4h 17min
7,7 km
1 modalidade
8 dias ativos
```

Evitar cinco caixas iguais.

Criar hierarquia:

```txt
Resumo dos últimos 30 dias

8
atividades

4h 17min        7,7 km
tempo total     distância

8
dias ativos
```

A modalidade predominante pode aparecer como badge:

```txt
Natação
```

---

# 17. Evolução

Dados atuais:

```txt
26/07 — 2 atividades — 1h08 — 2,1 km
02/08 — 1 atividade  — 32min — 1,0 km
09/08 — 2 atividades — 56min — 1,1 km
16/08 — 3 atividades — 1h40 — 3,5 km
23/08 — 0 atividades
```

## Novo componente

Criar gráfico principal com tabs:

```txt
[ Atividades ] [ Duração ] [ Distância ]
```

### Atividades

Bar chart.

### Duração

Bar chart ou area chart.

### Distância

Area chart ou bar chart.

### Tooltip

Ao passar o mouse:

```txt
Semana de 16/08
3 atividades
1h 40min
3,5 km
```

### Destaque

A semana de 16/08 deve aparecer visualmente como pico do período.

---

# 18. Atividade recente

Dados atuais:

```txt
Natação em piscina
21/08/2026
2,0 km
52min 10s
542 kcal
133 bpm média
157 bpm máxima
```

Também existem:

```txt
Training Effect aeróbico: 3.2
Training Effect anaeróbico: 2.4
Carga de treino: 116.9
SWOLF médio: 42
```

## Novo card

Criar um card grande:

```txt
Atividade recente

🏊 Natação em piscina

2,0 km
52:10
542 kcal

FC média       FC máxima
133 bpm        157 bpm

Efeito do treino
Aeróbico       3.2
Anaeróbico     2.4

SWOLF          42
```

Usar identidade azul/ciano.

---

# 19. Dados técnicos

Remover JSON bruto visível.

Hoje o JSON não deve competir com a interface do cliente.

Substituir por:

```txt
Dados técnicos
└── Ver detalhes
```

Ao abrir:

```txt
Frequência cardíaca
Natação
Training Effect
Zonas
Garmin
Metadados
```

Usar accordion.

Se for necessário manter JSON:

```txt
[ Copiar JSON ]
```

Ele deve ficar no último nível de detalhe.

---

# 20. Motion

Utilizar:

```ts
motion/react
```

Não adicionar Framer Motion legado caso o projeto já utilize `motion/react`.

---

# 21. Motion — entrada

Os cards devem entrar em sequência.

```ts
const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06
    }
  }
}

const item = {
  hidden: {
    opacity: 0,
    y: 14
  },
  show: {
    opacity: 1,
    y: 0
  }
}
```

Duração sugerida:

```txt
0.35–0.5s
```

---

# 22. Motion — cards

Desktop:

```txt
hover:
translateY(-3px)
scale(1.01)
```

Clique:

```txt
scale(0.985)
```

Não usar zoom excessivo.

Não usar bounce.

---

# 23. Motion — gráficos

Animar:

- barras crescendo;
- linhas sendo desenhadas;
- área aparecendo;
- progress ring preenchendo;
- tooltips com fade + scale leve.

Quando o período mudar:

```txt
crossfade
```

Não recarregar visualmente toda a página.

---

# 24. Motion — números

Métricas principais podem usar animação curta de valor.

Exemplo:

```txt
0 → 60
```

Duração:

```txt
400–700ms
```

Usar somente em:

- prontidão;
- atividades;
- distância;
- duração;
- passos.

Evitar animar todos os números da tela.

---

# 25. Reduced motion

Obrigatório:

```ts
import { useReducedMotion } from "motion/react"
```

Se ativado:

- remover translate;
- remover scale;
- remover stagger;
- manter fade mínimo ou atualização instantânea.

---

# 26. Componente base

```tsx
import { motion, useReducedMotion } from "motion/react";

type MetricCardProps = {
  children: React.ReactNode;
  className?: string;
};

export function MetricCard({
  children,
  className = "",
}: MetricCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={
        reduceMotion
          ? undefined
          : {
              y: -3,
              scale: 1.01,
            }
      }
      whileTap={
        reduceMotion
          ? undefined
          : {
              scale: 0.985,
            }
      }
      transition={{
        duration: 0.42,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`
        rounded-[24px]
        border
        border-white/10
        p-5
        shadow-sm
        transition-shadow
        ${className}
      `}
    >
      {children}
    </motion.article>
  );
}
```

---

# 27. Componentes recomendados

```txt
DashboardPage
│
├── DashboardOverview
│
├── DailyHealthGrid
│   ├── ReadinessCard
│   ├── BodyBatteryCard
│   ├── HeartRateCard
│   ├── SleepCard
│   ├── HrvCard
│   └── MovementCard
│
├── DailyInsightCard
│
├── PeriodSummaryCard
│
├── EvolutionChart
│
├── RecentActivityCard
│
└── TechnicalDetails
```

Componentes reutilizáveis:

```txt
MetricCard
MetricHeader
MetricIcon
MetricValue
MetricTrend
StatusBadge
ProgressRing
Sparkline
MiniChart
AnimatedNumber
EmptyState
SectionTitle
```

---

# 28. Estados do sistema

## Loading

Usar skeletons.

O skeleton deve ter a mesma geometria dos cards finais.

Não usar spinner central como padrão.

---

## Sem dados

Nunca mostrar apenas:

```txt
—
```

Usar:

```txt
Sem dados disponíveis
```

e, quando fizer sentido:

```txt
Sincronize novamente para atualizar esta métrica.
```

---

## Erro

Mostrar dentro do próprio card:

```txt
Não foi possível carregar esta informação.

[Tentar novamente]
```

---

## Atualização

Mostrar timestamps apenas como informação secundária.

Exemplo:

```txt
Atualizado às 18:41
```

Não transformar timestamp em métrica principal.

---

# 29. Garmin e WhatsApp

Os cards de integração não precisam ocupar posição de destaque no dashboard principal.

Mover para uma pequena área de status ou manter em Integrações.

Exemplo compacto:

```txt
Garmin       ● Conectado
WhatsApp     ● Pendente
```

Evitar cards grandes somente para dizer:

```txt
Conectado
Pendente
```

---

# 30. Texto técnico

Remover da experiência principal:

```txt
SYNCED_36
BALANCED
MODERATE
```

Traduzir status sempre que possível:

```txt
BALANCED → Equilibrado
MODERATE → Moderada
```

Status técnicos podem permanecer internamente, mas não devem ser o texto principal para o cliente.

---

# 31. Responsividade

## Desktop

```txt
sidebar atual
+
conteúdo em grid
```

Cards principais:

```txt
2–4 colunas
```

Alguns cards podem ocupar duas colunas.

---

## Tablet

```txt
2 colunas
```

---

## Mobile

```txt
1 coluna
```

ou:

```txt
2 colunas para métricas muito compactas
```

Obrigatório:

- números legíveis;
- gráficos responsivos;
- targets de toque ≥ 44px;
- nenhum scroll horizontal;
- dock atual intacto.

---

# 32. Hierarquia de tipografia

## Número principal

```txt
32–44px
font-semibold
tracking-tight
```

## Nome da métrica

```txt
13–15px
font-medium
```

## Informação secundária

```txt
12–14px
opacity reduzida
```

## Título da seção

```txt
20–24px
font-semibold
```

Evitar fonte muito pequena.

---

# 33. Ícones

Preferir ícones simples e reconhecíveis.

Exemplo:

```txt
Activity
Heart
Moon
Battery
Waves
Footprints
Flame
Timer
Gauge
```

Usar a biblioteca de ícones já existente no projeto.

Não misturar diferentes estilos de iconografia.

---

# 34. Implementação progressiva

Realizar a mudança nesta ordem:

### Etapa 1

Criar:

```txt
MetricCard
MetricHeader
MetricValue
StatusBadge
```

### Etapa 2

Refazer:

```txt
Garmin hoje
```

### Etapa 3

Refazer:

```txt
Resumo do período
```

### Etapa 4

Refazer:

```txt
Evolução
```

### Etapa 5

Refazer:

```txt
Atividade recente
```

### Etapa 6

Criar:

```txt
TechnicalDetails
```

### Etapa 7

Adicionar Motion.

### Etapa 8

Polir responsividade.

---

# 35. Antes e depois esperado

## Antes

```txt
[ card ][ card ][ card ][ card ]

[ card ][ card ][ card ][ card ]

[ barra ]
[ barra ]
[ barra ]
```

Todos possuem aparência semelhante.

---

## Depois

```txt
┌──────────────────────────────────────────┐
│ Olá, Samuel             Últimos 30 dias │
│ Seu desempenho e recuperação             │
└──────────────────────────────────────────┘

┌─────────────────────┐ ┌─────────────────┐
│ Prontidão       ◯60 │ │ Body Battery    │
│ Moderada            │ │ 55 ─────── 100 │
└─────────────────────┘ └─────────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ♥ FC         │ │ ☾ Sono       │ │ HRV          │
│ 51 bpm       │ │ Sem dados    │ │ Equilibrado  │
│ ▁▂▂▃▂▁       │ │              │ │ ▁▂▃▃▂        │
└──────────────┘ └──────────────┘ └──────────────┘

┌──────────────────────────────────────────┐
│ Evolução                                 │
│ Atividades | Duração | Distância         │
│                                            │
│      ▇                                     │
│ ▅    ▇       ▅        █                   │
│ Jul  Ago     Ago      Ago                 │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ 🏊 Atividade recente                     │
│ Natação em piscina                       │
│                                          │
│ 2,0 km       52:10       542 kcal        │
│                                          │
│ FC 133       Máx 157      SWOLF 42       │
└──────────────────────────────────────────┘
```

---

# 36. Critérios de aceite

## Estrutura

- [ ] sidebar não foi alterada;
- [ ] header não foi alterado;
- [ ] mobile dock não foi alterado;
- [ ] AppShell não foi redesenhado.

## Visual

- [ ] existe hierarquia clara;
- [ ] os cards não possuem todos o mesmo peso;
- [ ] há cores semânticas;
- [ ] os números importantes dominam visualmente;
- [ ] dados técnicos possuem baixa prioridade;
- [ ] a interface parece um produto premium para cliente final.

## Dados

- [ ] nenhum dado foi inventado;
- [ ] status técnicos foram traduzidos quando exibidos;
- [ ] JSON bruto não aparece aberto por padrão;
- [ ] estados vazios possuem mensagens legíveis;
- [ ] timestamps são secundários.

## Gráficos

- [ ] evolução possui gráfico;
- [ ] métricas relevantes possuem mini visualizações;
- [ ] tooltips são legíveis;
- [ ] gráficos funcionam em mobile.

## Motion

- [ ] `motion/react` é utilizado;
- [ ] cards possuem entrada em stagger;
- [ ] hover é discreto;
- [ ] gráficos possuem animação;
- [ ] mudança de período usa transição;
- [ ] `prefers-reduced-motion` é respeitado.

## Responsividade

- [ ] desktop funciona;
- [ ] tablet funciona;
- [ ] mobile funciona;
- [ ] não existe scroll horizontal;
- [ ] gráficos são responsivos.

---

# 37. Resultado final esperado

O usuário deve abrir o dashboard e perceber imediatamente:

```txt
Como estou hoje?
Como foi meu período?
Estou evoluindo?
Qual foi meu último treino?
```

A página deve responder essas quatro perguntas visualmente antes de apresentar detalhes técnicos.

O objetivo não é simplesmente "colocar mais cores".

O objetivo é transformar **dados esportivos em informação compreensível, visual e agradável de acompanhar todos os dias**.
