# Redesign — Tela de Integrações | RYVANO

## Objetivo

Redesenhar **somente o conteúdo central da tela `/app/integracoes`**, tornando a experiência mais clara, premium, visual e orientada a ação.

> **Não alterar a sidebar, header, navegação global ou dock mobile existentes.**

A nova tela deve comunicar rapidamente:

1. Quais integrações estão conectadas.
2. Se estão funcionando corretamente.
3. Quando ocorreu a última sincronização.
4. O que o usuário precisa fazer quando existir algum problema.
5. Quais relatórios/mensagens automáticas estão ativos.
6. Quais integrações estarão disponíveis futuramente.

---

# 1. Problemas da tela atual

## 1.1 Hierarquia visual fraca

Atualmente Garmin, WhatsApp, preferências de envio e integrações futuras possuem peso visual muito parecido.

Isso dificulta identificar o que é mais importante.

### Corrigir

Criar três níveis claros:

- **Nível 1:** visão geral das conexões.
- **Nível 2:** integrações ativas e suas ações.
- **Nível 3:** preferências e integrações futuras.

---

## 1.2 Estado contraditório do Garmin

A tela pode informar simultaneamente:

- `Garmin conectado`
- `Status: Conectado`
- `Sincronização: CONNECTED`
- texto solicitando que o usuário conecte sua conta.

### Corrigir

O conteúdo deve depender exclusivamente do estado real.

### Estado conectado

Mostrar:

> Garmin conectado e sincronizando seus treinos automaticamente.

### Estado desconectado

Mostrar:

> Conecte sua conta Garmin para importar seus treinos automaticamente para a RYVANO.

Nunca mostrar os dois estados ao mesmo tempo.

---

## 1.3 Erros técnicos expostos para o cliente

Não exibir diretamente mensagens como:

```text
GARMIN_SYNC_429
login strategies rate limited
HTTP 403
non-JSON
```

Essas informações são úteis para logs, não para a interface do cliente.

### Substituir por mensagem amigável

**Título:**

> Não foi possível sincronizar agora

**Descrição:**

> A Garmin recusou temporariamente uma nova tentativa de conexão. Seus dados continuam salvos e tentaremos novamente automaticamente.

**Ações:**

- `Tentar novamente`
- `Ver detalhes`

O botão **Ver detalhes** pode abrir um disclosure/modal com:

- código interno do erro;
- data e hora;
- ID da tentativa;
- orientação de suporte.

O erro técnico completo deve continuar disponível somente para suporte/logs.

---

## 1.4 Informações técnicas demais

Não mostrar `CONNECTED` se o usuário já vê `Conectado`.

Também não usar UTC como informação principal para configuração de horário.

### Usar

> Horário de Brasília (GMT-3)

ou, preferencialmente:

> Seu horário local

A aplicação deve converter internamente para UTC.

---

## 1.5 Preferências de mensagens estão dentro do Garmin

Atualmente opções como:

- Mensageria habilitada
- Relatório após atividade
- Resumo diário
- Horário do resumo

ficam visualmente associadas ao Garmin.

Isso está conceitualmente errado porque elas controlam **como a RYVANO se comunica com o atleta**, principalmente via WhatsApp.

### Corrigir

Criar uma seção independente:

# Automações RYVANO

Ela deve ficar abaixo das integrações conectadas.

---

# 2. Nova arquitetura da tela

Estrutura recomendada:

```text
CONTEÚDO CENTRAL
│
├── Intro da página
│   ├── Integrações
│   └── descrição curta
│
├── Resumo das conexões
│   ├── Garmin conectado
│   ├── WhatsApp conectado
│   └── Automações ativas
│
├── Integrações conectadas
│   ├── Garmin
│   └── WhatsApp
│
├── Automações RYVANO
│   ├── Relatório após atividade
│   ├── Resumo diário
│   └── Horário de envio
│
└── Próximas integrações
    ├── Apple Watch
    ├── Polar
    ├── COROS
    ├── Suunto
    └── Fitbit
```

---

# 3. Cabeçalho interno da página

> Este é o cabeçalho do **conteúdo da página**, não o header global da aplicação.

## Conteúdo

### Eyebrow

`CONEXÕES E AUTOMAÇÕES`

### Título

# Integrações

### Descrição

> Conecte seus dispositivos e escolha como a RYVANO acompanha seus treinos e envia seus insights.

