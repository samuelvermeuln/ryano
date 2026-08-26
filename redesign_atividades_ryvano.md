# Redesign — Tela de Atividades | RYVANO

## Objetivo

Redesenhar **somente o conteúdo central da tela `/app/atividades`**, transformando o histórico atual em uma experiência esportiva mais visual, informativa e premium.

> **Não alterar sidebar, header, navegação global ou dock mobile existentes.**

A nova tela deve permitir que o atleta entenda rapidamente:

1. Quanto treinou no período selecionado.
2. Quais modalidades praticou.
3. Como foi cada atividade sem precisar abrir todos os detalhes.
4. Quais treinos tiveram destaque, recorde ou comportamento fora do padrão.
5. Como encontrar rapidamente um treino específico.
6. Qual atividade merece ser analisada em seguida.

---

# 1. Diagnóstico da tela atual

## 1.1 A tela parece uma listagem administrativa

Atualmente o conteúdo principal é composto por:

- título `Histórico de atividades`;
- três selects;
- botão `Filtrar`;
- sequência de cards praticamente idênticos;
- paginação no final.

Visualmente, todos os treinos recebem o mesmo peso e quase não existe hierarquia.

### Problema

O usuário precisa ler cada linha para encontrar diferenças importantes.

A tela deveria se comportar como um **histórico esportivo**, não como uma tabela de registros.

### Corrigir

Criar três níveis de leitura:

- **Nível 1 — Resumo do período:** volume total e frequência.
- **Nível 2 — Filtros e organização:** modalidade, período, origem, pesquisa e ordenação.
- **Nível 3 — Atividades:** cards visuais com métricas realmente úteis.

---

## 1.2 Falta contexto do período selecionado

Selecionar `30` dias hoje apenas muda a lista.

O atleta não recebe uma resposta visual para perguntas como:

- Quantos treinos fiz?
- Quantos quilômetros acumulei?
- Quanto tempo treinei?
- Quantos dias treinei?
- Minha frequência aumentou ou diminuiu?

### Corrigir

Adicionar uma faixa de resumo imediatamente acima da lista.

Sugestão de KPIs:

- **Atividades** — quantidade de treinos.
- **Distância total** — km acumulados.
- **Tempo de treino** — horas/minutos acumulados.
- **Dias ativos** — número de dias com atividade.

Opcionalmente, quando houver comparação disponível:

- `+12% vs. período anterior`
- `2 treinos a mais`
- `+3,4 km`

Nunca inventar comparação quando não houver dados suficientes.

---

## 1.3 Os filtros não são amigáveis

Hoje o filtro de período mostra valores isolados:

```text
7
30
90
365
```

### Substituir por

```text
Últimos 7 dias
Últimos 30 dias
Últimos 90 dias
Último ano
```

### Melhor ainda

No desktop, usar **segmented control/chips** para os períodos mais usados:

```text
[ 7 dias ] [ 30 dias ] [ 90 dias ] [ 1 ano ]
```

`30 dias` pode continuar como padrão.

Não exigir clique em `Filtrar` para alterações simples. Quando possível, aplicar os filtros automaticamente.

---

## 1.4 Informações repetidas dentro do card

Exemplo atual:

```text
Natação em piscina
GARMIN

Duração: 40min 55s
Distância: 1,7 km
FC média: 129
Modalidade: Natação em piscina
```

A modalidade já está representada no título e não precisa aparecer novamente como métrica.

### Corrigir

Remover `Modalidade:` da grade de métricas e usar esse espaço para uma informação mais relevante.

Para natação, priorizar quando disponível:

- ritmo médio / 100 m;
- FC média;
- calorias;
- SWOLF;
- cadência de braçadas;
- carga do treino.

Para corrida:

- pace médio;
- FC média;
- ganho de elevação;
- calorias.

Para ciclismo:

- velocidade média;
- FC média;
- elevação;
- potência, quando disponível.

A quarta métrica deve ser **contextual à modalidade**, não fixa para todos os esportes.

---

## 1.5 Origem `GARMIN` recebe destaque demais

Se praticamente todas as atividades vierem da Garmin, repetir `GARMIN` como badge principal em todos os cards gera ruído visual.

