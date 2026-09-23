# STATUS — Ryvano Jornada Escola

> **Este é o primeiro arquivo a ler ao iniciar uma sessão.** Ele responde: onde o
> trabalho estava, o que já foi feito, o que está em andamento e por onde retomar.
>
> **Regra:** quem alterar o estado de qualquer task atualiza este arquivo **na mesma
> entrega**. Um STATUS desatualizado é pior do que nenhum, porque a próxima sessão
> confia nele e retrabalha ou pula etapa.

---

## 1. Retomada rápida

**Estado atual:** `NÃO INICIADO — aguardando decisão Q1`

```text
Fase atual .......... Onda 0 (base operacional)
Task em andamento ... nenhuma ([~] = 0)
Próxima task ........ T500 — Migration 0035: campos de Team
Bloqueios ........... nenhum bloqueio técnico
Decisão pendente .... Q4 precisa ser decidida DENTRO da T501
```

### Comandos de retomada

```bash
# 1. Estado do repositório
git status && git --no-pager log --oneline -5

# 2. Procurar trabalho interrompido — SEMPRE antes de iniciar algo novo
grep -n "^## \[~\]" .kiro/specs/ryvano-jornada-escola/task-list.md   # em andamento
grep -n "^## \[!\]" .kiro/specs/ryvano-jornada-escola/task-list.md   # bloqueadas

# 3. Ler contexto (nesta ordem)
#    requirements.md -> design.md -> task-list.md -> docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md

# 4. Confirmar que os defeitos D1-D7 ainda são reais (a base pode ter mudado)
bash .agents/skills/ryvano-telas/scripts/audit-routes.sh

# 5. Portões de verificação
npx tsc --noEmit && npx vitest run
```

> **Nunca assumir que uma task `[~]` está concluída só porque existe código.**
> Ler o bloco `Implementation Notes` da task antes de continuar.

---

## 2. Onde estava — a base de partida

| Item | Valor |
|---|---|
| Commit-base da análise | `998c5bf` (`main`) |
| Spec de produto | `docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md` v1.1 (commit `c14b255`) |
| Spec Kiro anterior | `.kiro/specs/ryvano-escola-spec/` — T000–T407 |
| Última migration | `0034_workout_requests` → próxima é **0035** |
| Maior task ID em uso | `T407` → este spec começa em **T500** |

### Situação do spec anterior (`ryvano-escola-spec`)

| Estado | Qtd | Observação |
|---|---|---|
| `[x]` concluída | 303 | Inclui T316 e T360–T366, corrigidos nesta sessão (ver §5). |
| `[ ]` pendente | 6 | T318, T369–T372, T407. |
| `[!]` bloqueada | 3 | T094, T110, T117. |
| `[~]` em andamento | 0 | Nenhum trabalho interrompido. |

**Pendências herdadas que importam para este spec:**

- **T318** (revisar exposição de histórico) depende de **T110**, que está `[!]`. Isso
  **não bloqueia** a Onda 0 nem a Onda 1 daqui, mas é pré-requisito antes de
  ampliar leitura de histórico entre organizações (Onda 3).
- **T369–T372** são ativação em staging/produção do módulo escola — infraestrutura,
  não código.

---

## 3. O que foi feito

### ✅ Concluído nesta sessão

| Entrega | Commit | Resultado |
|---|---|---|
| Spec de produto v1.1 | `c14b255` | 321 → 1064 linhas. 7 defeitos verificados com arquivo:linha; DDL validado com `prisma validate`; contratos HTTP; matriz de autorização; critérios de aceite; backlog T500–T547. |
| Registro de memória | `ab151a1` | Defeitos e convenções em `.openhands/memory/2026-09-23.md`. |
| Correção de status | *esta entrega* | T316 e T360–T366 estavam `[ ]` mas foram entregues em `35396c9`. Ver §5. |
| Spec Kiro da Jornada | *esta entrega* | `requirements.md`, `design.md`, `task-list.md`, `STATUS.md`, `spec.json`. |

### ⬜ Não iniciado

Nenhuma task de implementação (T500+) foi começada. **Não existe código de jornada
ou de turmas administrativas no repositório.**

---

## 4. O que está sendo feito

```text
Nenhuma task em andamento.
```

Quando uma task for iniciada, este bloco deve conter:

```text
Task ......... T5xx — título
Iniciada em .. AAAA-MM-DD
Arquivos ..... lista dos arquivos tocados até agora
Falta ........ o que ainda não foi feito
Próximo passo  a ação imediata ao retomar
```

---

## 5. Correção de estado aplicada

Auditoria do `ryvano-escola-spec/task-list.md` contra o código encontrou **8 tasks
marcadas como pendentes que já estavam entregues**. O commit `35396c9`
("T316/T360-T367 — indexes, docs, seed, migration checklist, rollback plan")
implementou o trabalho, mas o task-list não foi atualizado junto.

