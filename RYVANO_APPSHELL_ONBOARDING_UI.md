# RYVANO — Refatoração do AppShell e Onboarding

## Objetivo

Refatorar a tela de onboarding e o shell autenticado do RYVANO para:

- reutilizar o MESMO header visual e estrutural da landing page;
- reduzir significativamente o tamanho do menu lateral;
- tornar o menu lateral colapsável;
- manter o menu lateral com altura fixa da viewport;
- permitir scroll APENAS na área de conteúdo da página;
- impedir que sidebar e shell cresçam junto com o conteúdo;
- melhorar todos os textos do onboarding;
- remover linguagem técnica/interna;
- deixar a experiência mais clara, leve e com aparência de produto final.

A implementação deve ser incremental e deve reutilizar os componentes já existentes.

---

# 1. Regra obrigatória: investigar antes de alterar

Antes de implementar:

1. localizar o componente de header usado na landing page;
2. localizar `AppShell`;
3. localizar o componente atual de sidebar;
4. localizar o MobileDock já implementado;
5. localizar tokens de cor, glass, radius e spacing;
6. localizar o componente de usuário/avatar;
7. localizar a lógica de logout;
8. localizar a configuração de navegação;
9. localizar componentes de cards e badges;
10. localizar os formulários de onboarding.

NÃO recriar o header da landing copiando JSX.

Reutilizar o componente existente ou extrair uma versão compartilhada.

---

# 2. Header — usar o mesmo da landing page

O header da área autenticada deve usar a MESMA identidade visual da landing:

- mesma altura visual;
- mesmo glass;
- mesmo background;
- mesma borda;
- mesmo blur;
- mesmo radius;
- mesmos paddings;
- mesma sombra;
- mesma tipografia da marca RYVANO.

Não manter o header autenticado atual como um componente visual separado.

---

# 3. Estrutura do header autenticado

A aparência deve ser igual à landing, mas o conteúdo deve se adaptar ao usuário autenticado.

## Lado esquerdo

```text
RYVANO
Seus treinos, mais fáceis de entender.
```

ou reutilizar exatamente a tagline atual da landing.

## Lado direito

Na área autenticada:

```text
Dashboard
Atividades
Integrações
[avatar] Samuel
```

Se o produto ainda não tiver todas essas rotas, usar somente as existentes.

Não mostrar:

```text
App autenticado
```

Essa expressão é técnica e não deve aparecer.

---

# 4. Usuário no header

Substituir o bloco atual:

```text
RY
App autenticado
samuel vermeuln
```

por algo mais simples:

```text
[avatar] Samuel
```

Ao clicar:

```text
Minha conta
Configurações
Sair
```

Se já existir menu de perfil, reutilizar.

Não criar um novo dropdown se já existir um componente equivalente.

---

# 5. Header sticky

O header deve ficar fixo visualmente no topo da área de conteúdo.

Usar:

```css
position: sticky;
top: 16px;
z-index: 30;
```

Ele deve fazer parte da área de conteúdo rolável.

Quando o conteúdo rolar:

```text
sidebar = parada
header = permanece no topo
body da página = rola
```

---

# 6. Problema atual da sidebar

A sidebar atual usa aproximadamente:

```text
w-72 = 288px
```

Isso é grande demais.

Ela também participa da altura total do documento.

Isso deve ser corrigido.

---

# 7. Nova largura da sidebar

## Expandida

```text
240px
```

Tailwind equivalente aproximado:

```text
w-60
```

## Colapsada

```text
76px
```

Não usar menos de:

```text
72px
```

para não apertar ícones e áreas de clique.

---

# 8. Estado inicial

Desktop grande:

preferência:

```text
sidebar expandida
```

Mas lembrar a última escolha do usuário.

Se usuário colapsar:

```text
localStorage
```

pode guardar:

```text
ryano-sidebar-collapsed=true
```

Se o projeto já possui mecanismo de preferências, reutilizar.

---

# 9. Botão de colapso

Adicionar botão no topo da sidebar.

Expandida:

```text
RYVANO                   ‹
```

Colapsada:

```text
RY
                        ›
```

Preferência visual:

ícone:

```text
PanelLeftClose
PanelLeftOpen
```

ou equivalente da biblioteca existente.

Área clicável:

```text
40 × 40px
```

---

# 10. Sidebar expandida

Estrutura:

```text
┌──────────────────────┐
│ RYVANO            ‹  │
│                      │
│ ◉ Configuração       │
│                      │
│ ▦ Dashboard          │
│                      │
│ ⛓ Integrações       │
│                      │
│                      │
│                      │
│ [avatar] Samuel      │
└──────────────────────┘
```

---

# 11. Sidebar colapsada

Estrutura:

```text
┌──────────┐
│ RY    ›  │
│          │
│    ◉     │
│          │
│    ▦     │
│          │
│    ⛓     │
│          │
│          │
│ [avatar] │
└──────────┘
```

Esconder:

- labels;
- subtitles;
- nome completo;
- textos auxiliares.

Manter:

- ícones;
- active state;
- avatar;
- botão expandir.

---

# 12. Tooltip no modo colapsado

No hover/focus:

```text
Configuração
Dashboard
Integrações
```

Mostrar tooltip.

Não exibir tooltip em touch/mobile.

---

# 13. Animação do colapso

Usar Motion/Framer Motion se já existir.

Largura:

```text
240px → 76px
```

Spring:

```ts
{
  type: "spring",
  stiffness: 420,
  damping: 36,
  mass: 0.8
}
```

Tempo perceptivo:

```text
250–320ms
```

---

# 14. Animação dos textos

Ao colapsar:

```text
opacity 1 → 0
x 0 → -6px
```

Duração:

```text
120–160ms
```

Os textos devem desaparecer antes da sidebar terminar de fechar.

Ao expandir:

```text
opacity 0 → 1
x -6px → 0
```

com pequeno delay:

```text
80–100ms
```

---

# 15. Ícones não devem se mover bruscamente

Durante colapso, os ícones devem migrar suavemente para o centro.

Não desmontar os itens.

O mesmo item deve apenas mudar layout.

---

# 16. Altura do shell

O AppShell desktop deve ocupar exatamente a viewport.

Usar:

```css
height: 100dvh;
min-height: 0;
overflow: hidden;
```

NÃO usar no shell:

```text
min-h-screen
```

se isso permitir que o documento continue crescendo.

Preferir:

```text
h-dvh
```

---

# 17. Estrutura correta de scroll

Obrigatório:

```text
┌──────────────────────────────────────────┐
│ viewport = 100dvh                        │
│                                          │
│ ┌──────────┐ ┌────────────────────────┐  │
│ │ SIDEBAR  │ │ HEADER                 │  │
│ │          │ ├────────────────────────┤  │
│ │ fixa     │ │                        │  │
│ │          │ │ BODY                   │  │
│ │          │ │ ↑                      │  │
│ │          │ │ scroll                 │  │
│ │          │ │ ↓                      │  │
│ │          │ │                        │  │
│ └──────────┘ └────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

# 18. Scroll APENAS no conteúdo

Outer shell:

```css
.app-shell {
  height: 100dvh;
  overflow: hidden;
}
```

Grid/flex wrapper:

```css
.app-shell-layout {
  height: 100%;
  min-height: 0;

  display: flex;
}
```

Sidebar:

```css
.app-sidebar {
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
}
```

Content column:

```css
.app-content-column {
  flex: 1;
  min-width: 0;
  min-height: 0;

  display: flex;
  flex-direction: column;
}
```

Scrollable area:

```css
.app-page-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
```

---

# 19. Não permitir scroll no documento desktop

No shell autenticado desktop:

```text
body
```

não deve ser o responsável pelo scroll da página.

O scroll deve estar no:

```text
.app-page-scroll
```

Isso mantém sidebar estável.

---

# 20. Sidebar não deve possuir scroll normalmente

A sidebar possui poucos itens.

Portanto:

```css
overflow: hidden;
```

Se futuramente houver muitos itens:

```text
área central de navegação
```

pode usar `overflow-y:auto`, mantendo logo e perfil fixos.

Mas NÃO fazer sidebar inteira rolar junto com body.

---

# 21. Espaçamento externo

Hoje o shell usa margem/padding muito grande em alguns breakpoints.

Usar:

Desktop:

```text
padding: 16px
```

Large:

```text
padding: 20px
```

Gap entre sidebar e conteúdo:

```text
16px
```

Não usar gap de 24–32px sem necessidade.

---

# 22. Radius

Sidebar:

```text
24px
```

Header:

usar exatamente o radius da landing compartilhada.

Cards principais:

```text
24px
```

Cards internos:

```text
16–20px
```

Reduzir excesso atual de:

```text
28px
32px
```

em praticamente tudo.

---

# 23. Sidebar active item

Expandida:

```text
height mínimo: 52px
padding: 10px 12px
radius: 16px
```

Colapsada:

```text
48 × 48px
```

centralizado.

Não usar cards gigantes para cada item.

---

# 24. Remover subtitles desnecessárias do menu

Atual:

```text
Onboarding
Concluir ativação

Dashboard
Após concluir