### Corrigir

Mostrar a origem como metadado secundário:

```text
Garmin · sincronizado automaticamente
```

ou usar apenas um pequeno ícone/logo Garmin próximo da data.

Se futuramente existirem várias origens, o badge pode ganhar relevância novamente.

---

## 1.6 Problema de normalização dos nomes

Existem títulos exibidos com capitalização inconsistente, por exemplo:

```text
NataÇãO Em Piscina
Serra NataÇãO Em Alto Mar
```

### Corrigir

Normalizar nomes para apresentação sem destruir nomes personalizados do usuário.

Exemplos:

```text
Natação em piscina
Serra — Natação em águas abertas
```

### Regra sugerida

- nomes padrão Garmin devem passar por mapa de tradução/apresentação;
- nomes customizados devem preservar o conteúdo inserido pelo atleta;
- nunca aplicar `uppercase/lowercase` globalmente a nomes personalizados.

---

## 1.7 Falta identidade visual por esporte

Hoje todos os cards usam praticamente o mesmo fundo e borda.

### Corrigir

Criar uma identidade visual discreta por modalidade.

Sugestão:

| Modalidade | Cor de destaque |
|---|---|
| Natação | cyan / azul |
| Corrida | laranja / coral |
| Ciclismo | verde / lime |
| Triathlon | violeta |
| Caminhada | teal |
| Força | âmbar |
| Outros | neutro |

A cor deve aparecer em detalhes, não transformar todo o card em uma superfície saturada.

Usar em:

- ícone;
- pequeno glow;
- indicador lateral;
- badge;
- mini gráfico;
- hover.

---

## 1.8 A lista não destaca treinos importantes

O payload já pode possuir informações como PR/recorde, frequência cardíaca máxima, calorias, Training Effect, carga, SWOLF e outras métricas dependendo da modalidade.

Essas informações não precisam ficar escondidas até a tela de detalhe quando forem relevantes.

### Corrigir

Criar badges contextuais como:

```text
🏆 Recorde pessoal
↗ Melhor ritmo
🔥 Maior distância do mês
⚡ Treino intenso
✓ Base aeróbica
```

Os destaques devem ser baseados em dados reais.

Não criar badges apenas para decoração.

---

## 1.9 Dados suspeitos precisam de tratamento visual

Uma atividade de águas abertas pode, por exemplo, apresentar distância incompatível com a duração esperada.

Em vez de exibir o número como se fosse normal, quando houver uma regra de qualidade de dados confiável, mostrar um estado de atenção:

```text
⚠ Dados de distância parecem incompletos
```

A ação pode ser:

`Ver atividade`

Não corrigir números automaticamente sem uma fonte confiável.

---

## 1.10 Paginação sem utilidade visual

Quando existir apenas uma página, mostrar:

```text
Página 1 de 1
```

não ajuda o usuário.

### Corrigir

- esconder completamente a paginação quando existir apenas uma página;
- com múltiplas páginas, usar botões claros de anterior/próxima;
- preferencialmente considerar `Carregar mais` ou paginação progressiva para histórico esportivo.

---

# 2. Nova arquitetura da tela

Estrutura recomendada:

```text
CONTEÚDO CENTRAL
│
├── Introdução da página
│   ├── eyebrow
│   ├── título
│   └── descrição
│
├── Resumo do período
│   ├── atividades
│   ├── distância
│   ├── duração
│   └── dias ativos
│
├── Barra de filtros
│   ├── período
│   ├── modalidade
│   ├── origem
│   ├── busca
│   └── ordenação
│
├── Chips de filtros ativos
│
├── Lista de atividades
│   ├── Hoje / Esta semana / Mais antigas
│   └── cards de treino
│
└── Paginação / carregar mais
```

---

# 3. Cabeçalho interno da página

> Não confundir com o header global da aplicação, que deve permanecer intacto.

## Eyebrow

`SEU HISTÓRICO`

## Título

# Atividades

## Descrição

> Reveja seus treinos, acompanhe seu volume e encontre rapidamente cada atividade sincronizada.

À direita, no desktop, pode existir:

`8 atividades nos últimos 30 dias`

O número deve respeitar o filtro ativo.