### Status geral à direita

Badge:

`● Tudo funcionando`

Quando houver falha:

`● 1 integração requer atenção`

---

# 4. Resumo das conexões

Logo abaixo da introdução, criar uma faixa com **3 cards compactos**.

## Card 1 — Garmin

Ícone/logo Garmin.

**Label:**

`GARMIN`

**Valor:**

`Conectado`

**Informação secundária:**

`Sincronizado há 18 min`

Indicador visual verde.

---

## Card 2 — WhatsApp

Ícone WhatsApp.

**Label:**

`WHATSAPP`

**Valor:**

`Ativo`

**Informação secundária:**

`Número confirmado`

Indicador visual verde WhatsApp.

---

## Card 3 — Automações

Ícone de raio / sparkle / automation.

**Label:**

`AUTOMAÇÕES`

**Valor:**

`1 de 2 ativas`

**Informação secundária:**

`Relatório pós-treino ativo`

Indicador visual cyan/azul.

---

# 5. Seção — Integrações conectadas

Título:

## Suas conexões

Descrição:

> Seus serviços conectados à RYVANO e o status de sincronização de cada um.

Layout desktop:

```text
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ GARMIN                       │ │ WHATSAPP                     │
│ ● Conectado                  │ │ ● Conectado                  │
│                              │ │                              │
│ Última sincronização         │ │ Número confirmado           │
│ Hoje, 14:46                  │ │ ••••• •••• 8088              │
│                              │ │                              │
│ [Sincronizar agora]          │ │ [Testar mensagem]           │
│ [⋯]                          │ │ [Gerenciar]                  │
└──────────────────────────────┘ └──────────────────────────────┘
```

Mobile: uma coluna.

---

# 6. Card Garmin

O Garmin é uma integração de **entrada de dados**. O card deve enfatizar sincronização.

## Header do card

À esquerda:

- logo Garmin;
- `Garmin`;
- subtítulo `Treinos e métricas`.

À direita:

Badge:

`● Conectado`

---

## Corpo

### Última sincronização

Valor principal:

`Hoje, 14:46`

Texto secundário:

`Seus treinos são sincronizados automaticamente.`

### Última atividade importada

Caso exista dado disponível:

`Natação em piscina`

`1,7 km • 40min 55s`

Isso conecta a integração diretamente ao benefício percebido pelo usuário.

### Status da sincronização

Evitar outro card simplesmente dizendo `CONNECTED`.

Usar uma timeline curta:

```text
● Garmin conectada
│
● Última sincronização concluída
│  Hoje, 14:46
│
● Próxima sincronização automática
   Ativa
```

---

## Ações Garmin

### Primária

`Sincronizar agora`

Com ícone `RefreshCw`.

### Secundária

Menu `•••` contendo:

- Reconectar Garmin
- Ver detalhes da conexão
- Desconectar Garmin

**Desconectar** nunca deve competir visualmente com a ação principal.

Usar cor vermelha somente dentro do menu/modal de confirmação.

---

## Estado durante sincronização

Botão muda para:

`Sincronizando...`

Adicionar spinner ou ícone girando.

Não bloquear a tela inteira.

Após sucesso:

Toast:

> Garmin sincronizada com sucesso.

Subtexto:

> Seus treinos estão atualizados.

---

## Estado de erro

Dentro do card, apresentar um banner compacto amber/vermelho suave:

### Não foi possível atualizar o Garmin

> Tivemos uma falha temporária ao conversar com a Garmin. Seus dados anteriores continuam disponíveis.

Ações:

`Tentar novamente`

`Ver detalhes`

Nunca renderizar stack trace, HTTP code ou mensagem bruta como texto principal.

---

# 7. Card WhatsApp

O WhatsApp é uma integração de **saída/comunicação**.

## Header

- ícone oficial/compatível do WhatsApp;
- `WhatsApp`;
- subtítulo `Relatórios e alertas`;
- badge `● Conectado`.

Usar verde do WhatsApp somente como accent, não como fundo completo do card.

---

## Informações

### Número conectado

Não mostrar o número completo.

Usar:

`+55 (27) •••••-8088`

### Status

`Número confirmado`

### Último envio

Se disponível:

`Hoje, 08:12`

ou:

`Nenhuma mensagem enviada ainda`

---

## Ações

Primária:

`Enviar mensagem de teste`

