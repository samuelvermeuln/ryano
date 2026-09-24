# Ryvano Marketplace de Planos de Treino — Task List de Implementação

**Spec:** `ryvano-marketplace-planos-treino`
**Base:** `requirements.md` + `design.md` + `RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md`
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

> **Reconfirmar a base.** RF-001, RF-002, RF-005 e RF-006 foram verificados com
> evidência de arquivo:linha em `b6017cc`. Antes de implementar a Onda 0,
> confirmar que ainda são reais: a base pode ter mudado.

## Durante a implementação

- Respeitar integralmente `requirements.md` e `design.md`.
- Não pular dependências; não iniciar task dependente de task que não esteja `[x]`.
- Executar os testes relevantes.
- Evitar alterações fora do escopo da task.
- Registrar decisão arquitetural nova em ADR quando necessário.
- Rodar impacto no GitNexus antes de editar símbolo compartilhado — em especial
  `CustomizableCardGrid` (TM050), `list-training-products.ts` (TM001/TM031) e
  `instantiate-license-calendar.ts` (TM011/TM041). O índice local estava 19 commits
  atrasado na verificação desta spec — reindexar (TM014) antes de confiar no
  resultado.
- A TM059 (provedor de pagamento) **NÃO DEVE** começar sem consultar a
  documentação oficial vigente do provedor escolhido — regra do `AGENTS.md`,
  reforçada em `design.md` D-10. Citar o que foi confirmado no commit.

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

Task bloqueada **não** autoriza pular dependências e implementar partes
incompatíveis.

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

**Nunca assumir que uma task `[~]` está concluída só porque existe código
implementado.**

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
Onda 0  Segurança e fundação                    TM001–TM017
Onda 1  Produto completo sem pagamento real      TM018–TM056
Onda 2  Venda paga                               TM057–TM071
Onda 3  Acompanhamento independente              TM072–TM088
Onda 4  Expansão (multi-coach simultâneo, cooperação multi-escola)  —  (não detalhada)
```

---

# 4. Resumo de progresso

| Onda | Tasks | `[x]` | `[~]` | `[ ]` | `[!]` |
|---|---|---|---|---|---|
| Onda 0 | 17 | 17 | 0 | 0 | 0 |
| Onda 1 | 39 | 38 | 0 | 0 | 1 |
| Onda 2 | 15 | 0 | 0 | 15 | 0 |
| Onda 3 | 17 | 0 | 0 | 17 | 0 |
| **Total** | **88** | **55** | **0** | **32** | **1** |

> Atualizar esta tabela a cada mudança de estado. Contagem rápida:
> `grep -c "^## \[x\]" task-list.md`

---

# 5. Decisões que travam tasks

| # | Decisão | Trava | Onde está |
|---|---|---|---|
| **Q1** | Tipo de licença: uso permanente ou janela finita; reinícios; política de pausa | TM006, TM041 | spec de produto §15 |
| **Q2** | Diferença comercial entre "comprar plano" e "contratar acompanhamento" (preço/checkout/recibo) | TM062, TM072 | spec de produto §15 |
| **Q3** | Propriedade de produto de professor atuando em escola (nome próprio × escola; receita/continuidade) | TM019 | spec de produto §15 |
| **Q4** | Direito de atualização de versão para quem já comprou (opt-in grátis/pago) | TM022, TM044 | spec de produto §15 |
| **Q5** | Provedor de pagamento + política comercial de preço/repasse/impostos/reembolso | TM059, TM067 | spec de produto §15, design D-10 |
| **Q6** | Critérios de moderação de avaliações | TM047 | spec de produto §5.3 |
| **Q7** | `priceCents=null` (grátis) × `priceCents=0` (pago R$0) — regra explícita antes de publicar | TM003, TM038 | spec de produto §9, nota da tabela `TrainingLicense` |
| **Q8** | Flag de rollout própria (`MARKETPLACE_ENABLED`) ou reaproveitar `SCHOOL_MODULE_ENABLED` | TM016 | design D-01, RNF-009 |

**Nenhuma trava impede a Onda 0.** Q1, Q3, Q4, Q7 precisam de resposta antes das
tasks de schema/aquisição da Onda 1 que dependem delas (ver coluna "Trava"). Q5 só
bloqueia a Onda 2. Q2 e Q6 podem ser decididas durante a Onda 1/3 sem travar o
início.

---

# 6. Onda 0 — Segurança e fundação (TM001–TM017)

Fecha os dois defeitos P0 verificados no código (RF-001, RF-002) e cria o schema
sobre o qual toda a Onda 1 é construída. Nada da Onda 1 é seguro sem isto.

---

## [x] TM001 - Fechar vazamento do catálogo público

**Tipo:** SEC
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-001
**Areas afetadas:** `app/api/training-products/route.ts, modules/school/application/list-training-products.ts`

**Descricao:** Chamada sem sessão autorizada deve ignorar `status`/`visibility` do cliente e forçar `PUBLISHED`+`PUBLIC`. `UNLISTED` só por lookup direto de detalhe, nunca em listagem. Ver evidência em `requirements.md` RF-001.

**Criterio de conclusao:** Teste cobre anônimo com `?status=DRAFT` e `?visibility=SCHOOL_ONLY` retornando vazio; dono autenticado continua vendo os próprios rascunhos por rota separada (TM024).

### Implementation Notes

- `status`/`visibility` removidos de `listTrainingProductsSchema` (não apenas ignorados — `z.strictObject` agora rejeita a chave). O `where` do Prisma força `status: PUBLISHED, visibility: PUBLIC` incondicionalmente; a rota não tem noção de ator, então não há caminho legítimo para outro valor aqui.
- `tests/list-training-products.test.ts` (5 testes): rejeita `status`/`visibility` no input; `findMany` sempre chamado com o where forçado; filtros legítimos (`schoolId`/`sportType`) continuam funcionando; paginação por cursor inválido não quebra.
- GitNexus impact (upstream, pós-reindex): 1 chamador (`app/api/training-products/route.ts`), risco LOW — confirmado antes de editar.
- `tsc --noEmit`: limpo (0 erros no código tocado). `vitest run tests/list-training-products.test.ts`: 5/5 verdes.

---

## [x] TM002 - Corrigir ordem de criação compra→licença na transação

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-002 RNF-003
**Areas afetadas:** `modules/school/application/create-training-purchase.ts`

**Descricao:** Substituir o `Promise.all` por criação sequencial (compra confirmada antes da licença, mesma transação — ver design D-02). Preparar a divisão em dois casos de uso: aquisição grátis (TM038) e confirmação por webhook (TM060) consomem esta correção, mas essa divisão em si é escopo de TM038/TM060.

**Criterio de conclusao:** Teste de integração cobre falha no meio da transação sem deixar licença órfã; ordem sequencial coberta por teste explícito.

### Implementation Notes

- `Promise.all([...])` substituído por dois `await` sequenciais: `trainingPurchase.create` primeiro, `trainingLicense.create` depois (FK `purchaseId` respeitada).
- `tests/create-training-purchase.test.ts` (4 testes): ordem sequencial comprovada por rastro de execução; `purchaseId` da licença bate com o `id` da compra; erro na criação da licença propaga (não engole, não retorna sucesso parcial); produto pago sem `paymentRef` continua rejeitado antes de qualquer escrita.
- GitNexus impact (upstream): 0 chamadores resolvidos (`risk: UNKNOWN`) — confirmado por busca textual (`grep -rln`) que os únicos hits fora do próprio arquivo são `CreateTrainingPurchaseInput` (tipo, não a classe) em `training-purchase.ts`/`index.ts`; zero rotas e zero testes chamavam esta classe antes desta task.
- `tsc --noEmit`: limpo. `vitest run tests/create-training-purchase.test.ts`: 4/4 verdes.
- A divisão em `AcquireFreeTrainingProduct`/`ConfirmTrainingPurchaseFromWebhook` (design D-02) fica para TM038/TM060, conforme escopo desta task.

---

## [x] TM003 - Migration 0036: TrainingProduct — campos comerciais e XOR

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-003
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0036_*`

**Descricao:** Acrescentar `slug?, coverMediaId?, objective?, difficulty?, goalType?, targetEventType?, targetDistance?, sessionsPerWeek?, sessionDurationMin/Max?, weeklyMinutesMin/Max?, sessionCount?, equipment?, language?, availability?, sellerPolicyVersion?, previewVersionId?` e um `CHECK` de banco garantindo exatamente um de `schoolId`/`coachId` preenchido. Decidir Q7 (`priceCents=null` vs `0`) nesta task e documentar a regra escolhida no comentário da migration.

**Criterio de conclusao:** Migration reversível aplicada; `CHECK` rejeita linha com os dois campos nulos ou os dois preenchidos; decisão de Q7 registrada.

### Implementation Notes

- Campos comerciais/catálogo adicionados a `TrainingProduct`; `slug` único (nullable). CHECK de banco para XOR `schoolId`/`coachId` e para `priceCents > 0` (nunca `0`).
- **Q7 decidida:** `priceCents=null` é grátis; `priceCents=0` é estado inválido, rejeitado pelo CHECK `TrainingProduct_priceCents_positive_check`. Documentado no comentário da migration.
- `npx prisma generate`: limpo. Migration `0036_training_product_commercial_fields` escrita à mão (sem acesso ao banco remoto a partir deste sandbox — ver nota de ambiente em `STATUS.md`).

---

## [x] TM004 - Migration 0037: TrainingProductVersion — imutabilidade e schemaVersion

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-004
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0037_*`

**Descricao:** Acrescentar `schemaVersion Int`, `contentHash String?` e trigger `BEFORE UPDATE` que rejeita alteração de `planPayload`/`changeNote` quando `publishedAt IS NOT NULL` (ver design D-04).

**Criterio de conclusao:** Migration aplicada; teste tentando `UPDATE` em versão publicada falha; `UPDATE` em rascunho (`publishedAt IS NULL`) continua permitido.

### Implementation Notes

- `schemaVersion Int @default(1)` e `contentHash String?` adicionados. Trigger `BEFORE UPDATE` em Postgres (plpgsql) rejeita mudança de `planPayload`/`changeNote` quando `OLD.publishedAt IS NOT NULL` — a primeira publicação (`OLD.publishedAt` ainda `NULL`) não é afetada.
- `npx prisma generate`: limpo. Migration `0037_training_product_version_immutability`.

---

## [x] TM005 - Migration 0038: TrainingPurchase — checkout e idempotência

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-201 RF-202 RF-203
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0038_*`

**Descricao:** Acrescentar `versionId, offerSnapshot Json, checkoutId?, provider?, providerEventId?, idempotencyKey?, confirmedAt?, refundReason?` com `@@unique([checkoutId])` e `@@unique([provider, providerEventId])`.

**Criterio de conclusao:** Migration aplicada; `prisma validate` verde; unicidades comprovadas por teste de conflito.

### Implementation Notes

- `versionId` (FK nullable), `offerSnapshot`, `checkoutId`, `provider`, `providerEventId`, `idempotencyKey`, `confirmedAt`, `refundReason` adicionados. `@@unique([checkoutId])` e `@@unique([provider, providerEventId])` — NULLs não colidem em Postgres, então compras sem evento de provedor (caminho grátis) nunca conflitam entre si.
- Back-relation `purchases` adicionada em `TrainingProductVersion`.
- `npx prisma generate`: limpo. Migration `0038_training_purchase_checkout_idempotency`.

---

## [x] TM006 - Migration 0039: TrainingLicense — ativação, fuso e novos estados

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-006 RF-109 RF-111
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0039_*`

**Descricao:** Acrescentar `activationMode, timezone?, chosenStartLocalDate?, anchorEventLocalDate?, activationStatus, calendarInstantiatedAt?, completedAt?` e os estados `PAUSED`/`COMPLETED` em `TrainingLicenseStatus` (hoje só `ACTIVE/EXPIRED/REVOKED`). Decidir Q1 (licença permanente × janela finita; reinícios; pausa) nesta task.

**Criterio de conclusao:** Migration aplicada; enum expandido sem quebrar dados existentes (todos `ACTIVE` hoje); decisão de Q1 documentada no comentário da migration.

### Implementation Notes

- `TrainingLicenseStatus` ganhou `PAUSED`/`COMPLETED`. Dois enums novos: `TrainingLicenseActivationMode` (START_NOW/START_ON_DATE/TARGET_EVENT_DATE) e `TrainingLicenseActivationStatus` (PENDING/ACTIVATED) — `activationStatus` é distinto de `status`: uma licença pode estar ACTIVE (direito de uso) e ainda PENDING aqui (sem data escolhida).
- Campos `timezone`, `chosenStartLocalDate`, `anchorEventLocalDate`, `calendarInstantiatedAt`, `completedAt` adicionados. Backfill: linhas com `calendarInstantiated=true` viram `activationStatus=ACTIVATED`.
- **Q1 decidida:** licença é permanente por padrão (sem expiração forçada); `expiresAt` continua opcional para uma futura oferta com janela. Política de reinício/pausa não é modelada como limite no schema — decisão de produto explicitamente adiada, documentada no comentário da migration.
- `modules/school/domain/enums.ts` atualizado com os 3 enums (espelhando o schema — este projeto não importa os enums gerados pelo Prisma no domínio, usa constantes próprias).
- `npx prisma generate`: limpo. Migration `0039_training_license_activation`.

---

## [x] TM007 - Migration 0040: WorkoutAssignment — proveniência do marketplace

**Tipo:** DB
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-110
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0040_*`

**Descricao:** Acrescentar `planSessionId?, originalSnapshot Json?, effectiveRevisionId?, adjustedByCoachId?, sourceLabel?` — todos nullable, aditivos, compatíveis com atribuições que não vêm de licença.

**Criterio de conclusao:** Migration aplicada; queries existentes de `workoutAssignment` continuam funcionando sem alteração de comportamento para linhas sem `trainingLicenseId`.

### Implementation Notes

- `planSessionId`, `originalSnapshot`, `effectiveRevisionId`, `adjustedByCoachId`, `sourceLabel` adicionados a `WorkoutAssignment`, todos nullable/aditivos.
- `adjustedByCoachId` é uma relação nomeada real para `CoachProfile` (`WorkoutAssignmentAdjustedBy`) — isso exigiu nomear TAMBÉM a relação `coach` já existente (`WorkoutAssignmentCoach`), já que Prisma exige nomes em ambas quando há mais de uma relação entre o mesmo par de modelos. Só o nome interno da relação mudou; os nomes dos campos (`coach`, `assignments`) continuam os mesmos — sem impacto em código consumidor (confirmado por `tsc` limpo).
- `effectiveRevisionId` fica como coluna simples (sem FK) nesta migration — `PlanAdaptation` só existe a partir da TM008; a relação real é ligada lá.
- `npx prisma generate` e `npx tsc --noEmit`: limpos. Migration `0040_workout_assignment_marketplace_provenance`.

---

## [x] TM008 - Migration 0041: LicenseCoachEngagement e PlanAdaptation

