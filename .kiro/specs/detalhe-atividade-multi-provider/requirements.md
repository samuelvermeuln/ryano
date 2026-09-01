# Requirements Document

## Introduction

A página de detalhe de atividade (`app/app/atividades/[id]/page.tsx`) é montada
pela função provider-agnostic `getActivityVisualData` (em
`modules/shared/activities/presentation/get-activity-visual-data.ts`). Hoje,
essa função só enriquece a visão com dados ricos (zonas, splits, seções de
métricas) quando `activity.provider === "GARMIN"`. Qualquer outra origem —
Strava hoje, e qualquer provider futuro (Polar, COROS, Suunto, Fitbit) —
recebe apenas `buildBaseActivityVisualData`, que contém somente os campos
mínimos normalizados (duração, distância, ritmo/velocidade, FC média/máxima,
elevação, cadência, potência), sem zonas de frequência cardíaca
(`barSections` vazio) e sem seção de análise do treino (`metricSections`
vazio). O resultado é uma tela de detalhe visivelmente mais pobre para
atividades não-Garmin (ex.: atividade `cmtgcmtc4000wlwh47vw0qqz6`, de origem
Strava).

Este spec cobre a refatoração da montagem de dados e da exibição visual do
detalhe de atividade para que qualquer provider conectado — respeitando a
arquitetura provider-agnostic já estabelecida em `.kiro/specs/
integracoes-modulares` — possa exibir, quando o dado existir: zonas de
frequência cardíaca, frequência cardíaca, cadência/frequência de braçadas,
ritmo/pace, e uma seção de análise do treino. A decisão central desta spec é
que zonas de frequência cardíaca podem ser obtidas tanto de um endpoint
nativo do provider (caso do Garmin, hoje) quanto calculadas internamente a
partir de uma série temporal de FC (streams), sem que a UI precise saber qual
das duas origens foi usada.

O Garmin deve continuar funcionando exatamente como hoje: este spec não
regride o comportamento observável do enriquecimento Garmin existente
(`modules/garmin/application/activities/garmin-activity-details.ts`).

### Decisão arquitetural confirmada — zonas de FC do Strava calculadas a partir de streams

O Strava expõe um endpoint de zonas de FC do atleta (`/athlete/zones`), mas
esse endpoint exige o scope OAuth `profile:read_all`, que as conexões Strava
já existentes na Ryvano não possuem — usá-lo exigiria pedir reautorização
(nova concessão de scope) a todos os usuários já conectados. O Strava também
expõe um endpoint de zonas por atividade (`/activities/{id}/zones`), mas a
documentação oficial vigente marca esse recurso como exclusivo de contas
Summit (pago), o que o torna indisponível para atletas sem essa assinatura.

Por isso, a decisão confirmada para esta spec é: **as zonas de frequência
cardíaca do Strava são calculadas pela Ryvano a partir da série temporal de FC
do stream da atividade** (`GET /activities/{id}/streams`, tipo `heartrate`),
usando um método de percentual da frequência cardíaca máxima de referência
(ex.: 5 faixas por `%FCmáx`). Essa abordagem evita o endpoint pago e evita
pedir o novo scope OAuth. Em contrapartida, as zonas resultantes são
**aproximadas** — não correspondem necessariamente às zonas exatas
configuradas pelo atleta na conta Strava (que podem usar limites
personalizados, não apenas `%FCmáx`) — e essa ressalva deve ficar visível ao
usuário na UI (nível de requisito; a redação exata do aviso é decisão de
design).

Referências oficiais já consultadas nesta etapa (Strava, `developers.strava.
com/docs/reference/` e `docs/rate-limits/`; conteúdo parafraseado para
conformidade com licenciamento):
- `GET /activities/{id}/streams` retorna séries indexadas por tipo, incluindo
  `heartrate` (bpm por amostra), quando o parâmetro `keys` inclui esse tipo.
- `GET /activities/{id}/laps` retorna as voltas/splits da atividade.
- O endpoint de zonas por atividade é documentado como exclusivo de contas
  Summit; o endpoint de zonas do atleta exige o scope `profile:read_all`.

Esta verificação cobre apenas o que foi confirmado para fins de decisão
arquitetural nesta spec de requisitos. A fase de design/tasks desta feature
DEVE reconfirmar os detalhes exatos de schema, parâmetros e limites antes de
implementar qualquer chamada nova ao client Strava, conforme a regra
"Checklist de docs oficiais" do `AGENTS.md`.

### Regra transversal obrigatória

Antes de implementar ou alterar qualquer endpoint, DTO, scope ou payload de
qualquer provider (Strava, Garmin ou futuro), o desenvolvedor/agente DEVE
consultar a documentação oficial vigente do provider. Este documento orienta
a implementação, mas não substitui a documentação oficial.

---

## Glossary

- **Provider**: provedor esportivo externo conectado pelo usuário (GARMIN,
  STRAVA, e futuramente POLAR, COROS, SUUNTO, FITBIT).
- **Capability**: capacidade declarada por um provider no catálogo
  (`modules/shared/integrations/catalog`), consultada via `hasCapability` em
  vez de comparar o identificador do provider.
- **NormalizedActivity / Activity**: representação canônica de uma atividade,
  provider-agnostic, já persistida no banco (`Activity` do Prisma) com os
  campos normalizados (duração, distância, FC, velocidade, cadência,
  potência, `sportType` canônico).