Secundária:

`Gerenciar WhatsApp`

Menu secundário:

- Trocar número
- Reconectar
- Desconectar

---

## Não mostrar tutorial quando já conectado

O passo a passo atual:

1. Confirme seu número
2. Abra o WhatsApp
3. Envie a mensagem de confirmação
4. Pronto

só deve aparecer durante **onboarding/desconectado**.

Quando conectado, substituir por informações de status e uso real.

---

# 8. Nova seção — Automações RYVANO

Esta seção deve ser independente de Garmin e WhatsApp.

## Cabeçalho

### Automações RYVANO

> Escolha quando a RYVANO deve analisar seus treinos e enviar informações para você.

À direita:

Badge opcional:

`1 ativa`

---

## Automação 1 — Relatório pós-treino

Card horizontal.

Ícone: `Activity` / `Sparkles`.

Título:

`Relatório após cada atividade`

Descrição:

> Receba uma análise no WhatsApp assim que um novo treino for sincronizado.

Controle:

Toggle grande.

Estado atual:

`Ativo`

Quando ligado, utilizar glow/accent cyan ou verde suave.

---

## Automação 2 — Resumo diário

Título:

`Resumo diário`

Descrição:

> Receba um resumo do seu dia com atividades, evolução e principais indicadores.

Toggle.

Quando ativado, revelar com animação:

### Horário de envio

Input de horário:

`18:00`

Texto auxiliar:

> Enviado no seu horário local.

Nunca exibir UTC como configuração principal.

---

## Mensageria habilitada

Não manter `Mensageria habilitada` como checkbox técnico visível para o usuário.

Se essa configuração for realmente necessária, transformar em controle mestre:

### Receber mensagens da RYVANO

Descrição:

> Permite que a RYVANO envie seus relatórios e alertas pelo WhatsApp.

Toggle.

Se desligado, os toggles dependentes devem ficar visualmente desabilitados.

---

## Salvamento

Preferir **auto-save** para toggles.

Feedback:

`✓ Preferência atualizada`

Se não for possível usar auto-save, botão único no final:

`Salvar preferências`

Não usar `Salvar preferências Garmin`, porque essas opções pertencem à RYVANO/WhatsApp, não ao Garmin.

---

# 9. Próximas integrações

Trocar a seção genérica `Em breve` por algo mais comercial e visual.

## Título

### Mais integrações estão chegando

Descrição:

> Estamos expandindo a RYVANO para conectar os principais dispositivos esportivos.

---

## Cards

Criar cards para:

- Apple Watch
- Polar
- COROS
- Suunto
- Fitbit

Cada card deve conter:

- ícone/logo;
- nome;
- badge `Em breve`;
- pequena descrição;
- hover visual.

Exemplo:

```text
┌───────────────────────┐
│                      │
│ Apple Watch           │
│ Saúde e atividades    │
│                       │
│ [Em breve]            │
└───────────────────────┘
```

Opcional:

`Quero ser avisado`

Isso pode abrir uma ação simples de interesse/lista de espera.

---

# 10. Direção visual

A tela atual já utiliza dark mode + glassmorphism. Manter a identidade, mas aumentar contraste e diferenciação entre blocos.

## Background

Manter o fundo escuro/aurora existente.

Não criar grandes blocos sólidos que eliminem a profundidade da aplicação.

---

## Cards principais

Usar algo próximo de:

```css
background: rgba(255, 255, 255, 0.045);
border: 1px solid rgba(255, 255, 255, 0.09);
box-shadow:
  inset 0 1px 0 rgba(255,255,255,.06),
  0 18px 40px rgba(0,0,0,.12);
backdrop-filter: blur(18px);
border-radius: 24px;
```

Hover:

```css
background: rgba(255, 255, 255, 0.065);
border-color: rgba(255, 255, 255, 0.14);
```

---

# 11. Sistema de cores

Não deixar toda a interface somente cinza/branca.

Usar cores semanticamente.

## Accent RYVANO

Cyan / teal:

```text
#38BDF8
#22D3EE
#2DD4BF
```

Usar em:

- CTAs principais;
- automações;
- indicadores ativos;
- pequenos highlights;
- foco.

---

## Sucesso

```text
#22C55E
```

Uso:

- conectado;
- sincronizado;
- confirmação.

---

## WhatsApp

```text
#25D366
```

