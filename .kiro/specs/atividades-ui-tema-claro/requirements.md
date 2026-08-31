# Documento de Requisitos

## Introdução

A tela `/app/atividades` (listagem e detalhe de atividades) hoje trata a origem
de cada atividade (Strava, Garmin, e futuras integrações) de forma quase
invisível: todo Cartão de Atividade exibe o mesmo Selo de Origem neutro,
composto por um ícone genérico de relógio e o nome do provider em texto
pequeno, sem cor ou ícone de marca que diferencie visualmente Strava de
Garmin (ou de integrações futuras). A mesma tela é predominantemente neutra
(tons de branco/preto translúcidos), com cor concentrada apenas na borda e no
ícone de modalidade de cada Cartão de Atividade.

A investigação do código também confirmou um bug de contraste no Tema Claro:
os ícones de modalidade do Cartão de Atividade (`getSportIconShellClass` em
`components/activities/activities-browser.tsx`) e os destaques numéricos do
Cartão de Detalhe (`buildHeroStats`/`buildBaseHeroStats`) usam classes Tailwind
de cor fixa e muito clara (`text-cyan-200`, `text-emerald-200`,
`text-orange-200`, `text-teal-200`, `text-amber-200`, `text-violet-200`,
`text-fuchsia-200`). O projeto já corrige esse tipo de classe para o Tema
Claro via seletores `[data-theme="light"] .text-*` em `app/globals.css`, mas
essa correção existe apenas para `.text-rose-200` — as demais classes citadas
não têm override de Tema Claro, o que as deixa quase brancas sobre um fundo
claro (baixo contraste / efeito de "ícone que não aparece"). O mesmo padrão de
classe sem override também foi encontrado em `components/integrations/
integrations-hub.tsx` (ex.: múltiplos usos de `text-cyan-200`), relevante
porque o requisito de tema padrão claro é para todo o sistema, não apenas para
`/app/atividades`.

Uma investigação adicional, motivada por feedback direto do usuário, ampliou
o escopo desse bug de contraste: o mesmo padrão (classes Tailwind de cor fixa
e clara — `text-cyan-200`, `text-amber-200/90`, `text-rose-200`,
`text-sky-300`, `text-violet-300`, `text-emerald-300`, `text-indigo-300` — sem
override `[data-theme="light"]` correspondente em `app/globals.css`) também
aparece fora de `/app/atividades` e `/app/integracoes`, em pelo menos
`app/page.tsx` (landing pública), `components/public-page-shell.tsx`,
`components/dashboard/dashboard-redesign.tsx`,
`components/auth/auth-access-panel.tsx`, `components/auth/password-field.tsx`,
`components/admin/history-cleanup-panel.tsx`,
`components/admin/message-delivery-panel.tsx`,
`components/admin/evolution-media-test-panel.tsx`,
`components/admin/whatsapp-report-preview-panel.tsx`,
`app/admin/usuarios/[id]/page.tsx`,
`components/profile/security-experience.tsx` (tela `/app/seguranca`) e
`components/profile/profile-experience.tsx` (tela `/app/perfil`). Por isso, o
Requisito 6 deste documento
trata a correção de contraste como válida para toda Tela do Sistema, e não
apenas para as duas telas citadas acima, que servem de evidência da
investigação, não como lista definitiva.

A mesma investigação identificou também o uso de caracteres emoji Unicode
como ícone funcional em componentes de UI reais (fora de templates de
imagem de relatório), notavelmente `"✓"` como indicador textual de etapa
concluída em `components/profile/onboarding-wizard.tsx` e `"✓ "` como
prefixo textual de mensagem de feedback em
`components/profile/profile-experience.tsx`, em vez de um ícone da
Biblioteca de Ícones já usada no projeto (`@tabler/icons-react` e
`@iconify/react`). O Requisito 7 cobre a substituição desses casos e proíbe
esse padrão de forma geral, com exceções explícitas para conteúdo que não é
tela do Sistema (imagens de relatório em `lib/reports/**` e mensagens de
texto de WhatsApp) e para a simulação visual dos tiques de leitura do
WhatsApp em `components/landing-whatsapp-phone.tsx`, que reproduz
intencionalmente a identidade visual de um aplicativo externo dentro de um
mockup de celular.