- **ActivityVisualData**: contrato de apresentação provider-agnostic do
  detalhe de atividade (`heroStats`, `overviewMetrics`, `barSections`,
  `metricSections`), consumido por `ActivityVisualDashboard`.
- **Stream de atividade**: série temporal de uma métrica (ex.: FC, cadência,
  velocidade) amostrada ao longo da atividade, obtida via endpoint de streams
  do provider (quando a capability `streams` existir).
- **Zona de frequência cardíaca**: faixa de intensidade cardíaca (ex.: 5
  zonas por percentual da FC máxima de referência), com o tempo (ou
  proporção do tempo) da atividade passado em cada faixa.
- **Zona de FC nativa**: zona obtida diretamente de um endpoint do provider
  que já retorna zonas prontas (ex.: Garmin `hr-zones`).
- **Zona de FC calculada**: zona derivada internamente pela Ryvano a partir
  de um stream de FC e um método de `%FCmáx`, quando o provider não oferece
  zonas nativas de atividade.
- **Frequência de braçadas (stroke rate)**: cadência de nado, aplicável a
  atividades de natação; conceito análogo à cadência de corrida/ciclismo, mas
  com rótulo e unidade próprios da modalidade aquática.
- **Análise do treino (workout analysis)**: seção do detalhe de atividade que
  combina zonas, splits/voltas e indicadores de esforço em uma leitura
  interpretativa do treino, além das métricas agregadas simples já exibidas
  no resumo.
- **Enriquecimento**: etapa opcional de `getActivityVisualData` que busca
  dados adicionais específicos de um provider (nativos ou calculados) para
  complementar a visão base normalizada.
- **Visão base**: `ActivityVisualData` montada apenas a partir dos campos
  normalizados de `Activity`, sem nenhuma chamada a provider (função
  `buildBaseActivityVisualData`).
- **FC máxima de referência**: valor de frequência cardíaca máxima usado como
  denominador do cálculo de `%FCmáx` para zonas calculadas. Ver Requisito 2
  para as fontes aceitas e a ordem de precedência.
- **Categoria de exibição de métricas**: agrupamento de tipos de esporte
  canônicos (`RyvanoSportType`) que compartilham quais seções e métricas
  fazem sentido exibir no detalhe da atividade — zonas de frequência
  cardíaca, cadência ou frequência de braçadas, ritmo/pace, e o tipo de
  conteúdo da seção de análise do treino. É essa categoria — nunca o
  provider de origem — que decide o que é relevante mostrar. Ver Requisito 12
  para as categorias definidas e o Apêndice para a tabela de mapeamento
  completa.

---

## Requirements

### Requisito 1 — Enriquecimento de detalhe de atividade por capability, não por provider

**User Story:** Como usuário que conectou o Strava (ou qualquer provider
futuro), quero ver o detalhe da minha atividade com o mesmo nível de riqueza
visual que uma atividade Garmin, para não sentir que minha integração é de
segunda classe.

#### Acceptance Criteria

1. QUANDO `getActivityVisualData` montar o detalhe de uma atividade, ENTÃO o
   sistema DEVE decidir se aplica enriquecimento consultando a capability do
   provider da atividade, e NÃO comparando `activity.provider === "GARMIN"`
   ou qualquer outro identificador de provider específico no código
   compartilhado (`modules/shared/**`).
2. QUANDO o provider da atividade tiver um módulo de enriquecimento de
   detalhe registrado e disponível, ENTÃO o sistema DEVE tentar enriquecer a
   visão base com esse módulo antes de recorrer à visão base pura.
3. QUANDO nenhum módulo de enriquecimento estiver disponível para o provider
   da atividade (provider sem capability de detalhe, ou módulo ausente),
   ENTÃO o sistema DEVE retornar a visão base normalizada, sem lançar erro e
   sem retornar uma visão vazia sem explicação.
4. QUANDO uma nova conexão de módulo de enriquecimento for adicionada para um
   provider (ex.: Strava, ou um provider futuro), ENTÃO essa adição NÃO DEVE
   exigir alterar o módulo de enriquecimento de outro provider já existente
   (ex.: Garmin).
5. O sistema DEVE preservar, sem alteração de comportamento observável, o
   caminho de enriquecimento Garmin já existente (`getGarminActivityVisualData`
   continua sendo chamado e seu resultado continua sendo usado quando
   disponível).

### Requisito 2 — Zonas de frequência cardíaca (nativas ou calculadas)

**User Story:** Como usuário com dados de frequência cardíaca na minha
atividade, quero ver minhas zonas de FC no detalhe da atividade,
independentemente do provider de origem, para entender a intensidade do meu
treino.

#### Acceptance Criteria

1. QUANDO uma atividade tiver dados de frequência cardíaca disponíveis (via
   endpoint nativo de zonas do provider OU via stream de FC), ENTÃO o sistema
   DEVE exibir uma seção de zonas de frequência cardíaca no detalhe da
   atividade.
2. QUANDO o provider da atividade oferecer zonas de FC nativas por
   atividade (capability satisfeita por endpoint próprio do provider), ENTÃO
   o sistema DEVE priorizar as zonas nativas sobre qualquer cálculo interno.
