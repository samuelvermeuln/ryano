# Ryvano Jornada — especificação completa de produto, telas e implementação

**Versão:** 1.1 (completa) · **Data:** 23/09/2026 · **Base verificada:** `samuelvermeuln/ryano`, `main` @ `998c5bf`.

> **Como usar este documento.** As seções 1–7 definem *o que* construir e *por quê*. As seções 8–12 definem *como* construir: DDL, contratos HTTP, casos de uso, guards e critérios de aceite. As seções 13–15 definem *em que ordem* e *como verificar*. A seção 2.1 registra o estado do código **verificado com evidência de arquivo e linha** — é a única parte que envelhece rápido; reconfirme antes de implementar.
>
> Esta é uma proposta de diferenciação, não uma afirmação de exclusividade de mercado. Nada aqui descreve funcionalidade pronta: tudo marcado como *proposto* ainda não existe.

## Changelog

| Versão | Mudança |
|---|---|
| 1.0 | Estrutura de produto, ondas, telas, design system, regras e critérios de aceite. |
| 1.1 | Estado do código **verificado** com evidência (2.1); DDL Prisma concreto (8); contratos HTTP com Zod e códigos de erro reais (9); matriz de autorização (10); backlog executável T500+ (13); plano de testes (14). Correções factuais: `/professor/[schoolId]/turmas` **existe** — a lacuna é só na visão administrativa; `manage-team.ts` existe mas **não tem nenhuma rota HTTP**. |

---

## 1. Resultado esperado

Uma escola esportiva consegue receber um atleta, associá-lo a professores e turmas, ajudá-lo a escolher uma meta, acompanhar uma **jornada com marcos**, prescrever treinos, analisar a execução, fazer revisões e decidir o próximo passo. O atleta participa, conserva seu histórico e controla o compartilhamento. O professor tem uma fila objetiva de decisões. A escola vê o trabalho que precisa fazer hoje e consegue demonstrar o valor do acompanhamento.

**Princípio existente do Ryvano:** vínculos podem acabar; o histórico esportivo do atleta não. A jornada respeita isso. O objetivo é transformar o fluxo `meta → plano → execução → feedback → decisão → próximo marco` na unidade principal da experiência, com as funções comuns de gestão da escola funcionando plenamente.

### Público e proposta de valor

| Perfil | Ação recorrente | Valor recebido |
|---|---|---|
| Atleta | Conferir próximo marco, executar/registrar treino, informar dificuldade, aprovar revisões | Entende progresso e próximos passos sem depender de relógio conectado. |
| Professor | Planejar, avaliar exceções, ajustar o próximo bloco | Sabe a quem responder e por quê; mantém sua autoria. |
| OWNER/ADMIN da escola | Resolver pendências, organizar turmas e carga dos professores, acompanhar jornadas | Enxerga capacidade, continuidade e qualidade do serviço. |
| Outra escola, **fase posterior** | Participar de um marco com convite e consentimento explícito | Coopera sem assumir acesso geral ao histórico. |

**Não confundir:** jornada não é uma sequência automática de mensagens, ranking de alunos, ficha médica, nova cópia das atividades importadas ou substituto do professor. IA pode futuramente sugerir ações, mas nunca alterar o plano ou conceder acesso sozinha.

---

## 2. Fonte de verdade e restrições do repositório

Ler antes de alterar o código:

- `.agents/skills/ryvano-telas/SKILL.md` e `references/screen-map.md`, `references/access-matrix.md`; executar `scripts/audit-routes.sh` antes e `scripts/audit-access.sh` depois de mudanças de telas.
- `architecture/PROJECT_MAP.md`, `architecture/modules/school.yaml`, `architecture/escola-permission-rules.md`, `architecture/escola-security-review.md`, `architecture/rules/api.md`, `architecture/rules/database.md`, `architecture/rules/security.md` e `.kiro/specs/ryvano-escola-spec/required.md`.
- ADRs da escola em `architecture/adr/school/` — sobretudo `ADR-001-athlete-owns-history.md`, `ADR-002-temporal-memberships.md`, `ADR-005-history-grants.md`.
- `app/escola/[schoolId]/layout.tsx` e as páginas da escola; `app/app/dashboard/page.tsx`, `components/dashboard/dashboard-redesign.tsx`, `components/layout/customizable-card-grid.tsx`, `app/actions/dashboard-layout.ts`, `components/activities/activity-visual-dashboard.tsx`, `components/app-shell.tsx`, `components/app-header.tsx`, `app/globals.css`.
- `prisma/schema.prisma`, `app/api/schools/_shared.ts` e os casos de uso relevantes em `modules/school/application/**`.

> **Regra de segurança que não pode ser esquecida:** o guard do `layout.tsx` protege a *página*, nunca a *API*. Toda rota nova precisa da sua própria checagem de autorização no servidor. Se a implementação alterar escopos de leitura, auditar também todas as rotas de API existentes.

### 2.1 Estado verificado no commit `998c5bf`

Levantamento feito por inspeção direta do código. Cada linha traz a evidência; reconfirme antes de implementar.

#### O que já existe e deve ser reusado

| Peça | Evidência | Consequência |
|---|---|---|
| Módulo escola | `modules/school/application/` com 56 casos de uso; `modules/school/domain/` com 33 arquivos | Reusar; não recriar regra que já existe. |
| Envelope HTTP padronizado | `app/api/schools/_shared.ts` → `schoolResponse(op, status)`, `publicSchoolResponse`; trata `SchoolError`, `ZodError` e flag desligada | Toda rota nova usa esse envelope. |
| Catálogo de erros | `modules/school/domain/errors.ts` → `SCHOOL_ERROR_STATUS` já inclui `TEAM_NOT_FOUND`, `ATHLETE_ALREADY_IN_TEAM`, `ATHLETE_NOT_IN_TEAM` | Estender o catálogo; não inventar status solto na rota. |
| Prescrição e execução | `WorkoutAssignment`, `WorkoutExecution`, `WorkoutCompliance`, `CoachEvaluation`, `AthleteFeedback` em `prisma/schema.prisma` | Jornada **referencia** esses registros; não duplica execução. |
| Consentimento de histórico | `HistoryAccessGrant` + `check-history-access.ts`, `grant-history-access.ts`, `revoke-history-access.ts` | Acesso entre organizações sempre explícito e revogável. |
| Grade personalizável | `components/layout/customizable-card-grid.tsx` (`CustomizableCardGridItem`, `CustomizableCardLayout`, genérico `TMaxSpan`) | Reusar o componente; **não** criar um segundo grid. |
| Feature flag | `SCHOOL_MODULE_ENABLED` em `modules/school/config/feature-flag.ts` | Tudo novo entra atrás da flag. |
| Observabilidade | `schoolLogger`, `schoolMetrics` em `modules/school/infrastructure/` | Log estruturado, sem PII. |

#### Defeitos e lacunas confirmados — corrigir na Onda 0

| # | Problema | Evidência exata | Correção exigida |
|---|---|---|---|
| **D1** | **`/escola/[schoolId]/turmas` responde 404.** Não existe `app/escola/[schoolId]/turmas/page.tsx`, mas **dois pontos da UI linkam para lá**. | menu: `app/escola/[schoolId]/layout.tsx:44`; card "Turmas ativas": `app/escola/[schoolId]/page.tsx:134` | Criar a página. Enquanto não existir, **remover o link** — nunca entregar item de menu que leva a 404. |
| **D2** | **Casos de uso de turma sem nenhuma rota HTTP.** `manage-team.ts` expõe `CreateTeam`, `ArchiveTeam`, `AddAthleteToTeam`, `RemoveAthleteFromTeam`, `AddCoachToTeam`, `RemoveCoachFromTeam` com schemas Zod prontos, mas **não existe `app/api/schools/[id]/teams/`**. | `modules/school/application/manage-team.ts:23–213`; `find app/api -type d -name teams` → vazio | Expor as rotas. A lógica já existe; falta apenas o adaptador fino. |
| **D3** | **`Team` não comporta operação escolar.** O modelo tem só `id, schoolId, name, archivedAt, createdAt, updatedAt`. Sem nível, capacidade, local, modalidade ou horário. | `prisma/schema.prisma:871–884` | Evoluir o schema (8.2) **antes** de prometer "capacidade" e "horários" na tela. |
| **D4** | **Card "Solicitações pendentes" conta menos do que a tela mostra.** O dashboard conta só `schoolAthleteMembership` PENDING; a página de solicitações lista atletas **e** professores. Número e lista discordam. | conta: `app/escola/[schoolId]/page.tsx:61`; lista: `app/escola/[schoolId]/solicitacoes/page.tsx:73` (atletas) e `:78` (coaches) | Somar `schoolAthleteMembership` + `coachSchoolMembership` pendentes, ou corrigir o rótulo. |
| **D5** | **"Atrasados" tem teto silencioso de 200 e usa dia UTC.** `take: 200` descarta o excedente sem avisar; `scheduledAt < startOfUtcDay(now)` trata o início do dia UTC como se fosse o dia local da escola. | `app/escola/[schoolId]/page.tsx:23–27` (`startOfUtcDay`), `:63` (`scheduledAt: { lt: today }`) e `:70` (`take: 200`) | Contagem agregada + lista paginada; recortar o dia no fuso da escola. |
| **D6** | **Layout de cards não tem escopo por escola.** Persiste em `UserProfile.dashboardLayoutOrder`, chave única por usuário. Reusar a mesma chave no painel escolar faria o layout da escola sobrescrever o do atleta. | `prisma/schema.prisma:558`; `app/actions/dashboard-layout.ts:39,43` | Persistência por `(usuário, escola, superfície)` — ver 8.2 `DashboardLayoutPreference`. |
| **D7** | **`CustomizableCardGrid` depende de ponteiro.** Arrastar/redimensionar por `pointerdown`, sem caminho por teclado; contêiner e banner com superfícies claras literais. | `components/layout/customizable-card-grid.tsx` — handlers de ponteiro e `bg-white/[0.055]`/sombra fixa em `:214` | Corrigir **no componente compartilhado** (beneficia dashboard, atividades e integrações). Não clonar. |

#### Correções factuais em relação à v1.0

- **`/professor/[schoolId]/turmas/page.tsx` existe.** A v1.0 sugeria ausência geral de "turmas". A lacuna real é apenas na **visão administrativa** (`/escola/...`). Ao implementar D1, reaproveitar o que a tela do professor já resolveu e não divergir de vocabulário.
- **A lacuna de turmas é dupla:** falta a página *e* falta a API (D1 + D2). Entregar só a página deixaria a tela sem como escrever.

#### Numeração para trabalho novo

- Próxima migration: **`0035_`** (a última é `0034_workout_requests`).
- Próximo bloco de tasks: **T500+** (o maior ID em uso é `T407`).

---

## 3. Escopo em ondas

**Onda 0 — base operacional obrigatória.** Corrigir D1–D7. Entregar gestão de turma com atletas e professores, ação de atribuir professor no lobby, links profundos e indicadores corretos. Se a etapa não estiver pronta, remover temporariamente o link quebrado durante o desenvolvimento; nunca apresentar uma rota 404 em entrega.

**Onda 1 — MVP da Jornada, uma escola.** Meta, marcos, professor responsável, planos vinculados, check-in do atleta, revisão humana, fila de atenção e card de jornada no espaço pessoal. Preservar todas as funções administrativas da Onda 0.