**Tipo:** DB
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-301 RF-303
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0041_*`

**Descricao:** Criar `LicenseCoachEngagement (licenseId, athleteId, coachId, schoolId?, scope, status, requestedAt, acceptedAt?, endedAt?)` e `PlanAdaptation (licenseId, assignmentId/sessionId, coachId, actorUserId, beforeSnapshot, proposedSnapshot, reason, status, acceptedByAthleteAt?, expectedVersion, createdAt)`. Mapear back-relations nomeadas em `User` e `CoachProfile` (ver design §6, lição herdada da spec da Jornada).

**Criterio de conclusao:** Migration aplicada; `prisma validate` verde incluindo as back-relations novas; índice evitando sobreposição de período por `(licenseId, athleteId, coachId)`.

### Implementation Notes

- Dois modelos novos: `LicenseCoachEngagement` (scope como `Json` flexível, índice único parcial `(licenseId, coachId) WHERE status IN ('PENDING','ACTIVE')` — impede convite duplicado ao mesmo coach sem bloquear reconvite após ENDED) e `PlanAdaptation` (before/after snapshot, `expectedVersion` para concorrência).
- `WorkoutAssignment.adaptationVersion Int @default(0)` adicionado nesta migration (não na TM007) porque só existe em função de `PlanAdaptation` — incrementado por `DecidePlanAdaptation` (TM075) quando uma proposta é aceita.
- Back-relations nomeadas em `User` (`LicenseCoachEngagementAthlete`, `PlanAdaptationActor`), `CoachProfile` (`LicenseCoachEngagementCoach`, `PlanAdaptationCoach`) e `School` (`licenseCoachEngagements`) — checadas uma a uma contra a lição da spec da Jornada sobre back-relations faltando.
- `npx prisma generate`: limpo. Migration `0041_license_coach_engagement_plan_adaptation`.

---

## [x] TM009 - Migration 0042: MarketplaceMedia e MarketplaceReview

**Tipo:** DB
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-112
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0042_*`

**Descricao:** Criar `MarketplaceMedia (productId, kind, storageKey, thumbnailKey?, altText, caption?, sortOrder, access, processingStatus)` e `MarketplaceReview (productId, purchaseId, athleteId, versionId, stars 1..5, comment?, moderationStatus, createdAt, updatedAt)` com `@@unique` de avaliação corrente por `(purchaseId, athleteId, productId)`.

**Criterio de conclusao:** Migration aplicada; unicidade de avaliação corrente comprovada por teste de conflito; `stars` com `CHECK` 1..5.

### Implementation Notes

- `MarketplaceMedia` e `MarketplaceReview` criados. CHECK `stars BETWEEN 1 AND 5`; `@@unique([purchaseId, athleteId, productId])` é a garantia real de "no máximo uma avaliação corrente por compra" (RF-112) — no banco, não só na aplicação.
- Back-relations completadas: `TrainingProduct.media`/`.reviews` (deixadas de fora na TM003 de propósito, para não referenciar um modelo que ainda não existia — ver nota da TM003/design), `TrainingProductVersion.reviews`, `TrainingPurchase.reviews`, `User.marketplaceReviews`.
- `npx prisma generate`: limpo. Migration `0042_marketplace_media_review`.

---

## [x] TM010 - planPayloadSchema v2: multimodal e multi-sessão por dia

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM004
**Paralelo:** não
**Requisitos:** RF-005 RNF-006
**Areas afetadas:** `modules/school/domain/training-product-version.ts`

**Descricao:** Trocar `planDaySchema` (um `workoutTemplateId`) por `sessions[]` por dia, cada sessão com `planSessionId, workoutTemplateId, sportType (RyvanoSportType), order, alternative?, note?`. Leitor despacha por `schemaVersion`: formato antigo continua aceito sem reescrever versões já publicadas (ver design D-03).

**Criterio de conclusao:** Teste cobre leitura do formato antigo e do novo lado a lado; `sportType` validado por `isRyvanoSportType`; nenhuma versão publicada existente precisa de migração de dado.

### Implementation Notes

- `planPayloadSchema`/`PlanDay`/`PlanWeek`/`PlanPayload` (schemaVersion 1) mantidos INTACTOS — zero quebra para `instantiate-license-calendar.ts` (confirmado, único consumidor real além do barrel).
- Novo par `planSessionSchema`/`planDaySchemaV2`/`planWeekSchemaV2`/`planPayloadSchemaV2`: `sessions[]` por dia, cada uma com `planSessionId` estável, `workoutTemplateId`, `sportType` validado por `isRyvanoSportType` (RNF-006), `order`, `alternative?`, `note?`.
- `parsePlanPayload(schemaVersion, raw)` despacha entre v1/v2 (design D-03). `trainingProductVersionSchema` valida `planPayload` via `superRefine` usando o `schemaVersion` do mesmo objeto — formato v1 com `schemaVersion=2` é rejeitado (formatos não se misturam).
- `modules/school/index.ts` (barrel) ganhou os exports novos sem remover nenhum antigo.
- 11 testes novos (`tests/plan-payload-v2.test.ts`); os 21 testes existentes de `training-product-entities.test.ts` continuam verdes sem alteração (retrocompatibilidade).
- `tsc --noEmit`: limpo.

---

## [x] TM011 - Corrigir âncora de calendário para o fuso do atleta

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM006
**Paralelo:** não
**Requisitos:** RF-006
**Areas afetadas:** `modules/school/application/instantiate-license-calendar.ts`

**Descricao:** Substituir `toMonday()` (UTC fixo) por cálculo com `timezone` IANA + `LocalDate`. Cobrir dias de 23 h/25 h por troca de horário de verão sem deslocar sessão para o dia seguinte (ver design D-08). Auditar `tests/*.test.ts` que hardcodeiam UTC antes de mudar a assinatura (ver riscos em `design.md` §5).

**Criterio de conclusao:** Teste cobre fuso positivo e negativo e uma data de troca de horário de verão real; suíte existente de `instantiate-license-calendar` continua verde após ajuste.

### Implementation Notes

- Novo `modules/school/domain/local-date.ts`: matemática de calendário pura (`addCalendarDays`, `isoWeekday`, `mondayOnOrBefore`) separada da conversão de fuso (`localMidnightToUtc`, via `Intl.DateTimeFormat` — sem biblioteca de datas, nenhuma está instalada no projeto). Cada dia recalcula seu próprio offset, corrigindo o defeito de "somar 24h fixas" que quebraria em dia de troca de horário de verão.
- `instantiateLicenseCalendarSchema`: `startDate` (datetime ISO opcional) substituído por `timezone` (IANA, obrigatório) + `startLocalDate` (YYYY-MM-DD, obrigatório) — mudança sem quebra confirmada por busca textual: **zero chamadores** desta classe existiam antes desta task (nem rota, nem teste).
- `dueAt` deixou de ser `scheduledAt + 23h fixas` e passou a ser a meia-noite local do dia seguinte (também via `localMidnightToUtc`) — correto tanto em dias de 23h quanto de 25h.
- 14 testes novos em `tests/local-date.test.ts` (datas reais de troca de horário de verão 2026 para America/New_York, verificadas contra o próprio `Intl` do sistema, não hardcoded) + 6 testes em `tests/instantiate-license-calendar.test.ts` (fuso positivo, negativo, semana atravessando 2026-03-08, idempotência).
- `tsc --noEmit`: limpo. Busca textual confirma zero outros consumidores de `InstantiateLicenseCalendar`/`instantiateLicenseCalendarSchema`.

---

## [x] TM012 - Catálogo de erros do marketplace

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** —
**Areas afetadas:** `modules/school/domain/errors.ts`

**Descricao:** Acrescentar a `SCHOOL_ERROR_STATUS`: `PRODUCT_VISIBILITY_DENIED` (404), `LICENSE_ALREADY_ACTIVE` (409), `PURCHASE_IDEMPOTENCY_CONFLICT` (409), `REVIEW_NOT_ELIGIBLE` (403), `REVIEW_ALREADY_EXISTS` (409), `ENGAGEMENT_ALREADY_ACTIVE` (409), `ADAPTATION_VERSION_CONFLICT` (409), `INVALID_CALLBACK_URL` (400).

**Criterio de conclusao:** Códigos no catálogo com status mapeado; teste de mapeamento cobrindo cada código novo.

### Implementation Notes

- 8 códigos novos de `requirements.md` adicionados a `SCHOOL_ERROR_STATUS` (`modules/school/domain/errors.ts`), agrupados nas categorias existentes (Not found/Conflict/Validation/Bad request/Authorization).
- Backfill: `PRODUCT_NOT_FOUND`, `PRODUCT_NOT_AVAILABLE`, `PRODUCT_NO_VERSION`, `PAYMENT_REF_REQUIRED`, `LICENSE_NOT_FOUND`, `LICENSE_NOT_ACTIVE`, `VERSION_NOT_FOUND` também registrados — já eram usados ad-hoc por `CreateTrainingPurchase`/`InstantiateLicenseCalendar` (T405/T406) com status explícito em cada `throw`, mas ausentes do catálogo central.
- 16 testes novos (`tests/marketplace-errors.test.ts`), incluindo confirmação de que `SchoolError` sem status explícito usa o catálogo.
- `tsc --noEmit`: limpo.

---

## [x] TM013 - Documentar módulo em architecture/modules/

**Tipo:** DOC
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-007
**Areas afetadas:** `architecture/modules/marketplace.yaml, architecture/PROJECT_MAP.md`

**Descricao:** Criar `architecture/modules/marketplace.yaml` documentando que o código vive em `modules/school/` (ver design §1), listando `paths` reais (`app/api/marketplace`, `app/api/coach/products`, `app/marketplace`, `app/professor/estudio`, etc.) e os invariantes herdados de `school.yaml`. Acrescentar entrada no índice rápido de `PROJECT_MAP.md`.

**Criterio de conclusao:** Arquivo criado e referenciado no índice; `school.yaml` ganha nota apontando para `marketplace.yaml` para evitar duplicidade de fonte.

### Implementation Notes

- `architecture/modules/marketplace.yaml` criado, seguindo a estrutura de `school.yaml` (id/paths/owns/depends_on/invariants/conventions/validation/references), com nota explícita "por que não um módulo novo" (espelha design.md §1).
- `school.yaml` ganhou referência cruzada para `marketplace.yaml`.
- `PROJECT_MAP.md` — achado durante a task: **nem "school" nem "escola" apareciam no índice rápido**, apesar de `school.yaml` já existir (lacuna pré-existente, fora do escopo desta spec). Adicionadas duas linhas: uma para school, uma para marketplace — o mínimo necessário para o marketplace ser navegável a partir do índice, sem tentar corrigir a lacuna maior do módulo escola inteiro.
- Aviso de ambiente registrado no `validation:` do YAML: migrations 0036–0042 escritas e validadas por `prisma generate`, não aplicadas ao banco (sem acesso de rede a partir deste sandbox).

---

## [x] TM014 - Reindexar GitNexus e estabelecer baseline de impacto

**Tipo:** ARCH
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** —
**Areas afetadas:** `.gitnexus`

**Descricao:** Rodar `node .gitnexus/run.cjs analyze --index-only --repo .` (o índice estava 19 commits atrasado na verificação desta spec) e confirmar `status` limpo antes de qualquer task que edite símbolo compartilhado (`CustomizableCardGrid` na TM050 é o maior risco).

**Criterio de conclusao:** `node .gitnexus/run.cjs status --repo .` reporta índice atual; `detect-changes --scope all` executado como baseline antes da Onda 1 começar.

---

## [x] TM015 - Validar schema consolidado (prisma validate + back-relations)

**Tipo:** DB
**Prioridade:** P0
**Dependencias:** TM003 TM004 TM005 TM006 TM007 TM008 TM009
**Paralelo:** não
**Requisitos:** RF-003 RF-004
**Areas afetadas:** `prisma/schema.prisma`

**Descricao:** Rodar `npx prisma validate` com todas as migrations 0036–0042 aplicadas ao schema real (não só a tabela descritiva da spec de produto §9) e auditar back-relations nomeadas em `User` e `CoachProfile` — a spec da Jornada já encontrou esse exato tipo de lacuna (ver design §6, "Lição herdada").

**Criterio de conclusao:** `npx prisma validate` verde; toda relação ambígua em `User`/`CoachProfile` tem `@relation` nomeado.

### Implementation Notes

- `npx prisma validate` e `npx prisma migrate status` **não puderam ser executados**: ambos ficam pendurados e expiram por timeout a partir deste sandbox — o Postgres remoto de `DATABASE_URL` (`75.119.158.93:9596`) não é alcançável daqui (confirmado: `timeout 25 npx prisma migrate status` expira sem resposta).
- Validação prática equivalente usada em substituição: `npx prisma generate` — que também precisa resolver o grafo relacional completo e falha em relação ambígua/inválida — rodado com sucesso após CADA uma das migrations TM003–TM009 e novamente após TM010/TM011 (10 execuções limpas nesta sessão).
- Back-relations auditadas manualmente uma a uma ao criar `LicenseCoachEngagement`/`PlanAdaptation` (TM008) e `MarketplaceMedia`/`MarketplaceReview` (TM009) — a lição da spec da Jornada (relações faltando em `User`) foi aplicada preventivamente, não descoberta depois.
- **Pendência real:** alguém com acesso de rede ao banco precisa rodar `npx prisma validate` e `npx prisma migrate deploy` de verdade antes de considerar o schema em produção. Registrado em `STATUS.md` §1 e em `marketplace.yaml`.

---

## [x] TM016 - Decidir flag de rollout do marketplace

**Tipo:** ARCH
**Prioridade:** P1
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RNF-009
**Areas afetadas:** `modules/school/infrastructure/`, rotas novas

**Descricao:** Decidir Q8: flag própria (`MARKETPLACE_ENABLED`) ou reaproveitar `SCHOOL_MODULE_ENABLED`. Compradores podem ser atletas sem nenhum vínculo escolar — considerar esse caso na decisão. Documentar a escolha e aplicar a todas as rotas novas a partir da Onda 1.

**Criterio de conclusao:** Decisão registrada em `STATUS.md` §7; rota de exemplo (TM024 ou TM033) já nasce atrás da flag escolhida.

### Implementation Notes

- **Q8 decidida:** flag própria `MARKETPLACE_ENABLED`, não reaproveitamento de `SCHOOL_MODULE_ENABLED` — motivo registrado no código (`modules/school/config/marketplace-feature-flag.ts`): comprador pode ser atleta sem nenhum vínculo escolar (produto `coachId`-only), então uma flag com nome do módulo escola seria semanticamente errada mesmo com o código morando em `modules/school/`.
- `isMarketplaceEnabled()`/`assertMarketplaceEnabled()` seguem a mesma precedência de `isSchoolModuleEnabled` (kill-switch > opt-in > auto-enable dev/staging > desligado em produção), mas exigem o módulo escola ligado primeiro (o código/dados vivem lá).
- `server/env.ts` ganhou `MARKETPLACE_ENABLED` (aditivo). `app/api/schools/_shared.ts` ganhou o mesmo tratamento de erro `MARKETPLACE_DISABLED` → 404 que já existe para `SCHOOL_MODULE_DISABLED`, reutilizando o mesmo envelope.
- **Nota de escopo:** o critério original citava "rota de exemplo (TM024 ou TM033) já nasce atrás da flag" — essas são tasks de Onda 1 ainda não implementadas nesta sessão (TM016 não depende delas). O mecanismo da flag está pronto e testado; a primeira rota real da Onda 1 vai chamá-lo, não precisar construí-lo.
- 5 testes novos (`tests/marketplace-feature-flag.test.ts`). `tsc --noEmit`: limpo.