Por fim, a investigação confirmou que os Ícones de Navegação da Barra
Lateral, renderizados pela função `NavIcon` em `components/app-shell.tsx`,
usam um `<svg>` de `18x18px` dentro de um contêiner de `48x48px`
(`h-12 w-12`), proporção que o usuário considera pequena demais. O
Requisito 8 cobre o aumento perceptível desse tamanho.

Além do bug de contraste, o tema padrão do sistema hoje é escuro:
`DEFAULT_THEME` em
`lib/theme.ts` está definido como `"dark"`, aplicado tanto pelo script inline
de inicialização (`getThemeInitScript`, em `app/layout.tsx`) quanto pelos
componentes que leem esse valor (`components/theme-toggle.tsx`). Este spec
cobre a mudança desse padrão para claro, preservando a escolha manual do
usuário (persistida em `localStorage` sob a chave `ryvano-theme`) e o
funcionamento do Tema Escuro como opção.

Este spec NÃO cobre uma redefinição completa de identidade visual do produto;
o objetivo é (1) tornar a origem de cada atividade evidente, (2) corrigir o
bug de contraste de ícones/destaques no Tema Claro em toda Tela do Sistema,
(3) aumentar a presença de cor na tela de atividades sem remover os elementos
existentes, (4) trocar o tema padrão do sistema para claro, (5) eliminar o
uso de caracteres emoji como ícone funcional nas telas do Sistema em favor da
Biblioteca de Ícones já adotada pelo projeto, e (6) aumentar o tamanho dos
Ícones de Navegação da Barra Lateral.

## Glossário

- **Sistema**: a aplicação web Ryvano (frontend Next.js e suas rotas em
  `/app/**`).
- **Provider**: provedor esportivo externo integrado à Ryvano (ex.: `STRAVA`,
  `GARMIN`, e futuros `POLAR`, `COROS`, `SUUNTO`, `FITBIT`), identificado pelo
  campo `provider` (`WearableProvider`) de cada atividade.
- **Catálogo de Providers**: estrutura central (`modules/shared/integrations/
  catalog`) que define, por `ProviderId`, metadados como nome de exibição.
- **Mapeamento Visual de Provider**: estrutura central que associa cada
  `ProviderId` a um ícone de marca e a uma cor de destaque, usada para
  renderizar o Selo de Origem.
- **Tela de Atividades**: página `/app/atividades`, renderizada pelo
  componente `ActivitiesBrowser`, que lista as atividades do usuário em
  Cartões de Atividade agrupados por período.
- **Tela de Detalhe de Atividade**: página `/app/atividades/[id]`, renderizada
  pelo componente `ActivityVisualDashboard`, que exibe os dados completos de
  uma atividade.
- **Cartão de Atividade**: elemento visual da Tela de Atividades que
  representa uma atividade individual, contendo título, Ícone de Modalidade,
  Selo de Origem, métricas e selos de destaque.
- **Cartão de Resumo**: cada um dos quatro indicadores agregados exibidos no
  topo da Tela de Atividades (Atividades, Distância total, Tempo em
  atividade, Dias com treino).
- **Selo de Origem**: elemento visual, dentro do Cartão de Atividade e da
  Tela de Detalhe de Atividade, que identifica de qual Provider uma atividade
  foi sincronizada.
- **Ícone de Modalidade**: ícone que representa o tipo de esporte
  (`sportTone`) de uma atividade (natação, ciclismo, corrida, caminhada,
  força, triathlon ou padrão).
- **Tema Claro**: conjunto de variáveis visuais aplicado quando
  `document.documentElement.dataset.theme === "light"`.
- **Tema Escuro**: conjunto de variáveis visuais aplicado quando o atributo
  `data-theme` está ausente ou vale `"dark"`.
- **Inicializador de Tema**: mecanismo composto por `lib/theme.ts` e pelo
  script inline injetado em `app/layout.tsx` (via `getThemeInitScript`), que
  determina e aplica o tema antes da renderização da página.
- **Preferência de Tema Salva**: valor gravado em `localStorage` sob a chave
  `ryvano-theme`, escrito quando o usuário alterna o tema manualmente via
  `ThemeToggle`.
- **Tela do Sistema**: qualquer página ou rota renderizada pelo Sistema e
  visitada pelo usuário através do navegador (por exemplo, `/app/atividades`,
  `/app/integracoes`, `/app/perfil`, `/app/admin/**`, e a landing pública em
  `/`), independentemente de exigir autenticação. Não inclui artefatos que não
  são páginas web, como as imagens de relatório geradas em
  `lib/reports/**` e enviadas via WhatsApp.
