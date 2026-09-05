# Ryvano Brain V1 — Guia de Implementação para Agentes de IA

> Documento de implementação.
>
> Este arquivo deve ser entregue para a LLM/agente responsável por alterar o repositório da Ryvano.
> A implementação deve ser feita sobre o código real existente no repositório, sem inventar módulos, arquivos, rotas ou dependências.
>
> Objetivo principal: fazer com que qualquer agente de IA consiga entender **onde alterar**, **o que pode ser impactado** e **quais regras arquiteturais precisam ser respeitadas** antes de modificar a Ryvano.

---

# 1. Objetivo

A Ryvano precisa possuir uma camada permanente de conhecimento arquitetural — o **Ryvano Brain**.

Hoje existe documentação em arquivos `.md`, porém o agente ainda depende de instruções manuais como:

- "leia o project-map.md";
- "verifique também Garmin";
- "isso pode impactar Strava";
- "confira o relatório";
- "veja se a mudança afeta o WhatsApp";
- "não esqueça o dashboard";
- "consulte a documentação oficial".

Isso não deve depender do usuário.

A V1 deve fazer o agente trabalhar seguindo este fluxo:

```text
pedido
  ↓
identificar domínio
  ↓
consultar Ryvano Brain
  ↓
consultar grafo do código
  ↓
localizar owner/responsável
  ↓
calcular blast radius
  ↓
consultar regras arquiteturais
  ↓
selecionar o menor conjunto de arquivos
  ↓
implementar
  ↓
executar testes
  ↓
analisar impacto do diff
  ↓
finalizar
```

O agente deve deixar de trabalhar por busca textual aleatória e passar a trabalhar por:

- responsabilidade;
- dependência;
- fluxo;
- contrato;
- impacto;
- regra arquitetural;
- evidência do código real.

---

# 2. Resultado esperado

Após a implementação da V1, um pedido como:

```text
Adicionar suporte a uma nova modalidade esportiva.
```

não deve começar diretamente editando um parser.

O agente deve primeiro descobrir:

```text
RyvanoSportType
    ↓
normalização
    ↓
Garmin parser
    ↓
Strava parser
    ↓
activity presentation
    ↓
dashboard
    ↓
detalhe de atividade
    ↓
reports
    ↓
WhatsApp
    ↓
reconciliation
    ↓
tests
```

O mesmo vale para alterações em:

- autenticação;
- banco;
- integrações;
- Garmin;
- Strava;
- atividades;
- relatórios;
- WhatsApp;
- Evolution;
- jobs;
- segurança;
- dashboard;
- páginas administrativas;
- APIs;
- schemas;
- regras de negócio.

A LLM deve sempre descobrir o impacto antes de alterar o código.

---

# 3. Escopo da V1

A V1 deve utilizar quatro elementos:

```text
GitNexus
+
AGENTS.md
+
architecture/
+
código real da Ryvano
```

A V1 NÃO deve adicionar neste momento:

- Graphiti;
- Neo4j;
- FalkorDB;
- Serena;
- banco vetorial externo;
- RAG remoto;
- serviço próprio de embeddings;
- serviço SaaS obrigatório;
- infraestrutura adicional em produção.

Esses itens podem entrar em versões futuras.

A prioridade da V1 é:

> máximo ganho de contexto com o mínimo de infraestrutura nova.

---

# 4. Princípio central

Existem dois tipos diferentes de conhecimento.

## 4.1 Conhecimento descoberto automaticamente

O GitNexus deve representar a realidade atual do código:

- arquivos;
- imports;
- chamadas;
- símbolos;
- classes;
- funções;
- interfaces;
- dependências;
- fluxos;
- referências;
- rotas;
- consumidores;
- blast radius.

Esse conhecimento NÃO deve ser duplicado manualmente em dezenas de documentos.

---

## 4.2 Conhecimento que o código sozinho não consegue explicar

A pasta `architecture/` deve guardar:

- decisões arquiteturais;
- responsabilidades dos módulos;
- invariantes;
- regras de negócio;
- regras entre providers;
- contratos;
- limites entre domínios;
- decisões históricas importantes;
- comportamento esperado;
- restrições de segurança;
- intenção arquitetural.

Exemplo:

```text
"Nunca fazer merge automático de Garmin e Strava."
```

Essa regra pode não ser inferida de forma confiável apenas analisando imports.

Ela deve existir explicitamente no Ryvano Brain.

---

# 5. Regra fundamental da implementação

Antes de criar qualquer arquivo, o agente deve analisar o repositório atual.

NÃO assumir que um caminho existe somente porque este documento menciona esse caminho.

Sempre:

1. listar a estrutura real;
2. localizar os arquivos existentes;
3. localizar o `project-map.md` atual;
4. analisar `package.json`;
5. analisar `.gitignore`;
6. localizar `AGENTS.md`, caso exista;
7. localizar `CLAUDE.md`, caso exista;
8. identificar ferramentas de IA já configuradas;
9. localizar módulos Garmin e Strava reais;
10. localizar `modules/shared`;
11. localizar Prisma;
12. localizar APIs;
13. localizar testes;
14. somente depois criar ou modificar arquivos.

Se a estrutura real divergir deste documento, adaptar a implementação preservando a intenção arquitetural.

---

# 6. GitNexus

GitNexus será o **grafo estrutural do código** da V1.

Ele deve ser usado para responder perguntas como:

- quem usa este símbolo?
- quem importa este módulo?
- qual fluxo passa por este serviço?
- esta alteração pode quebrar quais consumidores?
- qual API é consumida por quais componentes?
- quais processos foram impactados pelo meu diff?
- qual é o caminho entre duas partes do sistema?

---

# 7. Instalação do GitNexus

Antes da instalação, verificar a documentação oficial atual.

Referência oficial usada na criação deste documento:

- https://github.com/nxpatterns/gitnexus
- https://www.npmjs.com/package/gitnexus

A documentação atual indica como fluxo principal:

```bash
npx gitnexus@latest analyze
npx gitnexus@latest setup
```

Também existe a opção global:

```bash
npm install -g gitnexus@latest
gitnexus analyze
gitnexus setup
```

O agente deve preferir a versão estável atual.

Não fixar uma versão arbitrária sem necessidade.

---

# 8. Primeiro index

Executar a partir da raiz da Ryvano:

```bash
npx gitnexus@latest analyze
```

Em seguida:

```bash
npx gitnexus@latest status
```

O comando deve concluir com sucesso.

Depois configurar MCP:

```bash
npx gitnexus@latest setup
```

Se o ambiente permitir selecionar agentes, configurar pelo menos o agente efetivamente utilizado no desenvolvimento da Ryvano.

Exemplo para Codex, se aplicável:

```bash
npx gitnexus@latest setup -c codex
```

Se também houver Cursor, Claude Code ou outro cliente compatível em uso, configurar somente os clientes realmente necessários.

Não adicionar configurações globais desnecessárias.

---

# 9. Arquivos gerados pelo GitNexus

O GitNexus pode criar/alterar contexto de agentes e instalar skills.

O agente deve:

- preservar o conteúdo útil criado automaticamente;
- não apagar regras personalizadas da Ryvano;
- não substituir `AGENTS.md` cegamente;
- mesclar regras quando necessário;
- manter clara a separação entre contexto gerado pelo GitNexus e regras próprias da Ryvano.

O índice `.gitnexus/` não deve ser tratado como documentação manual.

Ele representa um artefato derivado do código.

Se a ferramenta já adicionar `.gitnexus/` ao `.gitignore`, validar.

Caso contrário, adicionar:

```gitignore
.gitnexus/
```

Não versionar banco/índice local do GitNexus.

---

# 10. Configuração opcional `.gitnexusrc`

Verificar se faz sentido criar:

```text
.gitnexusrc
```

A configuração deve ser mínima.

Não ativar opções pesadas sem necessidade.

Uma configuração aceitável pode ser:

```json
{
  "analyze": {
    "defaultBranch": "main"
  }
}
```

Porém:

- descobrir a branch padrão real;
- não assumir `main`;
- não colocar `skipSkills` se as skills serão utilizadas;
- não colocar `skipAgentsMd` sem entender o impacto;
- não ativar embeddings apenas por ativar.

Se não houver necessidade concreta, NÃO criar `.gitnexusrc`.

---

# 11. Scripts no `package.json`

Se o projeto utilizar npm scripts e isso não conflitar com a arquitetura atual, adicionar aliases simples para facilitar manutenção.

Sugestão:

```json
{
  "scripts": {
    "brain:analyze": "gitnexus analyze",
    "brain:status": "gitnexus status",
    "brain:changes": "gitnexus detect-changes"
  }
}
```

Entretanto, antes de adicionar:

- verificar se GitNexus ficará global ou local;
- verificar package manager;
- verificar convenções do projeto.

Se a execução depender apenas de `npx`, pode ser preferível documentar os comandos em vez de modificar `package.json`.

Não adicionar dependência de produção.

---

# 12. Estrutura `architecture/`

Criar:

```text
architecture/
├── README.md
├── PROJECT_MAP.md
│
├── modules/
│   ├── shared-integrations.yaml
│   ├── shared-activities.yaml
│   ├── shared-reports.yaml
│   ├── garmin.yaml
│   ├── strava.yaml
│   ├── whatsapp.yaml
│   ├── auth.yaml
│   └── persistence.yaml
│
├── rules/
│   ├── providers.md
│   ├── activities.md
│   ├── reports.md
│   ├── database.md
│   ├── security.md
│   └── api.md
│
└── adr/
    ├── ADR-001-multi-provider.md
    ├── ADR-002-canonical-activity-normalization.md
    ├── ADR-003-provider-reconciliation.md
    └── ADR-004-report-delivery.md
```

IMPORTANTE:

Essa estrutura é o alvo conceitual.

Se durante a análise do código ficar evidente que algum domínio não existe ou possui outro nome, adaptar.

Não documentar funcionalidades inexistentes como se fossem implementadas.

---

# 13. Reaproveitar o `project-map.md` existente

Já existe um mapa inicial da Ryvano contendo:

- quick index;
- core architecture;
- shared integrations;
- activities;
- reports;
- Garmin;
- Strava;
- WhatsApp;
- auth;
- database;
- environments;
- API routes;
- surface-to-file guide;
- operational rules;
- test checklist;
- reading strategy.

Esse conteúdo NÃO deve ser descartado.

O agente deve:

1. localizar o arquivo real;
2. verificar se os caminhos continuam válidos;
3. confrontar cada seção com o código atual;
4. corrigir referências desatualizadas;
5. mover/copiar para `architecture/PROJECT_MAP.md` somente se isso não quebrar referências;
6. atualizar links que apontem para o arquivo antigo;
7. evitar manter duas versões divergentes.