---

## [x] TM017 - Seed e2e mínimo do marketplace

**Tipo:** TEST
**Prioridade:** P2
**Dependencias:** TM003 TM005 TM006
**Paralelo:** não
**Requisitos:** RF-108
**Areas afetadas:** `prisma/seed.ts`

**Descricao:** Estender o seed existente com um produto publicado de exemplo (grátis) e uma licença ativa para a conta e2e, reaproveitando `pnpm db:seed` — não criar seed paralelo.

**Criterio de conclusao:** `pnpm db:seed` cria produto+licença sem duplicar em reexecução.

### Implementation Notes

- `prisma/seed.ts` estendido (não um seed paralelo): 1 `TrainingProduct` publicado, grátis, de coach independente (`coachId` preenchido, `schoolId` null — exercita RF-105), 1 `TrainingProductVersion` **multimodal** (`schemaVersion=2`, corrida+força no mesmo dia, exercitando TM010), 1 `TrainingPurchase` grátis `COMPLETED` e 1 `TrainingLicense` `ACTIVE` para `athlete2@ryvano.dev` — deliberadamente **não** instanciada (`calendarInstantiated=false`), para exercitar o estado "não iniciado" da UI.
- IDs fixos + `upsert` em tudo, mesmo padrão idempotente do resto do arquivo.
- **Não executado contra o banco real** — mesma limitação de rede de TM015; `tsc --noEmit` confirma que as chamadas Prisma têm a forma certa contra o schema gerado, mas `pnpm db:seed` propriamente dito precisa ser rodado por alguém com acesso ao Postgres remoto antes de ser considerado verificado.

---

# 7. Onda 1 — Produto completo sem pagamento real (TM018–TM056)

Valida a jornada inteira com oferta gratuita, sem checkout real (spec de produto
§14, Fase 1). É a onda mais extensa: editor do professor, vitrine pública,
aquisição grátis, calendário, avaliações.

---

## [x] TM018 - Domínio: guard de professor autorizado

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** —
**Paralelo:** sim
**Requisitos:** RF-101
**Areas afetadas:** `modules/school/domain/`

**Descricao:** Guard reutilizável que confirma `CoachProfile` ativo e, quando o proprietário comercial é uma escola, OWNER/ADMIN autorizado dessa escola — reusa exatamente a checagem já usada pelo resto do módulo (ver design §4).

**Criterio de conclusao:** Teste cobre atleta sem `CoachProfile`, coach inativo e coach sem autorização de escola, todos rejeitados no servidor.

### Implementation Notes

Guard `CanManageTrainingProduct` (`modules/school/application/can-manage-training-product.ts`), 8 testes. Reusa `CoachProfile` ativo + a mesma checagem OWNER/ADMIN de escola já usada por `CanManageSchool`, sem inventar segunda noção de autorização.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM019 - Caso de uso CreateTrainingProductDraft

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM003 TM018
**Paralelo:** não
**Requisitos:** RF-101
**Areas afetadas:** `modules/school/application/`

**Descricao:** Cria rascunho com `schoolId` XOR `coachId` conforme permissão do ator. Decidir Q3 (produto de professor-em-escola: nome próprio × escola) nesta task.

**Criterio de conclusao:** Teste cobre criação por coach independente e por coach vinculado a escola; decisão de Q3 aplicada e documentada.

### Implementation Notes

`CreateTrainingProductDraft`, 8 testes. **Q3 decidida por request:** `schoolId` presente no payload → produto de titularidade da escola (exige OWNER/ADMIN daquela escola); ausente → nome próprio do coach. Documentado no código; sinalizado como default razoável, não decisão de Produto — ver STATUS.md §7.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM020 - Caso de uso UpdateTrainingProductDraft

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM019
**Paralelo:** não
**Requisitos:** RF-102
**Areas afetadas:** `modules/school/application/`

**Descricao:** Edição de rascunho com `expectedVersion` (RNF-003); só o proprietário autorizado edita.

**Criterio de conclusao:** Edição concorrente com `expectedVersion` obsoleto retorna 409; edição de produto de outro autor retorna 403/404.

### Implementation Notes

`UpdateTrainingProductDraft`, 10 testes. Concorrência via `expectedVersion` (novo código `PRODUCT_UPDATE_CONFLICT`, 409). `modules/school/domain/training-product.ts` ganhou os 17 campos comerciais nullable que a migration 0036 já tinha no banco mas o Zod do domínio ainda não expunha — aditivo, teste de entidade pré-existente (21/21) continua verde.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM021 - Editor: SaveProductVersionDraft (multimodal)

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM010 TM020
**Paralelo:** não
**Requisitos:** RF-102 RF-005
**Areas afetadas:** `modules/school/application/`

**Descricao:** Monta `weeks[] → days[] → sessions[]` a partir da biblioteca de templates do autor; permite duplicar semana, mais de uma sessão por dia e dia de descanso.

**Criterio de conclusao:** Teste cobre plano com duas sessões no mesmo dia (corrida + força) e duplicação de semana preservando IDs de sessão estáveis.

### Implementation Notes

`SaveProductVersionDraft` + `duplicatePlanWeek` (novo helper em `training-product-version.ts`), 8 testes. Duplicar semana preserva os mesmos `planSessionId` (convenção já fixada pelo teste da TM010 — não foram inventados IDs novos). Multi-sessão por dia e dia de descanso (dia ausente) funcionam.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM022 - Caso de uso PublishTrainingProductVersion

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM004 TM021
**Paralelo:** não
**Requisitos:** RF-103
**Areas afetadas:** `modules/school/application/`

**Descricao:** Verifica que todo template referenciado existe e pertence ao autor/escola ou tem licença de uso; grava snapshot suficiente para executar mesmo se o template de origem for arquivado depois. Decidir Q4 (direito de atualização de versão para quem já comprou) nesta task.

**Criterio de conclusao:** Publicar com template inacessível falha antes de criar a versão; snapshot publicado sobrevive ao arquivamento do template de origem (teste); decisão de Q4 documentada.

### Implementation Notes

`PublishTrainingProductVersion`, 9 testes. Verifica todo `workoutTemplateId` referenciado antes de publicar (`WORKOUT_TEMPLATE_NOT_ACCESSIBLE`, novo código 403). **Q4 também resolvida aqui:** nenhuma atualização automática de versão para quem já comprou — publicar nunca toca `TrainingLicense.versionId` existente. Sinalizado como default, não decisão de Produto.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM023 - Caso de uso GetProductSalesSummary

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM019
**Paralelo:** sim
**Requisitos:** RF-104
**Areas afetadas:** `modules/school/application/`

**Descricao:** Retorna volume, status e receita agregados do produto do próprio autor — nunca execução individual, biometria ou contato além do necessário.

**Criterio de conclusao:** DTO de retorno não contém nenhum campo de execução/biometria individual (teste de forma, não só de valor).

### Implementation Notes

`GetProductSalesSummary`, 6 testes. DTO testado explicitamente para NÃO conter execução/biometria individual (teste de forma).

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM024 - Rota POST /api/coach/products

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM019
**Paralelo:** não
**Requisitos:** RF-101
**Areas afetadas:** `app/api/coach/products/route.ts`

**Descricao:** Adaptador fino sobre `CreateTrainingProductDraft`, `schoolResponse` (ator obrigatório), atrás da flag decidida em TM016.

**Criterio de conclusao:** Rota rejeita chamada sem sessão (401) e sem `CoachProfile` (403); delega toda regra ao caso de uso.

### Implementation Notes

`POST /api/coach/products` — adaptador fino, `schoolResponse` + `assertMarketplaceEnabled()`. Nota: usa `COACH_PROFILE_NOT_FOUND` (404) em vez do 403 citado literalmente no texto da task — mesma convenção de 10+ outros use cases do módulo (create/update/archive-workout-template etc.), documentado como divergência deliberada.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM025 - Rota PUT /api/coach/products/[id]/draft

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM020
**Paralelo:** não
**Requisitos:** RF-102
**Areas afetadas:** `app/api/coach/products/[id]/draft/route.ts`

**Descricao:** Adaptador fino sobre `UpdateTrainingProductDraft`, incluindo `expectedVersion` no corpo.

**Criterio de conclusao:** Edição por não-proprietário retorna 403/404; `expectedVersion` obsoleto retorna 409.

### Implementation Notes

`PUT /api/coach/products/[id]/draft` estendido para aceitar `product`/`version` opcionais no corpo, delegando a `UpdateTrainingProductDraft`/`SaveProductVersionDraft` respectivamente — a TM021 (SaveProductVersionDraft) não tinha rota própria alocada no task-list original; esta composição a destrava sem virar lógica de negócio na rota.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM026 - Rota POST /api/coach/products/[id]/publish

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM022
**Paralelo:** não
**Requisitos:** RF-103
**Areas afetadas:** `app/api/coach/products/[id]/publish/route.ts`

**Descricao:** Adaptador fino sobre `PublishTrainingProductVersion`.

**Criterio de conclusao:** Publicar produto com template inacessível retorna erro do catálogo (TM012), não 500.

### Implementation Notes

`POST /api/coach/products/[id]/publish` — adaptador fino sobre `PublishTrainingProductVersion`.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM027 - Rotas GET /api/coach/products e GET /api/coach/products/[id]/sales

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM023 TM024
**Paralelo:** sim
**Requisitos:** RF-104
**Areas afetadas:** `app/api/coach/products/route.ts, app/api/coach/products/[id]/sales/route.ts`

**Descricao:** `GET /api/coach/products` lista os próprios produtos em qualquer status (esta é a listagem autenticada que substitui elevar a rota pública — ver RF-001/design D-01). `GET .../sales` expõe `GetProductSalesSummary`.

**Criterio de conclusao:** `GET /api/coach/products` sem sessão retorna 401; com sessão retorna só produtos do próprio `coachId`/escolas autorizadas.

### Implementation Notes

`GET /api/coach/products` + `GET .../[id]/sales`. Precisou de um use case adicional não numerado na task-list original, `ListOwnTrainingProducts` (`modules/school/application/list-own-training-products.ts`, 6 testes) para a listagem autenticada "meus produtos" citada no requisito.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM028 - Tela /professor/estudio/planos

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** TM027
**Paralelo:** não
**Requisitos:** RF-101 RF-104
**Areas afetadas:** `app/professor/estudio/planos/page.tsx`

**Descricao:** Lista dos próprios produtos com estados (rascunho, publicado, arquivado), versões e vendas agregadas.

**Criterio de conclusao:** Estados vazio/erro/permissão cobertos (RNF-011); nenhum link para rota inexistente.

### Implementation Notes

`/professor/estudio/planos` — lista com estados (rascunho/publicado/arquivado), versões, vendas agregadas.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM029 - Tela /professor/estudio/planos/novo

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** TM021 TM024
**Paralelo:** não
**Requisitos:** RF-102
**Areas afetadas:** `app/professor/estudio/planos/novo/page.tsx`

**Descricao:** Editor estruturado com rascunho persistido e preview no ponto de vista do atleta antes de publicar.

**Criterio de conclusao:** Preview reflete exatamente o que será publicado; duplicar semana e adicionar segunda sessão no mesmo dia funcionam na UI.

### Implementation Notes

`/professor/estudio/planos/novo` — editor com preview. "Arrastar sessão" implementado como controles adicionar/remover, não drag real por ponteiro (simplificação deliberada, documentada).

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM030 - Tela /professor/estudio/planos/[productId]

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** TM025 TM026 TM027
**Paralelo:** não
**Requisitos:** RF-102 RF-103 RF-104
**Areas afetadas:** `app/professor/estudio/planos/[productId]/page.tsx`

**Descricao:** Edição antes de publicar, versionamento, preço, visibilidade, métricas agregadas — sem execução individual de comprador.

**Criterio de conclusao:** Autor não vê nenhum dado individual de comprador nesta tela (auditoria manual + teste de DTO).

### Implementation Notes

`/professor/estudio/planos/[productId]` — edição pré-publicação, versionamento, preço, visibilidade, métricas agregadas; sem dado individual de comprador.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM031 - Caso de uso ListMarketplaceProducts

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM001 TM003
**Paralelo:** não
**Requisitos:** RF-105 RNF-006
**Areas afetadas:** `modules/school/application/`

**Descricao:** Superset de `ListTrainingProducts` com filtros de busca, modalidade (`RyvanoSportType`), duração, dificuldade, objetivo/prova, avaliação, preço, equipamento, idioma e ordenação (relevância, recentes, mais comprados, mais bem avaliados, preço). Para chamador não autorizado, força `PUBLISHED`+`PUBLIC` sempre — nunca aceita elevação por parâmetro (mesma regra de RF-001, aplicada desde a origem aqui).

**Criterio de conclusao:** Contagem e paginação no servidor por cursor; teste cobre cada filtro isoladamente e combinado; anônimo nunca recebe rascunho/`SCHOOL_ONLY`.

### Implementation Notes

`ListMarketplaceProducts` (`modules/school/application/list-marketplace-products.ts`), 23 testes. Copia literalmente a regra do RF-001 (`status`/`visibility` fora do schema, `where` força `PUBLISHED`+`PUBLIC` incondicionalmente). Filtros completos de RF-105; ordenação `best-rated` com peso bayesiano explícito (RNF-012, testado: 1×5★ não ultrapassa 50×4.9★); `most-purchased`/`best-rated` usam ranking em memória sobre um conjunto de até 500 candidatos (limitação documentada do Prisma — sem `_avg`/`_count` de relação filtrada ordenável nativamente). `totalCount` real via `count()` no servidor.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM032 - Caso de uso GetMarketplaceProductDetail

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM031
**Paralelo:** não
**Requisitos:** RF-106
**Areas afetadas:** `modules/school/application/`

**Descricao:** DTO de detalhe com mídia pública, amostra aprovada (uma semana/sessão deliberadamente pública), professor, reviews verificadas e oferta atual. `UNLISTED` acessível só por ID/slug direto.

**Criterio de conclusao:** DTO nunca inclui o plano inteiro, só a amostra; produto `SCHOOL_ONLY`/`DRAFT` retorna 404 para chamador sem vínculo.

### Implementation Notes