Uso apenas como accent do card/icon/status.

---

## Atenção

```text
#F59E0B
```

Uso:

- sincronização atrasada;
- ação necessária;
- aviso temporário.

---

## Erro

```text
#EF4444
```

Usar somente para falhas reais e ações destrutivas.

---

# 12. Tipografia e hierarquia

Manter Geist existente.

## Título da página

```text
font-size: 28–32px
font-weight: 650–700
letter-spacing: -0.03em
```

## Título de seção

```text
20–22px
font-weight: 600
```

## Título do card

```text
16–18px
font-weight: 600
```

## Métrica/status principal

```text
18–22px
font-weight: 650
```

## Label

```text
12–13px
font-weight: 500
opacity: .55–.68
```

Evitar grandes quantidades de texto em `14px` com a mesma cor e peso.

---

# 13. Ícones

Preferir `lucide-react` ou o conjunto já utilizado no projeto.

Sugestões:

- Garmin: logo/ícone próprio
- WhatsApp: `BrandWhatsapp` se Tabler já estiver instalado
- Sync: `RefreshCw`
- Automação: `Zap` ou `Sparkles`
- Relatório: `ChartNoAxesCombined`
- Sucesso: `CircleCheck`
- Aviso: `TriangleAlert`
- Horário: `Clock3`
- Dispositivo: `Watch`
- Menu: `Ellipsis`

Não usar emojis como ícones de interface.

---

# 14. Motion / microinterações

Usar **Motion** para dar sensação premium sem exagero.

Se o projeto estiver usando a biblioteca atual `motion`, preferir:

```tsx
import { motion, AnimatePresence } from "motion/react";
```

---

## Entrada das seções

```tsx
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.3 }}
```

Aplicar stagger leve nos cards.

```tsx
transition={{
  duration: 0.32,
  delay: index * 0.05,
}}
```

---

## Hover dos cards

```tsx
whileHover={{ y: -2 }}
transition={{ duration: 0.18 }}
```

Não usar escalas grandes.

---

## Botões

```tsx
whileTap={{ scale: 0.98 }}
```

---

## Status conectado

Ao carregar:

- ponto verde entra com fade/scale;
- pequeno glow estático;
- evitar pulse infinito chamativo.

---

## Sincronização

Durante sync:

- `RefreshCw` rotaciona continuamente;
- label passa para `Sincronizando...`;
- após concluir, usar `AnimatePresence` para trocar pelo check.

---

## Toggles / configurações condicionais

Ao ativar `Resumo diário`, revelar o horário com:

```tsx
initial={{ opacity: 0, height: 0, y: -4 }}
animate={{ opacity: 1, height: "auto", y: 0 }}
exit={{ opacity: 0, height: 0, y: -4 }}
```

---

# 15. Estados obrigatórios

A implementação não deve desenhar apenas o estado feliz.

Criar estados para:

## Garmin

- conectado;
- desconectado;
- conectando;
- sincronizando;
- sincronizado;
- erro temporário;
- autenticação expirada.

## WhatsApp

- conectado;
- não confirmado;
- aguardando confirmação;
- desconectado;
- erro.

## Automações

- ativo;
- inativo;
- salvando;
- salvo;
- erro ao salvar.

---

# 16. Empty states

## Garmin desconectado

```text
Garmin
Importe seus treinos automaticamente.

Conecte sua conta Garmin e deixe a RYVANO acompanhar suas atividades sem precisar enviar nada manualmente.

[Conectar Garmin]
```

---

## WhatsApp desconectado

```text
WhatsApp
Receba seus insights onde você já conversa todos os dias.

Conecte seu número para receber análises de treino, resumos e alertas.

[Conectar WhatsApp]
```

---

# 17. Mensagens e textos recomendados

## Sucesso Garmin

**Garmin conectada**

> Seus treinos serão importados automaticamente.

---

## Sync concluído

**Tudo atualizado**

> A última sincronização foi concluída agora.

---

## Sync com problema

**Não conseguimos atualizar agora**

> Sua conexão continua ativa. Vamos tentar novamente automaticamente.

---

## WhatsApp conectado

**WhatsApp conectado**

> Seus relatórios e alertas podem ser enviados para este número.

---

## Preferência salva

**Preferência atualizada**

> A próxima mensagem seguirá essa configuração.

---

# 18. Privacidade