3. QUANDO o provider da atividade não oferecer zonas de FC nativas por
   atividade, mas oferecer um stream de frequência cardíaca (capability
   `streams` satisfeita e stream de FC presente), ENTÃO o sistema DEVE
   calcular as zonas de FC internamente a partir desse stream, usando um
   método de percentual da FC máxima de referência (5 faixas por `%FCmáx`).
4. QUANDO o sistema calcular zonas de FC internamente, ENTÃO a FC máxima de
   referência usada no cálculo DEVE ser resolvida nesta ordem de precedência:
   (a) FC máxima observada na própria atividade (`activity.maxHeartRate`),
   quando presente e maior que a FC média da atividade; (b) na ausência de
   (a), uma estimativa padrão baseada em fórmula genérica de FC máxima por
   idade, quando a idade do usuário estiver disponível no perfil; (c) na
   ausência de ambas, o sistema NÃO DEVE exibir zonas de FC calculadas para
   essa atividade.
5. QUANDO o sistema exibir zonas de FC calculadas (não nativas), ENTÃO a UI
   DEVE indicar, de forma visível, que as zonas são aproximadas e podem
   diferir das zonas configuradas pelo atleta no provider de origem.
6. QUANDO nem endpoint nativo de zonas nem stream de frequência cardíaca
   estiverem disponíveis para a atividade, ENTÃO o sistema NÃO DEVE exibir a
   seção de zonas de frequência cardíaca, e essa omissão NÃO DEVE ser tratada
   como erro.
7. O código responsável por decidir se calcula zonas de FC (Requisito 2.3)
   DEVE residir no módulo do provider (ex.: `modules/strava/**`) ou em uma
   função utilitária compartilhada por percentual de FC máxima
   (`modules/shared/activities/**`) que não dependa de nenhum provider
   específico; o core (`modules/shared/activities/presentation/**`) DEVE
   permanecer agnóstico a qual provider forneceu a zona (nativa ou
   calculada).

### Requisito 3 — Exibição de frequência cardíaca

**User Story:** Como usuário, quero ver minha frequência cardíaca no detalhe
da atividade, seja como métricas agregadas, seja como série ao longo do
treino, para acompanhar meu esforço cardíaco.

#### Acceptance Criteria

1. QUANDO uma atividade tiver frequência cardíaca média e/ou máxima
   normalizada (`activity.averageHeartRate`/`activity.maxHeartRate`), ENTÃO o
   sistema DEVE exibir essas métricas agregadas no detalhe da atividade,
   independentemente do provider de origem.
2. QUANDO o provider da atividade oferecer um stream de frequência cardíaca
   (capability `streams` satisfeita e stream de FC presente), ENTÃO o sistema
   DEVE oferecer uma representação da série de FC ao longo do treino na
   seção de análise do treino (Requisito 6), além das métricas agregadas.
3. QUANDO a atividade não tiver nenhum dado de frequência cardíaca (nem
   agregado, nem stream), ENTÃO o sistema NÃO DEVE exibir métricas ou seções
   de frequência cardíaca, e essa omissão NÃO DEVE ser tratada como erro.

### Requisito 4 — Cadência e frequência de braçadas por modalidade

**User Story:** Como usuário, quero ver minha cadência (corrida/ciclismo) ou
frequência de braçadas (natação) no detalhe da atividade, respeitando a
modalidade do treino, para qualquer provider conectado.

#### Acceptance Criteria

1. QUANDO uma atividade normalizada tiver cadência média
   (`activity.averageCadence`) e a modalidade canônica (`RyvanoSportType`) for
   de natação (`swim` ou `open-water`), ENTÃO o sistema DEVE rotular essa
   métrica como frequência de braçadas (stroke rate), e não como "cadência"
   genérica.
2. QUANDO uma atividade normalizada tiver cadência média e a modalidade
   canônica for de corrida ou ciclismo, ENTÃO o sistema DEVE rotular essa
   métrica como cadência, mantendo a unidade e a convenção já usadas na visão
   base (`formatCadence`).
3. QUANDO o provider da atividade oferecer um stream de cadência (capability
   `streams` satisfeita e stream de cadência presente), ENTÃO o sistema DEVE
   oferecer uma representação da série de cadência/frequência de braçadas ao
   longo do treino na seção de análise do treino (Requisito 6).
4. QUANDO uma atividade de natação não tiver dado de frequência de braçadas
   disponível para o provider de origem (limitação conhecida: o Strava não
   expõe stream de frequência de braçadas na mesma forma que o Garmin), ENTÃO
   o sistema DEVE omitir a métrica/seção correspondente sem exibir erro, sem
   valor zerado enganoso e sem mensagem de "recurso indisponível" que sugira
   falha.
5. A decisão de qual rótulo/unidade usar (cadência vs. frequência de
   braçadas) DEVE ser resolvida a partir da modalidade canônica
   (`RyvanoSportType`) da atividade, nunca a partir do identificador do
   provider.
6. A decisão de exibir ou omitir cadência/frequência de braçadas para uma
   atividade DEVE respeitar a categoria de exibição de métricas
   (Requisito 12) da modalidade canônica da atividade, além da
   disponibilidade real do dado; modalidades cuja categoria não inclua
   cadência/frequência de braçadas (ex.: força e estúdio, esportes coletivos
   e de raquete, vento e vela) NÃO DEVEM exibir essa métrica mesmo que um
   valor bruto de cadência exista no dado normalizado.

### Requisito 5 — Ritmo e pace por modalidade

