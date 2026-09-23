# Ryvano Jornada Escola — Design técnico

**Spec:** `ryvano-jornada-escola` · **Base verificada:** `998c5bf`

> **Fonte única do detalhe.** O DDL completo, os contratos HTTP e o design system
> estão em `docs/RYVANO_JORNADA_ESCOLA_SPEC_V1.md`. Este arquivo mapeia **onde**
> cada decisão vive e registra as escolhas estruturais, para não haver duas versões
> do mesmo contrato divergindo com o tempo.

| Preciso de… | Ler |
|---|---|
| DDL Prisma completo + back-relations | spec de produto §8 |
| Contratos HTTP, Zod, códigos de erro | spec de produto §9 |
| Telas, navegação, design system | spec de produto §5 e §6 |
| Máquinas de estado | spec de produto §7 |
| Matriz de autorização | `requirements.md` RNF-001 |
| Critérios de aceite | spec de produto §12 |

---

# 1. Posicionamento na arquitetura

A jornada é uma **extensão do módulo escola**, não um módulo novo.

```text
modules/school/
  domain/        journey.ts, journey-milestone.ts, journey-state.ts  (novo)
  application/   create-journey.ts, propose-journey-milestones.ts, ...  (novo)
  infrastructure/  schoolLogger, schoolMetrics  (reusar)

app/api/journeys/**          rotas de jornada (novo)
app/api/schools/[id]/teams/**      rotas de turma (novo — fecha D2)
app/api/schools/[id]/attention/**  fila de atenção (novo)
```

**Por que dentro de `school` e não em `modules/journey`:** a jornada depende de
`SchoolAthleteMembership`, `CoachAthleteAssignment`, `WorkoutAssignment` e
`HistoryAccessGrant` — todos do módulo escola. Um módulo separado criaria
dependência circular ou duplicaria as regras de vínculo. A ADR-001
(atleta é dono do histórico) já vive ali.

---

# 2. Decisões estruturais

## D-01 — A jornada referencia treinos, nunca os copia

`JourneyAssignmentLink` aponta para `WorkoutAssignment` existente.

**Alternativa rejeitada:** guardar os treinos do plano dentro da jornada. Criaria
uma segunda verdade sobre execução, e `WorkoutExecution`, matching e compliance
já resolvem isso. Duas fontes divergiriam no primeiro reagendamento.

**Consequência:** a jornada **não funciona** sem prescrição. É intencional — ela
organiza o trabalho existente, não o substitui.

## D-02 — Check-in é sinal subjetivo, isolado do compliance

`JourneyCheckIn` é tabela separada, sem relação com `WorkoutExecution`.

**Por quê:** um atleta dizer "consegui" não é evidência de execução. Misturar os
dois corromperia o compliance e produziria número que parece medido mas é
autorrelato. A separação física torna o erro difícil de cometer.

## D-03 — Timeline com DTO próprio, separada do audit log

`JourneyEvent` tem `visibility` (`ATHLETE` | `SCHOOL` | `BOTH`).

**Por quê:** `SchoolAuditLog` é rastro técnico — payload, ator, antes/depois. Expor
isso ao atleta vazaria estrutura interna e texto incompreensível. São públicos e
propósitos diferentes.

## D-04 — `expectedVersion` nas entidades com decisão concorrente

`AthleteJourney` e `JourneyMilestone` têm `version`.

**Por quê:** professor e atleta podem agir ao mesmo tempo sobre o mesmo marco.
Sem controle, a última escrita vence silenciosamente e apaga a decisão do outro.
409 é melhor do que perda silenciosa.

## D-05 — Fila de atenção com `dedupeKey` único

`@@unique([dedupeKey])` em `JourneyAttentionItem`.

**Por quê:** o gerador roda periodicamente e o mesmo fato seria redescoberto a cada
execução. A unicidade no banco garante idempotência mesmo com concorrência —
não depende de o job checar antes de inserir.

**Em aberto (Q3):** materializar ou derivar por consulta. Decidir por volume medido.

## D-06 — Layout em tabela própria, não em `UserProfile`

`DashboardLayoutPreference` com `@@unique([userId, schoolId, surface])`.

**Por quê:** `UserProfile.dashboardLayoutOrder` é chave única por usuário. Reusá-la
faria o painel da Escola A sobrescrever o da Escola B e o dashboard pessoal.

**⚠️ Em aberto (Q4) — decidir DENTRO da T501:** em Postgres, `NULL` não colide com
`NULL` em índice único. Com `schoolId = null` (superfície pessoal), o `@@unique`
**não protege**. Opções: índice parcial na migration SQL, ou sentinela não nula.
Se ninguém decidir, a migration entrega unicidade que não funciona no caso pessoal —
e o bug só aparece depois.

## D-07 — Correção no componente compartilhado, não um fork