Não exibir telefone completo em uma tela de configurações quando não for necessário.

Preferir:

```text
+55 (27) •••••-8088
```

Para revelar o número completo, exigir ação explícita se isso realmente for necessário.

---

# 19. Responsividade

## Desktop ≥ 1280px

```text
Resumo: 3 colunas
Conexões: 2 colunas
Automações: 2 cards / linhas
Próximas integrações: 4–5 colunas
```

## Tablet

```text
Resumo: 3 colunas ou wrap
Conexões: 2 colunas
Próximas integrações: 2 colunas
```

## Mobile

Tudo em 1 coluna.

Prioridades mobile:

1. status;
2. última sincronização;
3. ação principal;
4. configurações.

Não utilizar tabelas horizontais.

---

# 20. Espaçamento

Utilizar um sistema consistente:

```text
4px   micro
8px   ícone/texto
12px  elementos internos
16px  padrão
20px  grupos
24px  cards
32px  seções
```

Desktop deve evitar padding excessivo para não desperdiçar altura útil.

---

# 21. Bordas

Manter linguagem arredondada atual, porém com hierarquia:

```text
Container principal: 24px
Card: 22–24px
Card interno: 18–20px
Input: 14–16px
Button: 14–16px ou pill quando fizer sentido
Badge: 999px
```

Evitar deixar **todos** os elementos com raio 20–24px, pois isso reduz hierarquia visual.

---

# 22. Botões

## Primário

Gradient/accent RYVANO discreto.

Exemplo visual:

```text
[Circular sync icon] Sincronizar agora
```

## Secundário

Glass neutro.

## Destrutivo

Não deixar `Desconectar Garmin` sempre vermelho e visível ao lado do botão primário.

Mover para menu `•••` e pedir confirmação.

---

# 23. Modal de desconexão

Título:

### Desconectar Garmin?

Texto:

> Novos treinos deixarão de ser sincronizados. As atividades já importadas permanecerão na sua conta.

Ações:

`Cancelar`

`Desconectar Garmin`

Somente o botão destrutivo deve usar vermelho.

---

# 24. Sugestão de composição final

```text
┌──────────────────────────────────────────────────────────────────────┐
│ CONEXÕES E AUTOMAÇÕES                                               │
│ Integrações                                      ● Tudo funcionando  │
│ Conecte seus dispositivos e escolha como receber seus insights.     │
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ GARMIN          │ │ WHATSAPP        │ │ AUTOMAÇÕES      │
│ ● Conectado     │ │ ● Ativo         │ │ 1 de 2 ativas   │
│ há 18 min       │ │ Nº confirmado   │ │ Pós-treino ON   │
└─────────────────┘ └─────────────────┘ └─────────────────┘

Suas conexões

┌────────────────────────────────┐ ┌────────────────────────────────┐
│ GARMIN              ● Conectado│ │ WHATSAPP          ● Conectado │
│ Treinos e métricas             │ │ Relatórios e alertas          │
│                                │ │                               │
│ Última sincronização           │ │ Número conectado              │
│ Hoje, 14:46                    │ │ +55 (27) •••••-8088           │
│                                │ │                               │
│ Última atividade               │ │ Último envio                  │
│ Natação • 1,7 km • 40min       │ │ Hoje, 08:12                   │
│                                │ │                               │
│ [↻ Sincronizar agora]      [•••]│ │ [Enviar teste] [Gerenciar]   │
└────────────────────────────────┘ └────────────────────────────────┘

Automações RYVANO
┌──────────────────────────────────────────────────────────────────────┐
│ ⚡ Relatório após cada atividade                      [ ON ]         │
│ Receba uma análise assim que seu treino for sincronizado.           │
├──────────────────────────────────────────────────────────────────────┤
│ ◷ Resumo diário                                      [ OFF ]        │
│ Receba um resumo diário das suas atividades e evolução.             │
└──────────────────────────────────────────────────────────────────────┘

Mais integrações estão chegando

┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐
│ Apple      │ │ Polar      │ │ COROS      │ │ Suunto     │ │ Fitbit   │
│ Em breve   │ │ Em breve   │ │ Em breve   │ │ Em breve   │ │ Em breve │
└────────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────┘
```

---

# 25. Componentização sugerida

