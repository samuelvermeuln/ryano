# Ryvano Jornada Escola — Task List de Implementação

**Spec:** `ryvano-jornada-escola`
**Base:** `requirements.md` + `design.md` + `docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md`
**Status geral:** ver `STATUS.md` (leia primeiro)

---

# 0. Protocolo obrigatório de execução

Este arquivo é o **estado persistente da implementação**.

Qualquer agente que implemente esta feature **DEVE** atualizar os checkboxes aqui,
no próprio repositório, e refletir a mudança em `STATUS.md` na mesma entrega.

## Estados permitidos

```text
[ ] PENDENTE
[~] EM ANDAMENTO
[x] CONCLUÍDA
[!] BLOQUEADA
```

### Transições

```text
[ ] → [~] → [x]
```

Em caso de impedimento real:

```text
[ ] ou [~] → [!]
```

**Nunca usar `[x]` para uma task apenas iniciada.**

## Antes de iniciar qualquer task

1. Ler `STATUS.md`.
2. Ler `requirements.md` e `design.md`.
3. Ler este arquivo.
4. Verificar o estado do Git (`git status`, `git log --oneline -5`).
5. **Procurar primeiro qualquer task `[~]`.**
6. Se existir `[~]`, retomar essa task antes de iniciar outra.
7. Se não existir, selecionar a primeira `[ ]` cujas dependências estejam `[x]`.
8. Mudar para `[~]` **antes de alterar código**.
9. Salvar este arquivo e atualizar o §4 do `STATUS.md`.

> **Reconfirmar a base.** Os defeitos D1–D7 foram verificados em `998c5bf`. Antes de
> implementar a Onda 0, confirmar que ainda são reais: a base pode ter mudado.

## Durante a implementação

- Respeitar integralmente `requirements.md` e `design.md`.
- Não pular dependências; não iniciar task dependente de task que não esteja `[x]`.
- Executar os testes relevantes.
- Evitar alterações fora do escopo da task.
- Registrar decisão arquitetural nova em ADR quando necessário.
- Rodar impacto no GitNexus antes de editar símbolo compartilhado — em especial
  `CustomizableCardGrid` (T510/T511) e `manage-team.ts` (T504).

## Quando a task estiver concluída

Mudar `[~] → [x]` **somente** quando:

- a implementação estiver concluída;
- `npx tsc --noEmit` passar;
- `npx vitest run` passar;
- o critério de conclusão da task for atendido;
- não restarem TODOs necessários para considerá-la finalizada.

Depois: salvar este arquivo, atualizar `STATUS.md` (§3, §4 e §6) e seguir para a
próxima task desbloqueada.

## Quando contexto, créditos ou tokens estiverem acabando

**NÃO marcar como `[x]`.** Em vez disso:

1. manter a task como `[~]`;
2. deixar o código em estado consistente sempre que possível;
3. preencher o bloco `Implementation Notes` da task;
4. atualizar o §4 do `STATUS.md`;
5. encerrar.

A próxima sessão localiza a `[~]`, lê as notas e continua dali.

## Task bloqueada

Usar `[!]` apenas em bloqueio real: dependência externa indisponível, requisito
contraditório, migration impossível sem decisão, API inexistente, dependência
quebrada. Acrescentar imediatamente abaixo da task:

```text
**Blocker:** descrição objetiva do bloqueio.
```

Task bloqueada **não** autoriza pular dependências e implementar partes incompatíveis.

## Implementation Notes

Cada task pode receber, ao final do seu bloco:

```text
### Implementation Notes

- Estado atual:
- Arquivos alterados:
- Implementado:
- Falta:
- Testes executados:
- Observações:
```

Usar principalmente em tasks `[~]` e `[!]`.

## Regra de retomada

```text
1. ler STATUS.md
2. git status
3. procurar "[~]" neste arquivo
4. procurar "[!]" neste arquivo
5. ler requirements.md e design.md
6. entender o diff atual
7. rodar os testes relacionados
8. continuar a task [~]
```

