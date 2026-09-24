# Ryvano Marketplace de Planos de Treino — Design técnico

**Spec:** `ryvano-marketplace-planos-treino` · **Base verificada:** `b6017cc`

> **Fonte única do detalhe.** DDL completo proposto, contratos HTTP, telas e
> design system estão em `RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md`. Este
> arquivo mapeia **onde** cada decisão vive e registra as escolhas estruturais,
> para não haver duas versões do mesmo contrato divergindo com o tempo.

| Preciso de… | Ler |
|---|---|
| Tabela de evolução de schema | spec de produto §9 |
| Contratos HTTP e DTOs propostos | spec de produto §11 |
| Fluxos completos (professor, atleta, acompanhamento) | spec de produto §4 |
| Telas, navegação, design system | spec de produto §5 e §6 |
| Matriz de propriedade/permissão | spec de produto §8, `requirements.md` RNF-001/002 |
| Checkout, webhook, ledger | spec de produto §10 |
| Critérios de aceite e cenários E2E | spec de produto §14 |
| Decisões de produto ainda abertas | spec de produto §15, `STATUS.md` §7 |

---

# 1. Posicionamento na arquitetura

O marketplace **continua dentro de `modules/school`**, como já está hoje — não é
extraído para um módulo novo nesta spec.

```text
modules/school/
  domain/        training-product.ts, training-product-version.ts,
                 training-purchase.ts, training-license.ts        (existentes,
                 evoluídos) + license-coach-engagement.ts,
                 plan-adaptation.ts, marketplace-review.ts         (novos)
  application/   create-training-purchase.ts,
                 instantiate-license-calendar.ts,
                 list-training-products.ts                        (existentes,
                 evoluídos) + publish-training-product-version.ts,
                 confirm-training-purchase-from-webhook.ts,
                 propose-plan-adaptation.ts, ...                   (novos)

app/api/marketplace/**        vitrine pública, checkout, webhook, reviews (novo)
app/api/coach/products/**     estúdio do professor                        (novo)
app/api/coach/training-licenses/**   acompanhamento                       (novo)
app/api/me/training-licenses/**      "meus planos", ativação, engagement  (novo)
app/api/training-products/**  legado — hotfix imediato (RF-001), depois
                               avaliar aposentar em favor de
                               /api/marketplace/products
```

**Por que não um `modules/marketplace` novo:** `TrainingProduct`, `TrainingPurchase`
e `TrainingLicense` já existem em `modules/school/` (T400–T406) e dependem de
`CoachProfile`, `School` e `WorkoutAssignment` — todos do módulo escola. Um módulo
separado duplicaria a checagem de vínculo escola/coach e criaria dependência
circular. O caso de "professor independente sem escola" já é suportado hoje por
`coachId` opcional em `TrainingProduct` — não exige um domínio novo, só uma
listagem/permissão que trate `schoolId = null` como caminho legítimo.

**Dívida assumida conscientemente:** o marketplace é comercial e público-facing —
mais próximo de um produto de e-commerce do que da gestão interna de uma escola.
Se o volume de código crescer muito além desta spec, extrair `modules/marketplace`
é um refactor futuro justificável — não fazer agora (regra de mudança cirúrgica).
RF-007 cobre o mínimo: documentar o limite explicitamente em
`architecture/modules/` para que a próxima sessão não presuma que o código
"pertence" à escola por acaso.

---

# 2. Decisões estruturais

## D-01 — Hotfix do vazamento antes de qualquer feature nova

`app/api/training-products/route.ts` fica **inalterado em intenção, corrigido em
comportamento** na TM001: continua público, mas passa a ignorar `status`/
`visibility` do cliente quando não há ator autorizado. A rota nova
`/api/marketplace/products` (TM033) é construída com o filtro correto desde o
início, sobre um caso de uso mais rico (`ListMarketplaceProducts`, superset de
`ListTrainingProducts`).

**Por quê não esperar a rota nova para corrigir:** o defeito é real hoje,
independente de quando o resto do marketplace for entregue. Corrigir depois cria
uma janela de exposição sem necessidade.

## D-02 — Compra confirmada só por evento verificado, nunca por rota pública com `paymentRef` do cliente

`CreateTrainingPurchase` **não é exposto por nenhuma rota** hoje (confirmado por
busca textual — zero chamadores fora do próprio módulo). Esta spec **não cria**
uma rota pública que aceite `paymentRef` livre. Os dois usos legítimos de
"compra confirmada" são:

1. **Aquisição gratuita** (TM038, `AcquireFreeTrainingProduct`) — sem
   `paymentRef`, só para `priceCents = null`.
2. **Confirmação por webhook** (TM060, `ConfirmTrainingPurchaseFromWebhook`) —
   `providerEventId` verificado contra a assinatura do provedor, nunca um texto
   vindo do navegador.

`CreateTrainingPurchase` original é dividido nessas duas responsabilidades; o
`Promise.all` (RF-002) é corrigido em ambas.

## D-03 — Plano multimodal com `sessions[]` e leitor retrocompatível

`planPayloadSchema` ganha um `schemaVersion`. Versões antigas
(`day.workoutTemplateId` único) continuam lidas e instanciadas sem alteração —
**não há migração de dado**, só um leitor que trata os dois formatos
(`instantiate-license-calendar.ts` passa a despachar por `schemaVersion`).

**Alternativa rejeitada:** reescrever `TrainingProductVersion` existentes para o
formato novo. Violaria RF-004 (versão publicada é imutável) e não é necessário —
nenhuma versão publicada precisa mudar de forma para o leitor novo funcionar.

## D-04 — Imutabilidade de versão publicada por trigger de banco, não só por convenção

`TrainingProductVersion` ganha um trigger `BEFORE UPDATE` que rejeita alteração de
`planPayload`/`changeNote` quando `publishedAt IS NOT NULL` (TM004). Convenção de
aplicação sozinha já falhou silenciosamente em outros pontos do projeto (ver
`WorkoutAssignmentHistory` para o padrão equivalente de imutabilidade por
histórico apensado) — aqui o risco é maior porque a imutabilidade é a garantia
central do produto (§2 princípio 5 da spec: "o original permanece estável").

## D-05 — `LicenseCoachEngagement` é autorização de escopo, não grant de histórico

Aceitar acompanhamento **não** cria `HistoryAccessGrant`. São dois consentimentos
diferentes, com o mesmo padrão que a spec da Jornada já estabeleceu para o vínculo
escola↔atleta (`ryvano-jornada-escola/design.md` D-05/RNF-003). Se o coach
acompanhante quiser ler histórico anterior à licença, precisa de um
`HistoryAccessGrant` explícito — fora do escopo de aceitar o convite de
acompanhamento.

## D-06 — `PlanAdaptation` versiona a instância, nunca a versão comprada

Um ajuste do coach acompanhante grava `beforeSnapshot`/`proposedSnapshot` em
`PlanAdaptation`, ligado a `WorkoutAssignment.effectiveRevisionId` — o
`TrainingProductVersion` original (RF-004) e as licenças de outros compradores
não são tocados. `expectedVersion` na proposta evita que duas edições concorrentes
apaguem uma à outra silenciosamente (RNF-003).

## D-07 — Ledger separado da licença, sem percentual no código

`SellerAccount`/ledger é contabilidade — split, taxa e reserva são configuração,
não constante (RF-205). A licença do atleta nunca depende do estado do ledger:
revogar/pausar acompanhamento ou reembolsar não apaga execuções nem a licença em
si (RF-204), só o direito de criar sessões futuras.

## D-08 — Calendário ancorado por `LocalDate` + timezone IANA, não por `Date` UTC

`InstantiateLicenseCalendar` passa a receber `timezone` (IANA) e um `LocalDate`
(início ou data-alvo de prova) em vez de assumir meia-noite UTC. A função
`toMonday()` é substituída por uma que calcula a segunda-feira local do atleta e
lida com dias de 23 h/25 h (TM011).

**Risco:** qualquer teste que hardcode datas UTC precisa ser revisado — auditar
`tests/*.test.ts` que tocam `InstantiateLicenseCalendar` antes de mudar a
assinatura.

## D-09 — Grid compartilhado ganha superfícies novas, não um fork

`CustomizableCardGrid` (já usado por dashboard, atividades e integrações) recebe
as chaves de superfície `marketplace-catalog`, `athlete-plan`, `coach-studio`
(TM050), mesmo padrão que `ryvano-jornada-escola/design.md` D-06/D-07 já adotou
para o painel da escola. Nenhuma tela nova **DEVE** clonar o componente.

**Risco:** blast radius alto — rodar impacto no GitNexus antes (a base local
estava 19 commits atrasada na verificação desta spec; reindexar é TM014) e
verificar as telas consumidoras existentes depois.

## D-10 — Rotas de checkout/webhook são adaptadoras finas sobre casos de uso com verificação de documentação oficial