**User Story:** Como usuário, quero ver meu ritmo/pace no detalhe da
atividade no formato adequado à modalidade, para qualquer provider
conectado.

#### Acceptance Criteria

1. QUANDO uma atividade normalizada tiver ritmo médio
   (`activity.averagePace`) e a modalidade canônica for de natação, ENTÃO o
   sistema DEVE exibir o ritmo no formato de pace por 100 metros
   (`formatSwimPace`).
2. QUANDO uma atividade normalizada tiver ritmo médio e a modalidade canônica
   for de corrida (incluindo variações como corrida em trilha), ENTÃO o
   sistema DEVE exibir o ritmo no formato de pace por quilômetro
   (`formatPace`).
3. QUANDO uma atividade normalizada não tiver ritmo médio, mas tiver
   velocidade média (`activity.averageSpeed`), ENTÃO o sistema DEVE exibir a
   velocidade no formato já usado pela visão base (km/h), mantendo o
   comportamento atual para modalidades sem conceito de pace (ex.: ciclismo).
4. QUANDO o provider da atividade oferecer um stream de distância e/ou
   velocidade (capability `streams` satisfeita), ENTÃO o sistema DEVE
   oferecer uma representação de ritmo/pace ao longo do treino (ex.: splits
   por distância) na seção de análise do treino (Requisito 6).
5. A decisão de qual formato de ritmo usar DEVE ser resolvida a partir da
   modalidade canônica (`RyvanoSportType`) da atividade, nunca a partir do
   identificador do provider.
6. A decisão de exibir ou omitir ritmo/pace para uma atividade DEVE respeitar
   a categoria de exibição de métricas (Requisito 12) da modalidade canônica
   da atividade, além da disponibilidade real do dado; QUANDO a categoria de
   exibição de métricas de uma atividade não incluir ritmo/pace (ex.:
   musculação e estúdio, esportes coletivos e de raquete, vento e vela),
   ENTÃO o sistema NÃO DEVE exibir ritmo/pace para essa atividade mesmo que
   exista um valor de velocidade normalizado — DEVE, no máximo, exibir
   velocidade/distância quando fizer sentido para a categoria.

### Requisito 6 — Seção de análise do treino

**User Story:** Como usuário, quero uma seção de análise do meu treino que
combine zonas, esforço e splits em uma leitura interpretativa, para entender
melhor como foi minha atividade, além dos números agregados isolados.

#### Acceptance Criteria

1. QUANDO uma atividade tiver pelo menos uma das seguintes fontes de dado
   disponível — zonas de frequência cardíaca (nativas ou calculadas),
   voltas/splits do provider, ou stream de alguma métrica (FC, cadência,
   ritmo/velocidade) — ENTÃO o sistema DEVE exibir uma seção de análise do
   treino no detalhe da atividade.
2. A seção de análise do treino DEVE compor, quando os dados de origem
   existirem: as zonas de frequência cardíaca (Requisito 2), os splits/voltas
   da atividade quando o provider oferecer a capability `laps`, e um resumo
   textual ou estrutural do esforço percebido (ex.: tempo em zonas
   intensas/moderadas/leves, variação de ritmo/cadência entre splits).
3. QUANDO uma das fontes de dado da seção de análise do treino estiver
   ausente para uma atividade específica (ex.: sem voltas, mas com zonas),
   ENTÃO o sistema DEVE compor a seção apenas com os dados disponíveis, sem
   exibir sub-blocos vazios e sem tratar a ausência como erro.
4. QUANDO nenhuma das fontes de dado da seção de análise do treino estiver
   disponível para uma atividade, ENTÃO o sistema NÃO DEVE exibir a seção de
   análise do treino.
5. A composição da seção de análise do treino DEVE ser decidida por
   capability e por dado efetivamente presente na atividade, nunca por
   identificador de provider.
6. O conteúdo da seção de análise do treino (quais séries e sub-blocos
   oferecer — ritmo/pace, cadência/frequência de braçadas, velocidade) DEVE
   respeitar a categoria de exibição de métricas (Requisito 12) da modalidade
   canônica da atividade, além da disponibilidade e da capability do dado de
   origem.

### Requisito 7 — Comportamento provider-agnostic e omissão graciosa

**User Story:** Como arquiteto do sistema, quero garantir que o detalhe de
atividade nunca dependa de um provider específico no código compartilhado,
para que providers futuros sejam suportados sem alterar o core.

#### Acceptance Criteria

1. O código em `modules/shared/activities/presentation/**` NÃO DEVE conter
   comparação direta com um identificador de provider (ex.:
   `provider === "STRAVA"`, `provider === "GARMIN"`) para decidir se
   enriquece, exibe zonas, cadência, ritmo ou análise do treino.
2. QUANDO um provider ainda não implementado (ex.: Polar, COROS, Suunto,
   Fitbit) for conectado no futuro e satisfizer as capabilities relevantes
   (`streams`, `laps`, `heartRateZones`), ENTÃO o detalhe de atividade DEVE
   funcionar para esse provider sem exigir alteração no código deste spec,
   além do próprio módulo do novo provider e seu registro no catálogo.
3. QUANDO qualquer dado opcional do detalhe de atividade (zonas, FC,
   cadência/frequência de braçadas, ritmo, análise do treino) estiver
   ausente para uma atividade específica, ENTÃO o sistema DEVE omitir
   graciosamente a métrica/seção correspondente, sem exibir mensagens de erro,
   sem placeholders vazios visíveis e sem renderizar a página de detalhe como
   vazia.