**Nunca assumir que uma task `[~]` está concluída só porque existe código implementado.**

---

# 1. Como ler uma task

Cada task tem: **ID**, **Título**, **Tipo**, **Prioridade**, **Dependências**,
**Paralelo**, **Requisitos**, **Áreas afetadas**, **Descrição** e
**Critério de conclusão**.

> Nenhuma task deve ser iniciada antes de suas dependências estarem `[x]`.

---

# 2. Legenda

## Tipo

```text
ARCH  Arquitetura      BE    Backend       DB    Banco / Migration
FE    Frontend         TEST  Testes        DOC   Documentação
SEC   Segurança        OBS   Observabilidade
```

## Prioridade

```text
P0  Bloqueadora     P1  Alta     P2  Média     P3  Futuro
```

---

# 3. Fases macro

```text
Onda 0  Base operacional — corrige D1–D7        T500–T519
Onda 1  Jornada (MVP, uma escola)               T520–T547
Onda 2  Operação escolar completa               T550+   (não detalhada)
Onda 3  Cooperação multi-escola                 —       (validar demanda antes)
Onda 4  Expansão                                —
```

---

# 4. Resumo de progresso

| Onda | Tasks | `[x]` | `[~]` | `[ ]` | `[!]` |
|---|---|---|---|---|---|
| Onda 0 | 20 | 0 | 0 | 20 | 0 |
| Onda 1 | 29 | 0 | 0 | 29 | 0 |
| **Total** | **49** | **0** | **0** | **49** | **0** |

> Atualizar esta tabela a cada mudança de estado. Contagem rápida:
> `grep -c "^## \[x\]" task-list.md`

---

# 5. Decisões que travam tasks

| # | Decisão | Trava | Onde está |
|---|---|---|---|
| **Q4** | `DashboardLayoutPreference` com `schoolId` nulo | **T501** | spec §15.2, design D-06 |
| **Q3** | Fila de atenção materializada ou derivada | T523, T534 | spec §15.2, design D-05 |
| **Q2** | Metas pessoais sem escola no MVP | T526, T540 | spec §15.2 |

**Q4 precisa ser decidida dentro da T501.** Em Postgres, `NULL` não colide com `NULL`
em índice único: sem índice parcial ou sentinela, a unicidade não protege o caso
pessoal e o defeito só aparece depois.

# 6. Onda 0 - base operacional (T500-T519)

Corrige os defeitos **D1-D7** verificados no codigo. Entrega valor sozinha, sem depender de jornada.

---

## [x] T500 - Migration 0035 — campos operacionais de Team

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** não
**Requisitos:** RF-003
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0035_*`

**Descricao:** Acrescentar sportType, level, capacity, location, notes a Team e o índice (schoolId, sportType, archivedAt). Ver spec §8.2.

**Criterio de conclusao:** Migration reversível aplicada; `npx prisma validate` verde.

---

## [ ] T501 - Migration 0035 — DashboardLayoutPreference

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** T500
**Paralelo:** não
**Requisitos:** RF-006
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0035_*`

**Descricao:** Criar o modelo com @@unique([userId, schoolId, surface]). DECIDIR Q4 nesta task: NULL não colide em índice único no Postgres; escolher índice parcial ou sentinela e documentar na migration.

**Criterio de conclusao:** Migration aplicada; decisão de Q4 registrada em comentário na migration; teste cobrindo o caso schoolId nulo.

---

## [x] T502 - Códigos de erro de turma

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-003
**Areas afetadas:** `modules/school/domain/errors.ts`

**Descricao:** Acrescentar TEAM_CAPACITY_EXCEEDED (409) e TEAM_ARCHIVED (409) ao SCHOOL_ERROR_STATUS.

**Criterio de conclusao:** Códigos no catálogo; teste de mapeamento de status.

---