A integração com o provedor de pagamento (TM059) é a única peça desta spec sujeita
à regra de documentação externa obrigatória do `AGENTS.md` ("MANDATORY
official-docs checklist"): OAuth/API/webhooks/assinatura do provedor escolhido
**DEVEM** ser confirmados contra a documentação oficial vigente antes da
implementação, citando o que foi confirmado no commit — mesma exigência já
aplicada a Garmin/Strava neste repositório. Provedor de pagamento ainda não está
decidido (Q5 nas decisões pendentes).

---

# 3. Ordem de implementação e o porquê

```text
Onda 0 ─ Segurança e fundação (TM001–TM017)
   │      Fecha os dois defeitos P0 (RF-001, RF-002) e cria o schema sobre o
   │      qual toda a Onda 1 é construída. Nada da Onda 1 é seguro sem isto.
   ▼
Onda 1 ─ Produto completo sem pagamento real (TM018–TM056)
   │  domínio + casos de uso do professor (TM018–TM023)
   │      ▼
   │  API do estúdio (TM024–TM027) → telas do estúdio (TM028–TM030)
   │      ▼
   │  vitrine pública + detalhe (TM031–TM037)
   │      ▼
   │  aquisição grátis + ativação + calendário (TM038–TM046)
   │      ▼
   │  avaliações (TM047–TM049) + grid compartilhado (TM050)
   │      ▼
   │  estados, observabilidade, docs, E2E (TM051–TM056)
   ▼
Onda 2 ─ Venda paga (TM057–TM071)
   │  ledger e checkout revalidado (TM057–TM058) → provedor (TM059, docs oficiais)
   │      ▼
   │  confirmação por webhook (TM060–TM061) → reconciliação (TM064)
   │      ▼
   │  reembolso (TM065–TM066) → painel financeiro (TM067–TM068)
   │      ▼
   │  idempotência, observabilidade, E2E pago (TM069–TM071)
   ▼
Onda 3 ─ Acompanhamento independente (TM072–TM088)
       convite → aceite → ajuste → decisão → revogação, com precedência
       multimodal explícita (TM085)
```

**Onda 0 antes de tudo:** RF-001 e RF-002 são defeitos que afetam o código hoje,
independente de qualquer feature nova — igual ao padrão já usado na spec da
Jornada (defeitos verificados corrigidos antes de construir em cima). O schema de
Onda 0 (TM003–TM009) é pré-requisito estrutural: publicar produto sem XOR
`schoolId`/`coachId` (RF-003) ou sem imutabilidade de versão (RF-004) produziria
dado que a Onda 1 teria que migrar depois.

**Onda 1 antes da Onda 2:** a spec de produto §14 é explícita — a Fase 1 valida a
jornada inteira com oferta gratuita antes de habilitar checkout real. Isso
significa que RF-108 (aquisição grátis) e RF-109 (ativação) já usam a mesma
`CreateTrainingPurchase` dividida em D-02; a Onda 2 só adiciona o segundo caminho
(webhook), não reabre a Onda 1.

**Onda 3 por último:** depende de licença ativa existente (Onda 1) e não depende
de pagamento (Onda 2 pode não ter sido entregue ainda — plano gratuito também
pode ter acompanhamento). A ordem aqui é por risco de superfície pública, não por
dependência técnica rígida: se o produto priorizar acompanhamento antes de venda
paga, Onda 3 pode trocar de posição com a Onda 2 sem violar nenhuma dependência
técnica registrada em `task-list.md`.

---

# 4. Pontos de integração com o que já existe

| Integração | Cuidado |
|---|---|
| `WorkoutAssignment` | Marketplace só referencia (`trainingLicenseId`, `planSessionId`); não duplica prescrição. Campos novos são aditivos e nullable — compatível com atribuições de escola que não vêm de licença. |
| `CoachProfile` / `School` | Autoria de produto reusa exatamente as mesmas checagens de `CoachSchoolMembership`/OWNER-ADMIN já usadas pelo resto do módulo escola — não inventar uma segunda noção de "professor autorizado". |
| `HistoryAccessGrant` | Aceitar acompanhamento (Onda 3) **não** cria grant — ver D-05. |
| `CustomizableCardGrid` | Estender com novas superfícies (D-09); não clonar. Blast radius alto — GitNexus antes de editar. |
| `schoolResponse` / `publicSchoolResponse` | Rotas autenticadas (estúdio, "meus planos", acompanhamento) usam `schoolResponse`; rotas públicas de vitrine usam `publicSchoolResponse` **sem** deixar parâmetro do cliente elevar o resultado (RF-001). |
| `SCHOOL_ERROR_STATUS` | Estender o catálogo existente (TM012); não inventar status HTTP solto na rota. |
| `RyvanoSportType` / `getRyvanoSportLabel` | Toda modalidade de produto/sessão usa a taxonomia canônica (RNF-006); confirmado existente em `modules/shared/activities/sport-types/index.ts`. |
| `prisma/seed.ts` | Estender com produto multimodal de exemplo + licença grátis (TM017, TM056), não criar um seed paralelo. |

---

# 5. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Corrigir `list-training-products.ts` sem cobrir todo parâmetro que pode escalar | Alto — reabre RF-001 de outra forma | Teste explícito por parâmetro (`status`, `visibility`, `schoolId`, `coachId`) combinando anônimo × autenticado × dono × não-dono. |
| `Promise.all` → sequencial na TM002 muda o tempo de resposta ou esconde um segundo bug de transação | Médio | Teste de integração cobrindo falha no meio da transação (rollback completo, nenhuma licença órfã). |
| Trigger de imutabilidade (D-04) bloqueia uma correção administrativa legítima futura | Médio | Documentar explicitamente no comentário da migration que correção excepcional exige nova versão, nunca `UPDATE` direto — nem por script administrativo. |
| Provedor de pagamento sem docs oficiais consultadas antes da TM059 | Alto — viola AGENTS.md e pode implementar contrato errado | D-10; bloquear a TM059 até Q5 (provedor) estar decidido e a checklist de docs oficiais citada no commit. |
| `CustomizableCardGrid` com blast radius alto (dashboard/atividades/integrações) | Alto | GitNexus impacto antes (índice estava 19 commits atrasado — reindexar é TM014); verificar as três telas depois. |
| Mudar `InstantiateLicenseCalendar` para timezone quebra testes que hardcodeiam UTC | Médio | Auditar `tests/*.test.ts` relacionados antes da TM011; rodar suíte completa depois. |
| Multi-coach por modalidade sem precedência definida gera ajuste conflitante | Médio | RF-305/TM085 antes de liberar convite a um segundo coach numa licença multimodal. |
| Spec envelhecer em relação ao código | Médio | §2 e §3 citam commit-base (`b6017cc`); reconfirmar RF-001/002/005/006 antes de implementar caso o tempo tenha passado. |

---

# 6. Verificação

| Portão | Comando | Critério |
|---|---|---|
| Tipos | `npx tsc --noEmit` | 0 erros |
| Testes | `npx vitest run` | verde |
| Schema | `npx prisma validate` | válido, incluindo back-relations das entidades novas |
| Rotas | `bash .agents/skills/ryvano-telas/scripts/audit-routes.sh` | sem 404 linkado |
| Acesso | `bash .agents/skills/ryvano-telas/scripts/audit-access.sh` | bate com RNF-001 |
| Grafo | `node .gitnexus/run.cjs detect-changes --scope all --repo .` | sem impacto cruzado inesperado; reindexar antes se `staleness.status != "current"` |

**Obrigatórios por tipo de mudança:** autorização pública × autenticado × dono
(uma checagem por combinação de RF-001); idempotência (aquisição grátis e
confirmação por webhook executadas duas vezes → efeito único); concorrência
(`expectedVersion` obsoleto em produto/adaptação → 409); transação (falha no meio
não deixa licença órfã nem compra sem licença); fuso (ativação em fuso positivo e
negativo, incluindo dia de troca de horário de verão).

> **Armadilha do Next dev:** Server Component pode responder 200 com meta refresh
> em vez de 3xx — `audit-access.sh` já interpreta isso; não concluir "rota
> desprotegida" só pelo código de status HTTP.

> **Lição herdada da spec da Jornada:** DDL de spec precisa ser validado de
> verdade — extrair os blocos Prisma reais (não só a tabela descritiva de §9),
> concatenar ao `schema.prisma` atual e rodar `npx prisma validate` antes de
> considerar uma migration pronta (TM015). A spec anterior descobriu assim que
> faltavam back-relations inteiras em `User`; aqui há pelo menos `User` (autor,
> ator de `PlanAdaptation`, avaliador) e `CoachProfile` (autor, acompanhante) como
> candidatos a relações nomeadas duplicadas — mapear na TM008/TM009, não deixar para
> depois.
