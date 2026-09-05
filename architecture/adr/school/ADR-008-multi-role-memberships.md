# Escola ADR-008 — Múltiplos papéis por membro

## Status

Aceito para implementação (T001).

## Contexto

Um administrador também pode treinar atletas, mas gestão e acompanhamento não são a mesma permissão.

## Decisão

SchoolMembershipRole permite vários papéis com unique membershipId/role. Não reutilizar Role.ADMIN global como administração escolar. A gestão exige membership ativo na escola e OWNER/ADMIN; prescrição e avaliação exigem permissão esportiva e contexto válido.

## Consequências e validação

Remover papéis revoga permissões futuras. Não permitir retirada do último OWNER nem manipulação do proprietário por outro membro. Papel COACH isolado não substitui vínculo coach-school ou assignment de atleta.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