---

# 4. Resumo do período

Criar 4 cards compactos logo abaixo do cabeçalho interno.

## Card 1 — Atividades

Ícone sugerido: `Activity`

**Valor grande:**

`8`

**Label:**

`Atividades`

**Complemento:**

`nos últimos 30 dias`

---

## Card 2 — Distância total

Ícone: `Route`

Exemplo:

`8,3 km`

Label:

`Distância total`

Para múltiplas modalidades incompatíveis, tomar cuidado com a interpretação. A soma pode existir, mas o usuário deve conseguir filtrar por esporte.

---

## Card 3 — Tempo de treino

Ícone: `Clock`

Exemplo:

`4h 21min`

Label:

`Tempo em atividade`

---

## Card 4 — Dias ativos

Ícone: `CalendarCheck`

Exemplo:

`8 dias`

Label:

`Dias com treino`

Se houver comparação confiável:

`+2 vs. período anterior`

---

# 5. Visual dos cards de resumo

Não usar quatro caixas idênticas e sem personalidade.

Cada card deve ter:

- ícone dentro de pill/square 40–44 px;
- valor com `text-2xl` ou `text-3xl`;
- label pequeno;
- informação comparativa discreta;
- leve gradient/glow relacionado à identidade RYVANO.

### Motion

Na entrada da página:

```tsx
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.35 }}
```

Aplicar stagger curto entre os cards.

Evitar animações chamativas.

---

# 6. Nova barra de filtros

A barra deve parecer uma ferramenta de exploração, não um formulário tradicional.

## Desktop

Estrutura sugerida:

```text
[ 7 dias | 30 dias | 90 dias | 1 ano ]

[ Modalidade ▾ ] [ Origem ▾ ] [ 🔎 Buscar atividade... ] [ Mais recente ▾ ]
```

Pode ser organizada em uma ou duas linhas conforme largura.

---

## 6.1 Período

Preferir segmented control.

Estado ativo deve possuir:

- fundo mais claro;
- border sutil;
- texto em foreground forte;
- indicador animado usando `layoutId` do Motion.

Exemplo:

```tsx
<motion.div layoutId="activity-period-active" />
```

---

## 6.2 Modalidade

Opções devem incluir somente modalidades existentes ou suportadas:

```text
Todas as modalidades
Natação em piscina
Águas abertas
Corrida
Ciclismo
Triathlon
...
```

Adicionar ícone de modalidade quando possível.

---

## 6.3 Origem

```text
Todas as origens
Garmin
Apple Health
Polar
COROS
...
```

Mostrar apenas integrações aplicáveis ao produto.

---

## 6.4 Pesquisa

Adicionar pesquisa por nome da atividade.

Placeholder:

`Buscar atividade...`

Pesquisar por:

- nome;
- modalidade;
- eventualmente local, quando disponível.

Aplicar debounce.

---

## 6.5 Ordenação

Adicionar:

```text
Mais recentes
Mais antigas
Maior distância
Maior duração
```

Outras opções somente se fizerem sentido com o esporte selecionado.

---

# 7. Filtros ativos

Quando o usuário filtrar, mostrar chips removíveis logo abaixo da barra.

Exemplo:

```text
Natação ×    Garmin ×    Últimos 90 dias ×

Limpar filtros
```

Não mostrar a seção se não houver filtros extras ativos.

---

# 8. Organização temporal da lista

Em vez de uma sequência longa sem referência, agrupar atividades.

Sugestão:

```text
HOJE
  atividade

ESTA SEMANA
  atividade
  atividade

ANTERIORES
  atividade
  atividade
```

Ou por mês quando o período for longo:

```text
AGOSTO 2026
JULHO 2026
```

### Regra

- até 30 dias: grupos relativos ou semanais;
- 90 dias ou mais: agrupar por mês.

---

# 9. Novo card de atividade

O card deve ser a peça principal da tela.

## Estrutura desktop

