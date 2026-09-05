# Escola ADR-001 — Histórico esportivo pertence ao atleta

## Status

Aceito para implementação (T001).

## Contexto

O atleta pode mudar de escola e treinador sem perder a identidade esportiva.

## Decisão

Reutilizar User.id como athleteId e Activity como atividade persistida. Escola fornece contexto, não propriedade. Nenhuma transferência copia ou move o histórico. Autoria e escola de origem permanecem vinculadas ao registro.

## Consequências e validação

FKs históricas usam Restrict; desligamentos alteram status/períodos. Exclusão legal de dados é uma política distinta, não uma consequência do vínculo.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