**Onda 2 — operação escolar completa, obrigatória na visão final.** Modelos de jornada por modalidade, duplicação de planos com edição individual, agenda de aulas/eventos, capacidade por turma, presença/ausência e justificativa, comunicação por turma e individual, matrícula/plano comercial, mensalidade/cobrança e painel financeiro. Entregar em fatias, mas **não tratar esses módulos como dispensáveis**. Escola remota pode ocultar agenda de aula/presença física por configuração, preservando os registros quando utilizados.

**Onda 3 — cooperação multi-escola.** Convite de outra organização para um marco, aceite do atleta, escopo mínimo de leitura, expiração/revogação, coordenação de horários/carga apenas com os dados autorizados. **Validar demanda real antes de executar.**

**Onda 4 — expansão.** Responsável legal com permissões e aceite apropriados, contratos digitais, remarcação de aula, lista de espera, integrações de pagamento e relatórios avançados. A base deve comportar essa evolução. Evitar misturar presença física em aula com execução de treino prescrito.

---

## 4. Jornada ponta a ponta

1. Atleta vincula-se à escola por convite/busca. OWNER/ADMIN aprova conforme política da escola.
2. Escola atribui professor e, se aplicável, uma turma. O lobby sai da fila somente quando existe atribuição **ativa**.
3. Atleta cria uma meta ou aceita proposta de escola/professor: por exemplo, "Completar 750 m de natação contínua até 15/12". Define modalidade, prazo, disponibilidade e compartilhamento.
4. Professor responsável propõe 2–5 marcos com resultado observável, prazo aproximado e plano de treinos. O atleta vê a proposta e a aceita. Sem aceite, o status permanece `PROPOSED` e o plano **não** é apresentado como acordado.
5. Cada treino segue o ciclo existente: prescrição, atividade normalizada ou registro manual, matching, avaliação e feedback. O marco **aponta** para as atribuições; não armazena uma segunda execução.
6. O atleta pode registrar check-in curto — "consegui", "difícil", "não fiz" — com nota opcional. Isso **não** altera automaticamente o status do treino nem produz dado fisiológico inventado.
7. Um sinal verificável coloca uma tarefa na fila de atenção: prazo de marco próximo, duas ausências consecutivas, feedback pedindo ajuda, falta de professor, avaliação pendente. O professor confirma contexto e decide: manter, ajustar, pausar ou concluir o marco.
8. O atleta recebe uma síntese compreensível do que foi observado, do que mudou e do próximo passo. Pode corrigir um registro próprio sem apagar a trilha anterior.
9. Ao encerrar vínculo com a escola, a jornada mantém autoria, marcos e fatos históricos; a escola perde leitura futura além do que sua autoria e consentimentos vigentes permitem. Um vínculo posterior começa novo período.

### Exemplo concreto

**Ana** entra em uma escola de natação para completar 750 m sem parar. A escola a coloca na turma Intermediário e atribui a professora Bia. Ana aceita três marcos: 250 m, 500 m, 750 m. Depois de dois treinos não realizados, a fila de Bia mostra "Ana: dois treinos sem execução confirmada"; Bia pergunta se houve problema. Ana informa incompatibilidade de horário. Bia ajusta o plano e registra o motivo. O painel da escola passa a mostrar a pendência resolvida e o marco seguinte; Ana vê a mesma decisão em linguagem simples. Sem relógio, Ana continua usando check-ins manuais e avaliações da professora.

---

## 5. Mapa de telas e navegação

Todas as rotas abaixo são **propostas**, salvo as marcadas como existentes. Implementar atrás de `SCHOOL_MODULE_ENABLED` e dos guards atuais. Não duplicar o shell nem alterar a identidade visual global.

### 5.1 Telas da escola (OWNER/ADMIN)

| Rota | Estado | Conteúdo obrigatório |
|---|---|---|
| `/escola/[schoolId]` | **Existe** — redesenhar | Visão operacional: hero, indicadores corretos (corrigir D4/D5), fila de ações, jornadas por estágio, turmas e execuções. Cards reorganizáveis. |
| `/escola/[schoolId]/turmas` | **Nova — reparar 404 (D1)** | Lista/busca, modalidade, professores, atletas, estado, criar/editar/arquivar, incluir/remover, detalhar. |
| `/escola/[schoolId]/turmas/[teamId]` | Nova | Resumo da turma, participantes, responsáveis, calendário/treinos coletivos e jornadas relacionadas. |
| `/escola/[schoolId]/atletas` | **Existe** — evoluir | Filtros, lobby acionável, professor atual, turma, marco atual e link para detalhe. |
| `/escola/[schoolId]/atletas/[athleteId]` | Nova | Somente o que a escola pode ler: vínculo, professor, turmas, jornadas escolares, treinos da escola, permissões. Link para histórico **apenas quando autorizado**. |
| `/escola/[schoolId]/jornadas` | Nova (Onda 1) | Lista filtrável por status, modalidade, professor, turma, prazo, necessidade de ação. Ações em lote só com autorização e confirmação adequada. |
| `/escola/[schoolId]/jornadas/[journeyId]` | Nova (Onda 1) | Linha do tempo e marcos, responsáveis, decisões, próximos passos, auditoria. |
| `/escola/[schoolId]/agenda` | Nova (Onda 2) | Aulas, eventos e treinos coletivos por dia/semana/mês; filtros por turma, modalidade e professor; capacidade, local, conflito e ações de presença. |
| `/escola/[schoolId]/presencas` | Nova (Onda 2) | Chamada por sessão/turma, falta justificada, acompanhamento de frequência e exportação autorizada. |
| `/escola/[schoolId]/comunicacao` | Nova (Onda 2) | Avisos para turma ou atleta, rascunho, histórico de entrega, filtros e preferências de comunicação. |
| `/escola/[schoolId]/financeiro` | Nova (Onda 2) | Planos, matrículas, cobranças, vencimentos, recebimentos, conciliação e relatórios. **Ocultar valores de perfis sem permissão financeira.** |
| `/escola/[schoolId]/professores` · `/solicitacoes` · `/convites` · `/membros` | **Existem** | Manter; adicionar ações contextuais e links profundos. |

### 5.2 Telas do professor

| Rota | Estado | Conteúdo obrigatório |
|---|---|---|
| `/professor/[schoolId]` · `/atletas` · `/atletas/[athleteId]` · `/atletas/[athleteId]/avaliar` · `/treinos` · `/turmas` | **Existem** | Base do trabalho do professor; reusar. |
| `/professor/[schoolId]/jornadas` | Nova (Onda 1) | "Preciso agir hoje", atletas atribuídos, avaliações e revisões pendentes. Guard duplo: `CoachProfile` **e** `CoachSchoolMembership` ativos. |
| `/professor/[schoolId]/jornadas/[journeyId]` | Nova (Onda 1) | Planejamento, avaliação, revisão e comentários com autoria. **Não expor outros atletas da escola.** |
| `/professor/[schoolId]/agenda` | Nova (Onda 2) | Aulas próprias, chamada das suas turmas, avisos destinados a ele, acesso à jornada dos atletas atribuídos. |

### 5.3 Telas do atleta

| Rota | Estado | Conteúdo obrigatório |
|---|---|---|
| `/app/dashboard` | **Existe** | Card "Minha jornada" na grade já existente, com próximo passo e estado vazio. Usuário sem jornada conserva dashboard coerente. |
| `/app/jornadas` | Nova (Onda 1) | Todas as jornadas do próprio atleta, inclusive históricas; diferencia escola e fase. |
| `/app/jornadas/[journeyId]` | Nova (Onda 1) | Meta, marco, próximo treino, feedback, histórico, aceite de proposta e controles de compartilhamento. |
| `/app/agenda` | Nova (Onda 2) | Próximas aulas/eventos em que está inscrito, presenças e justificativas. **Distinguir aula coletiva de treino individual prescrito.** |
| `/atleta/[schoolId]` · `/calendario` · `/historico` · `/treinos/[assignmentId]` · `/atleta/semana` | **Existem** | Resumo por escola; histórico de período encerrado continua acessível conforme regra atual. |

### 5.4 Estrutura visual da tela principal da escola

**Linha 1 — cabeçalho.** Avatar/logo da escola; eyebrow "ESCOLA"; `h1` com o nome; subtítulo com diagnóstico operacional ("3 ações precisam de atenção hoje"); chips de status e modalidade; à direita, seletor de período 7/30/90 dias, ação primária "Criar jornada" e secundária "Ver turmas". No mobile, empilhar controles sem esconder ações essenciais. A barra global `AppHeader` continua pertencendo ao `AppShell`; este cabeçalho é **o hero da página**, dentro do conteúdo, como em `DashboardRedesign`.

**Linha 2 — cards personalizáveis.** "Ações de hoje" (largura 2), "Jornadas ativas", "Atletas sem professor", "Solicitações", "Treinos previstos × realizados", "Turmas" e "Avaliações pendentes". Cada card leva à tela filtrada correspondente. Cards com 0 exibem estado útil, sem hífen ou promessa de dado inexistente. Card de segurança/consentimento só aparece se houver um evento autorizado relevante.

**Linha 3 — fluxo de atenção.** Lista curta e paginada de tarefas por prioridade: `tipo`, atleta, professor, prazo, motivo, status, ação contextual. **Nunca mostrar só um número sem permitir chegar ao caso.** Resolvido sai do estado "pendente", mas permanece no histórico.

**Linha 4 — progresso e atividade recente.** Visão por marcos e período; execução recente da própria escola. **Não exibir prontidão, sono, HRV ou Body Battery por padrão.** Mesmo com grant, métricas pessoais ficam em área específica, com escopo e explicação claros.

**Menu da escola, alvo final:** Painel, Jornadas, Atletas, Professores, Turmas, Agenda, Presenças, Comunicação, Financeiro, Solicitações, Convites e Membros/Configurações. Agrupar itens no sidebar para evitar lista longa no mobile; no dock, apenas destinos principais e uma entrada "Mais". Esconder item condicionado a permissão — **sem depender disso para a segurança da rota/API**.

### 5.5 Telas da operação escolar básica

**Turmas.** Listagem com `ocupação/capacidade`, modalidade, faixa/nível quando aplicável, horários e professor. No detalhe, seções `Visão geral`, `Atletas`, `Professores`, `Agenda`, `Presenças`, `Treinos`. Modalidade usa cor de `--sport-*`; lotação tem chip semântico. Arquivar preserva histórico e impede novas inscrições; **não deletar turma com registros históricos**. Lembrete D3: nível, capacidade, local e horários exigem evolução de schema antes de aparecerem na tela.

**Agenda.** Grade dia/semana e alternativa em lista no mobile. Sessões recorrentes geram ocorrências identificáveis; cancelar uma ocorrência **não** cancela a série; trocas de professor ficam auditadas. Card mostra hora local, modalidade, turma, local, responsável, vagas e estado. Bloquear conflitos relevantes de professor/local conforme regra configurada. `WorkoutAssignment` **não** representa sozinho uma aula presencial.

**Presenças.** Professor autorizado abre sessão, marca presente/ausente/justificado, revisa até o fechamento e registra motivo de correção posterior. Atleta vê as próprias presenças. **Ausência em aula e treino não executado são métricas diferentes.** Histórico com data, sessão e autor. Check-in por QR ou localização fica para a Onda 4.