| Task | Era | Virou | Evidência no repositório |
|---|---|---|---|
| T316 | `[ ]` | `[x]` | `prisma/migrations/0029_t316_indexes/` |
| T360 | `[ ]` | `[x]` | `architecture/ryvano-escola-integration.md` e demais docs |
| T361 | `[ ]` | `[x]` | `architecture/escola-endpoints.md` |
| T362 | `[ ]` | `[x]` | `architecture/escola-domain-events.md` |
| T363 | `[ ]` | `[x]` | `architecture/escola-permission-rules.md` |
| T364 | `[ ]` | `[x]` | `prisma/seed.ts` + script `db:seed` no `package.json` |
| T365 | `[ ]` | `[x]` | `architecture/escola-migration-checklist.md` |
| T366 | `[ ]` | `[x]` | `architecture/escola-rollback-plan.md` |

> **Lição registrada:** marcar o task-list na **mesma entrega** que o código. Um
> agente que confiasse no estado anterior teria reimplementado sete documentos de
> arquitetura e uma migration que já existiam.

**Não alterei** T318, T369–T372, T407, T094, T110 e T117: esses continuam
legitimamente pendentes ou bloqueados.

---

## 6. Mapa de progresso — este spec

### Onda 0 — base operacional (T500–T519)

Corrige os defeitos D1–D7 verificados. **Entrega valor sozinha**, sem depender de jornada.

```text
Migration/schema   [ ] T500  [ ] T501
Erros/domínio      [ ] T502  [ ] T503  [ ] T504
API de turmas      [ ] T505  [ ] T506  [ ] T507
Telas de turmas    [ ] T508  [ ] T509
Grid compartilhado [ ] T510  [ ] T511  [ ] T512
Métricas corretas  [ ] T513  [ ] T514  [ ] T515
Painel + lobby     [ ] T516  [ ] T517
Docs e seed        [ ] T518  [ ] T519

Progresso: 0/20
```

### Onda 1 — jornada (T520–T547)

```text
Migration/schema   [ ] T520  [ ] T521  [ ] T522  [ ] T523  [ ] T523b
Domínio            [ ] T524  [ ] T525
Casos de uso       [ ] T526  [ ] T527  [ ] T528  [ ] T529  [ ] T530
                   [ ] T531  [ ] T532  [ ] T533  [ ] T534  [ ] T535
API                [ ] T536  [ ] T537  [ ] T538  [ ] T539
Telas              [ ] T540  [ ] T541  [ ] T542  [ ] T543  [ ] T544
Observabilidade    [ ] T545
Docs e seed        [ ] T546  [ ] T547

Progresso: 0/29
```

**Total geral: 0/49 tasks concluídas.**

### Onda 2 — operação escolar (T550+)

Não detalhada. Só planejar depois que a Onda 1 estiver aceita.

### Grafo de dependências (validado)

Sem ciclos. Cadeia mais longa: 7 níveis (termina em T546).

**Tasks sem dependência — podem começar em paralelo hoje:**

```text
T500  Migration 0035: campos de Team          (destrava quase toda a Onda 0)
T502  Códigos de erro de turma
T510  Acessibilidade do grid                  (risco alto: rodar impacto antes)
T513  Corrigir contagem de solicitações       (fecha D4 sozinha)
T514  Contagem agregada de atrasados          (fecha D5 parte 1)
T517  Atribuir professor no lobby
T520  Migration 0036: enums de jornada        (só após Onda 0 aceita)
```

**Caminho crítico da Onda 0:** `T500 → T503 → T505/T506 → T508` (tela de turmas).
**Ganho mais rápido:** T513 fecha o D4 sem depender de nada.

---

## 7. Decisões que precisam de resposta

Detalhamento em `docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md` §15.2.

| # | Decisão | Trava qual task? | Dono |
|---|---|---|---|
| **Q4** | `DashboardLayoutPreference` com `schoolId` nulo: índice parcial ou sentinela? | **T501 — decidir DENTRO da migration** | Engenharia |
| **Q3** | `JourneyAttentionItem` materializado ou derivado por consulta? | T523, T534 | Engenharia |
| **Q1** | Escola piloto é remota, presencial ou ambas? | Ordena a Onda 2 | Produto |
| **Q2** | Metas pessoais sem escola entram no MVP? | Escopo de T526, T540 | Produto |
| **Q6** | Permissão financeira: `SchoolRole` novo ou flag? | T580 (Onda 2) | Engenharia |
| **Q5** | Provedor de pagamento | Onda 2 | Produto + engenharia |

**Q4 é a mais urgente:** Postgres não trata `NULL` como colisão em índice único.
Se ninguém decidir, a T501 entrega uma unicidade que não protege o caso pessoal —
e o bug só aparece depois, em produção.

---

## 8. Histórico de sessões

| Data | Sessão | Entregue | Commits |
|---|---|---|---|
| 2026-09-23 | Análise e especificação | Spec de produto v1.1 verificada contra o código; auditoria e correção do task-list anterior; spec Kiro da Jornada criada. | `c14b255`, `ab151a1`, + esta entrega |

**Template para as próximas linhas:**

```text
| AAAA-MM-DD | <foco> | <tasks movidas: T5xx [ ]→[x]> | <commits> |
```