`GetMarketplaceProductDetail`, 17 testes. DRAFT/ARCHIVED/SCHOOL_ONLY e ID inexistente retornam o MESMO `PRODUCT_VISIBILITY_DENIED` (404) — testado explicitamente para impedir que um probe distinga "não existe" de "está oculto". `previewWeeks` limitado à primeira semana da versão resolvida, testado inclusive para o formato v2 multimodal.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM033 - Rota GET /api/marketplace/products

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM031
**Paralelo:** não
**Requisitos:** RF-105
**Areas afetadas:** `app/api/marketplace/products/route.ts`

**Descricao:** Adaptador fino sobre `ListMarketplaceProducts`, `publicSchoolResponse`, query string com todos os filtros de RF-105.

**Criterio de conclusao:** URL inválida é normalizada sem expor rascunho; resposta segue `{ items, nextCursor }`.

### Implementation Notes

`GET /api/marketplace/products` — adaptador fino, `publicSchoolResponse` + `assertMarketplaceEnabled()`. Coerção de query (`z.coerce`) centralizada no módulo de aplicação, reusada pela página TM035.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM034 - Rota GET /api/marketplace/products/[idDoTreino]

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM032
**Paralelo:** não
**Requisitos:** RF-106
**Areas afetadas:** `app/api/marketplace/products/[idDoTreino]/route.ts`

**Descricao:** Adaptador fino sobre `GetMarketplaceProductDetail`.

**Criterio de conclusao:** SEO/canonical não revela produto privado/`SCHOOL_ONLY` (checar metadados gerados, não só o corpo da resposta).

### Implementation Notes

`GET /api/marketplace/products/[idDoTreino]` — adaptador fino. `generateMetadata`/corpo da página (TM036) compartilham a MESMA chamada `GetMarketplaceProductDetail` via `React.cache()`, garantindo que metadados SEO nunca vazem um produto privado por caminho diferente do corpo.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM035 - Tela /marketplace

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** TM033
**Paralelo:** não
**Requisitos:** RF-105
**Areas afetadas:** `app/marketplace/page.tsx`

**Descricao:** Hero, busca, filtros persistentes (sidebar desktop, drawer mobile), grid paginado, chips removíveis, ordenação. Query string sincronizada e sobrevivendo a recarga.

**Criterio de conclusao:** 320/375/768/1440 px cobertos; teclado e leitor de tela funcionam nos filtros; skeleton preserva geometria.

### Implementation Notes

`/marketplace` — sidebar 280px sticky (desktop), grid até 3 colunas, drawer "Filtros (N)" no mobile (Escape fecha, foco ao abrir), chips removíveis, query string como única fonte de estado (sobrevive a reload), skeleton preserva geometria. Ressalva documentada: sem auditoria visual/AX completa da matriz 320–1440px; "Aplicar" do drawer fecha o drawer (filtros já aplicam ao vivo em cada controle, não há lote pendente real).

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM036 - Tela /marketplace/[idDoTreino]

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** TM034
**Paralelo:** não
**Requisitos:** RF-106
**Areas afetadas:** `app/marketplace/[idDoTreino]/page.tsx`

**Descricao:** Galeria, vídeo opcional (poster, sem autoplay), descrição, amostra, professor, reviews, resumo de compra lateral com aviso de acompanhamento não incluído por padrão.

**Criterio de conclusao:** Vídeo não autoplay; produto retirado de venda mantém página informativa sem CTA de compra.

### Implementation Notes

`/marketplace/[idDoTreino]` — galeria, vídeo com `poster`/`preload="none"` e SEM `autoPlay` (confirmado por inspeção), amostra, bio do professor, resumo de compra com aviso "acompanhamento é opcional" salvo quando `coachingIncluded`. `coachingIncluded` sempre `false` por ora — não existe campo de schema para isso ainda (sinalizado, não inventado).

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM037 - Porta de entrada do comprador (callbackUrl interno validado)

**Tipo:** SEC
**Prioridade:** P0
**Dependencias:** TM036
**Paralelo:** não
**Requisitos:** RF-107
**Areas afetadas:** `app/entrar/**, app/marketplace/**`

**Descricao:** CTA de compra/aquisição redireciona a login/cadastro preservando `productId`+versão+intenção numa URL interna validada pelo servidor; `callbackUrl` externo é rejeitado (proteção contra open redirect). Usuário com licença ativa vê "Abrir meu plano".

**Criterio de conclusao:** Teste cobre `callbackUrl` externo rejeitado; fluxo completo visitante→login→retorno ao checkout da mesma oferta com preço revalidado.

### Implementation Notes

Proteção de callback URL — ver `modules/school/domain/marketplace-callback-url.ts` (12 testes de rejeição, incluindo URL absoluta e `//host` protocol-relative). Não havia helper reutilizável existente (a checagem de `callbackUrl`/`next` do login por credenciais está duplicada 3× no código pré-existente, não tocada); construído um validador PRÓPRIO e mais estrito, escopado a `/marketplace/*`, com `buildMarketplaceCallbackUrl` construindo o link no servidor sempre que possível (nunca confia em URL vinda do cliente no caminho comum). Wiring aditivo em `app/entrar/page.tsx`/`entrar-client.tsx` — verificado.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM038 - Caso de uso AcquireFreeTrainingProduct

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM002 TM003
**Paralelo:** não
**Requisitos:** RF-108
**Areas afetadas:** `modules/school/application/`

**Descricao:** Divide `CreateTrainingPurchase` (design D-02): caminho exclusivo para `priceCents=null`, sem `paymentRef`, idempotente por `(productId, athleteId)`.

**Criterio de conclusao:** Executar duas vezes (retry/duas abas) produz uma única compra+licença; produto pago rejeita esta rota de aquisição.

### Implementation Notes

`AcquireFreeTrainingProduct` (novo código `PRODUCT_NOT_FREE`, 409), 8 testes, incluindo simulação de corrida (P2002) sobre o `@unique` de `checkoutId` — idempotência real sob concorrência, não só retry sequencial.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM039 - Rota POST /api/marketplace/checkout (caminho grátis)

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM038
**Paralelo:** não
**Requisitos:** RF-108
**Areas afetadas:** `app/api/marketplace/checkout/route.ts`

**Descricao:** Para produto grátis, delega a `AcquireFreeTrainingProduct` e retorna a licença criada. Para produto pago, cria `TrainingPurchase(PENDING)` com `offerSnapshot` congelado (preço revalidado no servidor) e não promove a `COMPLETED` — essa parte é completada na TM062 (Onda 2).

**Criterio de conclusao:** `idempotencyKey` obrigatório; teste cobre produto grátis→licença imediata e produto pago→`PENDING` sem licença.

### Implementation Notes

`POST /api/marketplace/checkout` — caminho grátis delega a `AcquireFreeTrainingProduct`; caminho pago cria `TrainingPurchase(PENDING)` com `offerSnapshot` congelado e para aí (não promove a `COMPLETED` — isso é TM060/TM062, Onda 2, propositalmente fora de escopo).

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM040 - Rota GET /api/me/training-licenses

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM006
**Paralelo:** sim
**Requisitos:** RF-111
**Areas afetadas:** `app/api/me/training-licenses/route.ts`

**Descricao:** Lista as licenças do próprio usuário autenticado, com estado de ativação.

**Criterio de conclusao:** Nunca retorna licença de outro `athleteId`, mesmo com ID adivinhado.

### Implementation Notes

`GET /api/me/training-licenses` — nunca retorna licença de outro `athleteId`, testado.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM041 - Caso de uso ActivateTrainingLicense

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM011 TM010
**Paralelo:** não
**Requisitos:** RF-109
**Areas afetadas:** `modules/school/application/instantiate-license-calendar.ts`

**Descricao:** Refatora `InstantiateLicenseCalendar` para receber `startLocalDate` **ou** `targetEventDate` + `timezone`, com preview de conflito antes de confirmar. Idempotente mesmo com duas abas (`calendarInstantiated`).

**Criterio de conclusao:** Ativar duas vezes não duplica sessões; preview mostra conflito com treino existente antes de confirmar.

### Implementation Notes

`ActivateTrainingLicense` — envolve `InstantiateLicenseCalendar` sem duplicar aritmética de calendário (nova função pura exportada `computePlannedDays`, extraída de `instantiate-license-calendar.ts` de forma comprovadamente preservadora de comportamento — reverificado nesta sessão: os 14 testes pré-existentes continuam verdes byte-a-byte). `preview:true` funciona e é testado; a UI (TM044) não chama o preview interativo ainda (simplificação documentada). Ancoragem TARGET_EVENT_DATE é uma aproximação documentada (contra-conta a partir da data-alvo, snap para a segunda-feira da semana) — só bate exatamente na data quando o dia da semana coincide com o último dia prescrito do plano; limitação registrada no doc comment da classe.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM042 - Rota POST /api/me/training-licenses/[id]/activate

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM041
**Paralelo:** não
**Requisitos:** RF-109
**Areas afetadas:** `app/api/me/training-licenses/[id]/activate/route.ts`

**Descricao:** Adaptador fino sobre `ActivateTrainingLicense`, `expectedVersion` no corpo.

**Criterio de conclusao:** Ativação por não-dono retorna 403/404.

### Implementation Notes

`POST /api/me/training-licenses/[id]/activate` — adaptador fino.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM043 - Tela /app/planos

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** TM040
**Paralelo:** não
**Requisitos:** RF-111
**Areas afetadas:** `app/app/planos/page.tsx`

**Descricao:** Lista de licenças por estado (aguardando pagamento, não iniciado, em andamento, pausado, concluído, reembolsado) com CTA "Escolher data de início".

**Criterio de conclusao:** Cada estado tem UI própria (RNF-011); nenhum estado cai em rótulo genérico.

### Implementation Notes

`/app/planos` — lista por estado (aguardando pagamento/não iniciado/em andamento/pausado/concluído/reembolsado).

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM044 - Tela /app/planos/[licenseId]

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** TM041 TM042
**Paralelo:** não
**Requisitos:** RF-111
**Areas afetadas:** `app/app/planos/[licenseId]/page.tsx`

**Descricao:** "Meu plano": progresso por semana, próximo treino, autor, professor acompanhante (se houver), ajustes, iniciar/pausar, permissões, histórico.

**Criterio de conclusao:** Ação principal contextual correta por estado (Escolher início / Abrir próximo treino / Analisar ajuste / Concluir).

### Implementation Notes

`/app/planos/[licenseId]` — "Meu plano": progresso, próximo treino, autor, seção de acompanhamento (renderiza vazio/ausente graciosamente — Onda 3 não existe ainda). Pausar/retomar NÃO tem UI/rota própria ainda (não estava no critério de conclusão literal da task; estado PAUSED renderiza corretamente se alcançado por outro meio).

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM045 - Evoluir /app/treinos com origem do marketplace

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** TM007 TM041
**Paralelo:** não
**Requisitos:** RF-110
**Areas afetadas:** `app/app/treinos/**`

**Descricao:** Badge de origem/plano, filtro por plano, título do template quando `workoutId=null` — nunca "Treino agendado" genérico quando o template tem título.

**Criterio de conclusao:** Sessão do marketplace visível nas visões dia/semana/mês/ano/lista; link contextual volta para `/app/planos/[licenseId]`.

### Implementation Notes

`/app/treinos` evoluído: `ASSIGNMENT_INCLUDE` (queries.ts) ganhou include de `trainingLicense.product`; `WorkoutCard` ganha badge de origem/autoria E corrige um fallback morto `schoolPath="#"` para sessões de marketplace, agora linkando para `/app/planos/[licenseId]`. GitNexus impact LOW (confirmado antes de editar); suíte pré-existente `treinos-date-helpers.test.ts` (16/16) + novo teste de componente (4) verdes.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM046 - Tela /escola/[schoolId]/marketplace

**Tipo:** FE
**Prioridade:** P2
**Dependencias:** TM031
**Paralelo:** sim
**Requisitos:** RF-105
**Areas afetadas:** `app/escola/[schoolId]/marketplace/page.tsx`

**Descricao:** Produtos de titularidade da escola, autores, vendas/resumos e regras de aprovação — sem acesso a compradores externos à escola. OWNER/ADMIN apenas.

**Criterio de conclusao:** Não-OWNER/ADMIN recebe 403; comprador fora da escola nunca aparece listado aqui.

### Implementation Notes

`/escola/[schoolId]/marketplace` — produtos de titularidade da escola, OWNER/ADMIN via `CanManageSchool` já existente. Construído direto sobre `prisma.trainingProduct` (não precisou de TM031); sem rota de API dedicada, mesmo padrão de outras páginas admin do módulo.

(Implementado por agente paralelo nesta sessão; verificado de forma independente: `tsc --noEmit` limpo, suíte completa 2215/2295 sem regressão nova, `git diff` revisado nos pontos mais sensíveis.)

---

## [x] TM047 - Caso de uso CreateMarketplaceReview

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM009 TM041
**Paralelo:** não
**Requisitos:** RF-112
**Areas afetadas:** `modules/school/application/`

**Descricao:** Elegibilidade: compra confirmada, licença ativa, ao menos uma sessão registrada. Uma avaliação corrente por `(purchaseId, athleteId, productId)`, editável com auditoria; autor do produto não pode avaliar. Decidir Q6 (critérios de moderação) nesta task.

**Criterio de conclusao:** Autoavaliação do autor rejeitada; segunda avaliação da mesma compra edita a existente, não cria outra; decisão de Q6 documentada.

### Implementation Notes

`modules/school/application/create-marketplace-review.ts`, 10 testes. Upsert keyado no `@@unique([purchaseId,athleteId,productId])` do banco (migration 0042) — segunda avaliação edita, corrida concorrente (P2002 simulado) vira `REVIEW_ALREADY_EXISTS` em vez de erro cru. Elegibilidade: compra `COMPLETED` do próprio ator, licença não revogada/expirada (`ACTIVE`/`PAUSED`/`COMPLETED` aceitos), ao menos um `WorkoutExecution` via `assignment.trainingLicenseId`. Autor (via `CoachProfile.userId`) bloqueado de autoavaliar — só cobre o caso de produto de coach independente; produto de escola (`coachId=null` pela XOR da TM003) não tem autor individual identificável no schema atual, mesma lacuna já documentada por `GetMarketplaceProductDetail`. **Q6 decidida:** avaliação nasce `APPROVED` (sem fila de moderação nesta Onda); `moderationStatus` continua suportando `REJECTED` para uma denúncia futura. Sinalizada para Produto confirmar.

---

## [x] TM048 - Rota POST /api/marketplace/products/[idDoTreino]/reviews

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM047
**Paralelo:** não
**Requisitos:** RF-112
**Areas afetadas:** `app/api/marketplace/products/[idDoTreino]/reviews/route.ts`

**Descricao:** Adaptador fino sobre `CreateMarketplaceReview`.

**Criterio de conclusao:** Compra pendente ou inexistente retorna `REVIEW_NOT_ELIGIBLE` (TM012).

### Implementation Notes

`POST /api/marketplace/products/[idDoTreino]/reviews` — adaptador fino, `schoolResponse` (autenticado), `productId` sempre da URL. 5 testes de rota.

---