## [x] T503 - Casos de uso ListTeams, GetTeamDetail, UpdateTeam

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T500
**Paralelo:** não
**Requisitos:** RF-002 RF-003
**Areas afetadas:** `modules/school/application/`

**Descricao:** ListTeams com paginação por cursor e ocupação; GetTeamDetail com atletas e professores; UpdateTeam com expectedVersion.

**Criterio de conclusao:** Casos de uso implementados; testes de escopo por escola e paginação.

> **Divergência registrada — `expectedVersion` não implementado em `UpdateTeam`.**
> A descrição pede `expectedVersion`, mas `Team` não tem coluna `version`, e a
> D-04 do `design.md` só prevê `version` em `AthleteJourney` e `JourneyMilestone`
> (Onda 1), justamente por serem entidades com decisão concorrente entre
> professor e atleta. Turma é editada por administradores da escola e não tem
> esse padrão de disputa. Adicionar a coluna exigiria outra migration fora do
> escopo da T500. **Se a concorrência em turma vier a importar, abrir task
> própria** com migration + `JOURNEY_VERSION_CONFLICT` equivalente.
> Implementado: PATCH parcial em que ausente = não mexer e `null` = limpar.

---

## [x] T504 - Regra de capacidade e bloqueio de turma arquivada

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T500 T502
**Paralelo:** não
**Requisitos:** RF-003
**Areas afetadas:** `modules/school/application/manage-team.ts`

**Descricao:** AddAthleteToTeam valida capacity quando não nulo; escrita em turma arquivada falha.

**Criterio de conclusao:** TEAM_CAPACITY_EXCEEDED e TEAM_ARCHIVED cobertos por teste; capacity nulo continua sem limite.

---

## [x] T505 - Rotas GET/POST /api/schools/[id]/teams

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T503
**Paralelo:** não
**Requisitos:** RF-002
**Areas afetadas:** `app/api/schools/[id]/teams/route.ts`

**Descricao:** Adaptador fino com schoolResponse. Sem regra de negócio na rota.

**Criterio de conclusao:** Rotas respondem; teste de autorização e de flag desligada.

---

## [x] T506 - Rotas GET/PATCH teams/[teamId] e POST archive

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T503
**Paralelo:** não
**Requisitos:** RF-002
**Areas afetadas:** `app/api/schools/[id]/teams/[teamId]/`

**Descricao:** GET detalhe, PATCH com expectedVersion, POST archive.

**Criterio de conclusao:** Rotas respondem; arquivar preserva histórico; teste de 404 para turma de outra escola.

---

## [x] T507 - Rotas de vínculo de atletas e professores da turma

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T504
**Paralelo:** não
**Requisitos:** RF-002
**Areas afetadas:** `app/api/schools/[id]/teams/[teamId]/athletes|coaches`

**Descricao:** Quatro rotas. coachId é CoachProfile.id, não User.id.

**Criterio de conclusao:** Rotas respondem; testes de autorização e de capacidade.

---

## [x] T508 - Tela /escola/[schoolId]/turmas — fecha D1

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** T505 T506
**Paralelo:** não
**Requisitos:** RF-001
**Areas afetadas:** `app/escola/[schoolId]/turmas/page.tsx`

**Descricao:** Lista, busca, filtros, criar e arquivar. Reusar padrões de app/professor/[schoolId]/turmas.

**Criterio de conclusao:** Rota deixa de responder 404; nenhum link do menu ou card aponta para rota inexistente.

---

## [x] T509 - Tela /escola/[schoolId]/turmas/[teamId]

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** T506 T507
**Paralelo:** não
**Requisitos:** RF-001
**Areas afetadas:** `app/escola/[schoolId]/turmas/[teamId]/page.tsx`

**Descricao:** Detalhe com atletas, professores, contagens e ocupação/capacidade.

**Criterio de conclusao:** Tela renderiza; ações levam a resultado real.

---