4. O sistema NÃO DEVE tratar a ausência de um dado opcional como falha de
   carregamento da página; a página de detalhe DEVE sempre renderizar ao
   menos a visão base normalizada.

### Requisito 8 — Capabilities de zonas do Strava alinhadas à decisão de cálculo

**User Story:** Como desenvolvedor do core, quero que o catálogo de
capabilities reflita corretamente que o Strava pode fornecer zonas de FC via
cálculo próprio, para que a decisão do Requisito 2 seja consistente com o
restante da arquitetura de capabilities.

#### Acceptance Criteria

1. O catálogo de providers (`modules/shared/integrations/catalog`) DEVE
   declarar `heartRateZones: true` para o Strava, refletindo que a capability
   é satisfeita por cálculo interno a partir de stream, e não apenas por
   endpoint nativo.
2. O contrato de capabilities (`ProviderCapabilities`) NÃO DEVE distinguir,
   no nível do core, entre uma capability satisfeita por endpoint nativo e
   uma capability satisfeita por cálculo interno; essa distinção, quando
   necessária para telemetria/observabilidade, DEVE ficar dentro do módulo do
   provider (ex.: um campo de origem incluído no dado retornado ao core, não
   no contrato de capability em si).
3. O catálogo NÃO DEVE declarar `powerZones: true` para o Strava enquanto não
   houver dado de potência normalizado suficiente (stream `watts`) e uma
   decisão equivalente de cálculo ou origem nativa para zonas de potência;
   essa capability permanece fora do escopo desta spec (ver Fora de escopo).

### Requisito 9 — Streams e laps do Strava como fonte de dado

**User Story:** Como desenvolvedor do módulo Strava, quero um método de
client para obter streams e laps de uma atividade, para alimentar o
enriquecimento de detalhe sem expor DTOs remotos ao domínio/UI.

#### Acceptance Criteria

1. O sistema DEVE implementar em `StravaClient`
   (`modules/strava/api/client/strava-client.ts`) um método para obter os
   streams de uma atividade (`GET /activities/{id}/streams`), reutilizando os
   schemas Zod já existentes em `modules/strava/api/schemas/strava-stream.ts`.
2. O sistema DEVE implementar em `StravaClient` um método para obter as
   voltas/splits de uma atividade (`GET /activities/{id}/laps`), com
   validação Zod do DTO remoto.
3. Todo DTO remoto de streams/laps do Strava DEVE ser validado em runtime
   (Zod) e convertido, por um parser em `modules/strava/parsers/**`, para uma
   estrutura interna antes de atravessar para o enriquecimento de detalhe;
   o DTO remoto NÃO DEVE alcançar `modules/shared/**` ou a UI diretamente.
4. QUANDO a chamada de streams ou laps falhar (401/403/404/429/5xx/timeout)
   ou retornar um payload que falhe na validação Zod, ENTÃO o enriquecimento
   de detalhe do Strava DEVE tratar essa falha como ausência de dado
   (omissão graciosa do Requisito 7), sem propagar o erro para a renderização
   da página.
5. O acesso a streams/laps do Strava DEVE seguir o mesmo tratamento de rate
   limit, refresh de token e observabilidade já implementado nos demais
   métodos de `StravaClient` (Req 11.1, 11.5, 20.3, 20.4 do spec
   `integracoes-modulares`), sem introduzir um caminho de autenticação
   paralelo.

### Requisito 10 — Requisitos não funcionais de dados e observabilidade

**User Story:** Como responsável por conformidade e operação, quero que o
enriquecimento de detalhe siga as mesmas práticas de segurança e
observabilidade já estabelecidas para integrações, para não introduzir um
ponto fraco na arquitetura multi-provider.

#### Acceptance Criteria

1. O sistema NÃO DEVE logar tokens, segredos ou dados pessoais identificáveis
   ao buscar ou processar streams/laps/zonas de qualquer provider.
2. QUANDO uma operação de busca de streams/laps para enriquecimento de
   detalhe for executada, ENTÃO o sistema DEVE registrar o evento via
   `logIntegrationEvent` (provider, operação, status), seguindo o mesmo
   padrão já usado pelos demais clients de provider.
3. O cálculo de zonas de FC a partir de stream (Requisito 2.3) DEVE ser uma
   operação determinística e local (sem chamada de rede adicional por
   render), operando sobre o stream já obtido do provider.
4. O sistema DEVE evitar recalcular ou buscar novamente dados de
   enriquecimento (streams, laps, zonas) a cada renderização da mesma
   atividade sem necessidade, reaproveitando cache/memoização já existente no
   padrão de enriquecimento de detalhe (ver `garminActivityVisualCache` como
   referência de padrão), sem exigir uma estratégia de cache idêntica para
   todo provider.
5. Qualquer nova chamada ao client Strava para streams/laps DEVE respeitar o
   Policy Gate (`assertPolicy("STRAVA", "persist")`) antes de qualquer
   persistência derivada desses dados, quando persistência for introduzida.

### Requisito 11 — Requisitos de animação da tela de detalhe

**User Story:** Como usuário, quero que as novas seções do detalhe de
atividade apareçam com transições suaves e consistentes com o restante da
tela, para que a experiência pareça polida e não abrupta.

#### Acceptance Criteria