```text
┌─────────────────────────────────────────────────────────────────────┐
│ [ícone]  Natação em piscina          🏆 Recorde pessoal      ›      │
│          25 ago · 07:05 · Garmin                                  │
│                                                                     │
│          1,65 km        40:55        2:29/100m        129 bpm       │
│          DISTÂNCIA      DURAÇÃO      RITMO MÉDIO       FC MÉDIA     │
│                                                                     │
│          Base aeróbica · 432 kcal                        Ver análise │
└─────────────────────────────────────────────────────────────────────┘
```

Os valores acima são apenas exemplo de composição; usar os dados reais da atividade.

---

# 10. Hierarquia do card

## Área esquerda

### Ícone/modalidade

Container 48–52 px.

Natação:

- ícone `Waves`;
- cyan/azul.

Corrida:

- `PersonStanding` / `Footprints`;
- coral/laranja.

Ciclismo:

- `Bike`;
- lime/verde.

---

## Título

Título com peso maior que hoje:

```text
text-base / font-semibold
```

Nome normalizado.

---

## Metadata

Uma linha discreta:

```text
26 ago · 06:20 · Garmin
```

Evitar data no formato excessivamente burocrático quando não necessário.

Usar tooltip ou detalhe completo se necessário.

---

# 11. Métricas do card

Mostrar no máximo **4 métricas principais** no desktop e **2–4 no mobile**.

## Natação

Prioridade:

1. Distância
2. Duração
3. Ritmo / 100 m
4. FC média

Complementares:

- SWOLF;
- braçadas/min;
- calorias;
- Training Effect.

## Corrida

1. Distância
2. Duração
3. Pace
4. FC média

Complementares:

- elevação;
- calorias;
- Training Effect.

## Ciclismo

1. Distância
2. Duração
3. Velocidade média
4. FC média ou potência

---

# 12. Destaques inteligentes

Adicionar badges somente quando houver um motivo real.

## Recorde pessoal

```text
🏆 PR
```

ou

```text
🏆 Recorde pessoal
```

Cor: âmbar/ouro discreto.

---

## Melhor desempenho do período

Exemplos:

```text
↗ Maior distância
↗ Melhor ritmo
```

---

## Treino intenso

Somente baseado em uma métrica real de intensidade/carga:

```text
⚡ Alta intensidade
```

---

## Atenção com dados

```text
⚠ Dados incompletos
```

Cor: âmbar.

Nunca usar vermelho para algo que não seja realmente erro/problema.

---

# 13. CTA do card

Hoje o card inteiro é clicável, mas falta affordance visual.

Adicionar no desktop:

```text
Ver análise  →
```

No hover:

- seta desloca 3–4 px;
- borda ganha contraste;
- glow da modalidade aumenta discretamente;
- card sobe `-2px`.

### Motion

```tsx
whileHover={{ y: -2 }}
transition={{ duration: 0.18 }}
```

Não alterar layout de forma brusca.

---

# 14. Mini visualização opcional

Quando dados estiverem disponíveis, considerar uma pequena sparkline no card.

Exemplos:

- FC ao longo do treino;
- ritmo por trecho;
- velocidade.

A sparkline deve ser complementar e não ocupar mais espaço que as métricas principais.

Não adicionar se a API não fornecer série temporal eficiente para a listagem.

---

# 15. Card expandido opcional

No desktop pode existir um modo de preview rápido antes de abrir a página da atividade.

Ao clicar em uma área `Mais detalhes`, usar `AnimatePresence` para revelar:

- calorias;
- FC máxima;
- Training Effect;
- carga;
- SWOLF/cadência quando aplicável;
- observação de qualidade de dados.

### Recomendação

Não expandir automaticamente ao clicar no card inteiro, porque o comportamento atual é navegação para o detalhe.

Manter navegação previsível.

---

# 16. Empty state

Quando filtros não retornarem nenhuma atividade, não mostrar apenas uma área vazia.

## Visual

Ícone grande relacionado a atividade/filtragem.

## Título

`Nenhuma atividade encontrada`

## Texto

> Não encontramos treinos com esses filtros. Tente ampliar o período ou remover algum filtro.

## Ação

`Limpar filtros`

---

# 17. Estado sem atividades na conta

É diferente de um filtro vazio.

## Título

`Seu histórico começa no próximo treino`

## Texto

> Conecte um dispositivo compatível e suas atividades aparecerão automaticamente aqui.