**Comunicação.** Rascunho → prévia de destinatários → envio → histórico/estado de entrega. Canais escolhidos e consentidos (in-app/e-mail/WhatsApp se a integração estiver ativa), sem assumir WhatsApp sempre disponível. Aviso coletivo **não expõe a lista de destinatários** uns aos outros. Rate limits, preferências e deduplicação. Conteúdo sobre saúde ou biometria não entra em mensagem em massa.

**Financeiro.** Definir ofertas/mensalidades, registrar matrícula e competência, emitir cobrança via provedor integrado quando houver, registrar recebimento manual com comprovante e conciliar. Estados `DRAFT`, `OPEN`, `PAID`, `OVERDUE`, `CANCELLED`, `REFUNDED` com regras de transição e histórico. Valor em centavos + currency; datas e fuso consistentes; dinheiro e permissões separados do acompanhamento esportivo. **Não presumir que o `TrainingProduct` do marketplace seja mensalidade escolar.** Provedor de pagamento é decisão técnica posterior; **nunca guardar dados sensíveis de cartão no Ryvano**.

### 5.6 Tela de jornada

Cabeçalho com meta, modalidade, data-alvo, status, escola, professor responsável e controle de compartilhamento. Logo abaixo, **marco atual** com descrição, critério de conclusão e próximo passo. Depois, grade de cards (próximos treinos, check-ins, feedback, decisões, cronologia). Linha do tempo em ordem, cada evento com data, autor, tipo, resumo e link para o registro original. O professor pode propor ajuste; o atleta visualiza a diferença entre plano anterior e proposto antes de aceitar. Marco encerrado torna-se somente leitura; retificação cria evento de correção.

### 5.7 Formulários e microfluxos

- **Criar meta:** título claro, modalidade canônica, prazo, descrição de sucesso, escola opcional, visibilidade; validação inline; rascunho antes de publicar.
- **Propor marcos:** 2–5 marcos por padrão, ordem explícita, nome, condição verificável, prazo, professor; salvar como rascunho ou enviar para aceite.
- **Aceitar/recusar proposta:** mostrar quem propôs, os marcos, os dados compartilhados e o que acontece ao aceitar; recusa com motivo opcional.
- **Ajustar plano:** diff de prazo/treinos/marcos; motivo obrigatório na decisão do professor; aceite do atleta quando altera compromisso dele; status permanece até a confirmação.
- **Check-in:** opções rápidas e campo livre opcional; deixar claro que **não é laudo nem leitura do relógio**.
- **Atribuir professor:** selecionar apenas `CoachProfile` com vínculo ativo nesta escola; checar ausência de atribuição primária ativa ou usar o fluxo de troca existente (`ChangeAthleteCoach`); confirmação e auditoria.
- **Turma:** validar escola, modalidade, professores ativos, atleta ativo e impedimento de edição quando arquivada; vincular pessoas existentes, **nunca criar duplicatas** por conveniência da tela.

---

## 6. Design system — requisito obrigatório

**O código existente é a fonte de verdade.** Não inventar paleta paralela, novos componentes de navegação ou outro estilo de cards. Se um padrão atual apresentar problema de contraste ou teclado, **corrigir o componente compartilhado** para todas as telas afetadas.

| Elemento | Referência e regra de implementação |
|---|---|
| Shell e navegação | Reusar `AppShell`, `AppHeader`, sidebar, `MobileDock` e `lib/navigation`. Novo item de menu usa ícone do catálogo existente; verificar estados ativo e mobile. |
| Cabeçalho da página | Espelhar o hero de `components/dashboard/dashboard-redesign.tsx` e `activity-visual-dashboard.tsx`: `rounded-[24px]`, borda/superfície translúcida, avatar, eyebrow, título, subtítulo, chips e filtros. **Não inserir um segundo header global.** |
| Grade de cards | Reusar `CustomizableCardGrid` com ID estável, `label`, `defaultSpan`, `accentClassName` e `content`; 1 coluna no mobile, 3 no desktop quando a composição permitir. Permitir reordenar e redimensionar como no dashboard do atleta. |
| Persistência do layout | Salvar por **usuário + escola + superfície** (`school-dashboard`), **nunca** em `UserProfile.dashboardLayoutOrder` (D6). Validar IDs permitidos, spans 1–3, escola e papel no servidor; descartar IDs obsoletos e adicionar cards novos ao fim. Erro de rede preserva edição local com opção de tentar de novo; "Descartar" restaura o último layout confirmado. |
| Contêiner de card | Partir do `CustomizableCardGrid`: raio 24 px, borda suave, superfície translúcida, sombra leve e linha de cor superior. Respeitar tema claro/escuro. Não envolver tabela extensa em card estreito. |
| Cores | Semânticas existentes `theme-pill-*` e `theme-panel-*`: informação azul/ciano, sucesso verde, atenção âmbar, erro/risco rosa/vermelho, neutro. Modalidade vem de `--sport-*` em `app/globals.css`; **não confundir modalidade com estado**. Cor é apoio, sempre acompanhada de texto/ícone. |
| Ícones | `@tabler/icons-react`, como nas telas atuais. Mesmo conceito usa mesmo ícone em cards e listas; ícone redundante recebe `aria-hidden`. |
| Botões e filtros | Reusar o padrão de pills do dashboard (`min-h-11`, borda suave, seleção evidente); **uma** ação principal por região. Links profundos preservam filtro e período em query string. |
| Motion | Reusar `motion/react`, entrada discreta e transições do dashboard; `useReducedMotion` elimina efeitos dispensáveis. Não animar números continuamente nem atrasar ações críticas. |
| Tipografia | Geist via tokens globais; `h1` equivalente ao dashboard, labels curtas, valores legíveis, textos auxiliares `text-foreground/66` com contraste verificado. Não usar texto minúsculo como único modo de ler status. |
| Tema | Conferir visual e contraste em `:root` (escuro) e `[data-theme="light"]`; preferir tokens e classes temáticas, evitando fundos fixos em componentes novos. |
| Responsividade | 320/375/768/1024/1440 px; filtros quebram linha; tabelas viram cards ou rolagem horizontal identificada; alvos ≥ 44 px; barra de salvar não cobre o dock móvel. |
| Estados | Skeleton com a geometria do resultado; erro com repetição da ação; vazio com explicação e próxima ação; sem permissão com mensagem adequada; conteúdo parcial sem travar a tela. |

### 6.1 Correção obrigatória no componente compartilhado (D7)

Antes de reusar o `CustomizableCardGrid` na escola:

1. **Operação por teclado:** foco no handle, mover com setas e anúncio por `aria-live`, ou ações explícitas "Mover para cima/baixo"; alternativa declarada para redimensionar.
2. **Superfícies temáticas:** substituir o fundo/sombra literais do contêiner e do banner de salvamento por tokens que respondam a `[data-theme="light"]`.
3. **Compatibilidade:** manter o comportamento atual no dashboard do atleta, atividades e integrações. **Não criar um segundo grid divergente.**

### 6.2 Mapa semântico de cards propostos

| Card | Acento sugerido | Valor e CTA |
|---|---|---|
| Ações de hoje | âmbar | Número de tarefas abertas; "Abrir fila". |
| Jornadas ativas | violeta/índigo | Jornadas ativas da escola; "Ver jornadas". |
| Atletas sem professor | âmbar | Atletas ativos sem atribuição primária ativa; "Atribuir". |
| Solicitações | azul/ciano | Atletas **+** professores pendentes (D4); "Analisar". |
| Treinos da semana | verde quando concluído, neutro quando agendado | Fração de realizados elegíveis, com período explícito; "Ver treinos". |
| Turmas | acento neutro no resumo, cor da modalidade no detalhe | Turmas não arquivadas; "Gerenciar turmas". |
| Avaliações pendentes | rosa/âmbar conforme prazo | Avaliações elegíveis aguardando ação; "Avaliar". |

**Cálculo das métricas.** Definir o denominador de cada indicador na consulta/DTO e no tooltip. Treinos `CANCELLED`, `RESCHEDULED` e futuros **não** contam como execução esperada; `JUSTIFIED` tem tratamento separado. Não classificar ausência de sincronização como falta. Substituir o `scheduledAt < startOfUtcDay` + `take: 200` por contagem agregada e lista paginada, com janela bem definida no fuso da escola (D5).

---

## 7. Regras de negócio e estados

### 7.1 Estados de jornada

```
DRAFT ──▶ PROPOSED ──▶ ACTIVE ──▶ COMPLETED
  ▲          │            │
  └──────────┤            ├──▶ PAUSED ──▶ ACTIVE | COMPLETED | CANCELLED
             ▼            └──▶ CANCELLED
          DECLINED
```

- `PROPOSED → DECLINED`, ou retorno a `DRAFT` pelo autor.
- `COMPLETED` exige **pelo menos um marco concluído** ou justificativa registrada de encerramento antecipado. **Não inferir conclusão apenas por data.**
- `CANCELLED` e `DECLINED` permanecem no histórico.

### 7.2 Estados de marco

```
PLANNED ──▶ IN_PROGRESS ──▶ REVIEW_REQUIRED ──▶ COMPLETED
                │
                ├──▶ PAUSED  (com motivo)
                └──▶ SKIPPED (com motivo)
```

Só **um** marco é o principal em progresso por jornada no MVP, mas treinos futuros podem ser planejados. Alterações de meta, critério, prazo e responsável criam revisão com antes/depois.

### 7.3 Regras invariantes

1. `athleteId` é `User.id`; **não** criar `AthleteProfile` duplicado. IDs de escola, coach e turma são os IDs dos respectivos modelos — em especial, `CoachSchoolMembership.coachId` referencia `CoachProfile.id`, **não** `User.id`.
2. A jornada pertence ao atleta; a escola participa no período de vínculo. Autor da proposta, da prescrição e da avaliação permanece identificável.
3. OWNER/ADMIN de escola **não** equivale a `User.role = ADMIN`. Professor só lê/edita jornadas de atletas atribuídos, conforme vínculo ativo e regra do caso de uso.
4. A escola só vê execuções dos treinos prescritos por ela. Histórico bruto, biometria, prontidão e dados de outras escolas exigem grant específico não revogado. **Aceitar uma jornada não cria grant de histórico.**
5. Treino realizado deriva de `WorkoutExecution`/atividade normalizada ou do fluxo manual existente. **Check-in curto não falsifica execução nem score de compliance.**
6. Encerrar vínculo não apaga jornada, histórico, audit log ou autoria. Eventos históricos têm data UTC e fonte; correção **acrescenta** versão/evento.
7. Alterações de status/atribuição, aceite de plano, revisão e auditoria ocorrem **na mesma transação**. Operações repetidas por retry são idempotentes.
8. Nenhum indicador, alerta ou score pode diagnosticar lesão ou impor treino. Sinal automatizado explica os fatos e **pede decisão humana**.

### 7.4 Alertas de trabalho inicial

| Evento | Critério verificável | Destinatário | Desfecho |
|---|---|---|---|
| Atleta sem professor | membership de atleta `ACTIVE` e nenhuma atribuição primária `ACTIVE` com `endedAt = null` | Escola | Atribuir, trocar ou adiar com motivo. |
| Treinos sem execução confirmada | 2 atribuições vencidas elegíveis, sem execução confirmada nem justificativa | Professor responsável | Contatar, justificar, ajustar ou aguardar. |
| Avaliação pendente | execução vinculada à escola sem avaliação dentro da janela configurada | Professor autor/responsável | Avaliar ou dispensar com motivo. |
| Marco próximo do prazo | prazo em 7 dias e marco não concluído | Professor e atleta | Revisar, ajustar ou concluir. |
| Feedback pede ajuda | atleta sinalizou dificuldade explicitamente | Professor | Responder ou ajustar. |

