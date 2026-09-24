# Ryvano Marketplace de Planos de Treino — spec

Marketplace de planos de treino: professor publica, atleta descobre/compra/
adquire grátis, o plano vira calendário executável, e o atleta pode autorizar
**outro** professor a acompanhar essa instância — sem que a compra, sozinha,
crie qualquer vínculo de acompanhamento.

## Comece aqui

| Ordem | Arquivo | Para quê |
|---|---|---|
| **1** | [`STATUS.md`](STATUS.md) | **Onde o trabalho está.** O que foi feito, o que está em andamento, por onde retomar. |
| 2 | [`requirements.md`](requirements.md) | Requisitos normativos `RF-*` e `RNF-*`. |
| 3 | [`design.md`](design.md) | Decisões estruturais, ordem de implementação e riscos. |
| 4 | [`task-list.md`](task-list.md) | **Estado persistente.** Protocolo de marcação e as 88 tasks. |
| — | [`../../../RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md`](../../../RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md) | Fluxos completos, DDL proposto, contratos HTTP, telas, critérios de aceite. |

## Retomar trabalho

```bash
# 1. Onde parou
cat .kiro/specs/ryvano-marketplace-planos-treino/STATUS.md

# 2. Trabalho interrompido — SEMPRE antes de iniciar algo novo
grep -n "^## \[~\]" .kiro/specs/ryvano-marketplace-planos-treino/task-list.md

# 3. Estado consistente?
bash .kiro/specs/ryvano-marketplace-planos-treino/check-status.sh
```

## Antes de commitar

```bash
bash .kiro/specs/ryvano-marketplace-planos-treino/check-status.sh
npx tsc --noEmit && npx vitest run
node .gitnexus/run.cjs detect-changes --scope all --repo .
```

O `check-status.sh` compara `STATUS.md` com `task-list.md` e valida o grafo de
dependências. Ele existe pelo mesmo motivo do de `ryvano-jornada-escola`: no spec
anterior a esse (`ryvano-escola-spec`), oito tasks ficaram marcadas como
pendentes depois de entregues — quem confiasse naquele estado refaria trabalho
pronto.

## Estado atual

```text
Onda 0 (TM001–TM017)  segurança e fundação       17/17 ✅
Onda 1 (TM018–TM056)  produto sem pagamento real  39/39 ✅
Onda 2 (TM057–TM071)  venda paga                  15/15 ✅
Onda 3 (TM072–TM088)  acompanhamento              17/17 ✅
Total                                           88/88 ✅

Em andamento: nenhuma
Bloqueada:    nenhuma
Próxima:      nenhuma — spec-kit completo. Migrations 0036–0044 aplicadas ao banco real; auditoria HTTP de acesso concluída.
```

✅ **RF-001 e RF-002 — os dois defeitos de segurança P0 — foram corrigidos
(TM001, TM002)**, com teste e `tsc` verdes. O catálogo público não aceita mais
`status`/`visibility` do cliente; compra e licença são criadas sequencialmente.

⚠️ **Migrations 0036–0042 estão escritas e validadas, mas não aplicadas ao
banco** — o Postgres remoto não é alcançável a partir do ambiente onde a Onda
0 foi implementada. Ver `STATUS.md` §1 antes de continuar.

## Relação com as specs anteriores

`ryvano-escola-spec` cobre T000–T407. `ryvano-jornada-escola` cobre T500–T547 e
reserva T550+ (não detalhado) para sua própria Onda 2. Este spec usa **TM001–TM088**
— nenhuma sobreposição de ID com nenhuma das duas. `TrainingProduct`,
`TrainingPurchase`, `TrainingLicense` e `WorkoutAssignment` já existem
(T400–T406); esta spec evolui esse schema, não o recria.