## CTA

`Gerenciar integrações`

---

# 18. Loading state

Ao mudar filtros ou carregar outra página, não bloquear a tela inteira.

Usar skeletons na área da lista.

### Skeleton do card

- ícone circular/square;
- linha de título;
- linha de metadata;
- quatro blocos pequenos de métrica.

Manter o resumo e a barra de filtros visíveis sempre que possível.

---

# 19. Motion e microinterações

Usar `motion/react` / Framer Motion já compatível com o projeto.

## Entrada da lista

```tsx
initial={{ opacity: 0, y: 8 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: -4 }}
```

Stagger:

```text
40–60 ms por card
```

Limitar o stagger para listas grandes.

---

## Mudança de filtro

Usar `AnimatePresence mode="popLayout"` ou solução equivalente para transição suave dos resultados.

Não animar centenas de elementos simultaneamente.

---

## Hover

Card:

```text
translateY(-2px)
border opacity +
glow muito leve
```

CTA/seta:

```text
translateX(3px)
```

---

## Badges

Quando um badge de PR/alerta aparecer após atualização:

```tsx
initial={{ opacity: 0, scale: 0.94 }}
animate={{ opacity: 1, scale: 1 }}
```

---

# 20. Paleta e superfícies

Manter a linguagem glass/aurora existente da RYVANO, mas melhorar contraste.

## Fundo dos cards

Base:

```text
bg-white/[0.045]
border-white/10
```

Hover:

```text
bg-white/[0.075]
border-white/16
```

---

## Natação

Destaque sugerido:

```text
cyan-400 / sky-400
```

Glow muito leve.

---

## Corrida

```text
orange-400 / coral
```

---

## Ciclismo

```text
lime-400 / emerald-400
```

---

## Triathlon

```text
violet-400
```

---

# 21. Tipografia e números

As métricas são parte central do produto.

Dar mais contraste aos valores e menos aos labels.

Exemplo:

```text
1,65 km
DISTÂNCIA
```

Valor:

```text
text-base sm:text-lg
font-semibold
tabular-nums
```

Label:

```text
text-[10px] ou text-xs
uppercase
tracking-wide
text-foreground/45
```

Usar `tabular-nums` para duração, distância, frequência cardíaca e pace.

---

# 22. Responsividade

## Desktop — >= 1024px

- 4 cards de resumo em linha;
- filtros em linha ou duas linhas compactas;
- atividade horizontal;
- 4 métricas visíveis;
- CTA `Ver análise` visível.

---

## Tablet

- resumo em grid 2x2;
- filtros 2 colunas;
- card pode quebrar métricas para 2x2.

---

## Mobile

A experiência deve ser redesenhada, não apenas comprimida.

### Topo

Resumo pode ser:

- carrossel horizontal de KPIs;
- ou grid 2x2.

Preferir grid 2x2 se couber sem prejudicar legibilidade.

### Filtros

Linha principal:

```text
[ 30 dias ▾ ] [ Filtros ] [ Ordenar ]
```

O botão `Filtros` abre bottom sheet com:

- modalidade;
- origem;
- demais opções.

### Card mobile

```text
┌────────────────────────────┐
│ 🌊 Natação em piscina   › │
│ 25 ago · 07:05 · Garmin   │
│                            │
│ 1,65 km      40:55         │
│ Distância    Duração       │
│                            │
│ 2:29/100m    129 bpm       │
│ Ritmo        FC média      │
│                            │
│ 🏆 Recorde pessoal         │
└────────────────────────────┘
```

Touch target mínimo: 44 px.

Respeitar o dock inferior já existente.

---

# 23. Informações que não devem aparecer na lista

Mesmo que existam no payload, não expor dados técnicos/internos como:

- IDs internos;
- UUIDs;
- `typeKey`;
- roles/scopes Garmin;
- device IDs;
- objetos de privacidade;
- flags de backend;
- chaves de enum não traduzidas.

Esses dados pertencem a logs e debugging.

---

# 24. Tradução de enums

Nunca mostrar para o usuário valores como:

```text
lap_swimming
AEROBIC_BASE
BALANCED
CONNECTED
```

Criar uma camada de presentation mapping.