- **Biblioteca de Ícones**: os pacotes `@tabler/icons-react` e
  `@iconify/react`, já utilizados no projeto (por exemplo, em
  `components/integrations/integrations-hub.tsx` e
  `components/dashboard/dashboard-redesign.tsx`) para renderizar ícones
  vetoriais como componentes React.
- **Ícone de Navegação**: cada ícone renderizado pela função `NavIcon` em
  `components/app-shell.tsx`, exibido dentro do contêiner de item da Barra
  Lateral de navegação (`NavigationLink`), ao lado do rótulo de texto de cada
  seção do Sistema.

## Requisitos

### Requisito 1 — Identidade visual do Provider no Cartão de Atividade

**User Story:** Como usuário com mais de uma integração conectada (por
exemplo, Strava e Garmin), quero identificar rapidamente, pela aparência de
cada Cartão de Atividade, de qual Provider a atividade veio, para não precisar
ler o texto do Selo de Origem para diferenciar minhas atividades.

#### Acceptance Criteria

1. O Sistema DEVE fornecer um Mapeamento Visual de Provider que associe cada
   `ProviderId` do Catálogo de Providers a um ícone de marca e a uma cor de
   destaque.
2. QUANDO a Tela de Atividades renderizar um Cartão de Atividade, O Sistema
   DEVE exibir, no Selo de Origem desse cartão, o ícone de marca do Provider
   correspondente, em vez do ícone genérico de relógio usado atualmente.
3. QUANDO a Tela de Atividades renderizar um Cartão de Atividade, O Sistema
   DEVE aplicar, ao Selo de Origem desse cartão, a cor de destaque do Provider
   correspondente definida no Mapeamento Visual de Provider, em vez do estilo
   neutro (`theme-pill-neutral`) usado atualmente para todos os providers.
4. QUANDO dois Cartões de Atividade exibidos na mesma página pertencerem a
   Providers diferentes, O Sistema DEVE renderizar Selos de Origem com ícones
   e cores diferentes entre si.
5. SE o `provider` de uma atividade não tiver entrada correspondente no
   Mapeamento Visual de Provider, ENTÃO O Sistema DEVE exibir um ícone e uma
   cor de destaque padrão (fallback), preservando o rótulo textual do
   Provider.
6. ONDE um novo Provider for adicionado ao Mapeamento Visual de Provider, O
   Sistema DEVE exibir o ícone e a cor definidos para ele em todo Cartão de
   Atividade correspondente, sem exigir alterações no componente
   `ActivitiesBrowser`.

### Requisito 2 — Identidade visual do Provider na Tela de Detalhe de Atividade

**User Story:** Como usuário, quero ver a mesma identificação visual de
Provider ao abrir uma atividade específica, para manter a consistência entre
a listagem e o detalhe.

#### Acceptance Criteria

1. QUANDO a Tela de Detalhe de Atividade for renderizada, O Sistema DEVE
   exibir, junto ao nome do Provider, o ícone de marca definido para esse
   Provider no Mapeamento Visual de Provider.
2. QUANDO a Tela de Detalhe de Atividade for renderizada, O Sistema DEVE
   aplicar, ao selo que exibe o nome do Provider, a cor de destaque definida
   para esse Provider no Mapeamento Visual de Provider.
3. O ícone e a cor de destaque exibidos na Tela de Detalhe de Atividade para
   um Provider DEVEM ser os mesmos ícone e cor exibidos para esse Provider na
   Tela de Atividades.

### Requisito 3 — Correção de contraste de Ícones e destaques no Tema Claro

**User Story:** Como usuário que usa o Tema Claro, quero ver todos os ícones e
destaques numéricos da Tela de Atividades e da Tela de Detalhe de Atividade
com contraste suficiente, para não perder informação visual da tela.

#### Acceptance Criteria

1. QUANDO o Tema Claro estiver ativo, O Sistema DEVE renderizar o Ícone de
   Modalidade de cada Cartão de Atividade com uma cor de primeiro plano que
   tenha contraste mínimo de 3:1 em relação ao fundo do próprio ícone.
2. QUANDO o Tema Claro estiver ativo, O Sistema DEVE renderizar cada
   destaque numérico da Tela de Detalhe de Atividade (`heroStats`) com uma cor
   de primeiro plano que tenha contraste mínimo de 3:1 em relação ao fundo do
   cartão que o contém.