Acessibilidade e tema do `CustomizableCardGrid` (D7) são corrigidos **nele**.

**Por quê:** é usado por dashboard do atleta, atividades e integrações. Um segundo
grid duplicaria o defeito e dobraria a manutenção. A correção beneficia as telas
que já existem.

**Risco:** mudança de blast radius alto. Rodar impacto no GitNexus antes e verificar
as três telas consumidoras depois.

## D-08 — Rotas de turma são adaptadores finos

Os casos de uso já existem em `manage-team.ts` e estão testados. As rotas só
autenticam, validam e delegam.

**Por quê:** a lacuna (D2) é de exposição, não de lógica. Reimplementar regra na
rota criaria divergência com o caso de uso.

---

# 3. Ordem de implementação e o porquê

```text
Onda 0 ─ Turmas + correções (T500–T519)
   │      Independente da jornada. Entrega valor sozinha.
   │      Corrige D1–D7, que são defeitos reais hoje.
   ▼
Onda 1 ─ Jornada
   │  schema (T520–T523b)
   │      ▼
   │  domínio + máquinas de estado (T524–T525)
   │      ▼
   │  casos de uso (T526–T535)
   │      ▼
   │  API (T536–T539)
   │      ▼
   │  telas (T540–T544)
   │      ▼
   │  observabilidade e docs (T545–T547)
   ▼
Onda 2 ─ Operação escolar (T550+) — detalhar só após Onda 1 aceita
```

**Onda 0 antes da Onda 1** porque: (a) são defeitos que já afetam usuários hoje;
(b) a jornada precisa de turmas funcionando; (c) T510–T512 corrigem o grid que o
painel de jornada vai reusar. Inverter a ordem construiria sobre base quebrada.

**Schema antes de domínio, domínio antes de caso de uso** porque as máquinas de
estado precisam dos enums, e os casos de uso precisam das transições validadas.

---

# 4. Pontos de integração com o que já existe

| Integração | Cuidado |
|---|---|
| `WorkoutAssignment` | Só referenciar. Validar mesmo atleta+escola antes de vincular. |
| `WorkoutExecution` / `WorkoutCompliance` | Somente leitura. Check-in **não** entra no cálculo. |
| `CoachAthleteAssignment` | Fonte da verdade sobre "coach atribuído". Reusar `AssignCoachToAthlete` / `ChangeAthleteCoach`. |
| `HistoryAccessGrant` | Aceitar jornada **não** cria grant. Consentimentos distintos. |
| `SchoolAuditLog` | Mesma transação da mudança de estado. |
| `CustomizableCardGrid` | Corrigir nele; não clonar. Blast radius alto. |
| `schoolResponse` | Envelope obrigatório das rotas novas. |
| `SCHOOL_ERROR_STATUS` | Estender o catálogo; não inventar status na rota. |

---

# 5. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Mudar `CustomizableCardGrid` quebra dashboard/atividades/integrações | Alto | Impacto no GitNexus antes; verificar as 3 telas depois; sem fork. |
| `@@unique` com `schoolId` nulo não protege (Q4) | Médio, silencioso | Decidir na T501; testar o caso pessoal explicitamente. |
| Check-in vazar para o compliance | Alto — corrompe métrica | Tabela separada (D-02) + teste explícito de não interferência (AC-1.7). |
| Rota nova sem guard próprio | Alto — vazamento | RNF-001; `audit-access.sh` nos três perfis. |
| Fila de atenção duplicar alertas | Médio — ruído mata a fila | `dedupeKey` único; testar reprocessamento. |
| Spec envelhecer em relação ao código | Médio | §2.1 da spec tem commit-base; reconfirmar D1–D7 antes de implementar. |

---

# 6. Verificação

| Portão | Comando | Critério |
|---|---|---|
| Tipos | `npx tsc --noEmit` | 0 erros |
| Testes | `npx vitest run` | verde |
| Schema | `npx prisma validate` | válido |
| Rotas | `bash .agents/skills/ryvano-telas/scripts/audit-routes.sh` | sem 404 linkado |
| Acesso | `bash .agents/skills/ryvano-telas/scripts/audit-access.sh` | bate com RNF-001 |
| Grafo | `node .gitnexus/run.cjs detect-changes --scope all --repo .` | sem impacto cruzado inesperado |

**Obrigatórios por tipo de mudança:** transição de estado (caminho feliz **e** cada
transição inválida rejeitada); autorização (uma por linha da matriz, incluindo o
caso negativo); idempotência (executar duas vezes, efeito único); concorrência
(`expectedVersion` obsoleto → 409); fuso (janelas em fuso positivo e negativo).

> **Armadilha do Next dev:** Server Component pode responder 200 com meta refresh em
> vez de 3xx. O `audit-access.sh` já interpreta isso — não concluir "rota
> desprotegida" só pelo código de status.