## [ ] T510 - Acessibilidade por teclado no CustomizableCardGrid

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** não
**Requisitos:** RF-007 RNF-008
**Areas afetadas:** `components/layout/customizable-card-grid.tsx`

**Descricao:** Reordenar e redimensionar por teclado com anúncio aria-live. RISCO ALTO: componente usado por dashboard, atividades e integrações. Rodar impacto no GitNexus antes.

**Criterio de conclusao:** Operável só por teclado; as três telas consumidoras seguem funcionando.

---

## [ ] T511 - Superfícies temáticas do grid e do banner de salvar

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** T510
**Paralelo:** não
**Requisitos:** RF-007 RNF-007
**Areas afetadas:** `components/layout/customizable-card-grid.tsx`

**Descricao:** Substituir fundo e sombra literais por tokens que respondam a [data-theme=light].

**Criterio de conclusao:** Contraste adequado nos dois temas; banner não cobre o dock a 320 px.

---

## [ ] T512 - Caso de uso e rotas de dashboard-layout da escola

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T501
**Paralelo:** não
**Requisitos:** RF-006
**Areas afetadas:** `modules/school/application/, app/api/schools/[id]/dashboard-layout/`

**Descricao:** GET e PUT com allowlist de IDs, span 1..3, descarte de IDs obsoletos e cards novos ao fim.

**Criterio de conclusao:** Layout isolado por usuário+escola+superfície; deploy com card novo preserva layout salvo.

---

## [x] T513 - Corrigir contagem de solicitações — fecha D4

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-004
**Areas afetadas:** `app/escola/[schoolId]/page.tsx`

**Descricao:** Somar schoolAthleteMembership + coachSchoolMembership pendentes, ou corrigir o rótulo.

**Criterio de conclusao:** Número do card bate exatamente com a lista da tela de solicitações.

---

## [ ] T514 - Contagem agregada e lista paginada de atrasados — fecha D5

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** não
**Requisitos:** RF-005
**Areas afetadas:** `app/escola/[schoolId]/page.tsx`

**Descricao:** Substituir take:200 por count/groupBy mais lista paginada por cursor.

**Criterio de conclusao:** Com 250 atrasados o total continua correto e a UI sinaliza paginação.

---

## [ ] T515 - Recorte de janela no fuso da escola

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** T514
**Paralelo:** não
**Requisitos:** RF-005
**Areas afetadas:** `app/escola/[schoolId]/page.tsx`

**Descricao:** Eliminar startOfUtcDay como proxy do dia local.

**Criterio de conclusao:** Treino de hoje cedo em fuso negativo não aparece como atrasado; testes em fuso positivo e negativo.

---

## [ ] T516 - Redesenhar painel /escola/[schoolId]

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** T511 T512 T513 T515
**Paralelo:** não
**Requisitos:** RF-017 RNF-007
**Areas afetadas:** `app/escola/[schoolId]/page.tsx`

**Descricao:** Hero, cards personalizáveis, fila de atenção e links profundos com filtro aplicado.

**Criterio de conclusao:** Todo indicador leva a tela filtrada; nenhum número é beco sem saída.

---

## [ ] T517 - Ação de atribuir professor no lobby

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-016
**Areas afetadas:** `app/escola/[schoolId]/atletas/`

**Descricao:** Reusar AssignCoachToAthlete e ChangeAthleteCoach. Selecionar apenas CoachProfile com vínculo ativo.

**Criterio de conclusao:** Atribuição funciona com auditoria; sem duplicar pessoas.

---

## [ ] T518 - Atualizar skill ryvano-telas

**Tipo:** DOC
**Prioridade:** P2
**Dependencias:** T508 T509 T516
**Paralelo:** sim
**Requisitos:** —
**Areas afetadas:** `.agents/skills/ryvano-telas/references/`

**Descricao:** Atualizar screen-map.md e access-matrix.md com as telas novas.

**Criterio de conclusao:** Documentação reflete as rotas existentes.