3. QUANDO o Tema Claro estiver ativo, O Sistema DEVE renderizar o Selo de
   Origem introduzido pelo Requisito 1 e pelo Requisito 2 com contraste
   mínimo de 3:1 em relação ao próprio fundo do selo.
4. PARA TODA classe de cor de Ícone de Modalidade ou de destaque numérico
   definida para o Tema Escuro na Tela de Atividades e na Tela de Detalhe de
   Atividade, O Sistema DEVE definir uma variante equivalente para o Tema
   Claro, seguindo o padrão de sobrescrita `[data-theme="light"]` já usado em
   `app/globals.css`.
5. QUANDO o Tema Claro estiver ativo, O Sistema DEVE manter, para cada
   modalidade (natação, ciclismo, corrida, caminhada, força, triathlon,
   padrão), uma cor de Ícone de Modalidade visualmente distinguível das
   demais modalidades.

### Requisito 4 — Presença de cor na Tela de Atividades

**User Story:** Como usuário, quero que a Tela de Atividades tenha uma
aparência mais colorida do que a atual (predominantemente neutra em
branco/preto translúcido), para que a tela transmita mais identidade visual
sem perder legibilidade.

#### Acceptance Criteria

1. QUANDO a Tela de Atividades renderizar um Cartão de Resumo, O Sistema DEVE
   aplicar a esse cartão uma cor de destaque não neutra associada ao
   indicador que ele representa (Atividades, Distância total, Tempo em
   atividade, Dias com treino), distinta do estilo neutro atual
   (`bg-black/10 text-foreground/84`).
2. QUANDO dois Cartões de Resumo representarem indicadores diferentes, O
   Sistema DEVE aplicar a cada um deles uma cor de destaque diferente entre
   si.
3. A introdução das cores de destaque nos Cartões de Resumo e nos Selos de
   Origem (Requisitos 1, 2 e 4.1) NÃO DEVE reduzir a legibilidade dos valores
   numéricos e dos rótulos de texto já existentes em nenhum dos dois temas.

### Requisito 5 — Tema padrão do sistema

**User Story:** Como usuário novo ou sem preferência salva, quero que a
Ryvano abra no Tema Claro por padrão, para que essa seja a experiência inicial
do sistema em qualquer tela, não apenas em `/app/atividades`.

#### Acceptance Criteria

1. O Sistema DEVE definir o Tema Claro como o tema padrão usado pelo
   Inicializador de Tema.
2. QUANDO um usuário acessar o Sistema sem uma Preferência de Tema Salva no
   navegador, O Sistema DEVE aplicar o Tema Claro.
3. SE existir uma Preferência de Tema Salva no navegador do usuário
   (`"dark"` ou `"light"`), ENTÃO O Sistema DEVE aplicar essa preferência,
   independentemente do tema padrão definido no Requisito 5.1.
4. SE a execução do script do Inicializador de Tema falhar ou o JavaScript do
   navegador estiver indisponível, ENTÃO O Sistema DEVE renderizar a
   interface no Tema Claro.
5. QUANDO um usuário alternar manualmente entre Tema Claro e Tema Escuro
   através do `ThemeToggle`, O Sistema DEVE continuar persistindo a escolha
   como Preferência de Tema Salva, preservando o comportamento atual de
   alternância e persistência.
6. A mudança do tema padrão para claro NÃO DEVE remover o Tema Escuro como
   opção disponível ao usuário.

### Requisito 6 — Não regressão de legibilidade em toda Tela do Sistema ao tornar o Tema Claro padrão

**User Story:** Como usuário, quero que, ao abrir qualquer Tela do Sistema no
Tema Claro (agora o padrão), os ícones e destaques existentes continuem
visíveis, para não ter, em nenhuma tela, a mesma experiência de ícones que
desaparecem observada originalmente em `/app/atividades`.

#### Acceptance Criteria

1. QUANDO o Tema Claro estiver ativo, O Sistema DEVE renderizar todo ícone e
   todo destaque textual ou numérico de qualquer Tela do Sistema que hoje
   use uma classe Tailwind de cor fixa e clara sem variante de Tema Claro
   (por exemplo, `text-cyan-200`, `text-amber-200/90`, `text-rose-200`,
   `text-sky-300`, `text-violet-300`, `text-emerald-300`, `text-indigo-300`)
   com contraste mínimo de 3:1 em relação ao próprio fundo do elemento.
