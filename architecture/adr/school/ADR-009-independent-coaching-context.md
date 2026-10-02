# Escola ADR-009 — Contexto de acompanhamento independente e transferências

## Status

Aceito para implementação (SAM-30).

## Contexto

Um professor podia aceitar acompanhar um atleta sem escola (`CoachAthleteAssignment.schoolId` nulo), mas toda a jornada com o atleta (treinos, prescrição, ficha técnica, histórico, análise, avaliação) exigia escola ativa + professor membro + atleta matriculado, via `ResolveCoachAthleteContext`. O vínculo independente terminava numa lista de nomes.

## Decisão

1. **Escopo, não escola.** O portão aceita `string` (escola, forma original) ou `{ kind: "independent" }`, que resolve pelo vínculo independente ACTIVE do próprio professor. O período é o `startedAt` do vínculo; o fuso é o do atleta (`NotificationPreference.timezone`, senão o padrão da plataforma); não há turmas nem administrador.
2. **O escopo independente é sempre `{ schoolId: null, coachId }`.** `schoolId` nulo sozinho também casa sessões de licença do marketplace (`coachId` nulo), sessões auto-registradas e outros professores independentes. O escopo de escola continua exatamente `{ schoolId }`.
3. **Ficha técnica por relação.** Dentro da escola, `(schoolId, athleteId)`; fora dela, `(coachId, athleteId)` com `schoolId` nulo (índice único parcial, migração 0056). Um atleta pode ter dois professores independentes com fichas diferentes.
4. **Sem log de escola fora da escola.** Prescrição, ficha e avaliação independentes não auditam em `SchoolAuditLog` (mesma regra dos pedidos de acompanhamento); a trilha é o histórico da prescrição e as revisões da ficha.
5. **Transferência = fechar um período e abrir outro, sempre proposta pelo professor e confirmada pelo atleta.**
   - Independente → escola: notificação para o fluxo SAM-29 ("seguir professor"); a escola aprova; o aceite ativa o vínculo da escola e encerra o independente (`moved_with_coach`), inclusive quando é o próprio professor quem aceita.
   - Escola → independente: a proposta é um `CoachAthleteAssignment` PENDING independente aberto pelo professor com `reason = moved_from_school`. Só o atleta o ativa (`ConfirmTransferToIndependent`); o professor não aceita a própria proposta; propostas não aparecem como pedidos a decidir. Ao confirmar, os vínculos de escola do par encerram, a administração é avisada e **a matrícula do atleta na escola continua ACTIVE** (lobby, ADR-003).
6. **Um vínculo independente ACTIVE por par** `(athleteId, coachId)`, garantido no banco (migração 0056).

## Consequências e validação

Pedidos de alteração continuam exclusivos da escola (fora dela o canal é o comentário). Grants de histórico não mudam em nenhuma transferência (ADR-005). Telas de escola renderizam os mesmos screens com `{ kind: "school" }`; o comportamento de escola é coberto pelos testes existentes, e o independente por `tests/coach-athlete-independent-*.test.ts` e `tests/athlete-transfer.test.ts`.

## Referências

- `modules/school/application/coach-athlete-scope.ts`, `resolve-coach-athlete-context.ts`
- `modules/school/application/propose-athlete-transfer.ts`, `confirm-transfer-to-independent.ts`
- `prisma/migrations/0056_independent_coaching_context/migration.sql`
- ADR-002 (períodos), ADR-003 (lobby), ADR-005 (consentimento)