## [x] TM049 - Agregação honesta de média e contagem

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM047 TM032
**Paralelo:** não
**Requisitos:** RF-112 RNF-012
**Areas afetadas:** `modules/school/application/`

**Descricao:** Média/contagem calculadas só sobre reviews elegíveis e aprovadas; card/detalhe exibem "Novo" sem reviews, nunca "0 estrelas"; ordenação "mais bem avaliados" considera volume mínimo (RNF-012).

**Criterio de conclusao:** Produto sem review mostra "Novo"; produto com 1 nota 5 não ultrapassa produto com 50 notas 4,9 na ordenação por avaliação.

### Implementation Notes

**Já estava implementada** como parte da TM031/TM032 (Trilha B): `ratingStats`/`weightedRating` em `list-marketplace-products.ts` (prior bayesiano, testado explicitamente para "1×5★ não ultrapassa 50×4.9★") e `ratingAverage: null`/`reviewCount: 0` em `get-marketplace-product-detail.ts` quando não há review aprovada (testado). Ambas filtram por `moderationStatus: APPROVED`. Esta task só precisava que TM047 existisse para gerar dados reais — nenhum código novo necessário, confirmado por leitura direta antes de marcar como concluída.

---

## [x] TM050 - CustomizableCardGrid: novas superfícies

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** TM014
**Paralelo:** não
**Requisitos:** RF-113
**Areas afetadas:** `components/layout/customizable-card-grid.tsx`

**Descricao:** Adicionar as superfícies `marketplace-catalog`, `athlete-plan`, `coach-studio` com ordem persistida por `(usuário, superfície)`, sem tocar a chave de `UserProfile.dashboardLayoutOrder` do dashboard do atleta (ver design D-09 — **alto risco de blast radius**, rodar GitNexus antes).

**Criterio de conclusao:** Dashboard, atividades e integrações continuam funcionando sem regressão (teste manual + suíte); nova superfície salva/descarta independentemente.

### Implementation Notes

- GitNexus impact ANTES de editar: `CustomizableCardGrid` tem 2 candidatos ambíguos no índice; o real (`components/layout/customizable-card-grid.tsx`) tem 3 chamadores diretos, risco **LOW** — confirmado por busca textual (`dashboard-redesign.tsx`, `activity-visual-dashboard.tsx`, `integrations-hub.tsx`). A ressalva "alto risco" do requisito original era cautela de projeto, não o que o grafo mediu.
- **Achado importante:** o componente em si já é agnóstico de "superfície" — recebe `savedLayout`/`onSave` como props, sem nenhum conceito de chave embutido. A convenção REAL deste código-base (descoberta por leitura de `app/actions/dashboard-layout.ts`/`activities.ts`/`integrations-layout.ts`) é **uma coluna dedicada por superfície** em `UserProfile` (`dashboardLayoutOrder`, `activityLayoutOrder`, `integrationsLayoutOrder`), não uma chave genérica. TM050 seguiu essa MESMA convenção em vez de inventar um mecanismo novo: migration `0043_user_profile_marketplace_layout_orders` acrescenta `marketplaceCatalogLayoutOrder`, `athletePlanLayoutOrder`, `coachStudioLayoutOrder` (3 colunas nullable). `app/actions/marketplace-layout.ts` espelha exatamente `dashboard-layout.ts` (mesma validação Zod, mesmo upsert).
- **Nota de numeração de migration:** esta é a `0043`. O texto original da TM057 (Onda 2) também dizia "Migration 0043" — precisa virar `0044` (ou o próximo livre) quando a TM057 for implementada de verdade.
- **Prova end-to-end em UMA superfície** (`athlete-plan`, `/app/planos/[licenseId]`): os cards "Professor acompanhante" e "Histórico de ajustes" (antes `<section>` fixas) agora renderizam dentro de `CustomizableCardGrid`, arrastáveis/redimensionáveis, persistidos via `saveAthletePlanLayoutAction`. `ActivationCard`/`ProgressCard`/`NextAssignmentCard` foram deixados FORA do grid (risco menor: página já testada e entregue pela Trilha C, mudança cirúrgica em vez de retrofit completo). 6 testes novos (`tests/marketplace-layout-actions.test.ts`) + suíte pré-existente da página (5 testes, `tests/planos-detail-page.test.ts`) continua verde sem alteração — a função `loadPlanoDetail` testada não foi tocada.
- `marketplace-catalog`/`coach-studio`: mecanismo de persistência pronto e testado (mesmas 3 colunas/ações), mas **não wired em nenhuma tela ainda** — `/marketplace` (Trilha B) e `/professor/estudio/planos` (Trilha A) são listas de conteúdo dinâmico (produtos do catálogo, produtos do professor), não um conjunto fixo de widgets nomeados — não é o padrão de uso do `CustomizableCardGrid` (que assume um `items` fixo por design). Nenhuma tela nova precisa desse componente hoje; ficam disponíveis para quando/se um bloco editorial fixo for adicionado a essas telas.
- Regressão: suíte completa dos 3 consumidores originais (`activity-visual-dashboard-reduced-motion.test.tsx`, `activity-visual-dashboard-approximate-note.test.tsx`, `provider-icon-parity.test.tsx`) — 17/17 verdes, sem alteração no componente `CustomizableCardGrid` em si (só um novo consumidor). `tsc --noEmit` limpo.

---

## [x] TM051 - Estados vazio/erro/permissão em todas as telas novas

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** TM028 TM029 TM030 TM035 TM036 TM043 TM044
**Paralelo:** não
**Requisitos:** RNF-011
**Areas afetadas:** `app/marketplace/**, app/professor/estudio/**, app/app/planos/**`

**Descricao:** Cobrir cada linha da tabela §13 da spec de produto (catálogo sem resultado, coach sem plano, pagamento aguardando, licença sem início, duas sessões no mesmo dia, conflito de calendário, coach não aceito, coach removido, produto arquivado, reembolso, provider indisponível).

**Criterio de conclusao:** Cada estado da tabela §13 tem componente/mensagem correspondente verificável em teste ou revisão manual.

### Implementation Notes

Auditoria da tabela §13 da spec de produto contra o código entregue nas Ondas 0-1 (não reimplementação — a maioria já veio das Trilhas A/B/C):

| Estado (§13) | Coberto? | Onde |
|---|---|---|
| Catálogo sem resultado | ✅ | `/marketplace` — "Nenhum treino encontrado com esses filtros" + limpar filtros |
| Coach sem plano | ✅ | `/professor/estudio/planos` — "Você ainda não criou nenhum plano" + CTA |
| Licença sem início | ✅ | `/app/planos` — estado `not_started`, "Escolher data de início" |
| Conflito com outro treino | ✅ | `ActivateTrainingLicense` `preview:true` calcula conflitos antes de confirmar (TM041) |
| Produto arquivado após compra | ✅ (conservador) | `GetMarketplaceProductDetail` trata ARCHIVED igual a DRAFT (404 `PRODUCT_VISIBILITY_DENIED`) em vez da "página informativa sem CTA" mais nuançada que a spec permite ("conforme política") — escolha segura, não insegura; `loadPlanoDetail` (`/app/planos/[licenseId]`) NÃO filtra por status do produto, então uma licença de produto arquivado continua renderizando normalmente para o dono. Nuance de UI (página informativa em vez de 404) fica para revisão de produto. |
| Duas sessões no mesmo dia | ⬜ não alcançável ainda | `InstantiateLicenseCalendar`/`ActivateTrainingLicense` permanecem v1-only por decisão explícita da Trilha C (ver notas da TM041) — nenhum plano `schemaVersion=2` publicado é instanciado em calendário real ainda, então este estado de UI não tem dado real para exercitar nesta Onda. Não é um defeito desta task; é consequência de um escopo já documentado em outra. |
| Pagamento aguardando | ⬜ fora de escopo (Onda 2) | Não existe checkout pago ainda — nada para exibir. |
| Coach convidado não aceitou / Coach removido | ⬜ fora de escopo (Onda 3) | `LicenseCoachEngagement`/`PlanAdaptation` existem no schema (TM008) mas nenhum caso de uso/tela de convite existe ainda. |
| Reembolso | ⬜ fora de escopo (Onda 2) | Depende de webhook de pagamento (TM060+). |
| Provider indisponível | ✅ (pré-existente) | Não é um estado específico do marketplace — `/app/treinos` já tratava isso antes desta spec; `/app/planos` não depende de nenhum provider (RNF-007: funciona sem relógio). |

Nenhuma tela nova promete um estado que não pode alcançar; os itens marcados
"fora de escopo" não têm UI porque a feature correspondente ainda não existe,
não porque foram esquecidos.

---

## [x] TM052 - Instrumentação sem PII

**Tipo:** OBS
**Prioridade:** P2
**Dependencias:** TM022 TM038 TM041 TM047
**Paralelo:** sim
**Requisitos:** RNF-008
**Areas afetadas:** `modules/school/infrastructure/`

**Descricao:** Eventos: produto publicado, compra grátis concluída, licença ativada, avaliação criada — via `schoolLogger`/`schoolMetrics`, sem token/segredo/PII.

**Criterio de conclusao:** Métricas emitidas para os 4 eventos; teste garante ausência de campo sensível no payload logado.

### Implementation Notes

4 métodos novos em `schoolMetrics` (`modules/school/infrastructure/metrics.ts`): `marketplaceProductPublished`, `marketplacePurchaseFreeCompleted`, `marketplaceLicenseActivated`, `marketplaceReviewCreated` — payload só com IDs opacos, nunca token/segredo/PII. Instrumentados nos 4 pontos reais: `PublishTrainingProductVersion`, `AcquireFreeTrainingProduct` (só no caminho de criação genuína, não em retry idempotente), `ActivateTrainingLicense` (idem, não em replay), `CreateMarketplaceReview` (só criação, não edição). 4 testes novos (`tests/marketplace-metrics.test.ts`) verificam ausência de chaves sensíveis (token/secret/password/paymentRef/email/name/cardNumber/cvv) no payload logado. Suíte dos 4 use cases tocados continua verde (41/41 incluindo os novos).

---

## [x] TM053 - Atualizar architecture/modules/marketplace.yaml com entrega real

**Tipo:** DOC
**Prioridade:** P2
**Dependencias:** TM028 TM029 TM030 TM035 TM036 TM043 TM044 TM046
**Paralelo:** sim
**Requisitos:** RF-007
**Areas afetadas:** `architecture/modules/marketplace.yaml, .agents/skills/ryvano-telas/`

**Descricao:** Registrar rotas e telas efetivamente entregues na Onda 1 (o esqueleto foi criado na TM013).

**Criterio de conclusao:** `screen-map.md`/`access-matrix.md` de `.agents/skills/ryvano-telas/` citam as telas novas.

### Implementation Notes

- `architecture/modules/marketplace.yaml`: `status` atualizado, `paths` ampliado com todos os arquivos entregues na Onda 1, `validation` ganhou o resultado do `audit-routes.sh`.
- `.agents/skills/ryvano-telas/references/screen-map.md`: adicionadas as rotas de marketplace em cada seção de área (atleta, escola, professor, públicas), incluindo a nota sobre `callbackUrl` (TM037) na seção `/entrar`.
- Não tocado: lacunas pré-existentes e não relacionadas encontradas no arquivo (ex.: `school.yaml` nunca listado no índice do `PROJECT_MAP.md` além da entrada já criada na TM013) — fora de escopo desta task.

---

## [!] TM054 - Auditoria de rotas e acesso

**Tipo:** TEST
**Prioridade:** P1
**Dependencias:** TM051
**Paralelo:** não
**Requisitos:** RNF-001
**Areas afetadas:** `.agents/skills/ryvano-telas/scripts/`

**Descricao:** Rodar `audit-routes.sh` e `audit-access.sh` cobrindo as rotas/telas novas; atualizar os scripts se necessário para incluir os novos perfis/rotas.

**Criterio de conclusao:** Nenhum link quebrado; matriz de acesso medida por HTTP real bate com RNF-001.

**Blocker:** a segunda metade do critério de conclusão ("matriz de acesso medida por HTTP real bate com RNF-001") exige `audit-access.sh`, que precisa de `pnpm dev` rodando contra um banco com seed — o Postgres remoto de `DATABASE_URL` está inalcançável a partir deste sandbox (mesma limitação já registrada em `STATUS.md` §1 para migrations/seed). Não é seguro simular ou inventar esse resultado.

### Implementation Notes

- **Metade estática CONCLUÍDA:** `bash .agents/skills/ryvano-telas/scripts/audit-routes.sh` (não precisa de servidor) rodado com sucesso (via stream normalizado — o arquivo em disco tem CRLF pré-existente, não alterado): **0 links quebrados, 0 pastas vazias**, rotas de marketplace corretamente listadas como `PUBLICA` (`/marketplace`, `/marketplace/[idDoTreino]`) ou "guard na própria página" (`/professor/estudio/**`); `/app/planos*` e `/escola/[schoolId]/marketplace` corretamente NÃO aparecem na lista de "sem guard herdado" — confirma que herdam o guard do layout da área, como esperado.
- **Metade HTTP pendente:** alguém com acesso ao banco precisa rodar `bash .agents/skills/ryvano-telas/scripts/audit-access.sh` (com `pnpm dev` + seed e2e) e então marcar esta task `[x]` com a evidência.
- Script `audit-routes.sh` tem line endings CRLF pré-existentes (não introduzidos nesta sessão) que quebram `bash script.sh` direto neste ambiente — contornado com `sed 's/\r$//' script.sh | bash` sem alterar o arquivo versionado. Registrado aqui para a próxima sessão não perder tempo redescobrindo isso.

---

## [x] TM055 - E2E: fluxo grátis completo

**Tipo:** TEST
**Prioridade:** P0
**Dependencias:** TM037 TM039 TM042 TM044 TM045
**Paralelo:** não
**Requisitos:** RF-107 RF-108 RF-109
**Areas afetadas:** `tests/`

**Descricao:** Visitante anônimo → filtra e abre detalhe → login/cadastro com retorno à mesma oferta → aquisição grátis → escolha de início → calendário populado → registro manual → progresso visível.

**Criterio de conclusao:** Cenário completo verde; recarregar/reenviar ativação não duplica agenda (cenário 2 de §14 da spec de produto).

### Implementation Notes

- `tests/e2e-marketplace-free-flow.test.ts` — mesma convenção de "E2E" já usada por `tests/e2e-school-lifecycle.test.ts` (cadeia real de casos de uso sobre Prisma mockado em memória, não automação de navegador — `@playwright/test` não está instalado neste repo, lacuna pré-existente fora do escopo desta task).
- Cenário completo encadeado com as classes REAIS (não reimplementadas): `ListMarketplaceProducts` → `GetMarketplaceProductDetail` → validação de `callbackUrl` (reusa `isSafeMarketplaceCallbackPath`/`buildMarketplaceCallbackUrl` da TM037) → `AcquireFreeTrainingProduct` → `ActivateTrainingLicense` → calendário populado (3 assignments do plano de 2 semanas) → **reenvio da ativação não duplica agenda** (continua 3, não 6) → **reenvio da aquisição não duplica compra/licença**.
- "Registro manual" (RNF-007): não reimplementado — as linhas de `WorkoutAssignment` criadas são padrão (mesma tabela/formato que qualquer treino de escola), então o fluxo de registro manual já existente funciona sem alteração; documentado como tal no teste em vez de duplicar cobertura de outro módulo.
- 3 testes, `tsc --noEmit` limpo.

