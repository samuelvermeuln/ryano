# Escola ADR-007 — Desativação de escola

## Status

Aceito para implementação (T001).

## Contexto

Desativar uma organização deve retirar acesso operacional sem destruir sua origem histórica.

## Decisão

Transacionalmente inativar escola e encerrar memberships e assignments ativos, invalidando ingresso pendente e convites operacionais. Preservar todos os registros históricos. Treinos futuros ficam arquivados por desativação, consultáveis pelo próprio atleta.

## Consequências e validação

Reativação não reabre vínculos encerrados automaticamente. O proprietário continua podendo reativar a escola; novos períodos são explícitos. Registrar auditoria de cada alteração composta.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