Armazenar `dedupeKey` por evento/entidade/janela, além de `status`, destinatário e resolução. Atualizar um treino **não** pode criar alertas duplicados. Permitir silenciar regras não críticas por escola/atleta. **Não notificar a escola inteira sobre dados individuais sem necessidade.**

---

## 8. Modelo de dados proposto

Confirmar no `schema.prisma` antes de criar migration. Os nomes abaixo são **proposta de contrato**, não declaração de que já existam. Seguir `architecture/rules/database.md`: FKs históricas com `Restrict`, timestamps `Timestamptz(3)`, dinheiro em centavos + currency.

### 8.1 Convenções aplicadas

- **IDs:** `cuid()`, como todo o schema atual.
- **Tempo:** `DateTime @db.Timestamptz(3)`; persistência em UTC, apresentação no fuso da escola/usuário.
- **Concorrência otimista:** `version Int @default(0)` nas entidades que aceitam decisão concorrente (jornada, marco). Mutação envia `expectedVersion`; divergência → `409`.
- **Modalidade:** `String @db.VarChar(100)`, canônica `RyvanoSportType`, igual a `WorkoutAssignment.sportType`. **Não** criar enum novo de esporte.
- **Exclusão:** vínculos operacionais usam `Cascade`; registros históricos usam `Restrict`.

### 8.2 Onda 0 — corrigir a base (migration `0035`)

Evolução de `Team` (D3) e persistência de layout (D6):

```prisma
model Team {
  id         String    @id @default(cuid())
  schoolId   String
  name       String    @db.VarChar(200)
  // --- novos campos (Onda 0) ---
  sportType  String?   @db.VarChar(100)   // canônico RyvanoSportType
  level      String?   @db.VarChar(100)   // "Iniciante", "Intermediário", ...
  capacity   Int?                          // null = sem limite declarado
  location   String?   @db.VarChar(200)
  notes      String?   @db.VarChar(1000)
  // --- existentes ---
  archivedAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime  @updatedAt @db.Timestamptz(3)

  school             School              @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  members            TeamAthlete[]
  coaches            TeamCoach[]
  workoutAssignments WorkoutAssignment[]

  @@index([schoolId, archivedAt])
  @@index([schoolId, sportType, archivedAt])
}

/// Layout de cards por usuário + escola + superfície.
/// Separado de UserProfile.dashboardLayoutOrder para que o painel da escola
/// não sobrescreva o dashboard pessoal do atleta (D6).
model DashboardLayoutPreference {
  id        String   @id @default(cuid())
  userId    String
  schoolId  String?  // null = superfície pessoal
  surface   String   @db.VarChar(50)   // "school-dashboard", "coach-dashboard", ...
  layoutJson Json
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  school School? @relation(fields: [schoolId], references: [id], onDelete: Cascade)

  @@unique([userId, schoolId, surface])
  @@index([userId, surface])
}
```

> **Nota sobre `@@unique` com coluna nullable.** Em Postgres, `NULL` não colide com `NULL` em índice único. Se a superfície pessoal (`schoolId = null`) precisar de unicidade real, usar índice parcial na migration SQL ou normalizar `schoolId` para uma sentinela não nula. Decidir explicitamente e documentar na migration — não deixar implícito.

`capacity` é **declaração**, não trava: a regra de lotação vive no caso de uso (`AddAthleteToTeam` verifica ocupação contra `capacity` quando não nulo) e retorna `TEAM_CAPACITY_EXCEEDED` (409).

### 8.3 Onda 1 — jornada (migration `0036`)

```prisma
enum JourneyStatus {
  DRAFT
  PROPOSED
  ACTIVE
  PAUSED
  COMPLETED
  CANCELLED
  DECLINED
}

enum MilestoneStatus {
  PLANNED
  IN_PROGRESS
  REVIEW_REQUIRED
  COMPLETED
  PAUSED
  SKIPPED
}

enum JourneyCheckInKind {
  DONE        // "consegui"
  HARD        // "difícil"
  NOT_DONE    // "não fiz"
}

enum JourneyReviewDecision {
  KEEP
  ADJUST
  PAUSE
  COMPLETE
  CANCEL
}

/// Meta do atleta com marcos. Pertence ao atleta (ADR-001); a escola
/// participa durante o vínculo. Encerrar o vínculo não apaga a jornada.
model AthleteJourney {
  id               String        @id @default(cuid())
  athleteId        String        // User.id
  schoolId         String?       // null = meta pessoal sem escola
  title            String        @db.VarChar(200)
  sportType        String        @db.VarChar(100)
  successCriteria  String        @db.VarChar(1000)
  targetAt         DateTime?     @db.Timestamptz(3)
  status           JourneyStatus @default(DRAFT)
  proposedByUserId String?
  acceptedAt       DateTime?     @db.Timestamptz(3)
  endedAt          DateTime?     @db.Timestamptz(3)
  endedReason      String?       @db.VarChar(500)
  version          Int           @default(0)
  createdAt        DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime      @updatedAt @db.Timestamptz(3)

  athlete    User    @relation("UserAthleteJourney", fields: [athleteId], references: [id], onDelete: Restrict)
  school     School? @relation(fields: [schoolId], references: [id], onDelete: Restrict)
  proposedBy User?   @relation("UserProposedJourney", fields: [proposedByUserId], references: [id], onDelete: SetNull)

  milestones     JourneyMilestone[]
  events         JourneyEvent[]
  attentionItems JourneyAttentionItem[]

  @@index([schoolId, status, targetAt, id])
  @@index([athleteId, status, id])
}

model JourneyMilestone {
  id                 String          @id @default(cuid())
  journeyId          String
  ordinal            Int
  title              String          @db.VarChar(200)
  successCriteria    String          @db.VarChar(1000)
  targetAt           DateTime?       @db.Timestamptz(3)
  status             MilestoneStatus @default(PLANNED)
  responsibleCoachId String?         // CoachProfile.id
  startedAt          DateTime?       @db.Timestamptz(3)
  completedAt        DateTime?       @db.Timestamptz(3)
  version            Int             @default(0)
  createdAt          DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime        @updatedAt @db.Timestamptz(3)

  journey          AthleteJourney        @relation(fields: [journeyId], references: [id], onDelete: Cascade)
  responsibleCoach CoachProfile?         @relation(fields: [responsibleCoachId], references: [id], onDelete: SetNull)
  assignmentLinks  JourneyAssignmentLink[]
  checkIns         JourneyCheckIn[]
  reviews          JourneyReview[]

  @@unique([journeyId, ordinal])
  @@index([journeyId, status])
  @@index([responsibleCoachId, status])
}

/// Liga um marco a um treino JÁ prescrito. Nunca duplica a prescrição
/// nem a execução — a verdade continua em WorkoutAssignment/WorkoutExecution.
model JourneyAssignmentLink {
  id                  String   @id @default(cuid())
  milestoneId         String
  workoutAssignmentId String
  createdByUserId     String?
  createdAt           DateTime @default(now()) @db.Timestamptz(3)

  milestone  JourneyMilestone  @relation(fields: [milestoneId], references: [id], onDelete: Cascade)
  assignment WorkoutAssignment @relation(fields: [workoutAssignmentId], references: [id], onDelete: Restrict)

  @@unique([milestoneId, workoutAssignmentId])
  @@index([workoutAssignmentId])
}

/// Sinal subjetivo do atleta. NÃO é execução, NÃO entra no compliance
/// e NÃO produz dado fisiológico (regra 7.3.5).
model JourneyCheckIn {
  id          String             @id @default(cuid())
  milestoneId String
  athleteId   String
  kind        JourneyCheckInKind
  note        String?            @db.VarChar(1000)
  createdAt   DateTime           @default(now()) @db.Timestamptz(3)

  milestone JourneyMilestone @relation(fields: [milestoneId], references: [id], onDelete: Cascade)
  athlete   User             @relation(fields: [athleteId], references: [id], onDelete: Restrict)

  @@index([milestoneId, createdAt])
  @@index([athleteId, createdAt])
}

/// Decisão humana sobre um marco, com antes/depois e motivo obrigatório.
model JourneyReview {
  id              String                @id @default(cuid())
  milestoneId     String
  decision        JourneyReviewDecision
  reason          String                @db.VarChar(1000)
  proposedChanges Json?
  authorUserId    String
  acceptedAt      DateTime?             @db.Timestamptz(3)  // aceite do atleta quando altera compromisso
  createdAt       DateTime              @default(now()) @db.Timestamptz(3)

  milestone JourneyMilestone @relation(fields: [milestoneId], references: [id], onDelete: Restrict)
  author    User             @relation(fields: [authorUserId], references: [id], onDelete: Restrict)

  @@index([milestoneId, createdAt])
}

/// Timeline legível pelo atleta. Distinta do SchoolAuditLog:
/// o audit log é rastro técnico; este é narrativa com visibilidade controlada.
model JourneyEvent {
  id           String   @id @default(cuid())
  journeyId    String
  type         String   @db.VarChar(80)   // JOURNEY_PROPOSED, MILESTONE_COMPLETED, ...
  summary      String   @db.VarChar(500)
  payload      Json?
  authorUserId String?
  visibility   String   @db.VarChar(20)   // "ATHLETE", "SCHOOL", "BOTH"
  occurredAt   DateTime @default(now()) @db.Timestamptz(3)

  journey AthleteJourney @relation(fields: [journeyId], references: [id], onDelete: Cascade)
  author  User?          @relation(fields: [authorUserId], references: [id], onDelete: SetNull)

  @@index([journeyId, occurredAt, id])
}

/// Fila de atenção. dedupeKey impede que um retry ou um update de treino
/// gere o mesmo alerta duas vezes na mesma janela (7.4).
model JourneyAttentionItem {
  id               String    @id @default(cuid())
  schoolId         String
  type             String    @db.VarChar(80)
  athleteId        String
  coachId          String?   // CoachProfile.id
  journeyId        String?
  milestoneId      String?
  dueAt            DateTime? @db.Timestamptz(3)
  reason           String    @db.VarChar(500)
  status           String    @db.VarChar(20)  @default("OPEN")  // OPEN | RESOLVED | DISMISSED
  dedupeKey        String    @db.VarChar(200)
  resolvedByUserId String?
  resolvedAt       DateTime? @db.Timestamptz(3)
  outcome          String?   @db.VarChar(80)
  resolutionNote   String?   @db.VarChar(1000)
  createdAt        DateTime  @default(now()) @db.Timestamptz(3)

  school     School          @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  athlete    User            @relation(fields: [athleteId], references: [id], onDelete: Restrict)
  coach      CoachProfile?   @relation(fields: [coachId], references: [id], onDelete: SetNull)
  journey    AthleteJourney? @relation(fields: [journeyId], references: [id], onDelete: Cascade)
  resolvedBy User?           @relation("UserResolvedAttention", fields: [resolvedByUserId], references: [id], onDelete: SetNull)

  @@unique([dedupeKey])
  @@index([schoolId, status, dueAt, id])
  @@index([coachId, status, dueAt, id])
}
```

#### Back-relations obrigatórias nos modelos existentes