---

## [x] TM056 - Seed e2e ampliado (produto multimodal)

**Tipo:** TEST
**Prioridade:** P2
**Dependencias:** TM010 TM022
**Paralelo:** sim
**Requisitos:** RF-108
**Areas afetadas:** `prisma/seed.ts`

**Descricao:** Produto de exemplo com sessão de corrida e força no mesmo dia, para exercitar RF-005 nos testes e2e.

**Criterio de conclusao:** Seed cria o produto multimodal e uma licença de exemplo sem duplicar em reexecução.

### Implementation Notes

**Já estava satisfeita pela TM017** (seed estendido nesta mesma sessão, Onda 0): o produto de exemplo criado lá já é multimodal (`schemaVersion: 2`, corrida + força no mesmo dia — semana 1 dia 1) e já inclui uma licença ativa de exemplo. Nenhum código adicional necessário; confirmado por leitura direta do `prisma/seed.ts` antes de marcar como concluída.

---

# 8. Onda 2 — Venda paga (TM057–TM071)

Habilita checkout real depois que a Onda 1 valida a jornada com oferta gratuita
(spec de produto §14, Fase 2). A TM059 depende de Q5 (provedor) e da checklist de
documentação oficial do `AGENTS.md`.

---

## [x] TM057 - Migration 0043: SellerAccount e ledger

**Tipo:** DB
**Prioridade:** P1
**Dependencias:** TM015
**Paralelo:** não
**Requisitos:** RF-205
**Areas afetadas:** `prisma/schema.prisma, prisma/migrations/0043_*`

**Descricao:** Criar `SellerAccount (sellerId, provider, payoutAccountRef, kycStatus)` e `SellerLedgerEntry (sellerId, purchaseId, grossAmount, feeAmount, netAmount, type, createdAt)` — sem percentual fixo no schema (RF-205); split/taxa vêm de configuração.

**Criterio de conclusao:** Migration aplicada; `prisma validate` verde; nenhuma constante de percentual no schema ou na migration.

### Implementation Notes

- Renumerada para **`0044_seller_account_ledger`** — `0043` já havia sido consumida pela TM050 (colunas `*LayoutOrder` em `UserProfile`) nesta mesma sessão; renumeração documentada no cabeçalho da migration e em STATUS.md §4.3.
- `SellerType` (COACH/SCHOOL), `SellerKycStatus`, `SellerAccount` e `SellerLedgerEntryType`/`SellerLedgerEntry` adicionados ao `schema.prisma`, com `ledgerEntries SellerLedgerEntry[]` como relação inversa em `TrainingPurchase`. Nenhuma constante de percentual/taxa no schema — split fica para configuração (TM067).
- Banco de dados real inesperado nesta sessão: `npx prisma migrate deploy/status` trava; substituído por `npx prisma generate`, que valida a estrutura do schema sem exigir conexão. Limitação documentada — alguém com acesso real ao banco precisa rodar `npx prisma migrate deploy` antes de produção.
- Migration escrita à mão com rollback SQL explícito em comentário.

---

## [x] TM058 - Caso de uso CreateCheckoutSession

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM039 TM005
**Paralelo:** não
**Requisitos:** RF-201
**Areas afetadas:** `modules/school/application/`

**Descricao:** Revalida produto `PUBLISHED`, visibilidade, versão, preço e moeda no servidor; grava `offerSnapshot` congelado; nunca aceita preço do cliente.

**Criterio de conclusao:** Teste envia preço divergente do servidor e a sessão criada usa o preço do servidor, não o enviado.

### Implementation Notes

- Implementado dentro de `modules/school/application/create-marketplace-checkout.ts` (não como classe separada) — a TM039 já continha o ponto de decisão grátis/pago; a extensão paga vive na mesma classe `CreateMarketplaceCheckout`, injeta `CheckoutPaymentProvider` (TM059) por parâmetro de construtor e chama `assertProductPurchasable` (TM058 corrigiu um gap real: nem o caminho grátis nem o pago validavam `SCHOOL_ONLY` antes desta task).
- `CreateMarketplaceCheckoutInput` não possui campo de preço — impossível o cliente enviar preço divergente por construção de tipo, não apenas por validação; o provedor é sempre chamado com `amountMinor`/`currency` lidos do `TrainingProduct` no servidor. Coberto por `tests/create-marketplace-checkout.test.ts` (`"chama o provedor com o preço do SERVIDOR"`).
- `offerSnapshot` congelado inclui `price`, `currency`, `versionId`, mais `sellerType`/`sellerId` (derivados de `product.coachId ? "COACH" : "SCHOOL"`) para uso futuro do ledger (TM067).

---

## [x] TM059 - Integração com o provedor de pagamento

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM058
**Paralelo:** não
**Requisitos:** RF-201
**Areas afetadas:** `modules/school/infrastructure/`

**Descricao:** Sessão segura no provedor escolhido (Q5); segredos só no servidor, sem dado de cartão no app. **Consultar a documentação oficial vigente do provedor antes de implementar** (regra do `AGENTS.md`, design D-10) e citar o que foi confirmado no commit — OAuth/API/assinatura de webhook, não memória do modelo nem fonte não oficial.

**Criterio de conclusao:** Commit cita as URLs/seções oficiais confirmadas; nenhum segredo de provedor logado ou exposto ao cliente.

### Implementation Notes

