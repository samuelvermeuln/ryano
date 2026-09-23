# Ryvano Jornada Escola — Requisitos

**Spec:** `ryvano-jornada-escola` · **Base verificada:** `998c5bf`
**Spec de produto:** `docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md` v1.1

> Este arquivo contém os requisitos **normativos**. A spec de produto tem o
> racional, as telas e o design. Quando houver divergência, **este arquivo vence**
> para efeito de implementação — e a divergência deve ser corrigida na spec.
>
> Vocabulário: **DEVE** = obrigatório; **NÃO DEVE** = proibido; **PODE** = opcional.

---

# 1. Contexto e objetivo

Transformar `meta → plano → execução → feedback → decisão → próximo marco` na
unidade principal da experiência, sem quebrar as funções administrativas da escola.

**Princípio herdado (ADR-001):** vínculos podem acabar; o histórico esportivo do
atleta não. A jornada respeita isso.

---

# 2. Requisitos de correção da base — Onda 0

Estes requisitos corrigem defeitos **verificados no código** em `998c5bf`. Cada um
cita a evidência. Reconfirmar antes de implementar: a base pode ter mudado.

## RF-001 — Turmas na visão administrativa

`/escola/[schoolId]/turmas` **DEVE** existir e renderizar a lista de turmas da escola.

**Defeito atual (D1):** a rota responde 404, mas dois pontos da UI linkam para ela —
`app/escola/[schoolId]/layout.tsx:44` (menu) e `app/escola/[schoolId]/page.tsx:134`
(card "Turmas ativas").

- Nenhum item de menu ou card **DEVE** apontar para rota inexistente em uma entrega.
- Se a página não estiver pronta, o link **DEVE** ser removido temporariamente.
- `app/professor/[schoolId]/turmas/page.tsx` **já existe**: reaproveitar vocabulário
  e padrões, **NÃO DEVE** divergir sem motivo.

## RF-002 — API de turmas

Os casos de uso de turma **DEVEM** ser expostos por HTTP.

**Defeito atual (D2):** `modules/school/application/manage-team.ts` expõe `CreateTeam`,
`ArchiveTeam`, `AddAthleteToTeam`, `RemoveAthleteFromTeam`, `AddCoachToTeam` e
`RemoveCoachFromTeam` com schemas Zod prontos, mas `app/api/schools/[id]/teams/`
**não existe**. A lógica está pronta; falta o adaptador.

- As rotas **DEVEM** usar o envelope `schoolResponse` de `app/api/schools/_shared.ts`.
- As rotas **NÃO DEVEM** conter regra de negócio.

## RF-003 — Turma com dados operacionais

`Team` **DEVE** comportar modalidade, nível, capacidade, local e observações.

**Defeito atual (D3):** o modelo tem apenas `id, schoolId, name, archivedAt,
createdAt, updatedAt` (`prisma/schema.prisma:871–884`).

- `capacity` nulo significa **sem limite declarado**.
- Inclusão que exceda `capacity` **DEVE** falhar com `TEAM_CAPACITY_EXCEEDED` (409).
- Escrita em turma arquivada **DEVE** falhar com `TEAM_ARCHIVED` (409).
- Turma com registros históricos **NÃO DEVE** ser deletável; arquivar preserva histórico.
- A tela **NÃO DEVE** prometer capacidade/horário antes deste requisito existir.

## RF-004 — Contadores honestos

Todo indicador **DEVE** concordar com a lista que ele representa.

**Defeito atual (D4):** o card "Solicitações pendentes" conta apenas
`schoolAthleteMembership` (`page.tsx:61`), mas a tela de solicitações lista atletas
(`solicitacoes/page.tsx:73`) **e** professores (`:78`).

- O contador **DEVE** somar atletas + professores pendentes, ou o rótulo **DEVE**
  ser corrigido para refletir o que conta.
- Todo card **DEVE** declarar período e denominador.
- Card com valor 0 **DEVE** exibir estado útil, nunca hífen ou promessa de dado inexistente.

## RF-005 — Contagem sem teto silencioso e com fuso correto

Contagens **NÃO DEVEM** ser derivadas de listas truncadas.

**Defeito atual (D5):** "atrasados" usa `take: 200` (`page.tsx:70`) e descarta o
excedente sem avisar; `startOfUtcDay` (`page.tsx:23–27`) trata o início do dia UTC
como se fosse o dia local da escola.