Integrações
Garmin e WhatsApp
```

Isso torna o menu alto e pesado.

Mudar para:

```text
Configuração
Dashboard
Integrações
```

Se precisar mostrar status:

usar badge pequeno apenas quando útil.

---

# 25. Melhor nome para Onboarding

Na interface do usuário, preferir:

```text
Configuração inicial
```

ou:

```text
Complete seu perfil
```

No menu lateral, recomendação:

```text
Configuração
```

Título da página:

```text
Configure sua conta
```

Evitar usar "Onboarding" como principal palavra visível para usuário final.

---

# 26. Título atual da página

Remover:

```text
Onboarding
Concluir dados obrigatórios para ativar conta na V1.
```

Substituir por:

```text
Configure sua conta

Complete as informações abaixo para personalizar sua experiência e conectar seus treinos.
```

Nunca mostrar:

```text
V1
```

---

# 27. Card de progresso

Atual:

```text
Ativação da conta

Fluxo V1 com cinco etapas. A conta libera dashboard após dados básicos,
mas ativação completa inclui Garmin e WhatsApp.
```

Substituir por:

```text
Vamos deixar tudo pronto

Conclua estas etapas para aproveitar todos os recursos do RYVANO.
```

Badge:

```text
1 de 5 concluídas
```

---

# 28. Barra de progresso

Adicionar uma barra simples:

```text
████░░░░░░░░░░░░░░ 20%
```

Altura:

```text
6px
```

Radius:

```text
999px
```

Cor concluída:

accent da marca.

---

# 29. Cards de etapa

Hoje há cinco cards grandes em linha.

Simplificar.

Desktop:

```text
[✓ Conta] [2 Perfil] [3 Endereço] [4 Garmin] [5 WhatsApp]
```

Cada um deve ser compacto.

Altura aproximada:

```text
88–104px
```

Não usar descrições longas nos cards de navegação.

---

# 30. Copy dos cards de etapas

## 1 — Conta

```text
Nome e e-mail
```

## 2 — Perfil

```text
Telefone e dados físicos
```

## 3 — Endereço

```text
Onde você mora
```

## 4 — Garmin

```text
Conecte seus treinos
```

## 5 — WhatsApp

```text
Receba seus relatórios
```

Status:

```text
Concluído
Pendente
```

Não usar:

```text
OK
```

---

# 31. Seção dados pessoais

Substituir o texto atual por:

```text
Complete seu perfil

Essas informações ajudam o RYVANO a organizar sua conta e personalizar sua experiência.
```

Não mencionar Google nesse texto.

---

# 32. Etapa Conta

Substituir explicação técnica por:

```text
Confira seus dados básicos.
```

E-mail readonly:

```text
E-mail da sua conta
```

Não explicar tecnicamente por que está readonly.

---

# 33. Etapa Dados pessoais

Remover completamente textos com:

```text
server-side
E.164
```

Usar:

```text
Complete seus dados pessoais para continuar.
```

Telefone:

```text
(27) 99999-9999
```

A conversão para formato interno deve acontecer no sistema.

---

# 34. Altura e peso

Preferir:

```text
Altura
Peso
```

com suffix visual:

```text
cm
kg
```

---

# 35. Endereço

Título:

```text
Seu endereço
```

Descrição:

```text
Informe onde você mora.
```

Se preenchimento por CEP já existir, reutilizar.

Não criar API nova sem necessidade.

---

# 36. Botão salvar dados

Remover:

```text
Salvar etapas 1 a 3
```

Usar:

```text
Salvar e continuar
```

---

# 37. Garmin

Título:

```text
Conecte seu Garmin
```

Descrição:

```text
Sincronize suas atividades para que o RYVANO acompanhe seus treinos automaticamente.
```

Remover da UI:

```text
validar credenciais
V1
integração principal
sync inicial
```

---

# 38. Card de orientação Garmin

Usar:

```text
Use o mesmo e-mail e senha da sua conta Garmin Connect.
```

Opcional, somente se verdadeiro:

```text
Seus dados de acesso são usados somente para realizar a conexão.
```

Não mostrar mensagens sobre logs, servidor ou implementação.

---

# 39. Status Garmin

```text
Garmin não conectado
```

Depois:

```text
Garmin conectado
```

Botões:

```text
Conectar Garmin
Sincronizar atividades
Desconectar
```

Mostrar ações somente quando fizerem sentido para o estado atual.

---

# 40. WhatsApp

Título:

```text
Ative seus relatórios no WhatsApp
```

Descrição:

```text
Confirme seu número para receber os resumos dos seus treinos.
```

Remover completamente:

```text
webhook
```

---

# 41. Fluxo WhatsApp

Mostrar de forma simples:

```text
1. Confirme seu número
2. Abra o WhatsApp
3. Envie a mensagem de confirmação
4. Pronto
```

Status:

```text
Aguardando confirmação
```

Depois:

```text
WhatsApp conectado
```

Botão:

```text
Confirmar pelo WhatsApp
```

---

# 42. Transformar onboarding em wizard

A página atual é longa demais porque empilha todas as etapas.

Preferir:

```text
[Conta] [Perfil] [Endereço] [Garmin] [WhatsApp]

                ↓

      conteúdo da etapa ativa
