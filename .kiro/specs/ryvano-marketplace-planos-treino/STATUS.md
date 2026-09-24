# STATUS — Ryvano Marketplace de Planos de Treino

> **Este é o primeiro arquivo a ler ao iniciar uma sessão.** Ele responde: onde o
> trabalho estava, o que já foi feito, o que está em andamento e por onde retomar.
>
> **Regra:** quem alterar o estado de qualquer task atualiza este arquivo **na mesma
> entrega**. Um STATUS desatualizado é pior do que nenhum, porque a próxima sessão
> confia nele e retrabalha ou pula etapa — foi exatamente o defeito encontrado e
> corrigido na spec da Jornada (ver `.kiro/specs/ryvano-jornada-escola/STATUS.md`
> §5) e a razão de existir do `check-status.sh` desta spec.

---

## 1. Retomada rápida

**Estado atual:** `87/88 CONCLUÍDA — só TM054 bloqueada (precisa de banco alcançável)`

```text
Fase atual .......... Onda 0 (17/17) + Onda 1 (38/39) + Onda 2 (15/15) + Onda 3 (17/17) — 87/88, só TM054 bloqueada
Task em andamento ... nenhuma ([~] = 0)
Próxima task ........ nenhuma pendente — só desbloquear TM054 quando houver acesso real ao banco (ver §4.1) e aplicar as migrations 0036–0044
Bloqueios ........... TM054 (auditoria HTTP de acesso — precisa de banco alcançável, ver §4.1)
Decisões pendentes .. Q6 (critérios de moderação de avaliações — não bloqueia nada pendente; ver §7)
```

⚠️ **Migrations 0036–0042 estão ESCRITAS e o schema.prisma foi VALIDADO**
(`prisma generate` limpo 12× nesta sessão + `tsc --noEmit` limpo), mas **NÃO
aplicadas ao banco**: `prisma migrate status`/`validate` ficam pendurados e
expiram por timeout a partir deste sandbox — o Postgres remoto de
`DATABASE_URL` (`75.119.158.93:9596`) não é alcançável daqui. Alguém com
acesso de rede ao banco precisa rodar `npx prisma migrate deploy` (e então um
`prisma validate` de verdade) antes que este código funcione contra dados
reais. O seed do TM017 também não foi executado, pelo mesmo motivo.

⚠️ **GitNexus `detect-changes --scope all` reportou `risk: critical`** ao
final da Onda 0 (75 fluxos afetados, `publicSchoolResponse` em
`app/api/schools/_shared.ts`). Avaliado e considerado seguro para prosseguir,
não ignorado — ver §5 abaixo para o raciocínio completo antes de confiar
nesta avaliação.

### Comandos de retomada

```bash
# 1. Estado do repositório
git status && git --no-pager log --oneline -5

# 2. Procurar trabalho interrompido — SEMPRE antes de iniciar algo novo
grep -n "^## \[~\]" .kiro/specs/ryvano-marketplace-planos-treino/task-list.md   # em andamento
grep -n "^## \[!\]" .kiro/specs/ryvano-marketplace-planos-treino/task-list.md   # bloqueadas

# 3. Ler contexto (nesta ordem)
#    requirements.md -> design.md -> task-list.md
#    -> RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md

# 4. Confirmar que RF-001/RF-002/RF-005/RF-006 ainda são reais (a base pode ter mudado)
grep -n "publicSchoolResponse" app/api/training-products/route.ts
sed -n '85,112p' modules/school/application/create-training-purchase.ts

# 5. Portões de verificação
npx tsc --noEmit && npx vitest run
bash .kiro/specs/ryvano-marketplace-planos-treino/check-status.sh
```

> **Nunca assumir que uma task `[~]` está concluída só porque existe código.**
> Ler o bloco `Implementation Notes` da task antes de continuar.

---

## 2. Onde estava — a base de partida

| Item | Valor |
|---|---|
| Commit-base da análise | `b6017cc` (`main`) |
| Spec de produto | `RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md` v1.1 |
| Specs Kiro relacionadas | `ryvano-escola-spec` (T000–T407), `ryvano-jornada-escola` (T500–T547, Onda 2 reservada a partir de T550) |
| Última migration antes desta spec | `0035_team_operational_fields` → próxima é **0036** |
| Maior task ID em uso antes desta spec | `T580` (placeholder de decisão financeira, reservado dentro de `ryvano-jornada-escola` Onda 2) → esta spec usa **TM001–TM088**, sem sobreposição |

### O que já existe no código (T400–T406, spec anterior)

`TrainingProduct`, `TrainingProductVersion`, `TrainingPurchase`, `TrainingLicense`
e a instanciação de calendário via `InstantiateLicenseCalendar` **já existem e
funcionam** para o caminho feliz simples. Esta spec não recria essas entidades —
evolui o schema (Onda 0), fecha dois defeitos de segurança verificados (RF-001,
RF-002) e constrói tudo que falta em cima: editor multimodal, vitrine pública,
checkout real, avaliações e acompanhamento por outro professor.