1. QUANDO uma nova seção do detalhe de atividade (zonas, análise do treino,
   séries de FC/cadência/ritmo) for renderizada, ENTÃO o sistema DEVE aplicar
   uma transição de entrada consistente com o padrão de animação já usado
   pelas demais seções de `ActivityVisualDashboard` (biblioteca `motion/react`
   já em uso no componente).
2. QUANDO o usuário tiver preferência de movimento reduzido ativada no
   sistema operacional/navegador, ENTÃO as animações das novas seções DEVEM
   respeitar essa preferência, seguindo o mesmo tratamento já aplicado
   (`useReducedMotion`) pelas seções existentes.
3. QUANDO uma seção de série temporal (FC, cadência ou ritmo ao longo do
   treino) for exibida, ENTÃO sua renderização gráfica DEVE incluir uma
   transição de entrada dos dados (ex.: preenchimento progressivo), em vez de
   aparecer instantaneamente sem transição.
4. As animações introduzidas por esta spec NÃO DEVEM alterar o comportamento
   de arrastar/reordenar/redimensionar cards já existente em
   `CustomizableCardGrid`.

### Requisito 12 — Categorização de métricas por tipo de treino

**User Story:** Como usuário, quero que o detalhe da minha atividade só
exiba métricas que fazem sentido para a modalidade praticada (ex.: nada de
ritmo/pace para musculação, nada de frequência de braçadas para futebol),
independentemente do provider de origem, para não ver informação sem
sentido ou fabricada.

#### Acceptance Criteria

1. Toda atividade normalizada DEVE ter sua categoria de exibição de métricas
   resolvida a partir da modalidade canônica (`RyvanoSportType`) da
   atividade, nunca a partir do identificador do provider de origem.
2. O sistema DEVE reconhecer, no mínimo, as seguintes categorias de exibição
   de métricas, cada uma definindo quais seções fazem sentido (zonas de FC,
   cadência/frequência de braçadas, ritmo/pace, tipo de conteúdo da análise
   do treino):
   - **Resistência com ritmo** (corrida, corrida em trilha, caminhada,
     trilha/hiking, cadeira de rodas): zonas de FC, cadência, ritmo/pace,
     análise de treino completa.
   - **Ciclismo** (ciclismo de estrada, mountain bike, handbike): zonas de
     FC, cadência (RPM), velocidade (não ritmo/pace), potência quando houver
     stream de watts, análise de treino.
   - **Natação/desempenho aquático** (natação, águas abertas): zonas de FC,
     frequência de braçadas, ritmo por 100 metros, análise de treino.
   - **Remo e prancha** (remo, caiaque/canoagem, stand up paddle): zonas de
     FC quando houver, frequência de remada/braçada quando o provider
     expuser esse stream, velocidade/ritmo secundário, análise de treino
     limitada aos dados existentes.
   - **Vento e vela** (surf, kitesurf, vela, windsurf): duração, distância e
     rota quando houver, e zonas de FC quando houver dado de FC; SEM
     cadência e SEM ritmo/pace, que não fazem sentido nessas modalidades.
   - **Força e estúdio** (musculação, treino genérico, CrossFit, HIIT,
     elíptico, simulador de escada, yoga, pilates, fisioterapia, dança):
     duração e zonas de FC quando houver; SEM ritmo/pace, SEM cadência
     baseada em distância, SEM frequência de braçadas.
   - **Esportes coletivos e de raquete** (futebol, futsal, basquete, vôlei,
     tênis, padel, pickleball, badminton, squash, tênis de mesa,
     raquetebol, golfe, críquete): duração e zonas de FC quando houver;
     análise de treino baseada em esforço/zonas; SEM ritmo/pace, SEM
     cadência/frequência de braçadas.
   - **Neve, gelo e aventura** (esqui alpino, esqui fora de pista, esqui
     nórdico, snowboard, raquete de neve, patinação no gelo, patinação
     inline, esqui de rodas, skate, escalada em rocha): velocidade e/ou
     elevação quando houver, zonas de FC quando houver; SEM ritmo/pace no
     sentido de corrida; cadência somente quando o provider expuser stream
     de cadência dedicado para essas modalidades (nunca assumida por
     padrão).
   - **Multiesporte** (triathlon, duathlon, aquathlon, quando o dado já
     chegar identificado como tal por algum provider): tratamento igual ao
     já existente antes desta spec; aprofundar essa categoria fica fora de
     escopo (ver "Fora de escopo").
   - **Padrão/desconhecido**: categoria de fallback seguro para qualquer
     modalidade canônica que não se encaixe em nenhuma categoria conhecida.
3. QUANDO um valor bruto de `sport_type`/tipo de atividade (de qualquer
   provider, atual ou futuro) não corresponder a nenhuma categoria de
   exibição de métricas conhecida, ENTÃO o sistema DEVE aplicar a categoria
   Padrão/desconhecido, exibindo apenas o que já é normalizado de forma
   genérica (duração, distância se houver, frequência cardíaca agregada se
   houver), sem assumir ritmo/pace, cadência ou frequência de braçadas, sem
   lançar erro e sem interromper a renderização da página.