- Totais **DEVEM** usar `count`/`groupBy`; listas **DEVEM** paginar por cursor.
- A janela de "atrasado" **DEVE** ser recortada no fuso da escola.
- Quando um resultado for parcial, a UI **DEVE** sinalizar e **NÃO DEVE** exibir
  percentual derivado dele.

## RF-006 — Layout com escopo por escola

A preferência de layout **DEVE** ser isolada por `(usuário, escola, superfície)`.

**Defeito atual (D6):** persiste em `UserProfile.dashboardLayoutOrder`
(`prisma/schema.prisma:558`; `app/actions/dashboard-layout.ts:39,43`), chave única
por usuário. Reusar essa chave faria o painel da escola sobrescrever o dashboard
pessoal do atleta.

- Alterar o painel da Escola A **NÃO DEVE** afetar a Escola B nem o dashboard pessoal.
- O servidor **DEVE** validar IDs de card contra allowlist e `span ∈ 1..3`.
- IDs desconhecidos **DEVEM** ser descartados sem erro; cards novos entram no fim.
  (Um deploy que adiciona card não pode invalidar o layout salvo.)

## RF-007 — Grade de cards acessível

`CustomizableCardGrid` **DEVE** ser operável sem ponteiro.

**Defeito atual (D7):** arrastar e redimensionar dependem de `pointerdown`; o
contêiner e o banner de salvar usam superfícies claras literais.

- Reordenar e redimensionar **DEVEM** ter caminho por teclado, com anúncio `aria-live`.
- A correção **DEVE** ser feita no componente compartilhado. **NÃO DEVE** ser criado
  um segundo grid (o atual é usado por dashboard, atividades e integrações).
- O banner de salvar **NÃO DEVE** cobrir o dock móvel a 320 px.

---

# 3. Requisitos funcionais da jornada — Onda 1

## RF-010 — Criar meta

O atleta **DEVE** poder criar uma meta com título, modalidade canônica, critério de
sucesso e prazo opcional. Escola **PODE** ser nula (meta pessoal).

- Ao criar para si, `athleteId` **DEVE** vir da sessão, nunca do corpo.
- Escola/coach propondo **DEVEM** ter o vínculo validado no servidor.

## RF-011 — Propor marcos

Professor autorizado **DEVE** poder propor de **2 a 5** marcos ordenados, cada um com
título, critério verificável, prazo opcional e responsável.

- Fora dessa faixa → `JOURNEY_MILESTONE_LIMIT` (409).
- A proposta **DEVE** gravar evento e auditoria na mesma transação.

## RF-012 — Aceite exclusivo do atleta

Somente o atleta **DEVE** poder aceitar ou recusar uma proposta.

- Coach ou OWNER chamando `accept` **DEVEM** receber 403.
- Enquanto `PROPOSED`, a UI **NÃO DEVE** apresentar o plano como acordado.
- O aceite **DEVE** gravar `acceptedAt` e mover para `ACTIVE`.
- Responsável legal é Onda 4 e exige modelagem própria; **NÃO DEVE** ser improvisado.

## RF-013 — Vínculo com treinos existentes

Um marco **DEVE** referenciar `WorkoutAssignment` já existente.

- **NÃO DEVE** duplicar prescrição nem execução. A verdade continua em
  `WorkoutAssignment` / `WorkoutExecution`.
- Treino de outro atleta ou escola → `ASSIGNMENT_NOT_IN_SCOPE` (409).
- Desvincular **NÃO DEVE** apagar a prescrição.

## RF-014 — Check-in não falsifica execução

O atleta **PODE** registrar check-in curto (`DONE`, `HARD`, `NOT_DONE`) com nota opcional.

- Check-in **NÃO DEVE** alterar status de treino.
- Check-in **NÃO DEVE** entrar no cálculo de compliance.
- Check-in **NÃO DEVE** produzir dado fisiológico.

## RF-015 — Revisão humana com motivo

Alteração relevante de marco **DEVE** produzir revisão com decisão, motivo
obrigatório e antes/depois.

- Quando a revisão altera compromisso do atleta, **DEVE** exigir aceite dele.
- Marco encerrado **DEVE** ser somente leitura; retificação cria evento de correção.

## RF-016 — Fila de atenção verificável

O sistema **DEVE** manter fila de tarefas a partir de sinais verificáveis:

| Evento | Critério |
|---|---|
| Atleta sem professor | membership `ACTIVE` sem atribuição primária `ACTIVE` (`endedAt = null`) |
| Treinos sem execução | 2 atribuições vencidas elegíveis, sem execução nem justificativa |
| Avaliação pendente | execução da escola sem avaliação dentro da janela |
| Marco próximo do prazo | prazo em 7 dias e marco não concluído |
| Feedback pede ajuda | atleta sinalizou dificuldade explicitamente |

- Cada item **DEVE** ter `dedupeKey`: reprocessar **NÃO DEVE** duplicar.
- Atualizar um treino **NÃO DEVE** gerar alerta novo para o mesmo fato.
- Ausência de sincronização **NÃO DEVE** virar falta automaticamente.
- Resolver **DEVE** registrar autor e desfecho, e **NÃO DEVE** apagar histórico.
- O limiar de 2 treinos é **configuração inicial**, não verdade clínica.

## RF-017 — Nenhum número é beco sem saída

Todo indicador **DEVE** levar à tela filtrada correspondente. A fila **NÃO DEVE**
exibir apenas contagem sem permitir chegar ao caso.

## RF-018 — Continuidade após o vínculo

Encerrar o vínculo **NÃO DEVE** apagar jornada, marcos, autoria ou auditoria.

- A escola perde leitura futura além do que autoria e consentimentos vigentes permitem.
- Um vínculo posterior inicia novo período.

---

# 4. Requisitos não funcionais

## RNF-001 — Autorização no servidor, por rota

> O guard do `layout.tsx` protege a **página**, não a **API**.

- Toda rota nova **DEVE** ter checagem própria no servidor.
- Toda consulta **DEVE** filtrar por `schoolId`.
- `schoolId`, `coachId` e `athleteId` vindos do corpo **NÃO DEVEM** conceder papel.
- Acesso a recurso de outro escopo **DEVE** retornar 404 (não vazar existência).
- A permissão **DEVE** ser revalidada no momento da mutação, não só no render.

### Matriz de autorização

| Operação | Atleta dono | Coach atribuído | Coach não atribuído | OWNER/ADMIN |
|---|---|---|---|---|
| Ler jornada própria | ✅ | — | — | — |
| Ler jornada de atleta da escola | — | ✅ | ❌ | ✅ |
| Criar meta para si | ✅ | — | — | — |
| Propor marcos | ❌ | ✅ | ❌ | ✅ |
| Aceitar/recusar | ✅ **exclusivo** | ❌ | ❌ | ❌ |
| Check-in | ✅ **exclusivo** | ❌ | ❌ | ❌ |
| Revisar marco | ❌ | ✅ | ❌ | ✅ |
| Vincular treino | ❌ | ✅ | ❌ | ✅ |
| Gerenciar turmas | ❌ | ❌ | ❌ | ✅ |
| Conceder acesso ao histórico | ✅ **exclusivo** | ❌ | ❌ | ❌ |

## RNF-002 — Identidade sem ambiguidade

- `athleteId` é `User.id`. **NÃO DEVE** ser criado `AthleteProfile`.
- `CoachSchoolMembership.coachId` referencia **`CoachProfile.id`**, não `User.id`.
  Para filtrar por usuário, usar a relação `coach: { userId }`.
- OWNER/ADMIN de escola **NÃO** equivale a `User.role = ADMIN`.

## RNF-003 — Consentimento explícito

- Histórico anterior ao vínculo e biometria exigem `HistoryAccessGrant` não revogado.
- Sem grant, a escola lê **apenas** execuções das prescrições feitas por ela.
- Aceitar jornada **NÃO DEVE** criar grant de histórico. A UI **DEVE** deixar isso explícito.
- OWNER/ADMIN **NÃO DEVE** consentir pelo atleta.
- O painel escolar **NÃO DEVE** exibir prontidão, sono, HRV ou Body Battery por padrão.

## RNF-004 — Transação e idempotência

- Mudança de estado + evento + auditoria **DEVEM** ocorrer na mesma transação.
- Operações repetidas por retry **DEVEM** ser idempotentes.
- Edição concorrente **DEVE** usar `expectedVersion` → 409 `JOURNEY_VERSION_CONFLICT`.
  **NÃO DEVE** sobrescrever silenciosamente decisão alheia.

## RNF-005 — Contrato HTTP