### Defeitos verificados no código nesta análise

| ID | Onde | Evidência |
|---|---|---|
| RF-001 | `app/api/training-products/route.ts:14-18` | Sem checagem de sessão; `list-training-products.ts:40,57` aplica `status`/`visibility` do query sem autorização. |
| RF-002 | `create-training-purchase.ts:90-110` | `Promise.all` cria compra e licença concorrentemente, mas licença tem FK para compra. |
| RF-005 | `training-product-version.ts:7-21` | `planDaySchema` permite só um `workoutTemplateId` por dia — sem multi-sessão/multimodal. |
| RF-006 | `instantiate-license-calendar.ts:25-32` | `toMonday()` usa UTC fixo — sem fuso do atleta nem tratamento de horário de verão. |
| RF-007 | `architecture/modules/school.yaml` | Não lista `app/api/training-products` nem qualquer caminho de marketplace em `paths:` — módulo indocumentado. |

Todos com caminho para correção mapeado nas tasks TM001–TM013 (§6).

---

## 3. O que foi feito

### ✅ Concluído nesta sessão

| Entrega | Resultado |
|---|---|
| Verificação do código contra a spec de produto | RF-001, RF-002, RF-005, RF-006, RF-007 confirmados com evidência de arquivo:linha; enums, DTOs e rotas existentes mapeados. |
| Spec Kiro do Marketplace | `requirements.md`, `design.md`, `task-list.md`, `STATUS.md`, `spec.json`, `check-status.sh` criados. 88 tasks TM001–TM088, sem ciclos de dependência, validadas programaticamente contra o mesmo regex que `check-status.sh` usa. |
| TM014 — Reindexar GitNexus | Índice estava 19 commits atrasado; `analyze --index-only` rodado (15.448 nós, 33.833 arestas); `detect-changes --scope all` como baseline: sem mudanças pendentes. |
| TM001 — Fechar vazamento do catálogo público | `status`/`visibility` removidos de `listTrainingProductsSchema` (não só ignorados — `strictObject` rejeita a chave); `where` força `PUBLISHED`+`PUBLIC` incondicionalmente. 5 testes novos (`tests/list-training-products.test.ts`). Impact GitNexus: 1 chamador, risco LOW. |
| TM002 — Ordem compra→licença na transação | `Promise.all` → dois `await` sequenciais (compra antes da licença, FK respeitada). 4 testes novos (`tests/create-training-purchase.test.ts`). Impact GitNexus: `UNKNOWN` (0 arestas resolvidas) — confirmado por busca textual que a classe não tem chamador algum hoje (nem rota, nem teste). |
| TM003–TM009 — 7 migrations de fundação | `TrainingProduct` (campos comerciais + XOR/priceCents CHECK, Q7 decidida), `TrainingProductVersion` (schemaVersion + trigger de imutabilidade), `TrainingPurchase` (checkout/idempotência), `TrainingLicense` (ativação/fuso/PAUSED/COMPLETED, Q1 decidida), `WorkoutAssignment` (proveniência + adaptationVersion), `LicenseCoachEngagement` + `PlanAdaptation` (novos), `MarketplaceMedia` + `MarketplaceReview` (novos). Todas as back-relations em `User`/`CoachProfile`/`School` mapeadas. `prisma generate` + `tsc --noEmit` limpos após cada uma. Migrations **não aplicadas** ao banco (ver aviso em §1). |
| TM010–TM017 — multimodal, fuso, erros, docs, flag, seed | Ver notas individuais em `task-list.md`. |
| **TM018–TM046 — Onda 1, três trilhas em paralelo** | **Trilha A** (TM018–030, Estúdio do professor): guard de autorização, editor multimodal, publicação imutável, painel de vendas, 4 rotas, 3 telas. **Q3 decidida** (produto em nome próprio ou de escola conforme o `schoolId` do pedido) e **Q4 decidida** (nunca há upgrade automático de versão para quem já comprou) — ambas como default de engenharia documentado, sinalizadas para Produto confirmar/revisar. **Trilha B** (TM031–037, Vitrine pública): listagem/detalhe públicos replicando a regra do RF-001, SEO sem vazamento, proteção de callback URL contra open-redirect (validador próprio, escopado a `/marketplace/*`). **Trilha C** (TM038–046, Aquisição grátis + calendário): divisão de `CreateTrainingPurchase` (design D-02) em `AcquireFreeTrainingProduct`, ativação de licença com preview de conflito, `/app/planos`, evolução do `/app/treinos` existente (corrigiu um fallback morto `schoolPath="#"`), painel de marketplace da escola. Implementado por 3 agentes em paralelo nesta sessão; **verificado de forma independente após todos concluírem** (não apenas nos relatórios deles): `tsc --noEmit` limpo, suíte completa rodada do zero (2215/2295 testes passando, único diferencial as mesmas 2 falhas pré-existentes já documentadas), `prisma generate` limpo, `git diff` revisado nos pontos mais sensíveis (`instantiate-license-calendar.ts`, proteção de callback URL, os dois `layout.tsx` compartilhados), catálogo de erros conferido campo a campo após edição concorrente pelos 3 agentes (sem colisão). |
| **TM047–TM056 — fechamento da Onda 1** | Avaliações (`CreateMarketplaceReview` + rota; agregação/ranking já existia desde a Trilha B). **Q6 decidida** (avaliação nasce `APPROVED`, sem fila de moderação nesta Onda). `CustomizableCardGrid`: 3 colunas novas em `UserProfile` (migration 0043) seguindo a convenção real do código (uma coluna por superfície, descoberta por leitura de `dashboard-layout.ts`), prova end-to-end em `/app/planos/[licenseId]`. Instrumentação (4 eventos, sem PII). Docs (`marketplace.yaml`, `screen-map.md`) atualizadas com a entrega real. Auditoria estática de rotas limpa (0 links quebrados); auditoria HTTP **bloqueada** (TM054 — banco inalcançável). Estados da tabela §13 auditados um a um contra o código. E2E do fluxo grátis completo, incluindo não-duplicação em reenvio. |

