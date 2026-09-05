# Escola ADR-002 — Vínculos temporais

## Status

Aceito para implementação (T001).

## Contexto

Relacionamentos podem terminar e retornar.

## Decisão

Modelar memberships e coach assignments como entidades com status, startedAt e endedAt. Retorno cria novo período; não reabre nem sobrescreve o período encerrado. Índices únicos parciais impedem vínculos ativos equivalentes.

## Consequências e validação

Transações encerram e criam períodos atomicamente. PENDING não concede acesso e o início efetivo só ocorre na aprovação.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
