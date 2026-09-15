# Escola ADR-003 — Lobby derivado

## Status

Aceito para implementação (T001).

## Contexto

Uma lista persistida separada poderia divergir dos vínculos reais.

## Decisão

Derivar lobby de atletas ativos na escola sem assignment ativo naquele contexto. Remover coach encerra seus assignments na mesma transação, sem remover os atletas.

## Consequências e validação

Último coach e data de entrada no lobby vêm dos períodos encerrados ou início do membership; consultas paginadas e ordenação estável.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