4. A taxonomia canônica (`RyvanoSportType` em
   `modules/shared/activities/sport-types/index.ts`) DEVE ganhar valores
   individuais para os tipos de esporte do Strava hoje sem correspondência
   canônica adequada, cada um associado à categoria de exibição de métricas
   correta, cobrindo no mínimo: cadeira de rodas, handbike, kitesurf, vela,
   windsurf, pickleball, badminton, squash, tênis de mesa, raquetebol,
   golfe, críquete, dança, esqui alpino, esqui fora de pista, esqui nórdico,
   snowboard, raquete de neve, patinação no gelo, patinação inline, esqui de
   rodas, skate e escalada em rocha. A tabela do Apêndice A lista o
   mapeamento completo confirmado nesta spec.
5. Tipos de esporte já cobertos pela taxonomia canônica atual (ex.: `bike`,
   `mtb`, `swim`, `open-water`, `run`, `trail-run`, `walking`, `hiking`,
   `gym`, `crossfit`, `football`, `futsal`, `basketball`, `volleyball`,
   `tennis`, `padel`, `surf`, `rowing`, `kayak`, `stand-up-paddle`,
   `triathlon`, `duathlon`, `aquathlon`, `default`) DEVEM receber apenas a
   atribuição de categoria de exibição de métricas correspondente
   (Requisito 12.2), sem exigir novo valor canônico.
6. `sport_type` do Strava que já correspondem a um tipo canônico existente
   por equivalência funcional (`Velomobile`, `EBikeRide`,
   `EMountainBikeRide` → `bike`/`mtb`) NÃO exigem valor canônico dedicado;
   esses casos entram no Apêndice A apenas como rastreabilidade, para que
   nenhum `sport_type` da documentação oficial do Strava fique sem
   mapeamento decidido.

## Fora de escopo (neste ciclo)

- Reconciliação cross-provider de atividades (permanece desabilitada por
  padrão, conforme `.kiro/specs/integracoes-modulares`; esta spec não a
  habilita nem depende dela).
- Solicitar novos scopes OAuth do Strava (em particular, `profile:read_all`
  para `/athlete/zones`); a decisão desta spec evita essa necessidade.
- Implementação de um dashboard geral ou de relatórios; o escopo é
  exclusivamente a página de detalhe de uma atividade individual.
- Implementação de módulos de providers ainda não conectados (Polar, COROS,
  Suunto, Fitbit); esses providers ficam automaticamente cobertos pela
  arquitetura capability-driven descrita aqui quando forem implementados, sem
  trabalho adicional específico desta spec.
- Zonas de potência (`powerZones`) para o Strava — não há decisão de
  cálculo/origem definida nesta spec; permanece `false`/ausente no catálogo
  até uma spec futura decidir a abordagem.
- Edição manual pelo usuário da FC máxima de referência usada no cálculo de
  zonas (a resolução de FC máxima de referência é automática, conforme
  Requisito 2.4); uma tela de configuração de FC máxima manual pode ser objeto
  de spec futura.
- Detecção e costura automática de eventos multiesporte (brick) compostos
  por múltiplas atividades separadas do Strava (ex.: Swim → Ride → Run
  registrados como três atividades distintas e possivelmente já
  divididas/agrupadas pelo próprio Strava). O Strava não representa
  triathlon/duathlon/aquathlon como um `sport_type` individual; correlacionar
  múltiplas atividades separadas em um único evento multiesporte é um
  problema de correlação entre atividades, maior e diferente do escopo desta
  spec, e permanece fora de escopo. O Requisito 12 (categoria
  "Multiesporte") cobre apenas o caso em que o dado normalizado já chega
  identificado como `triathlon`/`duathlon`/`aquathlon` por algum provider.

## Critérios de aceite globais (Definition of Done)

- Uma atividade Strava com dados de FC (agregados e/ou stream) exibe zonas de
  frequência cardíaca (calculadas, com aviso de aproximação), frequência
  cardíaca, cadência (rotulada corretamente pela modalidade), ritmo/pace no
  formato correto da modalidade, e uma seção de análise do treino — sem
  nenhuma comparação direta a `"STRAVA"` no código compartilhado.
- Uma atividade Strava de natação sem stream de frequência de braçadas omite
  graciosamente essa métrica, sem erro e sem placeholder vazio.
- Uma atividade Garmin continua exibindo exatamente as mesmas seções e dados
  que exibia antes desta spec (nenhuma regressão observável).
- Nenhum arquivo em `modules/shared/**` compara o identificador do provider
  para decidir enriquecimento, zonas, cadência, ritmo ou análise do treino.
- O catálogo de capabilities declara `heartRateZones: true` para o Strava,
  coerente com a decisão de cálculo por stream.
- As novas seções da tela de detalhe usam o mesmo padrão de animação
  (`motion/react`, `useReducedMotion`) já presente em
  `ActivityVisualDashboard`.
- Nenhum token, segredo ou dado pessoal identificável aparece em logs
  relacionados ao enriquecimento de detalhe de atividade.
- Nenhuma atividade das categorias "Força e estúdio", "Esportes coletivos e
  de raquete", "Vento e vela" ou "Neve, gelo e aventura" exibe ritmo/pace ou
  cadência/frequência de braçadas fabricados a partir de dados que não fazem
  sentido para a modalidade.
- Um `sport_type` desconhecido (de qualquer provider, atual ou futuro) nunca
  quebra a renderização da página de detalhe; sempre cai na categoria
  Padrão/desconhecido do Requisito 12.

## Apêndice A — Mapeamento sport_type do Strava → RyvanoSportType → categoria de exibição de métricas