Exemplos:

```ts
lap_swimming -> Natação em piscina
open_water_swimming -> Natação em águas abertas
AEROBIC_BASE -> Base aeróbica
```

Essa lógica deve ficar centralizada para evitar capitalização e tradução inconsistentes.

---

# 25. Dados derivados úteis

Quando possível, calcular na camada de apresentação:

## Ritmo de natação

```text
duração ativa / distância × 100 m
```

Formato:

```text
2:05 /100m
```

Usar a métrica oficial fornecida pela origem quando houver diferença conceitual importante.

---

## Pace de corrida

```text
min/km
```

---

## Velocidade de ciclismo

```text
km/h
```

---

# 26. Destaque do treino mais recente

Opcionalmente, o primeiro treino pode possuir um tratamento sutil de `Última atividade`.

Não criar um hero gigante porque o objetivo da tela continua sendo histórico e comparação.

Badge discreto:

`Mais recente`

ou apenas manter a ordem cronológica clara.

---

# 27. Ações rápidas futuras

Preparar a arquitetura para ações futuras, sem obrigatoriamente implementá-las agora:

- Favoritar treino;
- adicionar observação;
- compartilhar relatório;
- enviar análise para WhatsApp;
- comparar com treino anterior.

Essas ações devem ficar em menu `•••` e não poluir o card principal.

---

# 28. Sugestão de componentes React

```text
ActivitiesPage
│
├── ActivitiesIntro
├── ActivityPeriodSummary
│   └── MetricCard × 4
│
├── ActivityFilters
│   ├── PeriodSegmentedControl
│   ├── SportFilter
│   ├── ProviderFilter
│   ├── ActivitySearch
│   └── ActivitySort
│
├── ActiveFilterChips
│
├── ActivityTimeline
│   └── ActivityGroup
│       └── ActivityCard
│           ├── SportIcon
│           ├── ActivityMeta
│           ├── ActivityMetrics
│           ├── ActivityBadges
│           └── ActivityCTA
│
└── ActivityPagination
```

---

# 29. Sugestão de modelo de apresentação

Evitar entregar o objeto Garmin bruto diretamente ao componente.

Criar um view model.

```ts
type ActivityListItem = {
  id: string
  name: string
  sportType: string
  sportLabel: string
  startedAt: Date
  providerLabel: string
  durationLabel: string
  distanceLabel?: string
  primaryMetric?: {
    label: string
    value: string
  }
  secondaryMetric?: {
    label: string
    value: string
  }
  badges: Array<{
    type: 'pr' | 'performance' | 'warning' | 'training-effect'
    label: string
  }>
}
```

Benefícios:

- reduz lógica dentro do JSX;
- facilita testes;
- normaliza nomes;
- centraliza unidades;
- evita enums técnicos na UI;
- facilita suportar novas integrações.

---

# 30. Exemplo visual completo