O DDL acima **não compila sozinho**: Prisma exige o campo oposto em cada modelo referenciado. Acrescentar exatamente estas linhas aos modelos que já existem, senão `prisma validate` falha com "missing an opposite relation field".

```prisma
// model User
  dashboardLayoutPreferences DashboardLayoutPreference[]
  athleteJourneys            AthleteJourney[]       @relation("UserAthleteJourney")
  proposedJourneys           AthleteJourney[]       @relation("UserProposedJourney")
  journeyCheckIns            JourneyCheckIn[]
  journeyReviews             JourneyReview[]
  journeyEvents              JourneyEvent[]
  attentionItems             JourneyAttentionItem[]
  resolvedAttentionItems     JourneyAttentionItem[] @relation("UserResolvedAttention")

// model School
  dashboardLayoutPreferences DashboardLayoutPreference[]
  athleteJourneys            AthleteJourney[]
  attentionItems             JourneyAttentionItem[]

// model CoachProfile
  journeyMilestones     JourneyMilestone[]
  journeyAttentionItems JourneyAttentionItem[]

// model WorkoutAssignment
  journeyLinks JourneyAssignmentLink[]
```

`User` participa de oito relações distintas com o domínio de jornada, e duas delas apontam para o mesmo modelo (`AthleteJourney` como atleta e como proponente; `JourneyAttentionItem` como sujeito e como resolvedor). Por isso os nomes de relação (`@relation("...")`) são **obrigatórios** nesses quatro pares — sem eles, Prisma não consegue desambiguar.

> **Validação feita.** O DDL desta seção, mais as back-relations acima, foi checado com `prisma validate` contra o `schema.prisma` real em `998c5bf`: schema válido. Reexecutar após qualquer ajuste.

**MVP pragmático.** Se o volume de tarefas for pequeno, `JourneyAttentionItem` pode ser **derivado por consulta** antes de ser materializado — desde que preserve status de resolução persistente e deduplicação. Nesse caso, materializar apenas as resoluções. `JourneyEvent` pode aproveitar a infraestrutura de auditoria para o rastro técnico, mas **a timeline exibida ao atleta precisa de DTO próprio**, texto compreensível e filtragem por visibilidade: nunca expor o JSON bruto do audit log.

### 8.4 Onda 2 — operação escolar (migrations `0037+`)

Contratos resumidos; detalhar quando a onda entrar em execução.

| Entidade | Campos principais | Relações e regras |
|---|---|---|
| `SchoolClassSession` | `id, schoolId, teamId, coachId?, startsAt, endsAt, timezone, location?, capacity?, status, recurrenceId?, createdAt` | Ocorrência de aula/evento coletivo. Conflito e cancelamento **por ocorrência**; cancelar uma não cancela a série. Não confundir com prescrição. |
| `ClassAttendance` | `id, sessionId, athleteId, status, reason?, markedByUserId?, markedAt?, updatedAt` | `@@unique([sessionId, athleteId])`. Só atleta ativo/inscrito. Correção auditada. **Não altera `WorkoutAssignment`.** |
| `SchoolNotice` / `NoticeDelivery` | aviso: `schoolId, authorId, audience, content, status`; entrega: `channel, recipientId, status, providerRef?, sentAt?` | Audiência resolvida e **congelada na expedição**; idempotência por (aviso, destinatário, canal); opt-out aplicável. |
| `SchoolMembershipPlan` / `SchoolEnrollment` | oferta: `name, priceCents, currency, recurrence, status`; matrícula: `schoolId, athleteId, planId, startedAt, endedAt?, status` | Contrato comercial **separado** de jornada e do marketplace. Versão de preço preservada na matrícula. |
| `SchoolInvoice` / `SchoolPayment` | fatura: `enrollmentId, period, amountCents, dueAt, status`; pagamento: `amountCents, paidAt, method, providerRef?, status` | Cobrança idempotente por competência; conciliação auditada; estorno é registro separado, não edição. |

**Templates, marketplace e multi-escola.** Não antecipar tabelas para a Onda 3. O `TrainingProduct` existente é plano comercializável, **distinto** de `AthleteJourney` e de mensalidade escolar; só vincular quando houver caso real. Evitar migration invasiva sem necessidade.

---

## 9. Contratos HTTP

### 9.1 Convenções obrigatórias

Seguindo `architecture/rules/api.md` e o padrão já em uso em `app/api/schools/**`:

- **Rotas são adaptadores finos.** Autenticar, validar, delegar. Nenhuma regra de negócio no handler.
- **Envelope:** usar `schoolResponse` de `app/api/schools/_shared.ts`. Ele já trata `SchoolError`, `ZodError` (→ 400 `VALIDATION_ERROR`) e flag desligada (→ 404 `SCHOOL_MODULE_DISABLED`).
- **Validação:** Zod `strictObject`; ID opaco não vazio; datas ISO 8601 no HTTP e UTC na persistência.
- **Erros:** código estável do catálogo `SCHOOL_ERROR_STATUS`; mensagem segura, sem vazar existência de recurso alheio.
- **Runtime:** `export const runtime = "nodejs"` e `export const dynamic = "force-dynamic"`, como nas rotas atuais.
- **Nunca confiar em `schoolId`, `coachId` ou `athleteId` vindos do corpo** para conceder papel. O ator sai da sessão.

**Paginação.** Resposta `{ items, nextCursor }`, `limit` padrão 20 e máximo 100, ordenação estável com `id` como desempate — igual ao `querySchema` de `app/api/schools/[id]/lobby/route.ts`:

```ts
const querySchema = z.strictObject({
  limit:  z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(2048).optional(),
});
```

**Códigos de erro novos** a acrescentar em `modules/school/domain/errors.ts`:

| Código | Status | Quando |
|---|---|---|
| `JOURNEY_NOT_FOUND` | 404 | Jornada inexistente ou fora do escopo do ator. |
| `MILESTONE_NOT_FOUND` | 404 | Marco inexistente ou de outra jornada. |
| `ATTENTION_ITEM_NOT_FOUND` | 404 | Item da fila inexistente ou de outra escola. |
| `JOURNEY_INVALID_TRANSITION` | 409 | Transição fora do diagrama de 7.1/7.2. |
| `JOURNEY_VERSION_CONFLICT` | 409 | `expectedVersion` divergente (edição concorrente). |
| `JOURNEY_MILESTONE_LIMIT` | 409 | Fora da faixa de 2–5 marcos na proposta. |
| `TEAM_CAPACITY_EXCEEDED` | 409 | Inclusão excede `Team.capacity`. |
| `TEAM_ARCHIVED` | 409 | Escrita em turma arquivada. |
| `ASSIGNMENT_NOT_IN_SCOPE` | 409 | Treino de outro atleta/escola ao vincular a marco. |

### 9.2 Onda 0 — turmas (fecha D2)

Casos de uso já existem em `modules/school/application/manage-team.ts`; falta só o adaptador.

| Método e rota | Entrada | Saída/efeito | Caso de uso |
|---|---|---|---|
| `GET /api/schools/[id]/teams` | `?archived&sportType&cursor&limit` | `{ items, nextCursor }` com ocupação e professores | novo `ListTeams` |
| `POST /api/schools/[id]/teams` | `{ name, sportType?, level?, capacity?, location?, notes? }` | Turma criada (201) | `CreateTeam` |
| `GET /api/schools/[id]/teams/[teamId]` | — | Turma, atletas, professores, contagens | novo `GetTeamDetail` |
| `PATCH /api/schools/[id]/teams/[teamId]` | campos editáveis + `expectedVersion` | Turma atualizada | novo `UpdateTeam` |
| `POST /api/schools/[id]/teams/[teamId]/archive` | `{}` | `archivedAt` preenchido; histórico preservado | `ArchiveTeam` |
| `POST /api/schools/[id]/teams/[teamId]/athletes` | `{ athleteId }` | Vínculo criado | `AddAthleteToTeam` |
| `DELETE /api/schools/[id]/teams/[teamId]/athletes/[athleteId]` | — | Vínculo removido | `RemoveAthleteFromTeam` |
| `POST /api/schools/[id]/teams/[teamId]/coaches` | `{ coachId }` (**`CoachProfile.id`**) | Vínculo criado | `AddCoachToTeam` |
| `DELETE /api/schools/[id]/teams/[teamId]/coaches/[coachId]` | — | Vínculo removido | `RemoveCoachFromTeam` |

Esqueleto conforme o padrão do repositório:

```ts
// app/api/schools/[id]/teams/route.ts
import { z } from "zod";
import { prisma } from "@/server/db";
import { CreateTeam, createTeamSchema } from "@/modules/school/application/manage-team";
import { ListTeams } from "@/modules/school/application/list-teams";
import { schoolResponse, type SchoolRouteContext } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.strictObject({
  archived:  z.enum(["true", "false"]).optional(),
  sportType: z.string().min(1).max(100).optional(),
  limit:     z.coerce.number().int().min(1).max(100).optional(),
  cursor:    z.string().min(1).max(2048).optional(),
});

const list = new ListTeams(prisma);
const create = new CreateTeam(prisma);

export function GET(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return list.execute(actorId, (await context.params).id, query);
  });
}

export function POST(request: Request, context: SchoolRouteContext) {
  return schoolResponse(async (actorId) => {
    const body = createTeamSchema.parse(await request.json());
    return create.execute(actorId, { ...body, schoolId: (await context.params).id });
  }, 201);
}
```

### 9.3 Onda 1 — jornada

| Método e rota | Entrada | Saída/efeito | Autorização |
|---|---|---|---|
| `POST /api/journeys` | `{ athleteId?, schoolId?, title, sportType, successCriteria, targetAt? }` | Jornada `DRAFT` (201) | Atleta: `athleteId` **fixado da sessão**. Escola/coach: valida `athleteId` e vínculo ativo **no servidor**. |
| `GET /api/journeys` | `?schoolId&status&coachId&teamId&cursor&limit` | `{ items, nextCursor }`; resumo sem dados externos | Atleta vê só as próprias; escola/coach precisam de escopo explícito. |
| `GET /api/journeys/[id]` | — | Meta, marcos, links de treino, eventos visíveis, ações permitidas | Guard no caso de uso; ID de outra escola → `JOURNEY_NOT_FOUND`. |
| `PATCH /api/journeys/[id]` | campos editáveis + `expectedVersion` | Jornada atualizada | Autor enquanto `DRAFT`; depois exige revisão. |
| `POST /api/journeys/[id]/propose` | `{ milestones: [...], expectedVersion }` | `PROPOSED` + evento + audit | Autor autorizado com vínculo ativo; 2–5 marcos. |
| `POST /api/journeys/[id]/accept` | `{ expectedVersion }` | `ACTIVE`, `acceptedAt` | **Somente o atleta.** (Responsável legal é Onda 4, com modelagem própria.) |
| `POST /api/journeys/[id]/decline` | `{ expectedVersion, reason? }` | `DECLINED` | Somente o atleta. |
| `POST /api/journeys/[id]/milestones/[mid]/check-ins` | `{ kind, note? }` | Check-in registrado (201) | Atleta dono. **Não altera status de treino nem compliance.** |
| `POST /api/journeys/[id]/milestones/[mid]/reviews` | `{ decision, reason, expectedVersion, proposedChanges? }` | Revisão + evento + audit | Professor responsável; aceite do atleta quando altera o compromisso dele. |
| `POST /api/journeys/[id]/assignment-links` | `{ milestoneId, workoutAssignmentId }` | Vínculo criado (201) | Coach autorizado; treino **do mesmo atleta e escola**, senão `ASSIGNMENT_NOT_IN_SCOPE`. |
| `DELETE /api/journeys/[id]/assignment-links/[linkId]` | — | Vínculo removido; prescrição intacta | Coach autorizado. |

