# Escola ADR-004 — Snapshots de prescrição

## Status

Aceito para implementação (T001).

## Contexto

Templates evoluem, prescrições históricas não podem mudar silenciosamente.

## Decisão

Guardar snapshot_payload e template_version na prescrição concreta. Mudanças relevantes em treino atribuído geram nova versão e histórico de alteração, preservando autor e origem anteriores.

## Consequências e validação

Cancelamento, substituição e reagendamento não apagam versões. Testes verificam que editar template não altera treino atribuído.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