2. PARA TODA classe de cor fixa e clara usada em qualquer Tela do Sistema e
   definida sem variante de Tema Claro em `app/globals.css`, O Sistema DEVE
   definir uma variante equivalente para o Tema Claro, seguindo o padrão de
   sobrescrita `[data-theme="light"]` já usado em `app/globals.css`.
3. A correção de contraste dos Requisitos 6.1 e 6.2 NÃO DEVE alterar a
   aparência desses ícones e destaques quando o Tema Escuro estiver ativo.
4. A Tela de Integrações (`/app/integracoes`) e as telas listadas na
   Introdução deste documento (landing pública, painel de dashboard, telas
   de autenticação e telas administrativas) SÃO evidências da investigação
   que originou este requisito, e NÃO constituem lista exaustiva das Telas
   do Sistema cobertas pelos Requisitos 6.1 a 6.3.

### Requisito 7 — Proibição de emoji como ícone funcional

**User Story:** Como usuário, quero que todo ícone informativo ou decorativo
exibido nas telas do Sistema seja um ícone vetorial consistente com o
restante da interface, para não ver caracteres emoji que variam de
aparência entre sistemas operacionais e navegadores no lugar de um ícone.

#### Acceptance Criteria

1. O Sistema DEVE representar todo ícone informativo ou decorativo exibido
   em uma Tela do Sistema usando um componente da Biblioteca de Ícones.
2. O Sistema NÃO DEVE usar um caractere emoji Unicode como ícone funcional
   em nenhuma Tela do Sistema.
3. QUANDO o indicador de etapa concluída do assistente de integração
   (`components/profile/onboarding-wizard.tsx`) representar uma etapa
   concluída, O Sistema DEVE exibir um ícone da Biblioteca de Ícones em vez
   do caractere `"✓"` usado atualmente.
4. QUANDO uma mensagem de feedback de sucesso for exibida em
   `components/profile/profile-experience.tsx`, O Sistema DEVE exibir um
   ícone da Biblioteca de Ícones em vez do prefixo textual `"✓ "` usado
   atualmente.
5. ONDE um conteúdo for uma imagem de relatório gerada em `lib/reports/**`
   e enviada como anexo por WhatsApp, o Requisito 7.2 NÃO SE APLICA a esse
   conteúdo, por não se tratar de uma Tela do Sistema.
6. ONDE um conteúdo for o texto de uma mensagem enviada via WhatsApp por
   `app/actions/integrations.ts`, o Requisito 7.2 NÃO SE APLICA a esse
   conteúdo, por não se tratar de uma Tela do Sistema.
7. ONDE o componente `components/landing-whatsapp-phone.tsx` exibir os
   caracteres `"✓✓"` dentro do mockup de celular da landing pública para
   simular visualmente os tiques de leitura reais do aplicativo WhatsApp, o
   Requisito 7.2 NÃO SE APLICA a esse uso, por se tratar de uma reprodução
   intencional da identidade visual de um aplicativo externo dentro de uma
   simulação de interface, e não de um ícone do Sistema.

### Requisito 8 — Tamanho dos Ícones de Navegação da Barra Lateral

**User Story:** Como usuário, quero que os Ícones de Navegação da Barra
Lateral sejam maiores do que os atuais, para identificá-los e distingui-los
entre si com mais facilidade.

#### Acceptance Criteria

1. O Sistema DEVE renderizar cada Ícone de Navegação (componente `NavIcon`
   em `components/app-shell.tsx`) com dimensões de SVG perceptivelmente
   maiores do que o valor atual de `18x18px`.
2. QUANDO o tamanho do SVG de um Ícone de Navegação for aumentado conforme o
   Requisito 8.1, O Sistema DEVE manter a proporção entre largura e altura
   do ícone.
3. QUANDO o tamanho do SVG de um Ícone de Navegação for aumentado conforme o
   Requisito 8.1, O Sistema DEVE manter esse ícone centralizado e alinhado
   dentro do contêiner atual de `48x48px` (`h-12 w-12`) do item de
   navegação, sem alterar o tamanho desse contêiner.
4. QUANDO o tamanho do SVG de um Ícone de Navegação for aumentado conforme o
   Requisito 8.1, O Sistema DEVE manter a legibilidade do rótulo de texto
   exibido ao lado desse ícone no item de navegação.