### 9.4 Onda 1 — fila de atenção e layout

| Método e rota | Entrada | Saída/efeito | Autorização |
|---|---|---|---|
| `GET /api/schools/[id]/attention` | `?status&type&coachId&cursor&limit` | Fila paginada | OWNER/ADMIN da escola. Professor recebe a consulta escopada à sua atribuição. |
| `POST /api/schools/[id]/attention/[itemId]/resolve` | `{ outcome, note? }` | `RESOLVED` com autor e data; permanece no histórico | Ator autorizado para aquele item. |
| `GET /api/schools/[id]/dashboard-layout` | — | Layout salvo ou padrão | OWNER/ADMIN. |
| `PUT /api/schools/[id]/dashboard-layout` | `{ layout: [{ id, span }] }` | Layout persistido em `DashboardLayoutPreference` | OWNER/ADMIN; IDs de card na allowlist e `span ∈ 1..3`. |

```ts
const layoutSchema = z.strictObject({
  layout: z.array(z.strictObject({
    id:   z.enum(SCHOOL_DASHBOARD_CARD_IDS),   // allowlist do servidor
    span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })).max(SCHOOL_DASHBOARD_CARD_IDS.length),
});
```

IDs desconhecidos são **descartados** (não causam erro — o catálogo de cards evolui); cards novos entram no fim. Isso mantém o layout salvo válido após um deploy que adiciona um card.

### 9.5 Onda 2 — operação escolar

| Método e rota | Entrada | Saída/efeito | Autorização |
|---|---|---|---|
| `GET/POST /api/schools/[id]/class-sessions` | intervalo/filtros ou `{ teamId, coachId, startsAt, endsAt, location?, recurrence? }` | Sessões paginadas ou sessão criada | OWNER/ADMIN; professor apenas leitura da agenda atribuída. |
| `PATCH /api/schools/[id]/class-sessions/[sessionId]/attendance` | `{ athleteId, status, reason?, expectedVersion }` | Presença + evento de correção | Professor da turma ou OWNER/ADMIN, escopado à sessão. |
| `GET/POST /api/schools/[id]/notices` | filtros ou `{ audience, channels, content, scheduledAt? }` | Aviso, prévia de audiência e entregas | OWNER/ADMIN ou papel delegado; validar preferências **antes** de enviar. |
| `GET/POST /api/schools/[id]/invoices` | competência/filtros ou cobrança validada | Faturas e pagamentos sem duplicata | Permissão financeira específica; escrita idempotente e auditada. |

### 9.6 DTOs de apresentação

**Card de resumo:**

```ts
type SchoolCardSummary = {
  label: string;
  value: number | string;
  period: string;        // "últimos 7 dias", "semana atual"
  definition: string;    // denominador explícito, exibido em tooltip
  href: string | null;   // link profundo com filtro já aplicado
  statusTone: "neutral" | "info" | "success" | "warning" | "danger";
  isPartial: boolean;    // true quando a consulta foi truncada
};
```

Se `isPartial`, mostrar aviso e **nunca** exibir percentual enganoso.

**Desempenho.** Evitar N+1: consultas agregadas por escola/coach e seleção mínima de colunas. Filas e listas de atletas paginam por cursor. Contagens de card usam `count`/`groupBy`, nunca `findMany` com `take` alto seguido de `length` (a causa de D5).

---

## 10. Acesso, privacidade e auditoria

### 10.1 Princípio estrutural

> O guard do `layout.tsx` protege **a página**. Ele **não** protege a API. Toda rota nova faz a sua própria checagem no servidor.

`app/escola/[schoolId]/layout.tsx` exige `schoolMembership` ativa com papel OWNER ou ADMIN e redireciona para `/app/dashboard` caso contrário. Isso cobre a navegação, e **nada mais**. Uma rota de API sem checagem própria é acessível a qualquer sessão autenticada que adivinhe o ID.

### 10.2 Matriz de autorização

| Recurso | Atleta dono | Professor atribuído | Professor da escola, não atribuído | OWNER/ADMIN | Outro usuário |
|---|---|---|---|---|---|
| Ler jornada própria | ✅ | — | — | — | ❌ |
| Ler jornada de atleta da escola | — | ✅ (só atribuídos) | ❌ | ✅ (jornadas da escola) | ❌ |
| Criar jornada para si | ✅ | — | — | — | ❌ |
| Propor marcos | ❌ | ✅ | ❌ | ✅ | ❌ |
| Aceitar/recusar proposta | ✅ **exclusivo** | ❌ | ❌ | ❌ | ❌ |
| Registrar check-in | ✅ **exclusivo** | ❌ | ❌ | ❌ | ❌ |
| Revisar marco | ❌ | ✅ | ❌ | ✅ | ❌ |
| Vincular treino a marco | ❌ | ✅ | ❌ | ✅ | ❌ |
| Ler fila de atenção | ❌ | ✅ (escopada) | ❌ | ✅ (escola) | ❌ |
| Gerenciar turmas | ❌ | ❌ | ❌ | ✅ | ❌ |
| Ler histórico anterior ao vínculo | ✅ | apenas com `HistoryAccessGrant` | ❌ | apenas com grant | ❌ |
| Conceder acesso ao histórico | ✅ **exclusivo** | ❌ | ❌ | ❌ | ❌ |
| Ler valores financeiros | ❌ | ❌ | ❌ | apenas com permissão financeira | ❌ |
| Salvar layout do painel da escola | ❌ | ❌ | ❌ | ✅ (próprio) | ❌ |

### 10.3 Regras de identidade que já causaram erro

- **`CoachSchoolMembership.coachId` referencia `CoachProfile.id`, não `User.id`.** Para filtrar por usuário, usar a relação: `coach: { userId }`. Confundir os dois produz consulta que não retorna nada — ou, pior, que retorna o registro errado.
- **`athleteId` é `User.id`** diretamente; não existe `AthleteProfile`.
- **OWNER/ADMIN de escola ≠ `User.role = ADMIN`.** O papel é escopado por escola; o `Role` global é outra coisa.
- Professor precisa de **vínculo escolar ativo** *e* **atribuição ao atleta**, conforme a operação.

### 10.4 Privacidade e consentimento

- O atleta visualiza a própria jornada e os próprios fatos. Usuário onboarded de outra escola **não** recebe dados por adivinhar um ID: a resposta é `404`, não `403` com conteúdo.
- Histórico anterior ao vínculo e biometria exigem `HistoryAccessGrant` não revogado, com escopo e prazo. **Sem grant, a escola lê apenas as execuções das prescrições feitas por ela.**
- **Aceitar uma jornada não cria grant de histórico.** São consentimentos distintos e a UI precisa deixar isso explícito na tela de aceite.
- OWNER/ADMIN **não** concede consentimento pelo atleta. Compartilhamento futuro entre escolas explicita organização, categorias, período, finalidade e botão de revogação. Revogar interrompe leituras subsequentes; o registro de autoria **não** é apagado.
- Não exibir prontidão, sono, HRV ou Body Battery no painel escolar por padrão. Mesmo com grant, métricas pessoais ficam em área específica com escopo declarado.

### 10.5 Auditoria e concorrência

- Gravar alterações de escola/coach/jornada **na mesma transação** que `SchoolAuditLog` ou evento equivalente, com ator, entidade, antes/depois relevante e horário. Evitar payload excessivo e PII em logs — usar `schoolLogger`.
- Ser explícito sobre quem pode ler cada tipo de evento (`JourneyEvent.visibility`).
- **Revalidar permissão no momento da mutação**, não apenas quando a página carregou. Uma sessão pode ter perdido o papel entre o render e o submit.
- Mudanças concorrentes usam `expectedVersion` → `409 JOURNEY_VERSION_CONFLICT`. A UI mostra o que mudou e permite reenviar; **nunca sobrescrever silenciosamente a decisão alheia**.

---

## 11. Acessibilidade e qualidade de experiência

- Ordem do teclado acompanha a ordem visual; foco visível; **cards arrastáveis também podem ser movidos sem ponteiro** (D7); mudanças e erros anunciados por `aria-live`.
- Títulos hierárquicos com `h1` único, labels reais, descrição de erro ligada ao campo, estados nunca indicados só por cor; contadores explicados por período e denominador.
- Datas apresentadas no fuso da escola/usuário, instantes em UTC no banco. **Não usar o início do dia UTC como equivalente silencioso do dia local** (D5).
- No mobile, a hierarquia é: próximo passo → ações pendentes → progresso → listas. Grade de uma coluna, hero compacto, dock navegável sem sobreposição do banner de salvar.
- **Sem integração de relógio**, jornada, prescrição, check-in e feedback continuam utilizáveis. Nenhum card pessoal de Garmin vazio aparece para conta administrativa.
- **Estado sem jornada:** explicar "Defina um objetivo para organizar seus próximos treinos" e oferecer a ação autorizada. **Sem professor:** CTA de atribuição para a escola; para o atleta, explicar que a escola analisará o vínculo.
- Erro ao salvar plano ou layout: manter a edição local, mensagem clara e nova tentativa. Evitar perda de rascunho por navegação acidental.

---

## 12. Critérios de aceite

Cada item é verificável. `AC-0.x` fecha a Onda 0; `AC-1.x` fecha a Onda 1; `AC-2.x` fecha a Onda 2.

### Onda 0 — base operacional

| ID | Critério | Como verificar |
|---|---|---|
| **AC-0.1** | `/escola/{id}/turmas` deixa de responder 404 e renderiza a lista. Nenhum item de menu ou card leva a rota inexistente. | `audit-routes.sh`; abrir a rota autenticado como OWNER. |
| **AC-0.2** | OWNER cria turma, associa professor com vínculo ativo e atletas ativos existentes. Nenhuma pessoa duplicada é criada pelo formulário. | Teste de integração de `CreateTeam` + `AddAthleteToTeam`; conferir contagem de `User`/`CoachProfile` antes e depois. |
| **AC-0.3** | Atleta sem professor pode ser atribuído a partir do lobby, com auditoria. | Fluxo no lobby; `SchoolAuditLog` recebe o registro na mesma transação. |
| **AC-0.4** | Turma arquivada preserva o histórico e recusa novas inscrições (`TEAM_ARCHIVED`). Turma com registros históricos não é deletável. | Teste de caso de uso. |
| **AC-0.5** | Inclusão que excede `Team.capacity` retorna `409 TEAM_CAPACITY_EXCEEDED`; `capacity` nulo significa sem limite. | Teste de caso de uso nos dois cenários. |
| **AC-0.6** | O card "Solicitações" conta atletas **e** professores pendentes; o número bate exatamente com a lista da tela de solicitações. | Seed com 2 atletas + 1 professor pendentes → card mostra 3. |
| **AC-0.7** | "Atrasados" usa contagem agregada e lista paginada; com mais de 200 atrasados o total continua correto e a UI sinaliza paginação. | Seed com 250 atribuições vencidas. |
| **AC-0.8** | A janela de "atrasado" respeita o fuso da escola; um treino de hoje cedo em fuso negativo não aparece como atrasado. | Teste unitário do recorte de janela. |
| **AC-0.9** | Layout de cards salva por usuário **e** escola. Alterar o painel da Escola A não altera o da Escola B nem o dashboard pessoal do atleta. | Teste de integração nas três superfícies. |
| **AC-0.10** | Um deploy que acrescenta um card novo **preserva** o layout salvo; o card novo entra no fim e IDs obsoletos são descartados sem erro. | Teste unitário da reconciliação de layout. |
| **AC-0.11** | Os cards do painel escolar podem ser reordenados e redimensionados **apenas com teclado**, com anúncio da mudança. | Navegação por teclado; verificar `aria-live`. |
| **AC-0.12** | O banner de salvar layout tem contraste adequado nos temas claro e escuro e **não cobre** o dock móvel a 320 px. | Revisão visual nos dois temas e em 320 px. |