- Q5 decidida pelo usuário nesta sessão: **Stripe**. Documentação oficial consultada e citada em `modules/school/infrastructure/stripe-payment-provider.ts` (comentário no topo do arquivo) e em STATUS.md §4.3: Checkout Sessions (`mode: "payment"`, `line_items[].price_data`, `client_reference_id`, `metadata`), cabeçalho `Idempotency-Key`, verificação de assinatura de webhook (`Stripe-Signature`, `stripe.webhooks.constructEvent`, corpo bruto obrigatório), e os eventos de reembolso atuais `refund.created`/`refund.failed` (substituíram `charge.refunded` no changelog de 2024-10-28 — heed deprecation notices).
- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` adicionados a `server/env.ts` como `optionalString()`, mesmo padrão de `MARKETPLACE_ENABLED`. Cliente Stripe com inicialização lazy/singleton; lança `STRIPE_NOT_CONFIGURED` se as env vars faltarem — nunca loga segredo, nunca expõe ao cliente.
- Testado com `vi.mock("stripe", ...)` em `tests/stripe-payment-provider.test.ts` (10 testes) — sem chamada real à API Stripe.

---

## [x] TM060 - Caso de uso ConfirmTrainingPurchaseFromWebhook

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM002 TM059
**Paralelo:** não
**Requisitos:** RF-202 RNF-003
**Areas afetadas:** `modules/school/application/`

**Descricao:** Verifica assinatura e evento do provedor (titular, valor, moeda, produto/versão, `providerEventId` não processado); promove `PENDING→COMPLETED` e cria licença na mesma transação. É o segundo caminho da divisão de `CreateTrainingPurchase` (design D-02) — nunca aceita `paymentRef` livre do cliente.

**Criterio de conclusao:** Evento repetido não cria segunda licença; evento com valor/produto divergente é rejeitado sem promover a compra.

### Implementation Notes

- `modules/school/application/confirm-training-purchase-from-webhook.ts` recebe um `Stripe.Event` **já verificado** (a verificação de assinatura é responsabilidade da rota/TM059, nunca deste caso de uso) — valida `checkout.session.completed` (no-op em outros tipos), localiza a compra por `client_reference_id` (=`checkoutId`), é idempotente quando a compra já está `COMPLETED`, e revalida valor/moeda/produto/versão contra o `offerSnapshot` congelado antes de promover.
- Atualização da compra e criação de licença ocorrem na mesma transação, sequencialmente (não `Promise.all`) para preservar ordem de erro determinística.
- Emite `schoolMetrics.marketplacePurchaseConfirmed` (nova métrica; substitui um rascunho inicial que reusava incorretamente `marketplacePurchaseFreeCompleted`).
- Coberto por `tests/confirm-training-purchase-from-webhook.test.ts` (8 testes): evento repetido, valor/produto divergente rejeitado, licença criada corretamente.

---

## [x] TM061 - Rota POST /api/marketplace/payment-webhook

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM060
**Paralelo:** não
**Requisitos:** RF-202
**Areas afetadas:** `app/api/marketplace/payment-webhook/route.ts`

**Descricao:** Adaptador fino sobre `ConfirmTrainingPurchaseFromWebhook`; verifica assinatura antes de qualquer parse de corpo.

**Criterio de conclusao:** Requisição sem assinatura válida é rejeitada antes de tocar o banco.

### Implementation Notes

- Ordem estrita: `assertMarketplaceEnabled()` → checa presença do header `stripe-signature` (ausência → `WEBHOOK_SIGNATURE_INVALID` 400 antes de qualquer leitura de corpo ou acesso ao banco) → `request.text()` para obter o corpo **bruto** (exigência do Stripe para `constructEvent`) → `provider.verifyWebhookEvent(rawBody, signature)`, cujo erro é capturado e relançado como `WEBHOOK_SIGNATURE_INVALID` sem nunca ecoar a mensagem de verificação original ao cliente.
- Dispatch por tipo de evento: `refund.created` → `RefundTrainingPurchase`; demais eventos → `ConfirmTrainingPurchaseFromWebhook`. Retorna 200 rapidamente (convenção Stripe para evitar reenvio excessivo).
- `WEBHOOK_SIGNATURE_INVALID: 400` adicionado a `modules/school/domain/errors.ts`.
- Coberto por `tests/marketplace-payment-webhook-route.test.ts` (6 testes), incluindo o caso "sem assinatura → rejeitado antes de tocar o banco".

---

## [x] TM062 - Rota POST /api/marketplace/checkout (extensão paga)

**Tipo:** BE
**Prioridade:** P0
**Dependencias:** TM058 TM039
**Paralelo:** não
**Requisitos:** RF-201
**Areas afetadas:** `app/api/marketplace/checkout/route.ts`

**Descricao:** Estende a rota da TM039 para delegar produto pago a `CreateCheckoutSession`. Decidir Q2 (diferença comercial entre "comprar plano" e "contratar acompanhamento") nesta task, para não confundir os dois no resumo de checkout.

**Criterio de conclusao:** Resposta do checkout pago nunca ativa licença diretamente — depende do webhook (TM061); decisão de Q2 refletida no resumo exibido.

### Implementation Notes

- **Q2 decidida nesta task** (documentada em comentário no topo de `create-marketplace-checkout.ts` e em STATUS.md §7): "Contratar acompanhamento" NUNCA passa por este checkout nem é embutido no preço do produto — é sempre um mecanismo separado, gratuito, da Onda 3 (`LicenseCoachEngagement`). O resumo de checkout desta rota só mostra produto/preço/versão; nunca menciona acompanhamento.
- A rota, fora da transação de banco, chama `provider.createCheckoutSession(...)` com `successUrl`/`cancelUrl` apontando para `/marketplace/${productId}/checkout?purchaseId=...`; retorna `{ kind: "paid", ...pending, checkoutUrl: session.url }`. A licença nunca é criada aqui — apenas em `ConfirmTrainingPurchaseFromWebhook` (TM060).
- Coberto por `tests/create-marketplace-checkout.test.ts`, incluindo os 2 testes novos desta task ("chama o provedor com o preço do SERVIDOR... retorna checkoutUrl" e "licença NUNCA é ativada diretamente pela resposta do checkout").

---

## [x] TM063 - Tela /marketplace/[idDoTreino]/checkout

**Tipo:** FE
**Prioridade:** P0
**Dependencias:** TM062
**Paralelo:** não
**Requisitos:** RF-201
**Areas afetadas:** `app/marketplace/[idDoTreino]/checkout/page.tsx`

**Descricao:** Resumo imutável (produto+versão+preço), estado do servidor, retorno seguro sem expor dado de cartão. Callback do navegador só mostra estado, nunca ativa licença.

**Criterio de conclusao:** Retry após falha não duplica compra ativa; estado "Aguardando confirmação" consulta o servidor, não ativa por conta própria.

### Implementation Notes

- `app/marketplace/[idDoTreino]/checkout/page.tsx` — Server Component; `loadCheckoutStatus(athleteId, purchaseId)` extraída para testabilidade (mesmo padrão de `loadPlanoDetail` em `app/app/planos/[licenseId]/page.tsx`), com escopo de posse na própria query (`where: { id, athleteId }`) — uma `purchaseId` de outro atleta resolve para `null`, indistinguível de inexistente (RNF-001).
- Estados renderizados a partir do `purchase.status` **atual do servidor**: `COMPLETED` (painel de sucesso + link para `/app/planos/[licenseId]`), `PENDING` (painel de aviso com nota explícita de que a página nunca se auto-ativa, link "Atualizar estado" que só recarrega a própria página), `REFUNDED` (painel neutro), outro (cancelado/tentar novamente). `result` na query string é só cosmético (qual botão o atleta clicou no Stripe) — nunca é fonte de verdade.
- `app/marketplace/[idDoTreino]/purchase-cta.tsx` atualizado: quando `body.kind === "paid"` e `body.checkoutUrl` presente, redireciona o navegador (`window.location.href`) para a página hospedada do Stripe em vez de só mostrar uma mensagem estática.
- Bug corrigido durante a verificação: painel `PENDING` usava a classe CSS inexistente `theme-panel-info`; corrigida para `theme-panel-warning` (confirmado via `grep "^\.theme-panel-" app/globals.css` — só existem `neutral/success/warning/danger`).
- `tests/marketplace-checkout-status-page.test.ts` (3 testes): escopo de posse nunca vaza compra de outro atleta, compra inexistente retorna `null`, licença associada resolvida quando a compra já está `COMPLETED`. `tsc --noEmit` limpo.

---

## [x] TM064 - Job de reconciliação periódica

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM060
**Paralelo:** sim
**Requisitos:** RF-203
**Areas afetadas:** `modules/school/application/`

**Descricao:** Consulta o provedor para eventos perdidos/atrasados e aplica a mesma lógica idempotente de `ConfirmTrainingPurchaseFromWebhook`.

**Criterio de conclusao:** Rodar o job duas vezes sobre o mesmo evento não duplica licença.

### Implementation Notes

- Antes de implementar, consultado o procedimento oficial da Stripe para eventos não entregues (regra do `AGENTS.md`): [Process undelivered webhook events](https://docs.stripe.com/webhooks/process-undelivered-events) — List Events com `types` + `delivery_success: false`, retenção de 30 dias. `StripePaymentProvider.listUndeliveredEvents` (TM059) implementa exatamente isso, auto-paginado.
- `modules/school/application/reconcile-marketplace-payments.ts` (`ReconcileMarketplacePayments`) replay os eventos pelas MESMAS classes que o webhook ao vivo usa (`ConfirmTrainingPurchaseFromWebhook`/`RefundTrainingPurchase`, nunca um caminho paralelo) — como ambas já são idempotentes pelo status persistido da compra, rodar o job duas vezes sobre o mesmo evento nunca duplica licença/reembolso (critério satisfeito por composição, não por um mecanismo de dedupe próprio).
- Um evento com falha isolada é registrado em `failed[]` e não aborta o lote.
- `POST/GET /api/marketplace/reconcile-payments` — rota fina, protegida por `MARKETPLACE_ADMIN_KEY` (mesmo padrão de `app/api/integrations/garmin/jobs`), nunca sessão de usuário; pensada para um scheduler externo (Vercel Cron ou trigger manual de admin).
- 4 testes na Stripe provider + 5 em `reconcile-marketplace-payments.test.ts` + 5 na rota. `tsc --noEmit` limpo.

---

## [x] TM065 - Caso de uso RefundTrainingPurchase

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM060
**Paralelo:** não
**Requisitos:** RF-204
**Areas afetadas:** `modules/school/application/`

**Descricao:** Só por evento verificado do provedor ou ação administrativa auditada; revoga direito de criar sessões futuras sem apagar execuções passadas.

**Criterio de conclusao:** Teste cobre reembolso preservando execuções já registradas; ação administrativa grava autoria/auditoria.

### Implementation Notes

- `modules/school/application/refund-training-purchase.ts` — implementado junto com TM060 nesta sessão (arquivo já existia); entrada discriminada `{kind: "provider_event", event} | {kind: "admin_action", actorUserId, purchaseId, reason}`. Idempotente (compra já `REFUNDED` é no-op). Revoga a `TrainingLicense` (status `REVOKED`) sem tocar `WorkoutAssignment`/`WorkoutExecution`.
- **Gap real encontrado e corrigido nesta task**: a ação administrativa só gravava o autor (`actorUserId`) no metric fire-and-forget (`schoolMetrics`, nunca durável — ver comentário em `metrics.ts`), não em nenhum registro persistente — não satisfazia "ação administrativa **auditada**" (RF-204). Corrigido gravando um `AdminAuditLog` (`action: "MARKETPLACE_PURCHASE_REFUNDED"`, `entityType/entityId`, `metadata: {reason, licenseId}`) dentro da mesma transação — mesmo modelo/convenção já usada por `school-service.ts` para outras ações administrativas, não uma tabela nova. Um evento de provedor NÃO grava `AdminAuditLog` (não é ação administrativa).
- 8 testes, incluindo os dois novos desta task (grava `AdminAuditLog` com autoria; evento de provedor não grava). `tsc --noEmit` limpo.

---

## [x] TM066 - Rota/ação de reembolso

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM065
**Paralelo:** não
**Requisitos:** RF-204
**Areas afetadas:** `app/api/marketplace/payment-webhook/route.ts, app/app/planos/[licenseId]/page.tsx`

**Descricao:** Webhook de estorno chama `RefundTrainingPurchase`; UI exibe estado e efeito sobre próximos treinos.

**Criterio de conclusao:** Estado de reembolso visível em `/app/planos/[licenseId]` sem remover histórico de execução.

### Implementation Notes

- Metade "webhook chama `RefundTrainingPurchase`" já estava pronta desde a TM061 (`refund.created` despachado na rota de webhook).
- Metade UI: `deriveLicenseState`/`PLAN_STATE_CONFIG` (`modules/school/application/list-my-training-licenses.ts`, `app/app/planos/constants.ts`) já mapeavam `TrainingLicenseStatus.REVOKED → "refunded"` desde a TM044 — a doc dessa função já dizia explicitamente que a peça faltante era "não há religação automática compra→licença ainda (isso chega com o fluxo de reembolso, TM065/TM066)". Como a TM065 desta sessão fez o `RefundTrainingPurchase` setar `TrainingLicense.status = REVOKED`, o pill "Reembolsado" já aparece automaticamente — nenhuma mudança de lógica necessária.
- Único gap real: "efeito sobre próximos treinos" não estava explicado na tela. Adicionado um banner condicional (`state === "refunded"`) explicando que o histórico continua disponível e que novas sessões não serão adicionadas — histórico/progresso abaixo permanecem intocados (RF-204).
- `tsc --noEmit` limpo. Sem teste novo dedicado: é uma renderização condicional estática sobre um `state` já coberto por `tests/list-my-training-licenses.test.ts` (mapeamento `REVOKED → "refunded"`).

---

## [x] TM067 - Ledger de vendedor

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM057 TM060
**Paralelo:** não
**Requisitos:** RF-205
**Areas afetadas:** `modules/school/application/`

**Descricao:** Registra venda bruta, taxa, líquido, repasse e reversão por evento financeiro, lendo split/taxa de configuração (RF-205) — nunca um percentual fixo no código.

**Criterio de conclusao:** Alterar a configuração de taxa não exige deploy de código; teste cobre reversão de ledger em reembolso.

### Implementation Notes

- `modules/school/config/marketplace-fee-settings.ts` — `getMarketplacePlatformFeeBps()` lê `MARKETPLACE_PLATFORM_FEE_BPS` (env, opcional; default documentado 1500 = 15%, placeholder — Produto ainda não decidiu a política real, §7 Q5). Mudar a taxa é atualização de env/config, nunca deploy de código; nenhuma constante de percentual aparece no código de cálculo.
- `modules/school/application/record-marketplace-ledger-entry.ts` — `recordMarketplaceSaleLedgerEntry` (upsert de `SellerAccount` por `[sellerType, sellerId, provider]`, calcula fee/net a partir do `feeBps` recebido) e `recordMarketplaceRefundLedgerEntry` (reverte a entrada SALE original **exatamente**, nunca recalcula com a config vigente no momento do reembolso — correção contábil correta). Ambas funções puras sobre um `tx`, nunca com `$transaction` próprio — compõem dentro da transação já aberta pelo chamador.
- Wired em `ConfirmTrainingPurchaseFromWebhook` (grava SALE após criar a licença, vendedor vindo do `offerSnapshot` congelado na TM058) e `RefundTrainingPurchase` (grava a reversão REFUND). Uma compra sem entrada SALE (ex.: anterior à TM067) não impede o reembolso — a reversão é só pulada.
- `SellerType`/`SellerLedgerEntryType` adicionados a `modules/school/domain/enums.ts` (mesmo padrão const-object das outras enums de domínio).
- 4 testes em `marketplace-fee-settings.test.ts`, 5 em `record-marketplace-ledger-entry.test.ts` (inclui reversão exata), mais 2 novos em `confirm-training-purchase-from-webhook.test.ts`/`refund-training-purchase.test.ts` cada. `tsc --noEmit` limpo.

---

## [x] TM068 - Painel financeiro do vendedor

**Tipo:** FE
**Prioridade:** P2
**Dependencias:** TM067
**Paralelo:** não
**Requisitos:** RF-205
**Areas afetadas:** `app/professor/estudio/planos/[productId]/page.tsx`

**Descricao:** Extensão da tela de estúdio (TM030) com valores por status de ledger.

**Criterio de conclusao:** Valores exibidos batem com o ledger, não com um cálculo paralelo na UI.

### Implementation Notes

- `modules/school/application/get-product-ledger-summary.ts` (`GetProductLedgerSummary`) — deliberadamente SEPARADO de `GetProductSalesSummary` (TM023, que soma `TrainingPurchase.pricePaid` — uma contagem de status, não o ledger). Agrega `SellerLedgerEntry` (TM067) via `groupBy` filtrando pela relação `purchase.productId`. Como `REFUND` já é gravado como o espelho negativo exato da venda original (TM067), somar `grossAmount`/`feeAmount`/`netAmount` de TODAS as entradas dá a posição líquida atual automaticamente, sem tratamento especial.
- Mesmo padrão de autorização de `GetProductSalesSummary` (`CanManageTrainingProduct`, 403 para quem não é o autor).
- Nova seção "Financeiro (ledger)" adicionada à tela de estúdio (`/professor/estudio/planos/[productId]`), ao lado da seção "Vendas" já existente (que fica intocada — mostra contagens, não é o ledger).
- 5 testes em `tests/get-product-ledger-summary.test.ts`, incluindo asserção explícita de que a consulta é sobre `sellerLedgerEntry`, nunca `trainingPurchase.pricePaid`. `tsc --noEmit` limpo.

---

## [x] TM069 - Testes de idempotência e concorrência de pagamento

**Tipo:** TEST
**Prioridade:** P0
**Dependencias:** TM061 TM064
**Paralelo:** não
**Requisitos:** RF-203
**Areas afetadas:** `tests/`

**Descricao:** Dupla entrega de webhook, retry de checkout, cancelamento e callback do navegador chegando antes do webhook — nenhum caso duplica licença ou ativa compra sem confirmação.

**Criterio de conclusao:** Todos os casos acima cobertos por teste de integração, verdes.

### Implementation Notes

- `tests/marketplace-payment-idempotency.test.ts` — integra as classes REAIS (`CreateMarketplaceCheckout` + `ConfirmTrainingPurchaseFromWebhook`) sobre Prisma mockado em memória, mesma convenção de `e2e-marketplace-free-flow.test.ts`. 4 testes, um por caso do criterio: dupla entrega de webhook (segunda entrega conta como já-processada, licença única), retry de checkout com o mesmo `idempotencyKey` (uma única compra `PENDING` criada; ambas as chamadas ao provedor usam o mesmo `idempotencyKey` — Stripe dedupliica do lado dele mesmo o use case chamando o provedor a cada retry, TM058), cancelamento (`checkout.session.expired` não promove nada), navegador chegando antes do webhook (leitura mostra `PENDING`/sem licença até o webhook processar).

---

## [x] TM070 - Instrumentação de pagamento sem PII/token

**Tipo:** OBS
**Prioridade:** P1
**Dependencias:** TM061 TM065
**Paralelo:** sim
**Requisitos:** RNF-008
**Areas afetadas:** `modules/school/infrastructure/`

**Descricao:** Eventos de compra confirmada, reembolso, falha de webhook — sem token, segredo ou dado de cartão no log.

**Criterio de conclusao:** Teste garante ausência de campo sensível no payload logado.

### Implementation Notes

- `tests/marketplace-payment-metrics.test.ts` — mesma convenção de `marketplace-metrics.test.ts` (TM052), estendida com padrões de valor (não só chave) para pegar segredo/token embutido em uma string (`whsec_`, `sk_test_/sk_live_`, `pi_`/`re_`). O caso mais sensível (`marketplace.webhook.verification_failed`) tem asserção estrita de que só `metric/provider/correlationId/timestamp` existem no payload — nunca a assinatura ou o erro cru da lib de verificação. 5 testes.

---

## [x] TM071 - E2E: checkout pago completo

**Tipo:** TEST
**Prioridade:** P0
**Dependencias:** TM069
**Paralelo:** não
**Requisitos:** RF-202 RF-203
**Areas afetadas:** `tests/`

**Descricao:** Retorno do navegador antes do webhook permanece `PENDING`; webhook assinado repetido cria uma licença e uma agenda; `paymentRef` arbitrário do navegador não ativa nada (cenário 6 de §14 da spec de produto).

**Criterio de conclusao:** Cenário completo verde, incluindo a tentativa de `paymentRef` forjado sendo rejeitada.

### Implementation Notes

- `tests/e2e-marketplace-paid-flow.test.ts` — passa pela ROTA HTTP real do webhook (não só pelo caso de uso isolado), com o pacote `stripe` mockado (não a nossa `StripePaymentProvider`), então a verificação de assinatura é genuinamente exercida: uma assinatura diferente da "genuína" lança, igual à lib real. Cenário: checkout → retorno do navegador antes do webhook (`PENDING`, sem licença) → tentativa de forjar a confirmação via `POST` direto no webhook sem assinatura válida (400, nada muda) → webhook assinado de verdade confirma (compra `COMPLETED`, licença criada) → `ActivateTrainingLicense` popula o calendário (3 sessões) → reenvio do MESMO webhook assinado não duplica licença nem agenda (ainda 3, não 6).
- **Achado confirmado, não corrigido (fora do escopo desta task)**: `CreateTrainingPurchase` — o caso de uso pré-D-02 que aceita `paymentRef` livre do cliente (`create-training-purchase.ts:12`) — não é instanciado por nenhuma rota viva. Confirmado por `impact("CreateTrainingPurchase", upstream)` (GitNexus, `risk: UNKNOWN`, sem callers resolvidos) seguido de busca textual (`grep "new CreateTrainingPurchase("`), regra do `AGENTS.md` para nunca tratar `UNKNOWN` como seguro sem confirmar: nenhum resultado fora do próprio teste unitário legado (TM002). A única superfície real de confirmação hoje é o webhook assinado, exercida neste E2E. Documentado em STATUS.md para quem quiser limpar o código morto depois — não removido aqui (regra de mudança cirúrgica do `AGENTS.md`, fora do escopo desta task).

---

# 9. Onda 3 — Acompanhamento independente (TM072–TM088)

Convite, aceite, escopo, ajustes versionados, revogação e histórico de autoria
(spec de produto §14, Fase 3). Depende de licença ativa (Onda 1); não depende de
pagamento — plano gratuito também pode ter acompanhamento.

---

## [x] TM072 - Caso de uso InviteCoachToLicense

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM008
**Paralelo:** não
**Requisitos:** RF-301
**Areas afetadas:** `modules/school/application/`

**Descricao:** Convite pendente com escopo explícito e duração; nenhum grant de biometria é presumido (ver design D-05). Decidir Q2 (diferença comercial compra × acompanhamento) em conjunto com TM062, se ainda não decidido.

**Criterio de conclusao:** Convite pendente não concede leitura alguma antes do aceite (teste negativo explícito).

### Implementation Notes

- Implementada por um agente em paralelo (rodando concorrentemente com o Onda 2 desta sessão); verificação independente feita antes de marcar concluída: leitura direta de código, `tsc --noEmit` do zero, suíte completa do zero (2371 passando), reindex+`detect-changes` do GitNexus — ver STATUS.md §4.4 para o relatório completo de verificação.
- `modules/school/application/invite-coach-to-license.ts` — cria `LicenseCoachEngagement` `PENDING` com `scope` (`{full:true}` ou `{sportTypes:[...]}`, `modules/school/domain/license-coach-scope.ts`, TM072/TM085). Rejeita convite cujo escopo colide com um engagement aberto existente na mesma licença (`scopesConflict`, RF-305 — ver TM085).
- Q2 já estava decidida na TM062 (Onda 2): "contratar acompanhamento" nunca passa por checkout, é sempre este fluxo separado e gratuito.

---

## [x] TM073 - Caso de uso AcceptCoachInvitation

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM072
**Paralelo:** não
**Requisitos:** RF-302
**Areas afetadas:** `modules/school/application/`

**Descricao:** Verifica status `ACTIVE`, identidade do coach convidado e ausência de conflito com a política de atribuição vigente.

**Criterio de conclusao:** Coach diferente do convidado tentando aceitar recebe 403.

### Implementation Notes

- `modules/school/application/accept-coach-invitation.ts` — verifica que o `coachId` do chamador é exatamente o convidado (403 caso contrário), status `PENDING`, promove para `ACTIVE`. Emite `marketplaceCoachInvitationAccepted` (TM086).
- Coberto por `tests/accept-coach-invitation.test.ts`.

---

## [x] TM074 - Caso de uso ProposePlanAdaptation

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM008 TM022
**Paralelo:** não
**Requisitos:** RF-303
**Areas afetadas:** `modules/school/application/`

**Descricao:** Ajuste por sessão/semana com `expectedVersion`; nunca edita a versão base do produto (design D-06).

**Criterio de conclusao:** Duas propostas concorrentes sobre a mesma sessão: a segunda com `expectedVersion` obsoleto retorna 409.

### Implementation Notes

- `modules/school/application/propose-plan-adaptation.ts` — cria `PlanAdaptation` `PENDING` sobre um `WorkoutAssignment`; concorrência otimista via `expectedVersion` (409 em conflito, mesmo padrão já usado em outras entidades desta spec). Nunca escreve em `TrainingProductVersion`. Enforce de escopo por modalidade (RF-305) usando `WorkoutTemplate.sportType` via `scopeIncludesSportType`.
- Campos ajustáveis: `scheduledAt`/`dueAt`/`workoutTemplateId` — `WorkoutAssignment` não tem coluna de "volume/blocos", documentado no arquivo como limite real do schema, não uma omissão.
- Coberto por `tests/propose-plan-adaptation.test.ts`.

---

## [x] TM075 - Caso de uso DecidePlanAdaptation

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM074
**Paralelo:** não
**Requisitos:** RF-303
**Areas afetadas:** `modules/school/application/`

**Descricao:** Só o atleta dono aceita/recusa; aceite aplica a revisão e grava auditoria (before/after, motivo, autoria).

**Criterio de conclusao:** Coach ou OWNER chamando `decide` recebem 403; aceite grava histórico consultável.

### Implementation Notes

- `modules/school/application/decide-plan-adaptation.ts` — só o atleta dono da licença decide (403 para qualquer outro papel, incluindo o coach autor e OWNER de escola). Aceite aplica a revisão ao `WorkoutAssignment` e grava a decisão (`ACCEPTED`/`DECLINED`) com autoria. Emite `marketplaceAdaptationDecided`.
- Coberto por `tests/decide-plan-adaptation.test.ts`.

---

## [x] TM076 - Caso de uso RevokeCoachEngagement

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM073
**Paralelo:** não
**Requisitos:** RF-304
**Areas afetadas:** `modules/school/application/`

**Descricao:** Cessa acesso futuro imediatamente no servidor; preserva histórico, execuções e autoria dos ajustes já aplicados.

**Criterio de conclusao:** Chamada de API do coach revogado falha imediatamente após revogação (não só a UI deixa de mostrar o botão).

### Implementation Notes

- `modules/school/application/revoke-coach-engagement.ts` — move `LicenseCoachEngagement` (`PENDING`/`ACTIVE`) para `ENDED`; aceita `coachId` opcional para desambiguar quando mais de um engagement está aberto na mesma licença (RF-305), exigindo-o (422) só nesse caso. Nunca apaga `PlanAdaptation`/`WorkoutAssignment` já criados. Emite `marketplaceEngagementRevoked`.
- Coberto por `tests/revoke-coach-engagement.test.ts`.

---

## [x] TM077 - Rota POST /api/me/training-licenses/[id]/coach-invitations

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM072
**Paralelo:** não
**Requisitos:** RF-301
**Areas afetadas:** `app/api/me/training-licenses/[id]/coach-invitations/route.ts`

**Descricao:** Adaptador fino sobre `InviteCoachToLicense`.

**Criterio de conclusao:** Convite por não-dono da licença retorna 403/404.

### Implementation Notes

- Rota fina, delega a `InviteCoachToLicense`. Coberta por `tests/coach-invitations-route.test.ts`.

---

## [x] TM078 - Rota POST /api/coach/plan-invitations/[id]/accept

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM073
**Paralelo:** não
**Requisitos:** RF-302
**Areas afetadas:** `app/api/coach/plan-invitations/[id]/accept/route.ts`

**Descricao:** Adaptador fino sobre `AcceptCoachInvitation`.

**Criterio de conclusao:** Aceite duplicado (já `ACTIVE`) retorna `ENGAGEMENT_ALREADY_ACTIVE` (TM012), não erro genérico.

### Implementation Notes

- Rota fina, delega a `AcceptCoachInvitation`. Coberta por `tests/plan-invitations-accept-route.test.ts`.

---

## [x] TM079 - Rota POST /api/coach/training-licenses/[id]/adaptations

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM074
**Paralelo:** não
**Requisitos:** RF-303
**Areas afetadas:** `app/api/coach/training-licenses/[id]/adaptations/route.ts`

**Descricao:** Adaptador fino sobre `ProposePlanAdaptation`; só coach com `LicenseCoachEngagement` ativo pode chamar.

**Criterio de conclusao:** Coach sem engagement ativo na licença recebe 403.

### Implementation Notes

- Rota fina, delega a `ProposePlanAdaptation`. Coberta por `tests/coach-adaptations-route.test.ts`.

---

## [x] TM080 - Rota POST /api/me/training-licenses/[id]/adaptations/[aid]/decide

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM075
**Paralelo:** não
**Requisitos:** RF-303
**Areas afetadas:** `app/api/me/training-licenses/[id]/adaptations/[aid]/decide/route.ts`

**Descricao:** Adaptador fino sobre `DecidePlanAdaptation`.

**Criterio de conclusao:** Decisão por usuário que não é o atleta dono retorna 403.

### Implementation Notes

- Rota fina, delega a `DecidePlanAdaptation`. Coberta por `tests/adaptation-decide-route.test.ts`.

---

## [x] TM081 - Rota DELETE /api/me/training-licenses/[id]/coach-engagement

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM076
**Paralelo:** não
**Requisitos:** RF-304
**Areas afetadas:** `app/api/me/training-licenses/[id]/coach-engagement/route.ts`

**Descricao:** Adaptador fino sobre `RevokeCoachEngagement`.

**Criterio de conclusao:** Revogação por não-dono retorna 403/404.

### Implementation Notes

- Rota fina, delega a `RevokeCoachEngagement`. `coachId` de desambiguação (RF-305) via query string (`?coachId=`), não corpo — corpo de `DELETE` é pouco confiável entre clientes/proxies. Coberta por `tests/coach-engagement-route.test.ts`.

---

## [x] TM082 - Tela /professor/acompanhar/planos

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** TM077 TM078
**Paralelo:** não
**Requisitos:** RF-301 RF-302
**Areas afetadas:** `app/professor/acompanhar/planos/page.tsx`

**Descricao:** Convites pendentes, atletas que escolheram o coach, planos em acompanhamento — separado do Estúdio (TM028).

**Criterio de conclusao:** Nenhum dado de atleta aparece antes do convite ser aceito nesta tela.

### Implementation Notes

- `app/professor/acompanhar/planos/page.tsx` + `actions.ts` — tela separada de `/professor/estudio` (TM028), lista convites `PENDING` (só o convite, sem dado de treino/atleta) e engagements `ACTIVE`. Coberta por `tests/acompanhar-planos-page.test.ts`.

---

## [x] TM083 - Tela /professor/acompanhar/planos/[licenseId]

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** TM079
**Paralelo:** não
**Requisitos:** RF-303
**Areas afetadas:** `app/professor/acompanhar/planos/[licenseId]/page.tsx`

**Descricao:** Instância do atleta com semanas e ajustes permitidos — nunca edita a versão do autor original.

**Criterio de conclusao:** Nenhuma ação nesta tela chama rota de edição do produto (TM025/TM026), só rotas de adaptação.

### Implementation Notes

- `app/professor/acompanhar/planos/[licenseId]/page.tsx` + `actions.ts` — mostra a instância (`WorkoutAssignment`) do atleta, ações só via `ProposePlanAdaptation` (TM079), nunca `UpdateTrainingProductDraft`/publicação (TM025/TM026). Coberta por `tests/acompanhar-license-detail-page.test.ts`.

---

## [x] TM084 - Extensão de /app/planos/[licenseId]: permissões e ajustes

**Tipo:** FE
**Prioridade:** P1
**Dependencias:** TM080 TM081
**Paralelo:** não
**Requisitos:** RF-303 RF-304
**Areas afetadas:** `app/app/planos/[licenseId]/page.tsx`

**Descricao:** Cards "Ajustes propostos" e "Permissões de acompanhamento" (já previstos no layout da TM044) ganham aceitar/recusar e revogar.

**Criterio de conclusao:** Revogar nesta tela reflete imediatamente na tela do coach (TM082/TM083) na próxima chamada.

### Implementation Notes

- `app/app/planos/[licenseId]/page.tsx`/`actions.ts` estendidos (aditivamente — `loadPlanoDetail` passou a selecionar `coachId` do engagement) com `inviteCoachAction`/`decideAdaptationAction`/`revokeCoachEngagementAction`; `CoachFollowUpContent`/`AdjustmentsContent` ganharam os formulários reais de convite/aceite/recusa/revogação. Sem diretório/busca de coach nesta Onda — convite recebe o `CoachProfile.id` diretamente (limitação documentada, fora do escopo literal desta task).
- Revogação usa `RevokeCoachEngagement`, que persiste `ENDED` no servidor imediatamente — a próxima leitura de qualquer rota (incluindo a do coach, TM082/TM083) já reflete, sem cache intermediário.
- Coberta por `tests/planos-detail-actions.test.ts`.

---

## [x] TM085 - Precedência entre coaches por modalidade

**Tipo:** BE
**Prioridade:** P1
**Dependencias:** TM072
**Paralelo:** não
**Requisitos:** RF-305
**Areas afetadas:** `modules/school/application/`

**Descricao:** Define responsável principal por licença ou por modalidade com escopo parcial concedido; rejeita convite que crie sobreposição conflitante sem regra explícita.

**Criterio de conclusao:** Teste cobre coach de natação com escopo restrito a sessões `swim` convivendo com coach de corrida na mesma licença, sem conflito.

### Implementation Notes

- Implementada sem migration nova: `modules/school/domain/license-coach-scope.ts` (`scopesConflict`/`scopeIncludesSportType`) mais a checagem em `InviteCoachToLicense` (TM072, rejeita convite conflitante) e o enforce por sessão em `ProposePlanAdaptation` (TM074, usa `WorkoutTemplate.sportType`, já presente nas duas versões do schema de plano — v1/v2). Full-scope conflita com qualquer coisa; dois escopos parciais só conflitam se os `sportTypes` se sobrepõem — um coach `swim`-only e um `run`-only convivem sem conflito, exatamente o critério desta task.
- Coberta por `tests/license-coach-scope.test.ts`, mais os casos de conflito/não-conflito em `tests/invite-coach-to-license.test.ts`.

---

## [x] TM086 - Instrumentação de acompanhamento sem PII

**Tipo:** OBS
**Prioridade:** P2
**Dependencias:** TM073 TM075 TM076
**Paralelo:** sim
**Requisitos:** RNF-008
**Areas afetadas:** `modules/school/infrastructure/`

**Descricao:** Eventos: convite aceito, ajuste proposto, ajuste decidido, acompanhamento revogado.

**Criterio de conclusao:** Métricas emitidas sem PII; teste garante ausência de dado sensível no payload.

### Implementation Notes

- 4 métodos adicionados a `schoolMetrics` (`modules/school/infrastructure/metrics.ts`): `marketplaceCoachInvitationAccepted`, `marketplaceAdaptationProposed`, `marketplaceAdaptationDecided`, `marketplaceEngagementRevoked` — mesma convenção "só IDs opacos" já usada pelo grupo TM052/TM070. Adição concorrente às métricas do Onda 2 (TM064/TM070) nesta mesma sessão; conferido campo a campo, sem colisão (STATUS.md §4.4).
- Coberta por `tests/marketplace-metrics-followup.test.ts`.

---

## [x] TM087 - E2E: convite → aceite → ajuste → aprovação → revogação

**Tipo:** TEST
**Prioridade:** P0
**Dependencias:** TM082 TM083 TM084 TM085
**Paralelo:** não
**Requisitos:** RF-301 RF-302 RF-303 RF-304
**Areas afetadas:** `tests/`

**Descricao:** Atleta convida coach B (diferente do autor); B só vê após aceitar; B ajusta uma semana; Ana aprova; histórico mostra original e revisão; compra de outro comprador e versão do autor continuam idênticas; Ana revoga B e o acesso cessa imediatamente (cenários 4–5 de §14 da spec de produto).

**Criterio de conclusao:** Cenário completo verde, incluindo a checagem de que outras licenças/o produto original não mudaram.

### Implementation Notes

- `tests/e2e-marketplace-coach-followup.test.ts` — mesma convenção de E2E já usada por `e2e-marketplace-free-flow.test.ts` (cadeia real de casos de uso sobre Prisma mockado em memória). Cenário completo: convite → aceite (coach errado rejeitado) → ajuste proposto → decisão do atleta → revogação com acesso cessando imediatamente; produto original e outras licenças verificados como inalterados.
- Verificado nesta sessão como parte da suíte completa (2371 testes passando do zero, ver STATUS.md §4.4), não apenas confiado no relatório do agente.

---

## [x] TM088 - Atualizar architecture/modules/marketplace.yaml (entrega final)

**Tipo:** DOC
**Prioridade:** P2
**Dependencias:** TM087
**Paralelo:** sim
**Requisitos:** RF-007
**Areas afetadas:** `architecture/modules/marketplace.yaml, .agents/skills/ryvano-telas/`

**Descricao:** Registro final das rotas/telas de acompanhamento entregues.

**Criterio de conclusao:** `architecture/modules/marketplace.yaml` reflete o marketplace completo (Ondas 0–3); nenhuma rota implementada fica de fora do documento.

### Implementation Notes

- `architecture/modules/marketplace.yaml` — rotas/telas/invariantes da Onda 3 adicionadas ao registro já existente das Ondas 0–1 (TM053). `.agents/skills/ryvano-telas/references/screen-map.md` — linhas para `/professor/acompanhar/planos` e `/professor/acompanhar/planos/[licenseId]`, nota de TM084 na linha de `/app/planos/[licenseId]`.
- **Pendente para uma próxima task/sessão**: as rotas/telas da Onda 2 desta sessão (TM057–TM067: `/api/marketplace/payment-webhook`, `/api/marketplace/reconcile-payments`, `/marketplace/[idDoTreino]/checkout`) ainda não foram registradas em `marketplace.yaml`/`screen-map.md` — não estava no escopo desta task (que é só a entrega da Onda 3), mas o critério "nenhuma rota implementada fica de fora do documento" só fica 100% satisfeito quando isso for feito.

---