```text
SEU HISTÓRICO

Atividades                                      8 atividades nos últimos 30 dias
Reveja seus treinos, acompanhe seu volume e encontre rapidamente cada atividade.

┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ 8              │ │ 8,3 km         │ │ 4h 21min       │ │ 8 dias         │
│ Atividades     │ │ Distância      │ │ Tempo treino   │ │ Dias ativos    │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘

[ 7 dias ] [ 30 dias ] [ 90 dias ] [ 1 ano ]

[ Todas modalidades ▾ ] [ Garmin ▾ ] [ 🔎 Buscar atividade... ] [ Mais recentes ▾ ]

HOJE

┌─────────────────────────────────────────────────────────────────────────┐
│ 🌊  Serra — Natação em águas abertas                              ›     │
│     26 ago · 06:20 · Garmin                                             │
│                                                                         │
│     1,2 km           38:05           — /100m          95 bpm            │
│     DISTÂNCIA        DURAÇÃO          RITMO             FC MÉDIA         │
│                                                                         │
│     ⚠ Verificar dados                                      Ver análise → │
└─────────────────────────────────────────────────────────────────────────┘

ESTA SEMANA

┌─────────────────────────────────────────────────────────────────────────┐
│ 🌊  Natação em piscina               🏆 Recorde pessoal           ›     │
│     25 ago · 07:05 · Garmin                                             │
│                                                                         │
│     1,65 km          40:55           2:29/100m        129 bpm           │
│     DISTÂNCIA        DURAÇÃO          RITMO             FC MÉDIA         │
│                                                                         │
│     Base aeróbica · 432 kcal                              Ver análise → │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 31. Critérios de aceite — UX

- [ ] Sidebar permanece visual e funcionalmente igual.
- [ ] Header global permanece visual e funcionalmente igual.
- [ ] Dock mobile existente não é substituído.
- [ ] Tela deixa de parecer uma lista administrativa.
- [ ] Usuário consegue entender o volume do período antes de ler os cards.
- [ ] Período aparece com labels amigáveis, não apenas números.
- [ ] Modalidade não é repetida desnecessariamente dentro do mesmo card.
- [ ] Origem Garmin possui peso visual secundário.
- [ ] Nomes de modalidades aparecem normalizados.
- [ ] Cards possuem identidade visual por modalidade.
- [ ] Métricas exibidas são adaptadas ao esporte.
- [ ] PRs e destaques aparecem somente com dados reais.
- [ ] Dados suspeitos podem receber aviso sem serem alterados automaticamente.
- [ ] Paginação não aparece quando existir somente uma página.
- [ ] Existe estado vazio para filtros sem resultado.
- [ ] Existe estado vazio para conta sem atividades.
- [ ] Existe estado de loading/skeleton.
- [ ] Mobile possui composição própria e touch targets adequados.

---

# 32. Critérios de aceite — Motion

- [ ] Cards de resumo entram com fade + deslocamento suave.
- [ ] Mudança de período possui indicador animado.
- [ ] Lista anima entrada/saída de resultados sem excesso.
- [ ] Cards possuem hover sutil no desktop.
- [ ] CTA possui microinteração de seta.
- [ ] Badges contextuais podem aparecer com scale/fade suave.
- [ ] Respeitar `prefers-reduced-motion`.

---

# 33. Critérios de aceite — Dados

- [ ] Nenhum enum técnico é mostrado diretamente para o cliente.
- [ ] Unidades são formatadas de maneira consistente.
- [ ] Distâncias menores que 1 km podem usar metros quando melhorar a leitura.
- [ ] FC utiliza `bpm`.
- [ ] Natação usa ritmo `/100m` quando disponível/calculável de forma confiável.
- [ ] Corrida usa `min/km`.
- [ ] Ciclismo usa `km/h` quando apropriado.
- [ ] Valores inexistentes não aparecem como `undefined`, `null`, `NaN` ou `0` artificial.
- [ ] Métrica ausente deve ser omitida ou mostrada como `—` somente quando isso ajuda a preservar o layout.

---

# 34. Prioridade de implementação

## P0 — Obrigatório

1. Novo cabeçalho interno.
2. Cards de resumo do período.
3. Filtros com labels amigáveis.
4. Redesign dos cards de atividade.
5. Remover repetição de modalidade.
6. Normalizar nomes e enums.
7. Cores/ícones por esporte.
8. Responsividade mobile.
9. Estados loading/empty.
10. Motion básico.

## P1 — Alto valor

1. Pesquisa por nome.
2. Ordenação.
3. Chips de filtros ativos.
4. Badges de PR/destaques.
5. Agrupamento temporal.
6. Métricas específicas por modalidade.

## P2 — Evolução

1. Sparklines.
2. Preview expandido.
3. Comparação entre atividades.
4. Ações rápidas.
5. Destaques automáticos mais avançados.

---

# 35. Resultado esperado

A tela de Atividades deve sair de:

> “uma lista de treinos sincronizados”

para:

> **“um histórico esportivo visual onde o atleta entende volume, desempenho e contexto em poucos segundos.”**

O objetivo não é adicionar informação por adicionar.

Cada elemento novo deve responder pelo menos uma destas perguntas:

- **Quanto eu treinei?**
- **Quando eu treinei?**
- **Como foi esse treino?**
- **Foi melhor ou diferente dos outros?**
- **Quero abrir este treino?**

Se um elemento não ajudar em nenhuma delas, ele provavelmente não precisa estar na tela.