### Onda 1 — jornada

| ID | Critério | Como verificar |
|---|---|---|
| **AC-1.1** | Atleta cria meta; professor autorizado propõe marcos; atleta aceita. Status, autoria e datas aparecem **iguais** nas visões de atleta, professor e escola. | E2E nos três perfis. |
| **AC-1.2** | Usuário sem vínculo não abre a jornada nem por URL direta nem por API: recebe `404`, sem vazar existência. | Teste de rota com sessão não relacionada. |
| **AC-1.3** | Proposta com menos de 2 ou mais de 5 marcos retorna `409 JOURNEY_MILESTONE_LIMIT`. | Teste de caso de uso. |
| **AC-1.4** | Enquanto `PROPOSED`, a UI **não** apresenta o plano como acordado. Só `accept` leva a `ACTIVE` e grava `acceptedAt`. | Teste de estado + revisão da tela. |
| **AC-1.5** | Somente o atleta aceita. Coach ou OWNER chamando `accept` recebem `403`. | Teste de autorização. |
| **AC-1.6** | Treino prescrito para um marco aparece no calendário existente; a execução confirmada é mostrada na jornada **por vínculo**, sem segundo registro. | Verificar que não há linha nova em `WorkoutExecution`. |
| **AC-1.7** | Check-in manual sozinho **não** conta como execução nem altera o score de compliance. | Teste: criar check-in `DONE` e conferir que o status e o compliance da atribuição não mudam. |
| **AC-1.8** | Vincular treino de outro atleta/escola a um marco retorna `409 ASSIGNMENT_NOT_IN_SCOPE`. | Teste de caso de uso. |
| **AC-1.9** | Dois treinos elegíveis sem execução geram **um** item de atenção na janela. Reprocessar o job não duplica (dedupeKey). | Executar o gerador duas vezes; conferir contagem. |
| **AC-1.10** | Resolver um item registra autor e desfecho e **não apaga** o histórico; ele sai de "pendente" mas continua consultável. | Teste de caso de uso. |
| **AC-1.11** | Ausência de sincronização **não** vira falta automaticamente. | Seed sem atividade importada → nenhum alerta de falta. |
| **AC-1.12** | Revisão de marco mostra antes/depois e motivo obrigatório. | Revisão da tela + validação do caso de uso. |
| **AC-1.13** | Atualização simultânea com `expectedVersion` antigo retorna `409 JOURNEY_VERSION_CONFLICT`, sem sobrescrever a decisão alheia. | Teste de concorrência com duas chamadas. |
| **AC-1.14** | Aceitar jornada **não** cria `HistoryAccessGrant`. | Teste: aceitar e conferir que não há grant novo. |
| **AC-1.15** | Encerrar o vínculo com a escola preserva jornada, marcos, autoria e audit log; a escola perde leitura futura. | Teste de caso de uso de saída. |
| **AC-1.16** | O painel escolar **não** exibe prontidão, sono, HRV ou Body Battery. | Revisão da tela e da consulta. |

### Onda 2 — operação escolar

| ID | Critério | Como verificar |
|---|---|---|
| **AC-2.1** | Sessão recorrente é cancelável individualmente sem cancelar a série. | Teste de caso de uso. |
| **AC-2.2** | Presença pode ser corrigida com autoria e **não altera** automaticamente a execução de `WorkoutAssignment`. | Teste de caso de uso. |
| **AC-2.3** | Mensagem coletiva respeita destinatários e preferências, é idempotente por (aviso, destinatário, canal) e **não expõe** a lista de destinatários. | Teste de entrega + inspeção do payload. |
| **AC-2.4** | Cobrança mensal não duplica quando a tarefa é repetida. | Executar o job duas vezes na mesma competência. |
| **AC-2.5** | Somente perfil com permissão financeira vê valores e executa estorno. | Teste de autorização com OWNER sem permissão financeira. |

### Transversais — sempre verificados

| ID | Critério | Como verificar |
|---|---|---|
| **AC-T.1** | Professor bloqueado em `/escola/*`; atleta bloqueado em `/professor/*`; usuário comum bloqueado em `/admin/*`. A API retorna 403/404 apropriado em acesso cruzado. | `audit-access.sh` com os três perfis. |
| **AC-T.2** | Atleta que deixou a escola acessa o próprio histórico autorizado, mas **não** a administração. | Teste com membership encerrada. |
| **AC-T.3** | Sem relógio, sem escola, sem turma, sem treinos e sem jornada, cada tela apresenta um próximo passo coerente — sem loading infinito e sem dado falso. | Seed mínimo; percorrer as telas. |
| **AC-T.4** | Modo claro/escuro, teclado, 320 px e movimento reduzido verificados em toda tela nova. | Revisão visual e por teclado. |
| **AC-T.5** | Todo indicador leva a uma tela funcional com o filtro já aplicado. Nenhum número é beco sem saída. | Clicar em cada card. |
| **AC-T.6** | Com `SCHOOL_MODULE_ENABLED=false`, todas as rotas novas retornam 404 `SCHOOL_MODULE_DISABLED`. | Teste de rota com a flag desligada. |

---

## 13. Backlog executável

Numeração a partir de **T500** (o maior ID em uso é `T407`). Estados seguem o protocolo de `.kiro/specs/ryvano-escola-spec/task-list.md`: `[ ]` pendente, `[~]` em andamento, `[x]` concluída, `[!]` bloqueada. **Nunca marcar `[x]` uma task apenas iniciada.**

### Onda 0 — base operacional (T500–T519)

| ID | Task | Depende de | Entrega |
|---|---|---|---|
| `[ ]` **T500** | Migration `0035`: campos de `Team` (`sportType`, `level`, `capacity`, `location`, `notes`) + índice `(schoolId, sportType, archivedAt)` | — | Migration reversível + `schema.prisma`. |
| `[ ]` **T501** | Migration `0035`: modelo `DashboardLayoutPreference` com decisão explícita sobre unicidade com `schoolId` nulo | T500 | Migration + nota sobre índice parcial. |
| `[ ]` **T502** | Novos códigos em `SCHOOL_ERROR_STATUS`: `TEAM_CAPACITY_EXCEEDED`, `TEAM_ARCHIVED` | — | `modules/school/domain/errors.ts` + teste. |
| `[ ]` **T503** | Casos de uso `ListTeams`, `GetTeamDetail`, `UpdateTeam` (com `expectedVersion`) | T500 | Arquivos em `modules/school/application/` + testes. |
| `[ ]` **T504** | Regra de capacidade em `AddAthleteToTeam` e bloqueio de escrita em turma arquivada | T500, T502 | Alteração em `manage-team.ts` + testes. |
| `[ ]` **T505** | Rotas `GET/POST /api/schools/[id]/teams` | T503 | Adaptadores finos com `schoolResponse`. |
| `[ ]` **T506** | Rotas `GET/PATCH /api/schools/[id]/teams/[teamId]` e `POST .../archive` | T503 | Adaptadores + testes de rota. |
| `[ ]` **T507** | Rotas de vínculo: atletas e professores da turma (4 rotas) | T504 | Adaptadores + testes de autorização. |
| `[ ]` **T508** | Tela `/escola/[schoolId]/turmas` — lista, busca, filtros, criar/arquivar (**fecha D1**) | T505, T506 | Página + componentes. |
| `[ ]` **T509** | Tela `/escola/[schoolId]/turmas/[teamId]` — detalhe com atletas, professores e contagens | T506, T507 | Página. |
| `[ ]` **T510** | Acessibilidade do `CustomizableCardGrid`: teclado + `aria-live` (**fecha D7, parte 1**) | — | Alteração no componente compartilhado + teste. |
| `[ ]` **T511** | Superfícies temáticas do `CustomizableCardGrid` e do banner de salvar (**fecha D7, parte 2**) | T510 | Tokens de tema; revisão visual nos dois temas. |
| `[ ]` **T512** | Caso de uso + rotas `GET/PUT /api/schools/[id]/dashboard-layout` com allowlist e reconciliação de IDs | T501 | Caso de uso + rotas + testes. |
| `[ ]` **T513** | Corrigir contagem de solicitações: atletas **+** professores (**fecha D4**) | — | Alteração em `app/escola/[schoolId]/page.tsx` + teste. |
| `[ ]` **T514** | Substituir `take: 200` por contagem agregada + lista paginada (**fecha D5, parte 1**) | — | Consulta refeita + teste com 250 registros. |
| `[ ]` **T515** | Recorte de janela no fuso da escola, eliminando `startOfUtcDay` como proxy do dia local (**fecha D5, parte 2**) | T514 | Helper + testes de fuso. |
| `[ ]` **T516** | Redesenhar `/escola/[schoolId]` com `CustomizableCardGrid`, hero e links profundos | T511, T512, T513, T515 | Página redesenhada. |
| `[ ]` **T517** | Ação "Atribuir professor" no lobby, reusando `AssignCoachToAthlete`/`ChangeAthleteCoach` | — | Componente + auditoria. |
| `[ ]` **T518** | Atualizar `references/screen-map.md` e `references/access-matrix.md` da skill `ryvano-telas` | T508, T509, T516 | Documentação da skill. |
| `[ ]` **T519** | Seed e2e com turmas, capacidade e atletas sem professor, sem duplicar pessoas | T500 | `prisma/seed.ts`. |

### Onda 1 — jornada (T520–T549)