---

## [ ] T519 - Seed e2e de turmas

**Tipo:** TEST
**Prioridade:** P2
**Dependencias:** T500
**Paralelo:** sim
**Requisitos:** RF-003
**Areas afetadas:** `prisma/seed.ts`

**Descricao:** Turmas com capacidade, atletas sem professor, sem duplicar pessoas.

**Criterio de conclusao:** pnpm db:seed roda; cenários de AC-0.5 e AC-0.7 reproduzíveis.


# 7. Onda 1 - jornada (T520-T547)

MVP da jornada em uma escola. Depende da Onda 0 concluida.

---

## [ ] T520 - Migration 0036 — enums de jornada

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** não
**Requisitos:** RF-010
**Areas afetadas:** `prisma/schema.prisma`

**Descricao:** JourneyStatus, MilestoneStatus, JourneyCheckInKind, JourneyReviewDecision. Ver spec §8.3.

**Criterio de conclusao:** Migration aplicada; prisma validate verde.

---

## [ ] T521 - Migration 0036 — AthleteJourney, JourneyMilestone, JourneyAssignmentLink

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** T520
**Paralelo:** não
**Requisitos:** RF-010 RF-013
**Areas afetadas:** `prisma/schema.prisma`

**Descricao:** Com os índices de §8.3 e version para concorrência otimista.

**Criterio de conclusao:** Migration aplicada; índices conferidos.

---

## [ ] T522 - Migration 0036 — JourneyCheckIn, JourneyReview, JourneyEvent

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** T521
**Paralelo:** não
**Requisitos:** RF-014 RF-015
**Areas afetadas:** `prisma/schema.prisma`

**Descricao:** JourneyCheckIn sem relação com WorkoutExecution (decisão D-02).

**Criterio de conclusao:** Migration aplicada.

---

## [ ] T523 - Migration 0036 — JourneyAttentionItem

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** T521
**Paralelo:** não
**Requisitos:** RF-016
**Areas afetadas:** `prisma/schema.prisma`

**Descricao:** Com @@unique([dedupeKey]). Confirmar Q3 antes: materializado ou derivado.

**Criterio de conclusao:** Migration aplicada; unicidade de dedupeKey testada.

---

## [ ] T523b - Back-relations nos modelos existentes

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** T521 T522 T523
**Paralelo:** não
**Requisitos:** —
**Areas afetadas:** `prisma/schema.prisma`

**Descricao:** Acrescentar os campos opostos em User, School, CoachProfile e WorkoutAssignment. Bloco pronto no fim de §8.3. Sem isso o schema NÃO compila.

**Criterio de conclusao:** npx prisma validate verde.

---

## [ ] T524 - Domínio e máquinas de estado

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T520
**Paralelo:** não
**Requisitos:** RF-018
**Areas afetadas:** `modules/school/domain/journey*.ts`

**Descricao:** Transições de §7.1 e §7.2; toda transição inválida rejeitada.

**Criterio de conclusao:** Teste do caminho feliz e de cada transição inválida.

---

## [ ] T525 - Códigos de erro de jornada

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T524
**Paralelo:** sim
**Requisitos:** RNF-005
**Areas afetadas:** `modules/school/domain/errors.ts`

**Descricao:** Os 7 códigos de §9.1 do spec de produto.

**Criterio de conclusao:** Códigos no catálogo com status correto.

---

## [ ] T526 - CreateJourney

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T521 T524
**Paralelo:** não
**Requisitos:** RF-010 RNF-001
**Areas afetadas:** `modules/school/application/create-journey.ts`

**Descricao:** athleteId da sessão para o atleta; validação de vínculo no servidor para escola/coach.

**Criterio de conclusao:** Atleta cria para si; terceiro não cria para outro; testes de autorização.

---

## [ ] T527 - ProposeJourneyMilestones

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T526
**Paralelo:** não
**Requisitos:** RF-011 RNF-004
**Areas afetadas:** `modules/school/application/`