Tabela de rastreabilidade da enumeração oficial de `sport_type` do Strava
([Strava API Reference](https://developers.strava.com/docs/reference/) —
`SportType`; conteúdo parafraseado para conformidade com licenciamento),
confirmada nesta spec, cobrindo todos os valores conhecidos e a categoria de
exibição de métricas (Requisito 12) resultante. Valores já cobertos pela
taxonomia canônica atual estão marcados; os demais são adições exigidas pelo
Requisito 12.4.

| `sport_type` (Strava) | `RyvanoSportType` | Categoria de exibição de métricas |
|---|---|---|
| `Run` | `run` (existente) | Resistência com ritmo |
| `TrailRun` | `trail-run` (existente) | Resistência com ritmo |
| `Walk` | `walking` (existente) | Resistência com ritmo |
| `Hike` | `hiking` (existente) | Resistência com ritmo |
| `Wheelchair` | `wheelchair` (novo) | Resistência com ritmo |
| `VirtualRun` | `run` (existente) | Resistência com ritmo |
| `Ride` | `bike` (existente) | Ciclismo |
| `MountainBikeRide` | `mtb` (existente) | Ciclismo |
| `GravelRide` | `bike` (existente) | Ciclismo |
| `EBikeRide` | `bike` (existente, sem valor dedicado) | Ciclismo |
| `EMountainBikeRide` | `mtb` (existente, sem valor dedicado) | Ciclismo |
| `Handcycle` | `handcycle` (novo) | Ciclismo |
| `Velomobile` | `bike` (existente, sem valor dedicado) | Ciclismo |
| `VirtualRide` | `bike` (existente) | Ciclismo |
| `Swim` | `swim` (existente) | Natação/desempenho aquático |
| `Canoeing` | `kayak` (existente) | Remo e prancha |
| `Kayaking` | `kayak` (existente) | Remo e prancha |
| `Kitesurf` | `kitesurf` (novo) | Vento e vela |
| `Rowing` | `rowing` (existente) | Remo e prancha |
| `Sail` | `sail` (novo) | Vento e vela |
| `StandUpPaddling` | `stand-up-paddle` (existente) | Remo e prancha |
| `Surfing` | `surf` (existente) | Vento e vela |
| `Windsurf` | `windsurf` (novo) | Vento e vela |
| `VirtualRow` | `rowing` (existente) | Remo e prancha |
| `WeightTraining` | `gym` (existente) | Força e estúdio |
| `Workout` | `gym` (existente) | Força e estúdio |
| `Crossfit` | `crossfit` (existente) | Força e estúdio |
| `HighIntensityIntervalTraining` | `gym` (existente) | Força e estúdio |
| `Elliptical` | `gym` (existente) | Força e estúdio |
| `StairStepper` | `gym` (existente) | Força e estúdio |
| `Yoga` | `gym` (existente) | Força e estúdio |
| `Pilates` | `gym` (existente) | Força e estúdio |
| `PhysicalTherapy` | `gym` (existente) | Força e estúdio |
| `Dance` | `dance` (novo) | Força e estúdio |
| `Soccer` | `football` (existente) | Esportes coletivos e de raquete |
| `Basketball` | `basketball` (existente) | Esportes coletivos e de raquete |
| `Volleyball` | `volleyball` (existente) | Esportes coletivos e de raquete |
| `Tennis` | `tennis` (existente) | Esportes coletivos e de raquete |
| `Padel` | `padel` (existente) | Esportes coletivos e de raquete |
| `Pickleball` | `pickleball` (novo) | Esportes coletivos e de raquete |
| `Badminton` | `badminton` (novo) | Esportes coletivos e de raquete |
| `Squash` | `squash` (novo) | Esportes coletivos e de raquete |
| `TableTennis` | `table-tennis` (novo) | Esportes coletivos e de raquete |
| `Racquetball` | `racquetball` (novo) | Esportes coletivos e de raquete |
| `Golf` | `golf` (novo) | Esportes coletivos e de raquete |
| `Cricket` | `cricket` (novo) | Esportes coletivos e de raquete |
| `AlpineSki` | `alpine-ski` (novo) | Neve, gelo e aventura |
| `BackcountrySki` | `backcountry-ski` (novo) | Neve, gelo e aventura |
| `NordicSki` | `nordic-ski` (novo) | Neve, gelo e aventura |
| `Snowboard` | `snowboard` (novo) | Neve, gelo e aventura |
| `Snowshoe` | `snowshoe` (novo) | Neve, gelo e aventura |
| `IceSkate` | `ice-skate` (novo) | Neve, gelo e aventura |
| `InlineSkate` | `inline-skate` (novo) | Neve, gelo e aventura |
| `RollerSki` | `roller-ski` (novo) | Neve, gelo e aventura |
| `Skateboard` | `skateboard` (novo) | Neve, gelo e aventura |
| `RockClimbing` | `rock-climbing` (novo) | Neve, gelo e aventura |

Observação: triathlon, duathlon e aquathlon não existem como `sport_type`
individual no Strava — o Strava representa esses eventos multiesporte por
meio de atividades separadas (ex.: Swim → Ride → Run), que podem já vir
divididas/agrupadas pelo próprio Strava. Costurar automaticamente essas
atividades separadas em um único evento multiesporte fica fora de escopo
desta spec (ver "Fora de escopo").