- Envelope `schoolResponse`; Zod `strictObject`; datas ISO 8601 no HTTP, UTC no banco.
- Listas: `{ items, nextCursor }`, `limit` padrão 20 e máximo 100, ordenação estável
  com `id` como desempate.
- Erros do catálogo `SCHOOL_ERROR_STATUS`, com mensagem segura.
- `runtime = "nodejs"` e `dynamic = "force-dynamic"`.

## RNF-006 — Feature flag

Tudo **DEVE** ficar atrás de `SCHOOL_MODULE_ENABLED`. Com a flag desligada, as rotas
retornam 404 `SCHOOL_MODULE_DISABLED`.

## RNF-007 — Design system

- Reusar `AppShell`, `AppHeader`, `MobileDock`, `CustomizableCardGrid`, tokens
  `theme-*` e `--sport-*`, ícones `@tabler/icons-react`.
- **NÃO DEVE** ser criada paleta paralela nem segundo header global.
- Problema em componente compartilhado **DEVE** ser corrigido nele, para todas as telas.

## RNF-008 — Acessibilidade

- `h1` único, labels reais, foco visível, ordem de teclado igual à visual.
- Estado **NÃO DEVE** ser indicado só por cor.
- Verificar 320/375/768/1024/1440 px, tema claro e escuro, movimento reduzido.
- Alvos de toque ≥ 44 px.

## RNF-009 — Degradação honesta

Sem relógio, sem escola, sem turma, sem treino e sem jornada, cada tela **DEVE**
apresentar próximo passo coerente — **NÃO DEVE** ter loading infinito ou dado falso.

## RNF-010 — Observabilidade sem PII

- Usar `schoolLogger` e `schoolMetrics`.
- **NÃO DEVE** registrar token, segredo ou PII.
- Instrumentar: jornada criada, proposta aceita, marco revisado, item resolvido,
  retorno semanal por perfil.
- Tempo no app **NÃO DEVE** ser usado como sinal de valor.

## RNF-011 — Limites éticos

Nenhum indicador, alerta ou score **DEVE** diagnosticar lesão ou impor treino. Sinal
automatizado explica fatos e **pede decisão humana**.

---

# 5. Fora de escopo

| Item | Onda |
|---|---|
| Agenda, presença, comunicação, financeiro | 2 — obrigatórios na visão final, não dispensáveis |
| Cooperação multi-escola | 3 — validar demanda real antes |
| Responsável legal, contratos digitais, pagamento integrado | 4 |
| IA sugerindo ações | Futuro — **nunca** alterar plano ou conceder acesso sozinha |

**Regra de comunicação:** funcionalidade proposta **NÃO DEVE** ser declarada pronta
em release notes, telas ou material comercial.

---

# 6. Rastreabilidade

| Requisito | Tasks | Critérios de aceite |
|---|---|---|
| RF-001 | T508, T509 | AC-0.1 |
| RF-002 | T505, T506, T507 | AC-0.2 |
| RF-003 | T500, T503, T504 | AC-0.2, AC-0.4, AC-0.5 |
| RF-004 | T513 | AC-0.6 |
| RF-005 | T514, T515 | AC-0.7, AC-0.8 |
| RF-006 | T501, T512 | AC-0.9, AC-0.10 |
| RF-007 | T510, T511 | AC-0.11, AC-0.12 |
| RF-010 | T526, T536 | AC-1.1 |
| RF-011 | T527, T537 | AC-1.3 |
| RF-012 | T528, T537 | AC-1.4, AC-1.5 |
| RF-013 | T529, T538 | AC-1.6, AC-1.8 |
| RF-014 | T530, T538 | AC-1.7 |
| RF-015 | T531, T538 | AC-1.12, AC-1.13 |
| RF-016 | T534, T535, T539 | AC-1.9, AC-1.10, AC-1.11 |
| RF-017 | T516, T544 | AC-T.5 |
| RF-018 | T524, T532 | AC-1.15 |
| RNF-001 | todas as tasks de API | AC-1.2, AC-T.1, AC-T.2 |
| RNF-003 | T526, T532, T533 | AC-1.14, AC-1.16 |
| RNF-004 | T527, T528, T531, T534 | AC-1.9, AC-1.13 |
| RNF-006 | todas | AC-T.6 |
| RNF-008 | T510, T511, telas | AC-T.4 |
| RNF-009 | T543, telas | AC-T.3 |

Os critérios `AC-*` estão em `docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md` §12.