Preferência:

```text
uma fonte de verdade
```

Se houver necessidade temporária de compatibilidade, o arquivo antigo pode conter apenas uma referência curta para o novo caminho.

---

# 14. `architecture/README.md`

Criar um arquivo curto.

Ele deve explicar:

```markdown
# Ryvano Architecture Brain

This directory contains architectural intent and business rules that cannot be reliably inferred from code alone.

For code relationships, imports, calls, consumers and blast-radius analysis, use GitNexus.

Read order:

1. `PROJECT_MAP.md`
2. relevant `modules/*.yaml`
3. relevant `rules/*.md`
4. relevant ADRs
5. GitNexus context/impact
6. implementation files
```

Também deve conter a regra:

> não carregar toda a documentação em todo pedido.

A leitura deve ser seletiva.

---

# 15. Formato dos arquivos `modules/*.yaml`

Os YAMLs devem representar responsabilidade arquitetural e relações de alto nível.

Eles NÃO devem tentar copiar todo o grafo do GitNexus.

Formato base:

```yaml
id: shared.activities
name: Shared Activities
status: active

owns:
  - canonical sport taxonomy
  - activity normalization
  - activity presentation
  - cross-provider reconciliation

paths:
  - modules/shared/activities

depends_on:
  - shared.integrations

consumed_by:
  - dashboard
  - activity-detail
  - reports
  - whatsapp-reports

invariants:
  - provider payloads must be normalized before shared UI/domain consumption
  - raw provider identifiers must remain available when required
  - reconciliation must not auto-merge conflicting provider records

cross_cutting_impacts:
  sport-taxonomy:
    - garmin
    - strava
    - reports
    - dashboard
    - activity-detail
    - whatsapp
    - tests

official_docs_required_when:
  - changing provider-specific mappings

tests:
  - discover from repository

notes:
  - keep this file architectural; use GitNexus for symbol-level relationships
```

---

# 16. Regras para YAML

Cada módulo deve conter apenas informações que sejam úteis para uma LLM decidir:

- quem é responsável;
- o que este domínio possui;
- do que depende;
- quem normalmente depende dele;
- quais invariantes não podem ser violados;
- quais áreas merecem análise de impacto;
- quando consultar documentação externa;
- quais testes são importantes.

NÃO colocar:

- lista de todas as funções;
- lista de todos os imports;
- assinatura de cada método;
- dump do código;
- documentação duplicada do TypeScript;
- detalhes que o GitNexus já consegue descobrir.

---

# 17. `shared-integrations.yaml`

Deve refletir o código real, mas sua intenção é registrar que:

- integração é orientada por capability;
- código compartilhado não deve depender da identidade de Garmin/Strava quando capability resolver o problema;
- providers entram por catálogo/registry/contracts;
- UI de integrações consome apresentação compartilhada;
- usuário pode possuir zero, uma ou várias integrações;
- nenhum provider deve ser considerado obrigatório para o app funcionar.

Exemplo de invariantes:

```yaml
invariants:
  - shared code must prefer capability checks over provider-name branching
  - the app must work with zero connected providers
  - the app must support one or multiple providers for the same user
  - provider-specific protocol details must stay inside provider modules
  - future providers must not require rewriting the shared domain
```

---

# 18. `shared-activities.yaml`

Registrar:

- `RyvanoSportType` como taxonomia canônica, se confirmado no código;
- normalização;
- apresentação;
- reconciliação;
- valores raw do provider quando necessários.

Invariantes:

```yaml
invariants:
  - provider values must be normalized before shared consumption
  - canonical sport taxonomy is provider-independent
  - conflicting provider activities must not be silently merged
  - adding a sport requires impact analysis across parsers, reports and UI
```

---

# 19. `shared-reports.yaml`

Registrar:

- contratos;
- seções orientadas por capability;
- geração;
- delivery;
- preview;
- idempotência;
- auditoria.

Invariantes esperados, se confirmados pelo código:

```yaml
invariants:
  - report sections are capability-driven
  - delivery must be idempotent
  - delivery must be auditable
  - preview and real delivery should share the same domain rules
  - transport concerns must not redefine report business rules
```

---

# 20. `garmin.yaml`

Registrar apenas intenção e limites.

Exemplo:

```yaml
id: provider.garmin

owns:
  - garmin connect
  - garmin sync
  - garmin provider protocol
  - garmin normalization
  - garmin reconnect handling

invariants:
  - garmin protocol details stay inside the Garmin module
  - Garmin failures must not break other providers
  - sync jobs must be idempotent
  - provider payload must be normalized before shared consumption

official_docs_required_when:
  - changing authentication
  - changing API contracts
  - changing webhook/push behavior
  - changing retention requirements
```

Adaptar para o que realmente existir.

---

# 21. `strava.yaml`

Registrar:

- OAuth;
- callback;
- token lifecycle;
- webhook;
- sync;
- activities;
- cleanup;
- provider wiring.

Invariantes:

```yaml
invariants:
  - OAuth changes require current official Strava documentation
  - scope changes require current official Strava documentation
  - webhook changes require current official Strava documentation
  - token lifecycle must remain isolated from shared business logic
  - sync jobs must be idempotent
  - Strava failures must not break other providers
```

---

# 22. `whatsapp.yaml`

Registrar:

- Evolution;
- activation;
- webhook;
- delivery;
- report transport;
- admin operational surface.

Invariantes:

```yaml
invariants:
  - webhook traffic must be validated
  - secrets and tokens must never be logged
  - delivery must be queue-driven if that is the current architecture
  - retries must not produce duplicate user-visible deliveries
  - preview rules must remain aligned with real report generation
```

Confirmar tudo no código antes de documentar como regra vigente.

---

# 23. `auth.yaml`

Registrar:

- sessão;
- guards;
- onboarding;
- roles;
- admin;
- login;
- páginas protegidas.

Invariantes:

```yaml
invariants:
  - authorization must be checked server-side where required
  - admin surfaces require explicit admin access
  - public/app shell must not assume a provider exists
  - session enrichment rules must remain centralized
```

---

# 24. `persistence.yaml`

Registrar:

- Prisma;
- migrations;
- constraints;
- relações;
- source of truth.

Invariantes:

```yaml
invariants:
  - Prisma schema is the persistence source of truth
  - schema changes require migration review
  - destructive changes require explicit data impact analysis
  - provider-specific data must not contaminate canonical models without a defined boundary
```

---

# 25. Pasta `rules/`

Os arquivos de regras devem explicar **comportamento obrigatório**, não a estrutura inteira.

Eles devem ser curtos.

Preferência:

```text
30–100 linhas
```

por arquivo.

Evitar documentos gigantes.

---

# 26. `rules/providers.md`

Deve conter no mínimo:

```text
- usuários podem utilizar zero, um ou vários providers;
- Garmin e Strava são providers atuais, não o centro da arquitetura;
- Polar, COROS, Suunto, Fitbit e outros devem poder ser adicionados futuramente;
- código compartilhado deve ser provider-agnostic sempre que possível;
- protocolos específicos ficam dentro do módulo do provider;
- capability é preferível a `if provider === ...`;
- falha de um provider não deve derrubar outro;
- regras compartilhadas não podem assumir que todos possuem Garmin;
- regras compartilhadas não podem assumir que todos possuem Strava.
```

---

# 27. `rules/activities.md`

Deve conter:

```text
- utilizar modelo canônico antes da UI;
- separar valor raw do provider quando necessário;
- taxonomia esportiva é compartilhada;
- mudança em taxonomia exige blast-radius;
- reconciliação entre providers é explícita;
- não auto-merge de registros conflitantes;
- divergência entre Garmin e Strava deve ser preservada/explicável quando necessário.
```

---

# 28. `rules/reports.md`

Deve registrar:

- source of truth do report;
- capability gating;
- preview;
- delivery;
- idempotência;
- auditoria;
- independência do transporte.

---

# 29. `rules/database.md`

Deve registrar:

- schema-first;
- migrações;
- compatibilidade;
- dados existentes;
- nullable/required;
- unique keys;
- relações;
- backfill quando necessário.

Qualquer alteração destrutiva precisa ser destacada antes da implementação.

---

# 30. `rules/security.md`

Deve conter pelo menos:

- não logar secrets;
- não logar tokens;
- evitar PII desnecessária;
- validar webhooks;
- proteger rotas admin;
- validar env;
- secrets em env/vault;
- não colocar credenciais em docs;
- não colocar credenciais em exemplos versionados.

---

# 31. `rules/api.md`

Registrar:

- route handlers finos;
- validação;
- domain/application layer;
- erros;
- auth;
- contracts;
- idempotência onde aplicável.

Regra importante:

> rotas HTTP devem adaptar protocolo HTTP para a aplicação; não concentrar regra de negócio complexa.

---

# 32. ADRs

ADR significa Architecture Decision Record.

Eles devem explicar decisões que um futuro agente poderia acidentalmente desfazer.

Formato:

```markdown
# ADR-XXX — Título

## Status

Accepted

## Context

...

## Decision

...

## Consequences

...

## Rules for future changes

...
```

---

# 33. ADR-001 — Multi-provider

Registrar a decisão de que Ryvano não é uma aplicação Garmin nem uma aplicação Strava.

Ela é uma plataforma que pode possuir múltiplas fontes.

Deve suportar:

```text
usuário sem integração
usuário apenas Garmin
usuário apenas Strava
usuário Garmin + Strava
usuário com providers futuros
```

Providers futuros previstos podem incluir:

- Polar;
- COROS;
- Suunto;
- Fitbit;
- outros.

A arquitetura não deve depender dessa lista ser fechada.

---

# 34. ADR-002 — Canonical Activity Normalization

Registrar:

```text
Provider payload
      ↓
provider parser
      ↓
normalização
      ↓
modelo canônico Ryvano
      ↓
UI / reports / reconciliation
```

A UI compartilhada não deve interpretar payload raw de Garmin ou Strava diretamente, salvo exceção claramente justificada.

---

# 35. ADR-003 — Provider Reconciliation

Registrar explicitamente:

- Garmin e Strava podem apresentar valores diferentes;
- mesma atividade pode existir em mais de um provider;
- reconciliação não significa apagar diferenças;
- conflitos não devem ser resolvidos silenciosamente;
- auto-merge só pode existir se houver regra explicitamente definida;
- auditoria/origem do dado deve ser preservável.

---

# 36. ADR-004 — Report Delivery

Registrar a decisão atual, após conferir o código:

- como report é construído;
- como preview é construído;
- como delivery funciona;
- idempotência;
- retries;
- Evolution;
- queues, caso existam;
- separação entre geração e transporte.

---

# 37. `AGENTS.md` — ponto central da V1

O `AGENTS.md` deve ser o contrato operacional dos agentes.

Se GitNexus gerar conteúdo nesse arquivo, preservar a parte gerada.

Adicionar uma seção claramente identificada:

```markdown
# Ryvano Engineering Protocol
```

Essa seção deve possuir regras obrigatórias.

---

# 38. Conteúdo obrigatório do protocolo do agente

Adicionar algo semanticamente equivalente a:

```markdown
## Mandatory brain-first workflow

Before changing Ryvano code:

1. Read the GitNexus repository context and confirm the index is fresh.
2. Identify the domain responsible for the requested behavior.
3. Read only the relevant file under `architecture/modules/`.
4. Read the relevant architecture rules/ADR when applicable.
5. Use GitNexus to inspect symbols, call chains, consumers and blast radius.
6. Determine the smallest safe set of files to change.
7. Inspect the implementation files.
8. Implement the change.
9. Run area-specific tests and project validation.
10. Run GitNexus change-impact analysis against the resulting diff.
11. Fix unexpected cross-domain impact before finishing.

Never start a cross-cutting change from text search alone.
```

---

# 39. Regra de índice desatualizado

Adicionar:

```markdown
If GitNexus reports that the repository index is stale:

- run `gitnexus analyze`;
- confirm `gitnexus status`;
- then continue.

Do not use a stale graph for impact analysis.
```

---

# 40. Regra de leitura seletiva

Adicionar:

```markdown
Do not read the whole architecture directory for every task.

Load only:
- project map;
- relevant module descriptor;
- relevant rules;
- relevant ADRs;
- relevant code context.
```

Objetivo:

- reduzir tokens;
- aumentar precisão;
- evitar ruído.

---

# 41. Regra de owner

Antes de alterar qualquer comportamento, o agente deve descobrir o owner arquitetural.

Exemplo:

```text
Strava OAuth
→ modules/strava

Canonical sport type
→ modules/shared/activities

Integration capability
→ modules/shared/integrations

Report contract
→ modules/shared/reports
```

Se o agente não consegue identificar o owner:

1. consultar PROJECT_MAP;
2. consultar GitNexus `query`;
3. analisar fluxos e referências;
4. só então decidir.

Não escolher owner apenas pelo nome do arquivo.

---

# 42. Regra de mudança cirúrgica

Adicionar:

```markdown
## Surgical change rule

Prefer the minimum coherent change.

Do not:
- refactor unrelated code;
- rename unrelated symbols;
- move unrelated files;
- rewrite working modules;
- change formatting across unrelated files;
- "clean up" adjacent architecture without a reason.

Every changed file must have a direct reason related to:
- implementation,
- contract update,
- migration,
- tests,
- documentation of a changed invariant.
```

---

# 43. Regra de blast radius

Para símbolos centrais, utilizar `impact`.

Especial atenção para:

- shared types;
- Prisma models;
- public API contracts;
- DTOs;
- schemas;
- `RyvanoSportType`;
- capability vocabulary;
- provider registry;
- report contracts;
- auth/session types;
- shared presentation types;
- functions usadas em jobs.

Exemplo CLI:

```bash
gitnexus impact <symbol>
```

Quando houver ambiguidade, resolver pelo arquivo/símbolo correto.

Não aceitar candidato ambíguo por conveniência.

---

# 44. Regra de contexto 360°

Antes de editar um símbolo central, consultar contexto.

Exemplo:

```bash
gitnexus context <symbol>
```

O agente deve observar:

- incoming calls;
- outgoing calls;
- imports;
- processos;
- consumidores.

---

# 45. Regra de busca semântica

Para descobrir onde um conceito vive:

```bash
gitnexus query "activity normalization"
```

ou equivalente via MCP.

Evitar começar com:

```bash
grep -R "activity"
```

em tarefas arquiteturais.

Busca textual continua válida para detalhes locais, mas não substitui descoberta estrutural.

---

# 46. Regra para APIs

Quando alterar um endpoint:

1. localizar handler;
2. localizar consumidores;
3. localizar contratos;
4. analisar shape;
5. analisar autenticação;
6. analisar impacto.

Se as ferramentas atuais do GitNexus disponibilizarem:

- `route_map`;
- `api_impact`;
- `shape_check`;

utilizá-las quando relevantes.

---

# 47. Regra pós-implementação

Após implementar:

```bash
gitnexus detect-changes
```

ou ferramenta MCP equivalente.

O agente deve revisar:

- símbolos alterados;
- processos afetados;
- risk level;
- consumidores inesperados.

Se houver impacto não previsto:

- investigar antes de concluir.

---

# 48. Protocolo completo para qualquer tarefa

A LLM deve internamente seguir:

```text
STEP 1 — classify
Qual é o domínio?

STEP 2 — map
Onde isso vive?

STEP 3 — rules
Quais invariantes governam essa mudança?

STEP 4 — graph
Quem depende disso?

STEP 5 — scope
Qual é o menor conjunto coerente de arquivos?

STEP 6 — implement
Alterar.

STEP 7 — validate
Testes/build/lint/typecheck adequados.

STEP 8 — impact
O diff afetou o que era esperado?

STEP 9 — document
Alguma decisão/invariante mudou?

STEP 10 — finish
Resumo curto com arquivos e validações.
```

---

# 49. Quando atualizar documentação arquitetural

NÃO atualizar `architecture/` em toda mudança.

Atualizar somente quando houver alteração de:

- responsabilidade de módulo;
- dependência arquitetural;
- invariantes;
- regra de negócio;
- provider capability;
- contrato compartilhado;
- política de reconciliação;
- decisão arquitetural;
- fluxo central.

Exemplo:

```text
corrigir typo de UI
→ não precisa ADR

adicionar novo provider
→ atualizar arquitetura

mudar política de reconciliação
→ atualizar ADR

mudar regra de report
→ atualizar rules/reports
```

---

# 50. Documentação não pode mentir

Toda documentação criada nesta implementação deve ser confrontada com o código.

Se este documento disser:

```text
delivery é queue-driven
```

mas o código atual não possuir queue, NÃO registrar isso como realidade.

Nesse caso:

- registrar o comportamento real;
- opcionalmente apontar discrepância como TODO arquitetural, se relevante.

Não fabricar consistência.

---

# 51. Documentação oficial de providers

Adicionar no `AGENTS.md`:

```markdown
When changing an external provider contract, verify the provider's current official documentation before implementation.

This applies especially to:
- authentication;
- OAuth;
- scopes;
- webhooks;
- rate limits;
- retention;
- API schemas;
- token lifecycle;
- event payloads.
```

Isso deve valer para:

- Garmin;
- Strava;
- Polar;
- COROS;
- Suunto;
- Fitbit;
- Evolution;
- futuros serviços externos.

Nunca assumir que documentação antiga continua válida.

---

# 52. Regras para Prisma

Quando uma alteração atingir `schema.prisma`:

O agente deve obrigatoriamente verificar:

```text
model
relations
unique constraints
indexes
nullable fields
existing migration history
queries
API consumers
jobs
reports
cleanup
tests
```

E executar blast-radius nos símbolos/áreas afetadas quando possível.

---

# 53. Regras para novos providers

Quando futuramente entrar Polar, COROS, Suunto, Fitbit ou outro:

O agente deve primeiro procurar os contratos compartilhados.

Fluxo esperado:

```text
provider
  ↓
provider module
  ↓
capabilities
  ↓
normalization
  ↓
shared domain
```

Evitar:

```text
if (provider === "POLAR")
if (provider === "COROS")
if (provider === "SUUNTO")
```

espalhados pelo shared/core.

Branch por provider só deve existir onde identidade do provider realmente faz parte da responsabilidade daquele módulo.

---

# 54. Regras para atividades esportivas

Toda mudança em modalidade esportiva deve considerar pelo menos:

```text
canonical taxonomy
provider parsing
normalization
metric display category
report theme
activity detail
dashboard/presentation
reports
WhatsApp
reconciliation
tests
```

O GitNexus deve confirmar o conjunto real.

A lista acima é um lembrete de risco, não substitui o grafo.

---

# 55. Regras para jobs

Jobs devem ser analisados considerando:

- idempotência;
- retries;
- concorrência;
- locks;
- duplicação;
- provider isolation;
- logging;
- erro parcial;
- agendamento;
- side effects.

Uma falha no job Garmin não deve automaticamente impedir processamento Strava, salvo contrato explícito.

---

# 56. Regra para erros e logs

Logs nunca devem expor:

- access token;
- refresh token;
- client secret;
- authorization headers;
- webhook secret;
- senha;
- PII desnecessária.

Ao criar logs estruturados, preferir:

```text
provider
operation
status
entity id não sensível
correlation id
```

---

# 57. Testes

O agente deve descobrir os comandos reais no `package.json`.

Não assumir:

```bash
npm test
```

sem verificar.

Antes de concluir, executar o conjunto adequado entre:

- unit tests;
- integration tests;
- typecheck;
- lint;
- build.

Para mudança localizada:

- executar primeiro testes da área;
- depois validação mais ampla necessária pelo risco.

Para mudança shared/cross-cutting:

- executar validação mais abrangente.

---

# 58. Baseline da implementação

Antes de modificar qualquer comportamento funcional, rodar validações básicas da branch atual quando viável.

Objetivo:

distinguir:

```text
erro já existente
```

de:

```text
erro introduzido pela V1
```

A implementação do Brain não deve corrigir bugs não relacionados.

---

# 59. O Brain não deve mudar negócio da Ryvano

Esta tarefa é primariamente arquitetural/tooling/documentação.

Não aproveitar para:

- refatorar Garmin;
- refatorar Strava;
- alterar banco;
- alterar telas;
- alterar API;
- mudar regras de relatório;
- mudar UI.

Somente corrigir algo nesses domínios se for estritamente necessário para instalar/configurar o Brain — o que normalmente não deve ser necessário.

---

# 60. Fases de implementação

Implementar na ordem abaixo.

---

## Fase 1 — Discovery

Entregar inventário interno contendo:

- branch atual;
- package manager;
- Node version se definida;
- `AGENTS.md` existente;
- `project-map.md` existente;
- estrutura `modules`;
- providers encontrados;
- shared modules;
- Prisma;
- APIs;
- testes;
- ferramentas de IA existentes.

Não precisa criar documento separado se não for útil.

---

## Fase 2 — GitNexus

Executar:

```text
install/analyze
status
setup MCP
```

Validar que o repositório aparece no GitNexus.

Validar pelo menos uma consulta real.

Exemplo:

```text
query:
"Strava OAuth"
```

Validar um símbolo real com `context`.

Validar uma análise real com `impact`.

---

## Fase 3 — Architecture folder

Criar `architecture/`.

Migrar/corrigir `PROJECT_MAP`.

Criar os YAMLs e rules a partir do código existente.

Criar ADRs.

---

## Fase 4 — AGENTS.md

Integrar:

- instruções GitNexus;
- Ryvano Engineering Protocol;
- Surgical Change Protocol;
- external docs rule;
- selective reading rule;
- stale index rule.

---

## Fase 5 — Validation

Executar:

```bash
gitnexus status
```

Executar consulta.

Executar análise de impacto.

Executar `detect-changes`.

Executar validações normais do projeto.

---

# 61. Cenários obrigatórios de teste manual do Brain

O agente deve demonstrar que a V1 consegue orientar pelo menos estes cenários.

## Cenário A — modalidade esportiva

Pergunta conceitual:

```text
Se eu alterar RyvanoSportType, o que pode ser afetado?
```

Esperado:

- localizar símbolo real;
- identificar consumers;
- mostrar blast radius;
- cruzar com `shared-activities.yaml`.

---

## Cenário B — Strava webhook

Pergunta:

```text
Onde alterar o processamento do webhook Strava?
```

Esperado:

- localizar route;
- localizar módulo;
- localizar fluxo;
- mostrar consumidores;
- aplicar regra de documentação oficial.

---

## Cenário C — reports

Pergunta:

```text
Se eu alterar uma regra compartilhada de report, quais telas/entregas podem ser afetadas?
```

Esperado:

- shared reports;
- preview;
- delivery;
- WhatsApp;
- UI, se realmente conectada;
- testes.

---

## Cenário D — Prisma

Pergunta:

```text
Qual o impacto de alterar o model relacionado a integrações?
```

Esperado:

- relações;
- queries;
- provider modules;
- APIs;
- jobs;
- migrations;
- testes.

---

# 62. Critérios de aceite

A implementação só está concluída quando TODOS os itens abaixo forem verdadeiros.

## GitNexus

- [ ] GitNexus consegue indexar a Ryvano.
- [ ] `gitnexus status` funciona.
- [ ] MCP está configurado para o agente utilizado.
- [ ] consulta estrutural funciona.
- [ ] `context` funciona sobre símbolo real.
- [ ] `impact` funciona sobre símbolo real.
- [ ] `detect-changes` funciona.
- [ ] `.gitnexus/` não é versionado.

## Architecture

- [ ] existe `architecture/README.md`.
- [ ] existe uma única fonte principal para PROJECT_MAP.
- [ ] mapa foi confrontado com código atual.
- [ ] módulos YAML refletem responsabilidades reais.
- [ ] rules registram invariantes reais.
- [ ] ADR multi-provider existe.
- [ ] ADR de normalização existe.
- [ ] ADR de reconciliation existe.
- [ ] ADR de report delivery reflete implementação real.

## Agent

- [ ] `AGENTS.md` possui Brain-first workflow.
- [ ] `AGENTS.md` exige verificação de índice.
- [ ] `AGENTS.md` exige blast-radius para mudanças relevantes.
- [ ] `AGENTS.md` exige análise pós-diff.
- [ ] `AGENTS.md` exige docs oficiais para contracts externos.
- [ ] `AGENTS.md` proíbe leitura desnecessária de toda arquitetura.
- [ ] `AGENTS.md` contém Surgical Change Rule.

## Project

- [ ] build continua funcionando.
- [ ] typecheck continua funcionando, se existir.
- [ ] lint continua funcionando, se existir.
- [ ] testes relevantes continuam passando.
- [ ] nenhuma regra de negócio foi alterada acidentalmente.

---

# 63. Definition of Done para futuras tarefas

Depois da V1, qualquer agente trabalhando na Ryvano deve poder finalizar uma tarefa com algo semelhante a:

```text
Domain:
shared.activities

Brain consulted:
architecture/modules/shared-activities.yaml
architecture/rules/activities.md
ADR-002
ADR-003

Impact:
Garmin parser
Strava parser
activity detail
reports

Changed:
4 files

Validation:
activity tests
typecheck
build
GitNexus detect_changes

Unexpected impact:
none
```

Isso não precisa necessariamente ser mostrado ao usuário em formato longo.

É o protocolo interno de engenharia.

---

# 64. O que NÃO fazer

Não transformar o Brain em um novo sistema gigante.

NÃO:

```text
criar 200 documentos
documentar toda função
duplicar TypeScript em markdown
duplicar grafo em YAML
adicionar Neo4j
adicionar vector DB
criar API do Brain
criar dashboard do Brain
criar embeddings custom
adicionar serviço em produção
```

na V1.

O objetivo da V1 é simplicidade.

---

# 65. Regra de manutenção

O GitNexus representa:

```text
o que o código É.
```

A pasta `architecture/` representa:

```text
o que o sistema DEVE preservar.
```

Quando código e arquitetura divergirem:

o agente não deve escolher silenciosamente um lado.

Ele deve descobrir se:

1. documentação ficou desatualizada;
2. implementação violou uma regra;
3. uma decisão foi alterada.

Corrigir a fonte adequada.

---

# 66. Regra de crescimento

Quando a Ryvano crescer, NÃO criar um documento gigante para cada nova funcionalidade.

Adicionar conhecimento ao Brain somente se ele responder pelo menos uma destas perguntas:

```text
Quem é responsável?
O que não pode ser quebrado?
Quem depende disso?
Qual decisão precisa ser preservada?
Qual contrato externo governa isso?
Qual outro domínio pode ser impactado?
```

Se a informação não ajuda nessas perguntas, provavelmente pertence ao código/testes, não ao Brain.

---

# 67. Fluxo desejado depois da V1

Exemplo de pedido:

```text
Adicionar Polar.
```

O agente deve automaticamente fazer:

```text
1. ler project map
2. identificar shared integrations
3. ler provider rules
4. ler ADR multi-provider
5. consultar GitNexus
6. entender Garmin e Strava como implementações de referência
7. localizar contracts/capabilities/registry
8. consultar documentação oficial Polar
9. propor/implementar módulo Polar isolado
10. analisar impacto
11. validar
```

O usuário não deve precisar dizer:

```text
"olha Garmin"
"olha Strava"
"não esquece reports"
"não esquece integrations"
```

Esse é o principal sucesso do Ryvano Brain.

---

# 68. Fluxo desejado para alteração pequena

Pedido:

```text
Mudar um texto do botão da tela de integrações.
```

O agente NÃO deve carregar:

- ADR de reconciliation;
- rules de database;
- Strava OAuth;
- Garmin sync;
- reports.

Ele deve identificar que é uma alteração localizada e trabalhar de forma cirúrgica.

Brain-first NÃO significa carregar tudo.

Significa consultar o mínimo correto.

---

# 69. Saída esperada desta implementação

Ao terminar a implementação da V1, entregar ao usuário:

## Arquivos criados

Lista objetiva.

## Arquivos alterados

Lista objetiva.

## GitNexus

- status;
- repositório indexado;
- MCP configurado;
- consultas testadas.

## Architecture Brain

Resumo das áreas documentadas.

## Validações

Comandos realmente executados e resultados.

## Pendências

Somente pendências reais.

Não inventar melhorias futuras para aumentar o escopo.

---

# 70. Regra final para o agente implementador

O objetivo não é simplesmente:

```text
"instalar GitNexus"
```

O objetivo é mudar a forma como agentes trabalham dentro da Ryvano.

Depois desta implementação, a regra passa a ser:

```text
UNDERSTAND
→ MAP
→ IMPACT
→ CHANGE
→ VERIFY
```

e não:

```text
SEARCH
→ GUESS
→ EDIT
→ HOPE
```

---

# Appendix A — Project map inicial

O projeto já possui um mapa conceitual semelhante ao conteúdo abaixo.

Não copiar cegamente.

Usar como entrada e validar contra o repositório.

```text
Core:
- app/**
- modules/shared/**
- modules/garmin/**
- modules/strava/**
- server/**
- prisma/**
- app/api/**
- components/**
- lib/**

Shared integrations:
- catalog
- capabilities
- contracts
- registry
- presentation
- policy

Shared activities:
- sport-types
- presentation
- reconciliation

Shared reports:
- contracts
- delivery

Providers:
- Garmin
- Strava

Cross-cutting:
- Auth
- Prisma
- WhatsApp / Evolution
- Jobs
- Security
- Tests
```

---

# Appendix B — Comandos úteis GitNexus

Os comandos abaixo estavam disponíveis na documentação oficial consultada na criação desta especificação.

Antes de executar em outro momento, validar documentação atual.

```bash
gitnexus analyze
gitnexus analyze --force
gitnexus analyze --skills
gitnexus setup
gitnexus status
gitnexus list
gitnexus query
gitnexus context
gitnexus impact
gitnexus trace
gitnexus detect-changes
gitnexus check
```

Via MCP, ferramentas atuais relevantes incluem:

```text
query
context
impact
trace
detect_changes
check
route_map
shape_check
api_impact
```

Nem toda tarefa precisa usar todas elas.

---

# Appendix C — Política para manutenção do AGENTS.md

`AGENTS.md` deve permanecer pequeno o suficiente para ser lido em todo início de trabalho.

Não mover o conteúdo completo de `architecture/` para `AGENTS.md`.

`AGENTS.md` contém:

```text
COMO trabalhar.
```

`architecture/` contém:

```text
O QUE preservar.
```

GitNexus contém:

```text
COMO o código está conectado agora.
```

Essa separação é parte da arquitetura da V1.

---

# Appendix D — Resumo arquitetural da V1

```text
                      ┌─────────────────────┐
                      │      LLM Agent      │
                      └──────────┬──────────┘
                                 │
                         reads / queries
                                 │
              ┌──────────────────┼─────────────────┐
              │                  │                 │
              ▼                  ▼                 ▼
         AGENTS.md          architecture/      GitNexus
              │                  │                 │
        work protocol       intent/rules      code graph
              │                  │                 │
              └──────────────────┼─────────────────┘
                                 │
                                 ▼
                         Surgical Change
                                 │
                                 ▼
                              Tests
                                 │
                                 ▼
                        detect_changes
```

---

# Appendix E — Future versions

Não implementar agora.

Possível evolução:

```text
V1
GitNexus + AGENTS + architecture

V2
knowledge graph de decisões/memória histórica

V3
memória temporal de alterações e incidentes

V4
cross-repository architecture graph
```

A V1 deve ser completamente útil sem depender dessas fases.