| ID | Task | Depende de | Entrega |
|---|---|---|---|
| `[ ]` **T520** | Migration `0036`: enums `JourneyStatus`, `MilestoneStatus`, `JourneyCheckInKind`, `JourneyReviewDecision` | — | Migration. |
| `[ ]` **T521** | Migration `0036`: `AthleteJourney`, `JourneyMilestone`, `JourneyAssignmentLink` com índices de 8.3 | T520 | Migration + schema. |
| `[ ]` **T522** | Migration `0036`: `JourneyCheckIn`, `JourneyReview`, `JourneyEvent` | T521 | Migration + schema. |
| `[ ]` **T523** | Migration `0036`: `JourneyAttentionItem` com `@@unique([dedupeKey])` | T521 | Migration + schema. |
| `[ ]` **T523b** | Back-relations em `User`, `School`, `CoachProfile` e `WorkoutAssignment` (bloco ao fim de 8.3) | T521–T523 | `schema.prisma`; `npx prisma validate` verde. |
| `[ ]` **T524** | Entidades de domínio e máquinas de estado de 7.1 e 7.2, com transições inválidas rejeitadas | T520 | `modules/school/domain/journey*.ts` + testes de transição. |
| `[ ]` **T525** | Códigos de erro de jornada em `SCHOOL_ERROR_STATUS` (7 códigos de 9.1) | T524 | `errors.ts` + teste. |
| `[ ]` **T526** | `CreateJourney` — `athleteId` da sessão para atleta; validação de vínculo para escola/coach | T521, T524 | Caso de uso + testes de autorização. |
| `[ ]` **T527** | `ProposeJourneyMilestones` — 2–5 marcos, transação com evento e audit | T526 | Caso de uso + testes. |
| `[ ]` **T528** | `AcceptJourney` / `DeclineJourney` — **exclusivos do atleta**, com `expectedVersion` | T527 | Caso de uso + teste de 403 para coach/owner. |
| `[ ]` **T529** | `LinkAssignmentToMilestone` / `UnlinkAssignment` — valida escopo atleta+escola | T521 | Caso de uso + teste de `ASSIGNMENT_NOT_IN_SCOPE`. |
| `[ ]` **T530** | `RecordJourneyCheckIn` — não altera status de treino nem compliance | T522 | Caso de uso + teste explícito de não interferência. |
| `[ ]` **T531** | `ReviewMilestone` — motivo obrigatório, antes/depois, aceite do atleta quando aplicável | T522, T524 | Caso de uso + testes. |
| `[ ]` **T532** | `ListJourneys` / `GetJourneyDetail` — paginação por cursor e escopo por perfil | T521 | Casos de uso + testes de escopo. |
| `[ ]` **T533** | Projeção de timeline: DTO próprio por `visibility`, sem expor JSON bruto de auditoria | T522 | Caso de uso + teste de visibilidade. |
| `[ ]` **T534** | Gerador da fila de atenção com as 5 regras de 7.4 e `dedupeKey` idempotente | T523 | Caso de uso + teste de reprocessamento. |
| `[ ]` **T535** | `ResolveAttentionItem` — autor, desfecho, histórico preservado | T534 | Caso de uso + testes. |
| `[ ]` **T536** | Rotas `POST/GET /api/journeys` e `GET/PATCH /api/journeys/[id]` | T526, T532 | Adaptadores + testes. |
| `[ ]` **T537** | Rotas de transição: `propose`, `accept`, `decline` | T527, T528 | Adaptadores + testes. |
| `[ ]` **T538** | Rotas de marco: check-ins, reviews, assignment-links | T529, T530, T531 | Adaptadores + testes. |
| `[ ]` **T539** | Rotas `GET /api/schools/[id]/attention` e `POST .../resolve` | T534, T535 | Adaptadores + testes. |
| `[ ]` **T540** | Telas `/app/jornadas` e `/app/jornadas/[journeyId]` com aceite e controle de compartilhamento | T536, T537 | Páginas. |
| `[ ]` **T541** | Telas `/professor/[schoolId]/jornadas` e `[journeyId]` com guard duplo | T536, T538 | Páginas. |
| `[ ]` **T542** | Telas `/escola/[schoolId]/jornadas` e `[journeyId]` | T536 | Páginas. |
| `[ ]` **T543** | Card "Minha jornada" no `/app/dashboard`, com estado vazio coerente | T532 | Componente. |
| `[ ]` **T544** | Fila de atenção na linha 3 do painel escolar, com ação contextual por item | T539, T516 | Componente. |
| `[ ]` **T545** | Instrumentação sem PII dos 5 eventos de 14.4 | T536–T539 | `schoolMetrics`. |
| `[ ]` **T546** | Atualizar `architecture/modules/school.yaml` e a skill `ryvano-telas` com as telas de jornada | T540–T542 | Documentação. |
| `[ ]` **T547** | Seed e2e de jornada nos estados `DRAFT`, `PROPOSED`, `ACTIVE`, com marcos e itens de atenção | T523 | `prisma/seed.ts`. |

### Onda 2 — operação escolar (T550+)

Detalhar quando a Onda 1 estiver aceita. Blocos previstos: **T550–T559** agenda e sessões; **T560–T569** presenças; **T570–T579** comunicação; **T580–T599** financeiro (matrícula, cobrança, conciliação, permissão financeira separada).

---

## 14. Verificação e entrega

### 14.1 Antes de implementar

1. Rodar `bash .agents/skills/ryvano-telas/scripts/audit-routes.sh` e inventariar as rotas; confirmar o 404 de turmas no estado corrente.
2. Conferir se D1–D7 continuam válidos no commit de trabalho — a seção 2.1 tem data e pode ter envelhecido.
3. Rodar impacto no GitNexus antes de editar símbolo compartilhado, especialmente `CustomizableCardGrid` (usado por dashboard, atividades e integrações) e `manage-team.ts`.
4. Examinar as telas do atleta e o design system no código, não apenas neste documento.

### 14.2 Como fatiar

Slices revisáveis e independentes, nesta ordem:

1. **Turmas e correções** (T500–T519) — entrega valor sozinha, sem depender de jornada.
2. **Domínio da jornada** (T520–T535) — schema e casos de uso, sem UI.
3. **API da jornada** (T536–T539).
4. **Telas** (T540–T544).
5. **Atenção, métricas e documentação** (T545–T547).

Migration reversível em toda fatia. Seed e2e não cria turmas nem profissionais duplicados.

### 14.3 Portões de verificação

| Portão | Comando | Critério |
|---|---|---|
| Tipos | `npx tsc --noEmit` | 0 erros. |
| Unidade e integração | `npx vitest run` | Verde. Inclui transições, autorização, idempotência e paginação. |
| Consultas | testes de integração com banco real | Contadores e listas concordam; nada de N+1 nas telas novas. |
| Acesso HTTP | `bash .agents/skills/ryvano-telas/scripts/audit-access.sh` com dev server + seed | Os três perfis batem com a matriz de 10.2. |
| Visual | revisão manual | Desktop e mobile, claro e escuro, 320 px, movimento reduzido. |
| Grafo | `node .gitnexus/run.cjs detect-changes --scope all --repo .` | Nenhum impacto cruzado inesperado. |

> **Armadilha conhecida do Next dev:** um Server Component pode responder `200` com meta refresh em vez de `3xx`. O `audit-access.sh` já interpreta isso — não concluir "a rota está desprotegida" só pelo código de status.

Testes obrigatórios por tipo de mudança:

- **Transição de estado:** caminho feliz **e** cada transição inválida rejeitada.
- **Autorização:** um teste por linha relevante da matriz de 10.2, incluindo o caso negativo.
- **Idempotência:** executar a operação duas vezes e conferir que o efeito é único.
- **Concorrência:** `expectedVersion` obsoleto retorna 409 sem sobrescrever.
- **Fuso:** janelas de data testadas em fuso positivo e negativo.

### 14.4 Instrumentação

Sem PII. Cinco eventos: jornada criada, proposta aceita, marco revisado, item de atenção resolvido, retorno semanal por perfil. Medir adoção e resolução de pendências — **não** usar tempo no app como sinal de valor.

### 14.5 Indicadores para validar a hipótese de produto

| Indicador | Definição inicial | Leitura esperada |
|---|---|---|
| Ativação do atleta | Meta criada e ao menos um marco aceito até 7 dias após o vínculo | O fluxo inicial comunica valor? |
| Ativação da escola | Primeiro atleta atribuído e primeira proposta de jornada enviada | A escola consegue operar? |
| Resposta do professor | Tempo até agir sobre um alerta legítimo | A fila ajuda ou gera ruído? |
| Continuidade | Atletas com revisão de marco e próximo passo após 4 semanas | Há acompanhamento real? |
| Qualidade dos alertas | Percentual de itens resolvidos como úteis versus descartados | Ajustar critérios e frequência. |

---

## 15. Limites da proposta e decisões em aberto

### 15.1 Limites assumidos

- A pesquisa de mercado já mostra produtos com passaporte esportivo e treinamento adaptativo. O diferencial aqui é uma **hipótese**: conectar meta, ações dos três perfis e continuidade entre organizações de modo consentido. Validar com escolas e atletas; **não anunciar "primeiro do mundo"**.
- Nada nesta spec está implementado. Toda tabela de contratos é proposta até existir código e teste.
- O limiar de dois treinos sem execução é **configuração inicial**, não verdade clínica nem regra universal.

### 15.2 Decisões em aberto

| # | Decisão | Por que importa | Quem decide |
|---|---|---|---|
| **Q1** | A primeira escola piloto é assessoria remota, escola presencial ou ambas? | Determina a ordem de entrega de agenda, presença, cobrança e responsáveis dentro da Onda 2. | Produto, com pilotos. |
| **Q2** | Metas pessoais sem escola entram no MVP ou só no modelo de dados? | `AthleteJourney.schoolId` já é nullable e suporta os dois; muda o escopo das telas da Onda 1. | Produto. |
| **Q3** | `JourneyAttentionItem` nasce materializado ou derivado por consulta? | Materializado é mais simples de paginar e resolver; derivado evita job e tabela. Ver nota de 8.3. | Engenharia, por volume medido. |
| **Q4** | Unicidade de `DashboardLayoutPreference` com `schoolId` nulo: índice parcial ou sentinela? | Postgres não trata `NULL` como colisão. Precisa ser decidido **na** migration, não depois. | Engenharia (T501). |
| **Q5** | Provedor de pagamento da Onda 2. | Define modelagem de `providerRef` e conciliação. **Nunca guardar dados de cartão no Ryvano.** | Produto + engenharia. |
| **Q6** | Permissão financeira é um `SchoolRole` novo (ex.: `FINANCE`) ou um flag em `SchoolMembershipRole`? | O enum já tem `OWNER, ADMIN, COACH, ASSISTANT_COACH, STAFF, ATHLETE, GUARDIAN`. Acrescentar valor exige migration e revisão de todo lugar que testa papel; um flag evita isso mas espalha a checagem. Afeta a matriz de 10.2. | Engenharia, antes da T580. |

### 15.3 O que explicitamente não entra agora

Multi-escola (Onda 3), IA, responsável legal e integrações avançadas são fases declaradas. Agenda, presença, comunicação e financeiro **integram a visão básica completa**, mesmo entregues depois da primeira versão da jornada — não são opcionais. **Não declarar funcionalidade proposta como pronta** em release notes, telas ou material comercial.

---

## Referências

### Internas

- `architecture/PROJECT_MAP.md`, `architecture/modules/school.yaml`
- `architecture/escola-permission-rules.md`, `architecture/escola-security-review.md`
- `architecture/rules/api.md`, `architecture/rules/database.md`, `architecture/rules/security.md`
- `architecture/adr/school/ADR-001-athlete-owns-history.md`, `ADR-002-temporal-memberships.md`, `ADR-005-history-grants.md`
- `.kiro/specs/ryvano-escola-spec/required.md`, `design.md`, `task-list.md`
- `.agents/skills/ryvano-telas/SKILL.md` e `references/`

### Produto e mercado

Consultados como referência de categoria, sem cópia de conteúdo:

- TrainingPeaks — <https://www.trainingpeaks.com/get-started-coach/>
- Final Surge — <https://www.finalsurge.com/coaches/>
- Spond — <https://www.spond.com/en-us/activity/schools-and-education/>
- SisRUN — <https://sisrun.com.br/>
- SCA — <https://www.sistemasca.com/natacao>
- Clubes Hub — <https://www.clubeshub.com/pt-BR>
- My Athlete Passport — <https://www.myathletepassport.com/>
- Athletica.ai — <https://www.athletica.ai/>