```text
IntegrationsPage
├── IntegrationsIntro
├── IntegrationSummaryGrid
│   ├── ConnectionSummaryCard
│   ├── ConnectionSummaryCard
│   └── AutomationSummaryCard
├── ConnectedIntegrationsSection
│   ├── GarminIntegrationCard
│   └── WhatsAppIntegrationCard
├── AutomationsSection
│   ├── AutomationToggleCard
│   ├── AutomationToggleCard
│   └── DeliveryTimeField
├── UpcomingIntegrationsSection
│   └── UpcomingIntegrationCard[]
├── IntegrationErrorBanner
├── ConnectionDetailsModal
└── DisconnectIntegrationDialog
```

---

# 26. Dados necessários para os componentes

Criar uma representação consistente de estado.

Exemplo:

```ts
type IntegrationStatus =
  | "connected"
  | "syncing"
  | "disconnected"
  | "warning"
  | "error";

type Integration = {
  id: string;
  name: string;
  status: IntegrationStatus;
  lastSyncAt?: string;
  lastSuccessAt?: string;
  lastActivity?: {
    name: string;
    distance?: string;
    duration?: string;
  };
  error?: {
    userMessage: string;
    internalCode?: string;
  };
};
```

Nunca usar diretamente a mensagem bruta retornada pelo backend como `userMessage`.

---

# 27. Acessibilidade

- Contraste mínimo adequado para textos secundários.
- Focus ring visível em todos os elementos interativos.
- Não comunicar status apenas por cor.
- Badge deve conter texto `Conectado`, `Erro`, `Sincronizando` etc.
- Toggles devem possuir label acessível.
- Loading deve usar `aria-busy` quando aplicável.
- Toasts importantes devem usar região `aria-live`.
- Respeitar `prefers-reduced-motion`.

---

# 28. Critérios de aceite

A tela só deve ser considerada finalizada se:

- [ ] Sidebar permanece intacta.
- [ ] Header global permanece intacto.
- [ ] Conteúdo central possui hierarquia visual clara.
- [ ] Garmin e WhatsApp possuem cards distintos.
- [ ] Estado conectado/desconectado não gera textos contraditórios.
- [ ] Nenhum erro técnico bruto aparece para o cliente.
- [ ] `CONNECTED` foi substituído por texto humano.
- [ ] Telefone é mascarado.
- [ ] Preferências de mensagens foram removidas do card Garmin.
- [ ] Existe seção independente de Automações RYVANO.
- [ ] Horário é mostrado no fuso local do usuário.
- [ ] Ações destrutivas não competem com CTAs primários.
- [ ] Existe feedback de loading, sucesso e erro.
- [ ] Motion é usado de maneira sutil nos principais estados e transições.
- [ ] Existem estados connected/loading/error/disconnected.
- [ ] Layout funciona em desktop, tablet e mobile.
- [ ] Integrações futuras possuem tratamento visual melhor que simples caixas de texto.
- [ ] A interface mantém dark mode/glass/aurora da identidade atual.
- [ ] Cores são usadas semanticamente e não apenas decorativamente.

---

# 29. Prioridade de implementação

## P0 — obrigatório

1. Corrigir estados contraditórios.
2. Remover erro técnico bruto da UI.
3. Separar Garmin, WhatsApp e Automações.
4. Mascarar telefone.
5. Corrigir UTC para horário local.
6. Melhorar hierarquia visual.
7. Criar estados de loading/sucesso/erro.

## P1 — alto impacto visual

1. Summary cards.
2. Card Garmin redesenhado.
3. Card WhatsApp redesenhado.
4. Toggles modernos.
5. Motion.
6. Toasts.

## P2 — acabamento

1. Cards de integrações futuras.
2. Timeline Garmin.
3. Última atividade importada.
4. Último envio WhatsApp.
5. Modal de detalhes técnicos.
6. Lista de interesse para integrações futuras.

---

# 30. Resultado esperado

A nova tela deve deixar de parecer uma **página técnica de configurações** e passar a parecer uma **central de conexões da RYVANO**.

O usuário deve conseguir responder em poucos segundos:

- Meu Garmin está conectado?
- Está sincronizando corretamente?
- Quando foi atualizado pela última vez?
- Meu WhatsApp está funcionando?
- Quais mensagens vou receber?
- Em qual horário?
- Existe alguma coisa que exige minha atenção?

O foco deve ser sempre no benefício ao atleta, e não na infraestrutura por trás da integração.
