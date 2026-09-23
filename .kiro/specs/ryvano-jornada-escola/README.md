# Ryvano Jornada Escola — spec

Evolução da área da escola: turmas na visão administrativa, correção de defeitos
verificados na base e o MVP da Jornada (meta → marcos → plano → revisão).

## Comece aqui

| Ordem | Arquivo | Para quê |
|---|---|---|
| **1** | [`STATUS.md`](STATUS.md) | **Onde o trabalho está.** O que foi feito, o que está em andamento, por onde retomar. |
| 2 | [`requirements.md`](requirements.md) | Requisitos normativos `RF-*` e `RNF-*`. |
| 3 | [`design.md`](design.md) | Decisões estruturais, ordem de implementação e riscos. |
| 4 | [`task-list.md`](task-list.md) | **Estado persistente.** Protocolo de marcação e as 49 tasks. |
| — | [`../../../docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md`](../../../docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md) | DDL, contratos HTTP, telas, critérios de aceite. |

## Retomar trabalho

```bash
# 1. Onde parou
cat .kiro/specs/ryvano-jornada-escola/STATUS.md

# 2. Trabalho interrompido — SEMPRE antes de iniciar algo novo
grep -n "^## \[~\]" .kiro/specs/ryvano-jornada-escola/task-list.md

# 3. Estado consistente?
bash .kiro/specs/ryvano-jornada-escola/check-status.sh
```

## Antes de commitar

```bash
bash .kiro/specs/ryvano-jornada-escola/check-status.sh
npx tsc --noEmit && npx vitest run
```

O `check-status.sh` compara `STATUS.md` com `task-list.md` e valida o grafo de
dependências. Ele existe porque, no spec anterior, oito tasks ficaram marcadas como
pendentes depois de entregues — quem confiasse naquele estado refaria trabalho pronto.

## Estado atual

```text
Onda 0 (T500–T519)  base operacional   0/20
Onda 1 (T520–T547)  jornada            0/29
Total                                  0/49

Em andamento: nenhuma
Próxima:      T500 — Migration 0035: campos de Team
```

⚠️ **Q4 precisa ser decidida dentro da T501.** Em Postgres, `NULL` não colide com
`NULL` em índice único: sem índice parcial ou sentinela, a unicidade de
`DashboardLayoutPreference` não protege a superfície pessoal.

## Relação com o spec anterior

`.kiro/specs/ryvano-escola-spec/` cobre T000–T407 (303 concluídas). Este spec continua
a partir de **T500**. Pendências herdadas que importam: **T110** está `[!]` e é
pré-requisito de **T318** (exposição de histórico) — não bloqueia as Ondas 0 e 1
daqui, mas bloqueia a Onda 3.