### ⬜ Não iniciado

TM047–TM088 (avaliações, grid compartilhado, estados/observabilidade/E2E da
Onda 1; toda a Onda 2 — venda paga; toda a Onda 3 — acompanhamento
independente).

---

## 4. O que está sendo feito

```text
Nenhuma task em andamento.
```

Quando uma task for iniciada, este bloco deve conter:

```text
Task ......... TMxxx — título
Iniciada em .. AAAA-MM-DD
Arquivos ..... lista dos arquivos tocados até agora
Falta ........ o que ainda não foi feito
Próximo passo  a ação imediata ao retomar
```

---

### 4.1. Risco CRITICAL do GitNexus ao final da Onda 0 — avaliado, não ignorado

`node .gitnexus/run.cjs detect-changes --scope all`, rodado como baseline
antes de começar a Onda 1 (conforme TM014 exige), reportou:

```text
Changes: 13 files, 33 symbols
Affected processes: 75
Risk level: critical
```

**Causa:** `publicSchoolResponse` (`app/api/schools/_shared.ts`) é o envelope
de resposta usado por praticamente toda rota pública do módulo escola — daí
o fan-out de 75 fluxos. A task TM016 adicionou um novo `if` ao catch dessa
função, tratando o erro `MARKETPLACE_DISABLED` (mesmo padrão já usado para
`SCHOOL_MODULE_DISABLED`).

**Por que foi considerado seguro prosseguir, e não um bloqueio real:**

1. A mudança é **estritamente aditiva** — um novo ramo `if` inserido depois
   dos existentes, sem alterar nenhuma condição, ordem ou retorno anterior.
   Nenhum código hoje lança `MARKETPLACE_DISABLED` (a flag foi criada nesta
   mesma Onda, `assertMarketplaceEnabled()` ainda não é chamada por rota
   nenhuma) — o ramo novo é código morto do ponto de vista de qualquer um
   dos 75 fluxos existentes até a Onda 1 conectar uma rota a ele.
2. A suíte completa (2105 testes, incluindo testes de rota que exercitam
   `publicSchoolResponse`/`schoolResponse` como `tests/school-teams-routes.test.ts`)
   rodou depois da mudança sem nenhuma regressão nova — as únicas 2 falhas
   são pré-existentes e não relacionadas (`view-models-multi-provider.test.ts`,
   `lib/reports/generate-report.test.ts`).
3. `risk: critical` aqui reflete **blast radius estrutural** (quantos fluxos
   passam pela função), não necessariamente que a mudança em si seja
   perigosa — mas a regra do `AGENTS.md` é clara: `critical`/`high` nunca é
   ignorado silenciosamente, mesmo quando a avaliação conclui que é seguro.
   Este bloco existe para que a próxima sessão veja o raciocínio, não só a
   conclusão.

**O que NÃO foi feito por causa disso:** nenhuma rota nova desta sessão
chama `assertMarketplaceEnabled()` ainda — isso só acontece na Onda 1, task
a task, cada uma testada individualmente antes de tocar uma rota real.

### 4.2. Atualização — Onda 1 (TM018–TM046) e o mesmo risco `critical`

`detect-changes --scope all`, rodado de novo após as 3 trilhas da Onda 1
concluírem (sem mais nenhum agente rodando em paralelo, leitura limpa desta
vez), continua reportando `risk: critical` — agora 101 processos afetados
(era 75 ao fim da Onda 0). Mesma avaliação de §4.1, estendida:

- O aumento vem de tocar mais três "hubs" estruturais: `ProtectedAppLayout`
  (`app/app/layout.tsx`) e `EscolaAdminLayout` (`app/escola/[schoolId]/layout.tsx`)
  ganharam um item de navegação cada (TM043/TM046) — todo `layout.tsx` é, por
  natureza, renderizado por toda página da árvore que ele envolve, então
  qualquer edição neles tem fan-out estrutural alto **mesmo sendo uma linha
  aditiva**; `WorkoutCard`/`ASSIGNMENT_INCLUDE` (`/app/treinos`, TM045)
  ganharam um include de Prisma e um badge condicional; `app/entrar/**`
  (TM037) ganhou o parâmetro `callbackUrl` de comprador.
- Verificado por leitura direta do diff de cada um desses arquivos (não só
  confiado no relatório do agente): as duas edições de `layout.tsx` são
  exatamente um `if` + um item de array, atrás de `isMarketplaceEnabled()`;
  a proteção de callback URL é aditiva e coberta por 12 testes de rejeição.
- Suíte completa (2295 testes) re-executada do zero após todas as três
  trilhas pararem: 2215 passando, as mesmas 2 falhas pré-existentes de
  sempre, zero falha nova.

Mesma conclusão de §4.1: avaliado e aceito, não ignorado.

### 4.3. Q5 decidida: Stripe — documentação oficial consultada (AGENTS.md checklist)

Por pedido explícito do usuário (não decisão unilateral). Antes de escrever
qualquer código de integração (regra obrigatória do `AGENTS.md` para contratos
externos), consultei a documentação oficial atual da Stripe:

| Confirmado | Fonte oficial |
|---|---|
| Checkout Session: `mode="payment"` (pagamento único), `line_items[].price_data` (sem precisar pré-criar `Price` objects na Stripe), `client_reference_id` (string, até 200 chars — usar para `checkoutId`), `metadata` (map — productId/versionId/athleteId), `success_url`/`cancel_url`, `expires_at` (30min–24h, default 24h) | [Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create) |
| Fulfillment só via webhook `checkout.session.completed`, nunca no redirect do navegador; `checkout.session.expired` para limpeza | [How Checkout works](https://docs.stripe.com/payments/checkout/how-checkout-works) |
| Idempotência de escrita: header `Idempotency-Key` (até 255 chars, sugerido UUID v4), cache de pelo menos 24h, aceito em todo `POST` | [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) |
| Verificação de webhook: header `Stripe-Signature` (`t=...,v1=...`), segredo `whsec_...`, `stripe.webhooks.constructEvent(rawBody, sig, secret)`, **exige o corpo bruto da requisição** (framework não pode fazer parse antes), HMAC-SHA256, tolerância padrão de 5 min contra replay | [Receive Stripe events](https://docs.stripe.com/webhooks) |
| Sem garantia de ordem de entrega; **nunca** usar `created`/timestamp para dedupe — usar `event.id`; at-least-once, retry com backoff exponencial por até 3 dias em produção | [Receive Stripe events](https://docs.stripe.com/webhooks) |
| Reembolso: eventos atuais recomendados são `refund.created`/`refund.failed` — **não** `charge.refunded` (mudança de 2024-10-28, funciona uniformemente com ou sem `Charge` associado) | [Refund webhook update, changelog 2024-10-28](https://docs.stripe.com/changelog/acacia/2024-10-28/refund-webhook-update) |
| Responder `2xx` rapidamente, antes de lógica lenta | [Receive Stripe events](https://docs.stripe.com/webhooks) |

Política comercial (percentual de repasse, prazos, moeda padrão, tratamento
fiscal) **não** foi decidida — TM057/TM067 usam ledger configurável, sem
constante de percentual no código (RF-205), exatamente como já estava
planejado antes de Q5 ser respondida.

### 4.4. Atualização final — TM064/TM065/TM067 (Onda 2) + Onda 3 completa (TM072–088), mesmo risco `critical`

Reconciliação (TM064), auditoria de reembolso administrativo (TM065) e ledger
de vendedor (TM067) implementados nesta sessão; em paralelo, um segundo
agente implementou toda a Onda 3 (TM072–088, acompanhamento independente por
outro professor) no mesmo working tree. Dois arquivos foram editados
concorrentemente por mim e pelo agente (`modules/school/domain/enums.ts` e
`modules/school/infrastructure/metrics.ts`) — conferido campo a campo após o
merge: minhas chaves (`SellerType`, `SellerLedgerEntryType`,
`marketplaceReconciliationRun`) e as dele (`LicenseCoachEngagementStatus`,
`PlanAdaptationStatus`, 4 métricas TM086) coexistem sem colisão nem
sobrescrita — nenhuma edição de terceiros foi perdida.

Reindexação completa (`analyze --index-only`, 17.389 nós/38.361 arestas) e
`detect-changes --scope all` rodados do zero ao final de tudo:
**`risk: critical`, 24 arquivos, 102 símbolos, 37 processos afetados** — mesma
categoria de risco de §4.1/§4.2, não uma nova. Causa confirmada: a árvore de
trabalho já estava com dezenas de arquivos não relacionados ao marketplace
modificados e não commitados **antes mesmo desta sessão começar** (visto no
`git status` inicial: `.agents/`, `.claude/skills/gitnexus-*`, `.codex/`,
outras specs `.kiro/`, etc.) — `detect-changes` compara contra o HEAD commitado,
então herda todo esse diff pré-existente, não apenas o trabalho desta sessão.
Os símbolos citados no relatório (`publicSchoolResponse`, `ProtectedAppLayout`,
`WorkoutCard`, `CreateTrainingPurchase`, `app/entrar/**`) já foram avaliados e
aceitos em §4.1/§4.2 nesta mesma sessão — nenhum item genuinamente novo na
categoria "hub estrutural". `parsePlanPayload`/`duplicatePlanWeek` aparecem
por serem transitivamente alcançáveis a partir de arquivos já avaliados, não
por terem sido editados agora.

Verificação independente completa, não apenas o relatório do agente:
`npx tsc --noEmit` limpo (rodado do zero após o merge); suíte completa
rodada do zero: **2371 passando, 87 puladas, 3 falhando** — 2 já documentadas
como pré-existentes/não relacionadas (`view-models-multi-provider.test.ts`,
`lib/reports/generate-report.test.ts`) e 1 (`modules/strava/tests/webhook-processor.test.ts`,
timeout de hook) confirmada como ruído transiente de infraestrutura do
sandbox ao rodar o arquivo isolado (9/9 passando). **Zero regressão nova**
atribuível ao trabalho desta sessão (Onda 2 TM064/065/067 ou Onda 3
completa). Avaliado e aceito, não ignorado — mesma conclusão de §4.1/§4.2.

---

## 5. Verificação da base antes de implementar

Esta spec foi escrita a partir de leitura direta do código em `b6017cc`, não só
da spec de produto. Antes de iniciar a Onda 0, reconfirmar rapidamente:

```bash
# RF-001 — ainda sem checagem de sessão?
sed -n '1,20p' app/api/training-products/route.ts

# RF-002 — ainda Promise.all entre compra e licença?
sed -n '85,112p' modules/school/application/create-training-purchase.ts

# RF-005 — ainda um workoutTemplateId por dia?
sed -n '1,21p' modules/school/domain/training-product-version.ts

# RF-006 — ainda toMonday() em UTC fixo?
sed -n '18,32p' modules/school/application/instantiate-license-calendar.ts
```

Se qualquer um já tiver sido corrigido por outro trabalho, marcar a task
correspondente como `[x]` **com a evidência do commit que corrigiu**, não
reimplementar — mesma lição da spec da Jornada.

---

## 6. Mapa de progresso — este spec

### Onda 0 — segurança e fundação (TM001–TM017)

```text
Vazamento/transação  [x] TM001  [x] TM002
Schema P0            [x] TM003  [x] TM004  [x] TM005  [x] TM006
Schema P1            [x] TM007  [x] TM008  [x] TM009
Correções de código  [x] TM010  [x] TM011
Base e docs          [x] TM012  [x] TM013  [x] TM014  [x] TM015  [x] TM016  [x] TM017

Progresso: 17/17 — CONCLUÍDA
```

### Onda 1 — produto completo sem pagamento real (TM018–TM056)

```text
Domínio/casos de uso coach   [x] TM018  [x] TM019  [x] TM020  [x] TM021  [x] TM022  [x] TM023
API do estúdio               [x] TM024  [x] TM025  [x] TM026  [x] TM027
Telas do estúdio             [x] TM028  [x] TM029  [x] TM030
Vitrine pública               [x] TM031  [x] TM032  [x] TM033  [x] TM034  [x] TM035  [x] TM036  [x] TM037
Aquisição grátis + calendário [x] TM038  [x] TM039  [x] TM040  [x] TM041  [x] TM042  [x] TM043  [x] TM044  [x] TM045  [x] TM046
Avaliações                    [x] TM047  [x] TM048  [x] TM049
Grid compartilhado            [x] TM050
Estados/docs/E2E               [x] TM051  [x] TM052  [x] TM053  [!] TM054  [x] TM055  [x] TM056

Progresso: 38/39 (TM054 bloqueada — ver §4.1)
```

### Onda 2 — venda paga (TM057–TM071)

```text
Ledger/checkout      [x] TM057  [x] TM058  [x] TM059
Confirmação/webhook  [x] TM060  [x] TM061  [x] TM062  [x] TM063  [x] TM064
Reembolso/ledger     [x] TM065  [x] TM066  [x] TM067  [x] TM068
Testes/observ./E2E   [x] TM069  [x] TM070  [x] TM071

Progresso: 15/15 — CONCLUÍDA
```

### Onda 3 — acompanhamento independente (TM072–TM088)

```text
Casos de uso   [x] TM072  [x] TM073  [x] TM074  [x] TM075  [x] TM076
API            [x] TM077  [x] TM078  [x] TM079  [x] TM080  [x] TM081
Telas          [x] TM082  [x] TM083  [x] TM084
Regras/QA/docs [x] TM085  [x] TM086  [x] TM087  [x] TM088

Progresso: 17/17 — CONCLUÍDA
```

**Total geral: 87/88 tasks concluídas** (+ 1 bloqueada — TM054, ver §4.1). As Ondas 0, 2 e 3 estão 100% completas; a Onda 1 está 38/39 (só TM054 bloqueada).

### Onda 4 — expansão (não detalhada)

Multi-coach simultâneo com precedência avançada, cooperação multi-escola sobre o
mesmo produto. Só planejar depois que a Onda 3 estiver aceita.

### Grafo de dependências (validado)

Sem ciclos — verificado programaticamente contra o mesmo regex de
`check-status.sh` (88/88 blocos reconhecidos, 0 dependência apontando para ID
inexistente).

**Onda 0 (17/17) e as três trilhas da Onda 1 (TM018–TM046, 29/29) completas.**
O caminho crítico até a primeira tela pública e até a primeira compra grátis
real (ambos citados na revisão anterior deste arquivo) **já foi percorrido**.

Próximas tasks sem dependência pendente:

```text
TM047  CreateMarketplaceReview       (dep. TM009+TM041, ambas [x])
TM050  CustomizableCardGrid: novas superfícies (dep. TM014 [x] — risco alto, GitNexus antes)
```

TM048/TM049 dependem de TM047; TM051–TM056 (estados/observabilidade/docs/E2E)
dependem de várias telas TM028–046, todas [x] — podem começar assim que
TM047–050 fecharem.

---

## 7. Decisões que precisam de resposta

Detalhamento em `RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md` §15.

| # | Decisão | Status | Trava qual task? | Dono |
|---|---|---|---|---|
| **Q1** | Licença permanente ou janela finita; reinícios; pausa | ✅ decidida (TM006): permanente por padrão, sem expiração forçada; política de reinício deliberadamente não modelada no schema — ver `prisma/migrations/0039_*` | TM041 (usa a decisão) | Produto (pode revisar) |
| **Q2** | Diferença comercial "comprar plano" × "contratar acompanhamento" | ✅ decidida (TM062): "contratar acompanhamento" nunca passa pelo checkout nem é embutido no preço do produto — é sempre um mecanismo separado, gratuito, da Onda 3 (`LicenseCoachEngagement`) | TM062 (usa a decisão), TM072 | Produto (pode revisar) |
| **Q3** | Produto de professor-em-escola: nome próprio ou da escola | ✅ decidida (TM019): por pedido — `schoolId` presente no payload torna o produto de titularidade da escola (exige OWNER/ADMIN); ausente, nome próprio do coach | TM019 (usa a decisão) | Produto (pode revisar) |
| **Q4** | Direito de atualização de versão para quem já comprou | ✅ decidida (TM022): nunca automático — publicar nova versão não toca `TrainingLicense.versionId` de ninguém | TM022, TM044 (usam a decisão) | Produto (pode revisar) |
| **Q5** | Provedor de pagamento + política de preço/repasse/impostos/reembolso | ✅ **provedor decidido pelo usuário: Stripe** (Checkout Sessions, `mode=payment`). Documentação oficial consultada nesta sessão — ver §4.3. Política de preço/repasse/impostos ainda não definida por Produto; TM057/TM067 usam ledger configurável, sem percentual fixo no código. | TM059, TM067 | Engenharia (provedor); Produto (política de repasse) |
| **Q6** | Critérios de moderação de avaliações | ⬜ aberta | TM047 | Produto |
| **Q7** | `priceCents=null` (grátis) × `priceCents=0` (pago R$0) | ✅ decidida (TM003): `null`=grátis; `0` é estado inválido, rejeitado por CHECK de banco | TM038 (usa a decisão) | Produto (pode revisar) |
| **Q8** | Flag própria (`MARKETPLACE_ENABLED`) ou reaproveitar `SCHOOL_MODULE_ENABLED` | ✅ decidida (TM016): flag própria — comprador pode não ter vínculo escolar | — | Engenharia |

**Decisões de engenharia (Q1/Q7/Q8) foram tomadas dentro das próprias tasks de
schema/infra, com o raciocínio documentado no comentário da migration
correspondente — Produto pode revisar e pedir mudança, mas nada ficou
bloqueado esperando resposta.** Q5 (provedor) e Q2 (comprar × contratar)
foram decididas nesta sessão e destravaram o checkout pago (TM057–TM063).
Só **Q6** (critérios de moderação de avaliações) continua aberta; não
bloqueia nenhuma task pendente das Ondas 2/3 além da própria TM047, já
concluída com um default de engenharia documentado.

---

## 8. Histórico de sessões

| Data | Sessão | Entregue |
|---|---|---|
| 2026-09-23 | Verificação de código e especificação | Spec Kiro do Marketplace criada a partir de `RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md` v1.1, com 5 defeitos verificados por leitura direta do código (RF-001, RF-002, RF-005, RF-006, RF-007) e 88 tasks TM001–TM088 em 4 ondas. |
| 2026-09-23 | Onda 0 completa (17/17): segurança e fundação | TM001–TM017 todas [ ]→[x]. 2 defeitos de segurança P0 corrigidos (vazamento de catálogo, ordem compra→licença); 7 migrations de schema escritas e validadas (0036–0042: campos comerciais+XOR, imutabilidade de versão, checkout/idempotência, ativação/fuso+PAUSED/COMPLETED, proveniência de marketplace, LicenseCoachEngagement+PlanAdaptation, MarketplaceMedia+MarketplaceReview); `planPayloadSchema` v2 multimodal retrocompatível; calendário corrigido para fuso IANA do atleta (DST real testado); catálogo de erros, `architecture/modules/marketplace.yaml`, flag `MARKETPLACE_ENABLED` (Q8), seed estendido. Q1/Q7/Q8 decididas nas próprias tasks. 92 testes novos (2105 no total), `tsc --noEmit` limpo, GitNexus reindexado e `detect-changes` avaliado (risco `critical` por fan-out de `publicSchoolResponse`, mudança aditiva confirmada segura — ver §4.1). Migrations e seed escritos mas **não aplicados** ao banco remoto (inalcançável deste sandbox). |
| 2026-09-23 | Onda 1, três trilhas em paralelo (29/39): TM018–TM046 | TM018–TM046 todas [ ]→[x], implementadas por 3 agentes rodando simultaneamente (Trilha A: estúdio do professor; Trilha B: vitrine pública; Trilha C: aquisição grátis + calendário). Q3 e Q4 decididas (default de engenharia, documentado, sinalizado para Produto revisar). ~250 testes novos (2295 no total, 2215 passando — mesmas 2 falhas pré-existentes de sempre, zero regressão nova). Verificação independente pós-merge (não apenas relatório dos agentes): `tsc --noEmit` limpo, suíte completa rodada do zero, `prisma generate` limpo, `errors.ts` conferido campo a campo após edição concorrente por 2–3 agentes (sem colisão), `instantiate-license-calendar.ts` e a proteção de callback URL lidas e re-testadas diretamente. `detect-changes` continua `critical` (101 processos, era 75) — causa identificada e aceita: dois `layout.tsx` compartilhados + `WorkoutCard`/`app/entrar` tocados, todos com edições aditivas de baixo risco real (ver §4.2). |
| 2026-09-23 | Onda 1 concluída (38/39): TM047–TM056 | TM047–TM056 [ ]→[x], exceto TM054 [ ]→[!] (bloqueada, sem acesso a banco para a metade HTTP da auditoria). Avaliações (Q6 decidida: nasce APPROVED), `CustomizableCardGrid` com 3 superfícies novas (migration 0043 — nova coluna `UserProfile` por superfície, mesma convenção real do código, não um mecanismo genérico inventado), prova end-to-end em `/app/planos/[licenseId]`. Instrumentação (4 eventos), docs atualizadas, auditoria estática de rotas limpa, estados §13 auditados, E2E do fluxo grátis completo com verificação de não-duplicação. Verificação final: `tsc --noEmit` limpo, suíte completa 2238/2318 (mesmas 2 falhas pré-existentes + ruído de infraestrutura do sandbox sob carga, confirmado transiente ao rodar isoladamente), `prisma generate` limpo, `detect-changes` `critical` com a mesma causa já avaliada em §4.2 (fan-out estrutural de arquivos compartilhados, não risco comportamental real). **Onda 0 + Onda 1: 55/88 tasks, 1 bloqueada.** |
| 2026-09-24 | Onda 2 iniciada, checkout pago até a tela de status: TM057–TM063 | Q5 decidida pelo usuário (Stripe) e Q2 decidida na própria TM062 (destravaram o início da Onda 2 — ver §4.3 para as citações de documentação oficial). TM057–TM063 [ ]→[x]: migration `0044_seller_account_ledger` (renumerada de 0043, colisão com TM050 documentada), `assertProductPurchasable` (corrigiu gap real: nenhum dos dois caminhos de aquisição checava `SCHOOL_ONLY` antes), `CreateMarketplaceCheckout` estendida com provedor injetável e `offerSnapshot` congelado com preço do servidor, `StripePaymentProvider` (Checkout Sessions + verificação de assinatura de webhook), `ConfirmTrainingPurchaseFromWebhook` (segundo caminho da divisão D-02, idempotente, revalida evento contra o snapshot), `POST /api/marketplace/payment-webhook` (assinatura verificada antes de tocar o banco), `POST /api/marketplace/checkout` estendida para produto pago, e a tela `/marketplace/[idDoTreino]/checkout` (estado do servidor, nunca auto-ativa). 51 testes novos, `tsc --noEmit` limpo. Um bug de CSS (classe inexistente `theme-panel-info`) encontrado e corrigido antes de fechar a task. **Onda 0 + Onda 1 + Onda 2 parcial: 62/88 tasks, 1 bloqueada.** |
| 2026-09-24 | TM064/TM065/TM067 (Onda 2) + Onda 3 completa (TM072–088), em paralelo | TM064: reconciliação (`ReconcileMarketplacePayments`) via List Events oficial da Stripe (`delivery_success:false`, citado em código), reutilizando as mesmas classes idempotentes do webhook ao vivo; rota `POST/GET /api/marketplace/reconcile-payments` protegida por `MARKETPLACE_ADMIN_KEY` (mesmo padrão dos jobs Garmin/Strava). TM065: gap real corrigido — ação administrativa de reembolso agora grava `AdminAuditLog` (durável), não só um metric fire-and-forget. TM067: ledger de vendedor com taxa via env (`MARKETPLACE_PLATFORM_FEE_BPS`, nunca constante no código) e reversão de reembolso que espelha exatamente a venda original. Em paralelo, um segundo agente implementou as 17 tasks da Onda 3 (TM072–088: convite/aceite/ajuste/decisão/revogação de acompanhamento por outro professor, com precedência por modalidade RF-305) — **verificado independentemente antes de marcar concluído**, não apenas o relatório do agente: `enums.ts`/`metrics.ts` (editados por ambos concorrentemente) conferidos campo a campo sem colisão, reindex completo do GitNexus, `detect-changes --scope all` (`critical`, mesma causa já aceita em §4.1/4.2 — ver §4.4), `tsc --noEmit` limpo, suíte completa rodada do zero (2371 passando, só as 2 falhas pré-existentes já documentadas + 1 timeout transiente de infraestrutura confirmado ao isolar). **Onda 0 + Onda 1 + Onda 2 (10/15) + Onda 3 (17/17): 82/88 tasks, 1 bloqueada.** Restam só TM066 (UI de reembolso em `/app/planos/[licenseId]`), TM068 (painel financeiro), TM069 (testes de idempotência/concorrência dedicados), TM070 (teste de instrumentação sem PII) e TM071 (E2E de checkout pago). |
| 2026-09-24 | Onda 2 concluída (TM066/068/069/070/071) — spec inteira fechada exceto TM054 | TM066: o pill "Reembolsado" já existia desde a TM044 (`deriveLicenseState` mapeia `REVOKED→"refunded"`) e passou a acender sozinho assim que a TM065 desta sessão fez `RefundTrainingPurchase` setar `TrainingLicense.status=REVOKED`; só faltava um banner explicando o efeito sobre próximos treinos, adicionado. TM068: `GetProductLedgerSummary` (nova classe, deliberadamente separada de `GetProductSalesSummary`/TM023) soma `SellerLedgerEntry` de verdade — nunca `TrainingPurchase.pricePaid` — nova seção "Financeiro (ledger)" no estúdio do professor. TM069: `tests/marketplace-payment-idempotency.test.ts`, 4 cenários (dupla entrega de webhook, retry de checkout, cancelamento, navegador antes do webhook). TM070: `tests/marketplace-payment-metrics.test.ts`, com verificação por padrão de valor (não só por chave) para pegar segredo embutido em string. TM071: `tests/e2e-marketplace-paid-flow.test.ts` passando pela ROTA HTTP real do webhook com o pacote `stripe` mockado (verificação de assinatura genuinamente exercida) — achado confirmado e documentado, não corrigido (fora do escopo): `CreateTrainingPurchase` (aceita `paymentRef` livre do cliente, defeito que o design D-02 existe para eliminar) não é instanciado por nenhuma rota viva, confirmado por `impact` (GitNexus, `UNKNOWN`) seguido de busca textual — código morto pré-D-02, não um risco real em produção. Verificação final: `tsc --noEmit` limpo, reindex completo do GitNexus (17.544 nós/38.604 arestas), `detect-changes --scope all` ainda `critical` mas com a MESMA causa já aceita 4 vezes nesta sessão (ver §4.4) — 75 símbolos agora (era 102, cai conforme o resto do trabalho se estabiliza), nenhuma categoria nova. Suíte completa rodada do zero: 2401 passando, 87 puladas, só a mesma falha pré-existente já documentada (`view-models-multi-provider.test.ts`, confirmada determinística e não-relacionada ao reexecutar isolada) + ruído transiente de infraestrutura do sandbox sob carga (3 timeouts de 5s em arquivos não relacionados, incluindo o meu próprio `e2e-marketplace-paid-flow.test.ts` — todos confirmados verdes ao reexecutar isolados). **Spec completa: 87/88 tasks, só TM054 bloqueada (precisa de acesso real ao banco).** |

**Template para as próximas linhas:**

```text
| AAAA-MM-DD | <foco> | <tasks movidas: TMxxx [ ]→[x]> |
```
