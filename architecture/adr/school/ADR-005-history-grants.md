# Escola ADR-005 — Grants explícitos de histórico

## Status

Aceito para implementação (T001).

## Contexto

Estar atualmente vinculado não autoriza leitura automática de períodos anteriores.

## Decisão

Separar autorização operacional de acesso histórico. Grants concedidos pelo atleta identificam SCHOOL ou COACH, período, categorias e status. Toda query aplica filtros no backend antes de retornar dados.

## Consequências e validação

Categorias não autorizadas são omitidas; revogação encerra leitura futura sem apagar dados. IDs conhecidos e grants de outro contexto nunca concedem acesso.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
