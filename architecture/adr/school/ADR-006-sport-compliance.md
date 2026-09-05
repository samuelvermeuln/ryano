# Escola ADR-006 — Compliance por modalidade

## Status

Aceito para implementação (T001).

## Contexto

Esportes possuem estruturas, unidades e métricas diferentes.

## Decisão

Usar estratégias selecionadas pelo RyvanoSportType canônico, com versão do algoritmo persistida e detalhes dos scores. Métrica ausente não é zero nem sucesso. Ryvano Score permanece separado de avaliação do coach e feedback.

## Consequências e validação

Recalcular deve preservar trilha da versão anterior. O adapter lê atividades persistidas normalizadas sem consultar providers.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