```

Mostrar apenas UMA etapa principal por vez.

Dados já concluídos podem ser revisitados.

---

# 43. Fluxo

```text
Conta
  ↓
Perfil
  ↓
Endereço
  ↓
Garmin
  ↓
WhatsApp
  ↓
Concluir
```

Não usar anchors como principal navegação se não forem necessários.

---

# 44. Usuário autenticado por Google

Se Nome e E-mail já existem:

```text
✓ Conta
```

e permitir edição opcional.

Não pedir os mesmos dados novamente.

---

# 45. Responsividade

## Desktop >= 1024px

```text
sidebar
+
header
+
content scroll interno
```

## Tablet/mobile < 1024px

usar MobileDock existente.

Não manter sidebar desktop apertada em tablet.

Não refazer MobileDock.

---

# 46. Scroll mobile

No mobile pode continuar usando o scroll natural da página.

Evitar nested scroll.

A regra de scroll isolado é obrigatória no desktop.

---

# 47. Textos proibidos na UI final

Não deixar visível:

```text
V1
server-side
E.164
webhook
sync inicial
validar credenciais
integração principal
fluxo autenticado
App autenticado
Base pendente
```

---

# 48. Critérios de aceite — Header

- [ ] usa o mesmo componente/base da landing;
- [ ] mesma linguagem visual;
- [ ] remove "App autenticado";
- [ ] usuário aparece de forma compacta;
- [ ] header permanece sticky;
- [ ] não existe duplicação de componente.

---

# 49. Critérios de aceite — Sidebar

- [ ] expandida ~240px;
- [ ] colapsada ~76px;
- [ ] botão colapsar/expandir;
- [ ] animação suave;
- [ ] tooltips colapsada;
- [ ] sidebar não cresce com conteúdo;
- [ ] sidebar não rola junto com a página;
- [ ] estado persistido quando possível.

---

# 50. Critérios de aceite — Scroll

- [ ] AppShell usa `100dvh`;
- [ ] outer shell usa `overflow:hidden`;
- [ ] content column usa `min-height:0`;
- [ ] somente conteúdo usa `overflow-y:auto`;
- [ ] sidebar fica parada;
- [ ] header fica sticky;
- [ ] sem double-scroll;
- [ ] sem scrollbar horizontal.

---

# 51. Critérios de aceite — Copy

- [ ] remove V1;
- [ ] remove server-side;
- [ ] remove E.164;
- [ ] remove webhook;
- [ ] remove linguagem de implementação;
- [ ] títulos orientados ao usuário;
- [ ] botões claros;
- [ ] "Onboarding" não é o título principal.

---

# 52. Testes desktop

Validar em:

```text
1366×768
1440×900
1920×1080
```

Em todos:

- sidebar inteira visível;
- sidebar não cresce;
- conteúdo possui único scroll;
- header continua visível;
- collapse funciona;
- formulários não ficam largos demais.

---

# 53. Teste de scroll

Com conteúdo longo:

1. rolar até o final;
2. sidebar deve continuar exatamente na mesma posição;
3. header deve continuar sticky;
4. documento externo não deve rolar;
5. não pode haver segunda scrollbar.

---

# 54. Estrutura conceitual

```tsx
<AppShell>
  <DesktopSidebar />

  <AppContent>
    <SharedLandingHeader authenticated />

    <PageScrollArea>
      {children}
    </PageScrollArea>
  </AppContent>

  <MobileDock />
</AppShell>
```

Adaptar à arquitetura existente.

---

# 55. Não fazer

NÃO:

- copiar o header da landing;
- manter `w-72`;
- deixar sidebar crescer com conteúdo;
- criar double-scroll;
- colocar scroll simultâneo em body + main;
- usar textos técnicos;
- manter cinco seções gigantes empilhadas se puder usar wizard;
- reimplementar MobileDock;
- duplicar navegação.

---

# 56. Resultado esperado

```text
┌────────────┬──────────────────────────────────────────┐
│            │ HEADER IGUAL À LANDING                  │
│ SIDEBAR    ├──────────────────────────────────────────┤
│            │                                          │
│ 240px      │ CONTEÚDO                                │
│ ou         │                                          │
│ 76px       │ APENAS ESTA ÁREA POSSUI SCROLL          │
│            │                                          │
│            │                                          │
└────────────┴──────────────────────────────────────────┘
```

A sidebar deve parecer compacta e permanente.

A identidade visual deve ser contínua entre:

```text
landing
autenticação
onboarding
dashboard
```

e não parecer que cada área foi criada como um produto diferente.