**Descricao:** 2 a 5 marcos; evento e auditoria na mesma transação.

**Criterio de conclusao:** Fora da faixa retorna JOURNEY_MILESTONE_LIMIT; transação testada.

---

## [ ] T528 - AcceptJourney e DeclineJourney

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T527
**Paralelo:** não
**Requisitos:** RF-012
**Areas afetadas:** `modules/school/application/`

**Descricao:** Exclusivos do atleta; expectedVersion.

**Criterio de conclusao:** Coach e OWNER recebem 403; accept grava acceptedAt e move para ACTIVE.

---

## [ ] T529 - LinkAssignmentToMilestone e Unlink

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T521
**Paralelo:** não
**Requisitos:** RF-013
**Areas afetadas:** `modules/school/application/`

**Descricao:** Valida mesmo atleta e escola. Não duplica prescrição.

**Criterio de conclusao:** Treino fora do escopo retorna ASSIGNMENT_NOT_IN_SCOPE; desvincular não apaga a prescrição.

---

## [ ] T530 - RecordJourneyCheckIn

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T522
**Paralelo:** não
**Requisitos:** RF-014
**Areas afetadas:** `modules/school/application/`

**Descricao:** Não altera status de treino nem compliance.

**Criterio de conclusao:** Teste explícito: criar check-in DONE e confirmar que status e compliance não mudam.

---

## [ ] T531 - ReviewMilestone

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T522 T524
**Paralelo:** não
**Requisitos:** RF-015 RNF-004
**Areas afetadas:** `modules/school/application/`

**Descricao:** Motivo obrigatório, antes/depois, aceite do atleta quando altera compromisso.

**Criterio de conclusao:** Revisão registrada; expectedVersion obsoleto retorna 409.

---

## [ ] T532 - ListJourneys e GetJourneyDetail

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T521
**Paralelo:** não
**Requisitos:** RNF-001 RNF-005
**Areas afetadas:** `modules/school/application/`

**Descricao:** Paginação por cursor; escopo por perfil.

**Criterio de conclusao:** Atleta vê só as próprias; usuário sem vínculo recebe 404.

---

## [ ] T533 - Projeção de timeline por visibilidade

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** T522
**Paralelo:** não
**Requisitos:** RNF-003
**Areas afetadas:** `modules/school/application/`

**Descricao:** DTO próprio por visibility. Não expor JSON bruto de auditoria.

**Criterio de conclusao:** Evento SCHOOL não aparece para o atleta quando não deve.

---

## [ ] T534 - Gerador da fila de atenção

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T523
**Paralelo:** não
**Requisitos:** RF-016
**Areas afetadas:** `modules/school/application/`

**Descricao:** As 5 regras de §7.4 com dedupeKey idempotente.

**Criterio de conclusao:** Reprocessar não duplica; ausência de sync não vira falta.

---

## [ ] T535 - ResolveAttentionItem

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T534
**Paralelo:** não
**Requisitos:** RF-016
**Areas afetadas:** `modules/school/application/`

**Descricao:** Autor, desfecho e histórico preservado.

**Criterio de conclusao:** Item sai de pendente mas continua consultável.

---

## [ ] T536 - Rotas POST/GET /api/journeys e GET/PATCH [id]

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T526 T532
**Paralelo:** não
**Requisitos:** RNF-005
**Areas afetadas:** `app/api/journeys/`

**Descricao:** Adaptadores finos com schoolResponse.

**Criterio de conclusao:** Rotas respondem; teste de flag desligada e de acesso cruzado.

---

## [ ] T537 - Rotas propose, accept, decline

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T527 T528
**Paralelo:** não
**Requisitos:** RF-011 RF-012
**Areas afetadas:** `app/api/journeys/[id]/`

**Descricao:** Transições de estado.

**Criterio de conclusao:** Coach chamando accept recebe 403.

---

## [ ] T538 - Rotas de marco — check-ins, reviews, assignment-links

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T529 T530 T531
**Paralelo:** não
**Requisitos:** RF-013 RF-014 RF-015
**Areas afetadas:** `app/api/journeys/[id]/milestones/`

**Descricao:** Adaptadores finos.

**Criterio de conclusao:** Rotas respondem; testes de escopo.

---

## [ ] T539 - Rotas da fila de atenção

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** T534 T535
**Paralelo:** não
**Requisitos:** RF-016
**Areas afetadas:** `app/api/schools/[id]/attention/`

**Descricao:** GET paginado e POST resolve.

**Criterio de conclusao:** OWNER vê a escola; professor vê escopo da sua atribuição.

---

## [ ] T540 - Telas /app/jornadas e /app/jornadas/[id]

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** T536 T537
**Paralelo:** não
**Requisitos:** RF-012
**Areas afetadas:** `app/app/jornadas/`

**Descricao:** Aceite de proposta e controle de compartilhamento. Deixar explícito que aceitar não concede histórico.

**Criterio de conclusao:** Atleta aceita e vê mudança; estado PROPOSED não parece acordado.

---

## [ ] T541 - Telas /professor/[schoolId]/jornadas

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** T536 T538
**Paralelo:** não
**Requisitos:** RNF-001
**Areas afetadas:** `app/professor/[schoolId]/jornadas/`

**Descricao:** Guard duplo: CoachProfile e CoachSchoolMembership ativos. Não expor outros atletas.

**Criterio de conclusao:** Professor vê só atletas atribuídos.

---

## [ ] T542 - Telas /escola/[schoolId]/jornadas

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** T536
**Paralelo:** não
**Requisitos:** RF-017
**Areas afetadas:** `app/escola/[schoolId]/jornadas/`

**Descricao:** Lista filtrável e detalhe com linha do tempo.

**Criterio de conclusao:** Filtros preservados em query string.

---

## [ ] T543 - Card Minha jornada no dashboard

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** T532
**Paralelo:** sim
**Requisitos:** RNF-009
**Areas afetadas:** `components/dashboard/`

**Descricao:** Próximo passo e estado vazio coerente.

**Criterio de conclusao:** Usuário sem jornada conserva dashboard coerente.

---

## [ ] T544 - Fila de atenção no painel escolar

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** T539 T516
**Paralelo:** não
**Requisitos:** RF-017
**Areas afetadas:** `app/escola/[schoolId]/`

**Descricao:** Lista paginada por prioridade com ação contextual.

**Criterio de conclusao:** Cada item leva ao caso; contagem sozinha não basta.

---

## [ ] T545 - Instrumentação sem PII

**Tipo:** OBS
**Prioridade:** P2
**Dependencias:** T536 T537 T538 T539
**Paralelo:** sim
**Requisitos:** RNF-010
**Areas afetadas:** `modules/school/infrastructure/`

**Descricao:** Os 5 eventos de §14.4.

**Criterio de conclusao:** Métricas emitidas sem token nem PII.

---

## [ ] T546 - Atualizar documentação de arquitetura

**Tipo:** DOC
**Prioridade:** P2
**Dependencias:** T540 T541 T542
**Paralelo:** sim
**Requisitos:** —
**Areas afetadas:** `architecture/modules/school.yaml, .agents/skills/ryvano-telas/`

**Descricao:** Registrar telas e rotas de jornada.

**Criterio de conclusao:** Documentação reflete o código.

---

## [ ] T547 - Seed e2e de jornada

**Tipo:** TEST
**Prioridade:** P2
**Dependencias:** T523
**Paralelo:** sim
**Requisitos:** —
**Areas afetadas:** `prisma/seed.ts`

**Descricao:** Jornadas em DRAFT, PROPOSED e ACTIVE com marcos e itens de atenção.

**Criterio de conclusao:** Cenários de AC-1.x reproduzíveis.

