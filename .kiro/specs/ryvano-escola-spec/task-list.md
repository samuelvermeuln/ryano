# Ryvano Escola — Task List de Implementação

**Arquivo:** `task-list.md`  
**Módulo:** Escola  
**Base:** `required.md` + `design.md`  
**Status:** Plano de execução inicial  
**Objetivo:** transformar os requisitos e o design técnico em uma sequência implementável, com dependências, ordem, critérios de conclusão, testes e oportunidades de paralelismo.

---


# 0. Protocolo obrigatório de execução por LLM/agente

Este arquivo também é o **estado persistente da implementação**.

Qualquer LLM/agente que implemente esta feature DEVE atualizar os checkboxes deste arquivo no próprio repositório.

## Estados permitidos

```text
[ ] PENDENTE
[~] EM ANDAMENTO
[x] CONCLUÍDA
[!] BLOQUEADA
```

### Regra de transição

```text
[ ] → [~] → [x]
```

Se houver impedimento real:

```text
[ ] ou [~] → [!]
```

Nunca utilizar `[x]` para uma task apenas iniciada.

## Antes de iniciar qualquer task

O agente deve:

1. ler `required.md`;
2. ler `design.md`;
3. ler este `task-list.md`;
4. verificar o estado atual do Git;
5. procurar primeiro qualquer task `[~]`;
6. se existir task `[~]`, retomar essa task antes de iniciar outra;
7. se não existir, selecionar a primeira task `[ ]` cujas dependências estejam `[x]`;
8. mudar a task para `[~]` **antes de alterar código**;
9. salvar `task-list.md`.

## Durante a implementação

O agente deve:

- respeitar integralmente `required.md`;
- respeitar integralmente `design.md`;
- não pular dependências;
- não iniciar task dependente de uma task que não esteja `[x]`;
- executar testes relevantes;
- atualizar documentação quando a task exigir;
- evitar alterações fora do escopo da task atual;
- registrar decisões arquiteturais novas em ADR quando necessário.

## Quando a task estiver concluída

Somente mudar:

```text
[~] → [x]
```

quando:

- implementação estiver concluída;
- build aplicável passar;
- lint aplicável passar;
- testes da task passarem;
- critérios de conclusão da task forem atendidos;
- não existirem TODOs necessários para considerar a task finalizada.

Depois:

1. salvar o `task-list.md`;
2. seguir para a próxima task desbloqueada.

## Quando créditos, tokens ou contexto estiverem acabando

O agente NÃO deve marcar a task como `[x]`.

Deve:

1. manter a task como `[~]`;
2. deixar o código em estado consistente sempre que possível;
3. registrar no bloco `Implementation Notes` da task:
   - o que já foi feito;
   - o que falta;
   - arquivos alterados;
   - testes executados;
   - erros ou decisões pendentes;
4. salvar `task-list.md`;
5. encerrar.

A próxima LLM deverá localizar a task `[~]`, ler as notas e continuar dela.

## Task bloqueada

Usar `[!]` somente quando existir um bloqueio real, como:

- dependência externa indisponível;
- requisito contraditório;
- migration impossível sem decisão;
- API necessária inexistente;
- dependência do projeto quebrada.

Adicionar imediatamente abaixo da task:

```text
**Blocker:** descrição objetiva do bloqueio.
```

Uma task bloqueada não autoriza pular suas dependências e implementar partes incompatíveis.

## Implementation Notes

Cada task pode receber, ao final de seu bloco:

```text
### Implementation Notes

- Estado atual:
- Arquivos alterados:
- Implementado:
- Falta:
- Testes executados:
- Observações:
```

Esse bloco deve ser usado principalmente para tasks `[~]` ou `[!]`.

## Regra de retomada

Ao iniciar uma nova sessão:

```text
1. git status
2. procurar "[~]" em task-list.md
3. procurar "[!]" em task-list.md
4. ler required.md
5. ler design.md
6. entender diff atual
7. rodar testes relacionados
8. continuar a task [~]
```

Nunca assumir que uma task `[~]` está concluída apenas porque existe código implementado.


# 1. Como usar este documento

Cada task possui:

- **ID**
- **Título**
- **Tipo**
- **Prioridade**
- **Dependências**
- **Pode rodar em paralelo**
- **Áreas afetadas**
- **Descrição**
- **Entregáveis**
- **Testes**
- **Critério de conclusão**

A regra geral é:

> Nenhuma task deve ser iniciada antes de suas dependências estarem concluídas.

---

# 2. Legenda

## Tipo

```text
ARCH      Arquitetura
DB        Banco / Migration
BE        Backend
FE        Frontend
TEST      Testes
DOC       Documentação
SEC       Segurança
OBS       Observabilidade
INT       Integração
DATA      Dados / migração
```

## Prioridade

```text
P0  Bloqueadora
P1  Alta
P2  Média
P3  Futuro
```

---

# 3. Fases macro

```text
Fase 0  Preparação e validação do projeto
Fase 1  Fundação do domínio Escola
Fase 2  Memberships, papéis e autorização
Fase 3  Professores, atletas e vínculos
Fase 4  Lobby, transferências e convites
Fase 5  Histórico compartilhado
Fase 6  Treinos e templates
Fase 7  Execução e matching
Fase 8  Compliance
Fase 9  Avaliação e feedback
Fase 10 Frontend administrativo
Fase 11 Frontend professor
Fase 12 Frontend atleta
Fase 13 Auditoria, observabilidade e hardening
Fase 14 Testes de integração e E2E
Fase 15 Rollout
Fase 16 Futuro / Marketplace
```

---

# 4. Ordem crítica resumida

```text
T000
 ↓
T010–T019
 ↓
T020–T039
 ↓
T040–T059
 ↓
T060–T079
 ↓
T080–T099
 ↓
T100–T119
 ↓
T120–T139
 ↓
T140–T159
 ↓
T160–T189
 ↓
T190–T219
 ↓
T220–T249
 ↓
T250+
```

---

# FASE 0 — PREPARAÇÃO

## [x] T000 — Revisar arquitetura existente da Ryvano

**Tipo:** ARCH  
**Prioridade:** P0  
**Dependências:** nenhuma  
**Paralelo:** não  
**Áreas:** repositório inteiro

### Descrição

Validar antes de criar o módulo:

- estrutura atual de módulos;
- ORM utilizado;
- padrão de migrations;
- padrão de services;
- padrão de controllers/routes;
- autenticação;
- autorização;
- entidade de usuário;
- entidade de atleta;
- modelo normalizado de atividades;
- sistema de eventos;
- logger;
- testes;
- naming conventions.

### Entregáveis

- mapa dos pontos de integração;
- lista de entidades existentes a reutilizar;
- decisão de nomes reais de tabelas/classes.

### Testes

Nenhum.

### Conclusão

Nenhuma entidade nova é criada antes desta análise.

---

## [x] T001 — Criar ADRs iniciais

**Tipo:** DOC / ARCH  
**Prioridade:** P1  
**Dependências:** T000  
**Paralelo:** sim

Criar:

```text
ADR-001 Athlete owns sports history
ADR-002 Temporal memberships
ADR-003 Derived lobby
ADR-004 Workout snapshot strategy
ADR-005 History access grants
ADR-006 Compliance strategy by sport
ADR-007 School deactivation behavior
ADR-008 Multi-role school membership
```

### Conclusão

ADRs versionados no repositório.

---

## [x] T002 — Criar estrutura física dos módulos

**Tipo:** ARCH  
**Prioridade:** P0  
**Dependências:** T000  
**Paralelo:** sim

Criar estrutura compatível com o projeto:

```text
modules/
  school/
  coaching/
  training/
  athlete-history/
```

### Conclusão

Módulos compilam sem lógica funcional.

---

## [x] T003 — Definir padrões compartilhados do módulo

**Tipo:** ARCH  
**Prioridade:** P1  
**Dependências:** T000  
**Paralelo:** sim

Definir:

- IDs;
- timestamps;
- soft delete;
- domain errors;
- paginação;
- cursor;
- envelopes de resposta;
- validação de DTO.

---

## [x] T004 — Criar feature flag do módulo Escola

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T000  
**Paralelo:** sim

Criar flag:

```text
SCHOOL_MODULE_ENABLED
```

### Conclusão

Módulo pode ser ativado/desativado sem remoção de código.

---

# FASE 1 — FUNDAÇÃO DO DOMÍNIO ESCOLA

## [x] T010 — Criar enums de escola

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T002  
**Paralelo:** sim

Criar:

```text
SchoolStatus
SchoolJoinPolicy
CoachSelectionPolicy
MembershipStatus
SchoolRole
MembershipJoinSource
```

---

### Implementation Notes — T010

- Vocabulário provider-agnostic completo do design em `modules/school/domain/enums.ts`.
- RED: import inexistente; GREEN: teste do vocabulário passando; TypeScript e ESLint executados sem erros.
- Não altera papéis globais nem concede permissões.

## [x] T011 — Criar entidade de domínio School

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T010  
**Paralelo:** não

Campos conforme `design.md`.

### Regras

- nome obrigatório;
- owner obrigatório;
- status inicial ACTIVE;
- políticas com defaults seguros.

---

### Implementation Notes — T011

- Entidade e factory em `modules/school/domain/school.ts`; identidade opaca preservada, validação Zod estrita, nome/owner obrigatórios, timestamps copiados e defaults REQUIRE_APPROVAL/ADMIN_ASSIGNS.
- RED/GREEN executados para criação, entradas inválidas e data inválida. `vitest run tests/school*`: 14 testes passaram; `tsc --noEmit` e ESLint da área passaram.
- Domínio puro: não é use case autenticado nem endpoint; autorização será implementada nas respectivas tasks.
- GitNexus atualizado; impact createSchool UNKNOWN sem callers resolvidos; busca textual confirmou apenas os novos testes como consumidores.

## [x] T012 — Criar migration `schools`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T011  
**Paralelo:** não

### Incluir

- PK;
- unique slug;
- owner;
- status;
- policies;
- timestamps;
- índices principais.

---

### Implementation Notes — T012

- `0009_school_core` gerada schema-first, PK cuid, slug único, owner FK RESTRICT, defaults seguros, índices owner/status e status/name/id, timestamps timestamptz(3).
- PostgreSQL 18.4 real isolado 127.0.0.1:55439 reutilizado. Reiniciado após interrupção 429; não duplicar cluster nem executar start.mjs sobre dados existentes; usar `/opt/data/escola-runtime/restart.mjs` e health.mjs.
- Migrations 0001–0009 aplicadas em school_dev e do zero em school_shadow; migrate status atualizado. Dois testes de persistência executados e passando nos dois bancos (sem skips), incluindo slug, FK e preservação após inativação.
- TypeScript e ESLint da área passaram. Avaliação de rollback e índices em `architecture/school-migrations.md`.
- GitNexus MCP detect_changes: 6 símbolos, 5 arquivos, risco low, sem partial/truncated. Prisma não é modelado no grafo: revisão complementar schema/SQL e testes reais obrigatórios; não interpretar zero callers como ausência de impacto.

## [~] T013 — Criar repository de School

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T011, T012  
**Paralelo:** não

Métodos mínimos:

```text
create
findById
findBySlug
update
deactivate
reactivate
searchByName
```

---

## [ ] T014 — Criar use case `CreateSchool`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T013  
**Paralelo:** não

### Regras

- owner = usuário autenticado;
- slug único;
- status ACTIVE;
- audit posterior.

---

## [ ] T015 — Criar use case `UpdateSchool`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T013  
**Paralelo:** sim

---

## [ ] T016 — Criar use case `DeactivateSchool`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T013  
**Paralelo:** não

Inicialmente apenas domínio. Efeitos em memberships virão depois.

---

## [ ] T017 — Criar use case `ReactivateSchool`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T013  
**Paralelo:** sim

---

## [ ] T018 — Criar endpoints básicos de School

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T014, T015, T016, T017  
**Paralelo:** não

```http
POST  /api/schools
GET   /api/schools/:id
PATCH /api/schools/:id
POST  /api/schools/:id/deactivate
POST  /api/schools/:id/reactivate
```

---

## [ ] T019 — Testes unitários de School

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T014–T018  
**Paralelo:** sim

Cobrir:

- criação;
- slug duplicado;
- desativação;
- reativação;
- update inválido.

---

# FASE 2 — MEMBERSHIPS, PAPÉIS E AUTORIZAÇÃO

## [ ] T020 — Criar migration `school_memberships`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T012  
**Paralelo:** não

---

## [ ] T021 — Criar entidade SchoolMembership

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T020  
**Paralelo:** não

---

## [ ] T022 — Criar migration `school_membership_roles`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T020  
**Paralelo:** sim

---

## [ ] T023 — Criar entidade SchoolMembershipRole

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T022  
**Paralelo:** sim

---

## [ ] T024 — Criar constraint de vínculo ativo único

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T020  
**Paralelo:** não

Garantir um único membership ativo equivalente por escola + usuário.

---

## [ ] T025 — Criar repository de SchoolMembership

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T021, T023  
**Paralelo:** não

---

## [ ] T026 — Criar use case `AddSchoolMember`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T025  
**Paralelo:** não

---

## [ ] T027 — Criar use case `RemoveSchoolMember`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T025  
**Paralelo:** sim

---

## [ ] T028 — Criar use case `AddRoleToMember`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T025  
**Paralelo:** sim

---

## [ ] T029 — Criar use case `RemoveRoleFromMember`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T025  
**Paralelo:** sim

---

## [ ] T030 — Criar bootstrap do OWNER

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T014, T025  
**Paralelo:** não

Ao criar escola:

- criar membership do owner;
- adicionar papel OWNER;
- opcionalmente ADMIN.

---

## [ ] T031 — Criar política `CanManageSchool`

**Tipo:** SEC  
**Prioridade:** P0  
**Dependências:** T025  
**Paralelo:** sim

---

## [ ] T032 — Criar política `CanManageMembers`

**Tipo:** SEC  
**Prioridade:** P0  
**Dependências:** T025  
**Paralelo:** sim

---

## [ ] T033 — Criar política `CanDeactivateSchool`

**Tipo:** SEC  
**Prioridade:** P0  
**Dependências:** T025  
**Paralelo:** sim

---

## [ ] T034 — Integrar policies aos endpoints

**Tipo:** SEC / BE  
**Prioridade:** P0  
**Dependências:** T031–T033, T018  
**Paralelo:** não

---

## [ ] T035 — Endpoints de membros

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T026–T029  
**Paralelo:** não

```http
GET    /api/schools/:schoolId/members
POST   /api/schools/:schoolId/members
DELETE /api/schools/:schoolId/members/:membershipId
```

---

## [ ] T036 — Endpoints de papéis

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T028, T029  
**Paralelo:** sim

---

## [ ] T037 — Testes de múltiplos papéis

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T028, T029  
**Paralelo:** sim

Cenários:

```text
ADMIN + COACH
OWNER + ADMIN + COACH
```

---

## [ ] T038 — Testes negativos de autorização

**Tipo:** TEST / SEC  
**Prioridade:** P0  
**Dependências:** T034  
**Paralelo:** sim

---

## [ ] T039 — Teste de integração CreateSchool + Owner

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T030  
**Paralelo:** não

---

# FASE 3 — PROFESSORES E ATLETAS

## [ ] T040 — Criar migration `coach_profiles`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T000  
**Paralelo:** sim

---

## [ ] T041 — Criar entidade CoachProfile

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T040  
**Paralelo:** não

---

## [ ] T042 — Criar serviço de resolução CoachProfile por User

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T041  
**Paralelo:** sim

---

## [ ] T043 — Criar migration `coach_school_memberships`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T040, T012  
**Paralelo:** não

---

## [ ] T044 — Criar entidade CoachSchoolMembership

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T043  
**Paralelo:** não

---

## [ ] T045 — Criar repository CoachSchoolMembership

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T044  
**Paralelo:** não

---

## [ ] T046 — Criar migration `school_athlete_memberships`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T012  
**Paralelo:** sim

---

## [ ] T047 — Criar entidade SchoolAthleteMembership

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T046  
**Paralelo:** não

---

## [ ] T048 — Criar repository SchoolAthleteMembership

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T047  
**Paralelo:** não

---

## [ ] T049 — Criar use case `RequestCoachSchoolMembership`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T045  
**Paralelo:** sim

---

## [ ] T050 — Criar use case `ApproveCoachSchoolMembership`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T045, T032  
**Paralelo:** não

---

## [ ] T051 — Criar use case `RejectCoachSchoolMembership`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T045  
**Paralelo:** sim

---

## [ ] T052 — Criar use case `RemoveCoachFromSchool`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T045  
**Paralelo:** não

Ainda sem encerrar assignments; isso será adicionado na Fase 4.

---

## [ ] T053 — Criar use case `RequestSchoolMembership`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T048  
**Paralelo:** sim

---

## [ ] T054 — Criar use case `ApproveAthleteMembership`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T048, T032  
**Paralelo:** sim

---

## [ ] T055 — Criar use case `RejectAthleteMembership`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T048  
**Paralelo:** sim

---

## [ ] T056 — Criar use case `RemoveAthleteFromSchool`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T048  
**Paralelo:** não

---

## [ ] T057 — Criar use case `RejoinSchool`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T048  
**Paralelo:** sim

---

## [ ] T058 — Endpoints de coaches e atletas

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T050–T057  
**Paralelo:** não

---

## [ ] T059 — Testes temporais de vínculo

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T050–T057  
**Paralelo:** sim

Validar:

- saída;
- retorno;
- períodos anteriores;
- nenhuma sobrescrita.

---

# FASE 4 — ASSIGNMENTS, LOBBY E TRANSFERÊNCIAS

## [ ] T060 — Criar migration `coach_athlete_assignments`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T043, T046  
**Paralelo:** não

---

## [ ] T061 — Criar entidade CoachAthleteAssignment

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T060  
**Paralelo:** não

---

## [ ] T062 — Criar repository CoachAthleteAssignment

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T061  
**Paralelo:** não

---

## [ ] T063 — Criar regra de professor primário

**Tipo:** BE / DB  
**Prioridade:** P0  
**Dependências:** T060  
**Paralelo:** não

MVP:

- apenas um primary coach ativo por atleta/escola.

---

## [ ] T064 — Criar use case `AssignCoachToAthlete`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T062, T048, T045  
**Paralelo:** não

Validar:

- atleta ativo na escola;
- coach ativo na escola;
- ausência de conflito.

---

## [ ] T065 — Criar use case `ChangeAthleteCoach`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T064  
**Paralelo:** não

Operação transacional.

---

## [ ] T066 — Criar use case `EndCoachAssignment`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T062  
**Paralelo:** sim

---

## [ ] T067 — Criar query derivada de Lobby

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T062, T048  
**Paralelo:** sim

---

## [ ] T068 — Criar endpoint de Lobby

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T067  
**Paralelo:** não

```http
GET /api/schools/:schoolId/lobby
```

---

## [ ] T069 — Integrar remoção de professor com assignments

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T052, T066, T067  
**Paralelo:** não

Ao remover coach:

- encerrar coach-school membership;
- encerrar assignments naquele contexto;
- atletas aparecem no Lobby.

---

## [ ] T070 — Criar use case `BulkAssignCoach`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T064  
**Paralelo:** sim

---

## [ ] T071 — Criar endpoint de bulk assignment

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T070  
**Paralelo:** sim

---

## [ ] T072 — Criar evento `CoachAssignedToAthlete`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T064  
**Paralelo:** sim

---

## [ ] T073 — Criar evento `AthleteEnteredLobby`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T067  
**Paralelo:** sim

---

## [ ] T074 — Criar evento `CoachLeftSchool`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T069  
**Paralelo:** sim

---

## [ ] T075 — Testes de troca de professor

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T065  
**Paralelo:** sim

---

## [ ] T076 — Testes de remoção de professor

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T069  
**Paralelo:** sim

Validar:

- aluno permanece na escola;
- assignment encerrado;
- aparece no lobby;
- histórico preservado.

---

## [ ] T077 — Testes de bulk assignment

**Tipo:** TEST  
**Prioridade:** P1  
**Dependências:** T070  
**Paralelo:** sim

---

## [ ] T078 — Testar admin que também é coach

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T064, T037  
**Paralelo:** sim

---

## [ ] T079 — Tornar `DeactivateSchool` transacional completo

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T069  
**Paralelo:** não

Encerrar:

- memberships ativos;
- coach-school;
- assignments.

Preservar todo histórico.

---

# FASE 5 — CONVITES E DESCOBERTA

## [ ] T080 — Criar enums de convite

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T010  
**Paralelo:** sim

---

## [ ] T081 — Criar migration `invitation_links`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T080  
**Paralelo:** não

---

## [ ] T082 — Criar migration `invitation_uses`

**Tipo:** DB  
**Prioridade:** P1  
**Dependências:** T081  
**Paralelo:** sim

---

## [ ] T083 — Criar entidade InvitationLink

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T081  
**Paralelo:** não

---

## [ ] T084 — Implementar geração segura de token

**Tipo:** SEC / BE  
**Prioridade:** P0  
**Dependências:** T083  
**Paralelo:** sim

Armazenar hash.

---

## [ ] T085 — Criar `CreateInvitationLink`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T083, T084  
**Paralelo:** não

---

## [ ] T086 — Criar `ResolveInvitationLink`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T083  
**Paralelo:** sim

---

## [ ] T087 — Criar `AcceptInvitation`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T085, T086, T053, T049  
**Paralelo:** não

Cobrir:

- school;
- school + coach;
- coach independente.

---

## [ ] T088 — Criar `RevokeInvitation`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T085  
**Paralelo:** sim

---

## [ ] T089 — Criar expiração automática

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T083  
**Paralelo:** sim

---

## [ ] T090 — Criar endpoints de convite

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T085–T088  
**Paralelo:** não

---

## [ ] T091 — Criar busca de escola por nome

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T013  
**Paralelo:** sim

---

## [ ] T092 — Criar endpoint `/api/schools/search`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T091  
**Paralelo:** sim

---

## [ ] T093 — Testar convite para usuário existente

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T087  
**Paralelo:** sim

---

## [ ] T094 — Testar convite para novo usuário

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T087  
**Paralelo:** sim

---

## [ ] T095 — Testar limites e expiração

**Tipo:** TEST  
**Prioridade:** P1  
**Dependências:** T088, T089  
**Paralelo:** sim

---

## [ ] T096 — Testar `requiresApproval`

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T087  
**Paralelo:** sim

---

## [ ] T097 — Criar idempotência de aceite

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T087  
**Paralelo:** não

---

## [ ] T098 — Criar auditoria de uso do convite

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T082, T087  
**Paralelo:** sim

---

## [ ] T099 — Criar testes de segurança do token

**Tipo:** TEST / SEC  
**Prioridade:** P1  
**Dependências:** T084  
**Paralelo:** sim

---

# FASE 6 — HISTÓRICO E GRANTS

## [ ] T100 — Criar enums de history grant

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T002  
**Paralelo:** sim

---

## [ ] T101 — Criar migration `history_access_grants`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T100  
**Paralelo:** não

---

## [ ] T102 — Criar entidade HistoryAccessGrant

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T101  
**Paralelo:** não

---

## [ ] T103 — Criar validação de escopo

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T102  
**Paralelo:** sim

---

## [ ] T104 — Criar `GrantHistoryAccess`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T102, T103  
**Paralelo:** não

---

## [ ] T105 — Criar `UpdateHistoryGrant`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T104  
**Paralelo:** sim

---

## [ ] T106 — Criar `RevokeHistoryAccess`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T104  
**Paralelo:** sim

---

## [ ] T107 — Criar `CheckHistoryAccess`

**Tipo:** SEC / BE  
**Prioridade:** P0  
**Dependências:** T102  
**Paralelo:** não

Validar:

- grantee;
- período;
- scope;
- status.

---

## [ ] T108 — Criar policy `CanReadAthleteCurrentData`

**Tipo:** SEC  
**Prioridade:** P0  
**Dependências:** T062, T048  
**Paralelo:** sim

---

## [ ] T109 — Criar policy `CanReadAthleteHistory`

**Tipo:** SEC  
**Prioridade:** P0  
**Dependências:** T107  
**Paralelo:** não

---

## [ ] T110 — Integrar history policies às queries

**Tipo:** SEC / BE  
**Prioridade:** P0  
**Dependências:** T108, T109  
**Paralelo:** não

---

## [ ] T111 — Criar endpoints de grants

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T104–T106  
**Paralelo:** sim

---

## [ ] T112 — Testar compartilhamento por período

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T107  
**Paralelo:** sim

---

## [ ] T113 — Testar compartilhamento parcial

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T107  
**Paralelo:** sim

---

## [ ] T114 — Testar grant revogado

**Tipo:** TEST / SEC  
**Prioridade:** P0  
**Dependências:** T106, T109  
**Paralelo:** sim

---

## [ ] T115 — Testar escola nova sem grant

**Tipo:** TEST / SEC  
**Prioridade:** P0  
**Dependências:** T109  
**Paralelo:** sim

Garantir que escola B não leia histórico da escola A automaticamente.

---

## [ ] T116 — Testar coach independente com grant

**Tipo:** TEST  
**Prioridade:** P1  
**Dependências:** T109  
**Paralelo:** sim

---

## [ ] T117 — Criar fluxo de grant ao entrar em nova escola

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T104, T054  
**Paralelo:** sim

---

## [ ] T118 — Criar evento `HistoryAccessGranted`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T104  
**Paralelo:** sim

---

## [ ] T119 — Criar evento `HistoryAccessRevoked`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T106  
**Paralelo:** sim

---

# FASE 7 — TREINOS E TEMPLATES

## [ ] T120 — Criar enums de treino

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T002  
**Paralelo:** sim

---

## [ ] T121 — Criar migration `workout_templates`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T120  
**Paralelo:** não

---

## [ ] T122 — Criar migration `workouts`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T121  
**Paralelo:** não

---

## [ ] T123 — Criar migration `workout_blocks`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T122  
**Paralelo:** sim

---

## [ ] T124 — Criar entidade WorkoutTemplate

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T121  
**Paralelo:** sim

---

## [ ] T125 — Criar entidade Workout

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T122  
**Paralelo:** não

---

## [ ] T126 — Criar entidade WorkoutBlock

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T123  
**Paralelo:** sim

---

## [ ] T127 — Implementar snapshot de treino

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T124, T125  
**Paralelo:** não

---

## [ ] T128 — Criar repository de templates

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T124  
**Paralelo:** sim

---

## [ ] T129 — Criar repository de workouts

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T125  
**Paralelo:** sim

---

## [ ] T130 — Criar `CreateWorkoutTemplate`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T128  
**Paralelo:** sim

---

## [ ] T131 — Criar `UpdateWorkoutTemplate`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T130  
**Paralelo:** sim

---

## [ ] T132 — Criar `ArchiveWorkoutTemplate`

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T130  
**Paralelo:** sim

---

## [ ] T133 — Criar `CreateWorkout`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T127, T129  
**Paralelo:** não

---

## [ ] T134 — Criar migration `workout_assignments`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T122  
**Paralelo:** sim

---

## [ ] T135 — Criar entidade WorkoutAssignment

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T134  
**Paralelo:** não

---

## [ ] T136 — Criar `AssignWorkout`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T133, T135, T108  
**Paralelo:** não

---

## [ ] T137 — Criar `AssignWorkoutToTeam`

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T136, T150  
**Paralelo:** sim

---

## [ ] T138 — Criar `RescheduleWorkout`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T136  
**Paralelo:** sim

---

## [ ] T139 — Criar `CancelWorkout`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T136  
**Paralelo:** sim

---

## [ ] T140 — Criar endpoints de templates

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T130–T132  
**Paralelo:** sim

---

## [ ] T141 — Criar endpoints de workouts

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T133, T136, T138, T139  
**Paralelo:** não

---

## [ ] T142 — Criar calendário de treinos do atleta

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T136  
**Paralelo:** sim

Endpoint:

```http
GET /api/athletes/:athleteId/workouts
```

---

## [ ] T143 — Implementar estados de treino

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T135  
**Paralelo:** sim

Cobrir:

- scheduled;
- completed;
- partial;
- missed;
- cancelled;
- rescheduled;
- justified.

---

## [ ] T144 — Criar regra de treino extra

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T142  
**Paralelo:** sim

---

## [ ] T145 — Tratar treino futuro de coach removido

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T069, T136  
**Paralelo:** não

---

## [ ] T146 — Tratar treino futuro de escola desativada

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T079, T136  
**Paralelo:** não

---

## [ ] T147 — Testar snapshot imutável

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T127  
**Paralelo:** sim

---

## [ ] T148 — Testar alteração de template sem afetar prescrição

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T131, T127  
**Paralelo:** sim

---

## [ ] T149 — Testar permissões de prescrição

**Tipo:** TEST / SEC  
**Prioridade:** P0  
**Dependências:** T136  
**Paralelo:** sim

---

# FASE 7.5 — TURMAS / EQUIPES

## [ ] T150 — Criar migration `teams`

**Tipo:** DB  
**Prioridade:** P2  
**Dependências:** T012  
**Paralelo:** sim

---

## [ ] T151 — Criar migration `team_members`

**Tipo:** DB  
**Prioridade:** P2  
**Dependências:** T150  
**Paralelo:** sim

---

## [ ] T152 — Criar migration `team_coaches`

**Tipo:** DB  
**Prioridade:** P2  
**Dependências:** T150  
**Paralelo:** sim

---

## [ ] T153 — Criar entidades Team, TeamMember, TeamCoach

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T150–T152  
**Paralelo:** sim

---

## [ ] T154 — Criar CRUD de turmas

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T153  
**Paralelo:** sim

---

## [ ] T155 — Vincular atleta a turma

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T153  
**Paralelo:** sim

---

## [ ] T156 — Vincular coach a turma

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T153  
**Paralelo:** sim

---

# FASE 8 — EXECUÇÃO E MATCHING

## [ ] T160 — Mapear modelo real de `NormalizedActivity`

**Tipo:** INT / ARCH  
**Prioridade:** P0  
**Dependências:** T000  
**Paralelo:** sim

Confirmar:

- IDs;
- athlete;
- sport;
- start time;
- duration;
- distance;
- streams;
- provider metadata.

---

## [ ] T161 — Criar adapter `TrainingActivityReader`

**Tipo:** INT / BE  
**Prioridade:** P0  
**Dependências:** T160  
**Paralelo:** não

Evitar dependência direta do módulo com Garmin/Strava.

---

## [ ] T162 — Criar migration `workout_executions`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T134, T160  
**Paralelo:** não

---

## [ ] T163 — Criar entidade WorkoutExecution

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T162  
**Paralelo:** não

---

## [ ] T164 — Criar `WorkoutMatchingService`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T161, T163  
**Paralelo:** não

---

## [ ] T165 — Implementar matching por esporte

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T164  
**Paralelo:** sim

---

## [ ] T166 — Implementar matching por data

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T164  
**Paralelo:** sim

---

## [ ] T167 — Implementar matching por proximidade de horário

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T164  
**Paralelo:** sim

---

## [ ] T168 — Implementar matching por duração

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T164  
**Paralelo:** sim

---

## [ ] T169 — Implementar matching por distância

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T164  
**Paralelo:** sim

---

## [ ] T170 — Implementar matching estrutural

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T164  
**Paralelo:** sim

---

## [ ] T171 — Calcular `match_score`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T165–T170  
**Paralelo:** não

---

## [ ] T172 — Implementar thresholds de matching

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T171  
**Paralelo:** não

---

## [ ] T173 — Criar `FindMatchingWorkout`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T172  
**Paralelo:** não

---

## [ ] T174 — Criar `MatchActivityToWorkout`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T173  
**Paralelo:** não

---

## [ ] T175 — Criar `ConfirmWorkoutMatch`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T174  
**Paralelo:** sim

---

## [ ] T176 — Criar `OverrideWorkoutMatch`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T174  
**Paralelo:** sim

---

## [ ] T177 — Criar `UnmatchActivity`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T174  
**Paralelo:** sim

---

## [ ] T178 — Criar endpoints de matching

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T173–T177  
**Paralelo:** não

---

## [ ] T179 — Integrar matching ao evento de nova atividade

**Tipo:** INT / BE  
**Prioridade:** P0  
**Dependências:** T173  
**Paralelo:** não

---

## [ ] T180 — Implementar idempotência de matching

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T174  
**Paralelo:** sim

---

## [ ] T181 — Testes unitários de score

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T171  
**Paralelo:** sim

---

## [ ] T182 — Testes de matching correto

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T174  
**Paralelo:** sim

---

## [ ] T183 — Testes de matching ambíguo

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T172  
**Paralelo:** sim

---

## [ ] T184 — Testes de override manual

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T176  
**Paralelo:** sim

---

# FASE 9 — COMPLIANCE

## [ ] T190 — Criar migration `workout_compliance`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T162  
**Paralelo:** não

---

## [ ] T191 — Criar entidade WorkoutCompliance

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T190  
**Paralelo:** não

---

## [ ] T192 — Criar interface `ComplianceStrategy`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T191  
**Paralelo:** não

---

## [ ] T193 — Criar `DefaultComplianceStrategy`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T194 — Criar `SwimComplianceStrategy`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T195 — Criar `RunComplianceStrategy`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T196 — Criar `BikeComplianceStrategy`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T197 — Implementar score de distância

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T198 — Implementar score de duração

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T199 — Implementar score de ritmo

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T200 — Implementar score de frequência cardíaca

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T201 — Implementar score de potência

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T202 — Implementar score de intervalos

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T203 — Implementar score de descanso

**Tipo:** BE  
**Prioridade:** P2  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T204 — Implementar score de zonas

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T192  
**Paralelo:** sim

---

## [ ] T205 — Criar `WorkoutComplianceService`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T193–T204  
**Paralelo:** não

---

## [ ] T206 — Implementar `algorithm_version`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T205  
**Paralelo:** não

---

## [ ] T207 — Criar `CalculateWorkoutCompliance`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T205, T174  
**Paralelo:** não

---

## [ ] T208 — Criar `RecalculateWorkoutCompliance`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T207  
**Paralelo:** sim

---

## [ ] T209 — Integrar cálculo após matching confirmado

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T207  
**Paralelo:** não

---

## [ ] T210 — Criar endpoint de compliance

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T207, T208  
**Paralelo:** sim

---

## [ ] T211 — Testes por modalidade

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T194–T196  
**Paralelo:** sim

---

## [ ] T212 — Testar versionamento de algoritmo

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T206  
**Paralelo:** sim

---

## [ ] T213 — Criar dataset de fixtures de compliance

**Tipo:** TEST / DATA  
**Prioridade:** P1  
**Dependências:** T205  
**Paralelo:** sim

---

# FASE 10 — AVALIAÇÕES E FEEDBACK

## [ ] T220 — Criar migration `coach_evaluations`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T134  
**Paralelo:** sim

---

## [ ] T221 — Criar migration `athlete_feedback`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T134  
**Paralelo:** sim

---

## [ ] T222 — Criar entidade CoachEvaluation

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T220  
**Paralelo:** sim

---

## [ ] T223 — Criar entidade AthleteFeedback

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T221  
**Paralelo:** sim

---

## [ ] T224 — Criar validações de nota

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T222  
**Paralelo:** sim

---

## [ ] T225 — Criar validações de feedback

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T223  
**Paralelo:** sim

---

## [ ] T226 — Criar `CreateCoachEvaluation`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T222, T108  
**Paralelo:** não

---

## [ ] T227 — Criar `UpdateCoachEvaluation`

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T226  
**Paralelo:** sim

---

## [ ] T228 — Criar `SubmitAthleteFeedback`

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T223  
**Paralelo:** sim

---

## [ ] T229 — Criar endpoints de avaliação

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T226, T227  
**Paralelo:** sim

---

## [ ] T230 — Criar endpoint de feedback

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T228  
**Paralelo:** sim

---

## [ ] T231 — Testar separação Ryvano Score / Coach Score / Feedback

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T207, T226, T228  
**Paralelo:** sim

---

## [ ] T232 — Testar preservação após troca de coach

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T226, T065  
**Paralelo:** sim

---

# FASE 11 — AUDITORIA

## [ ] T240 — Criar migration `audit_logs`

**Tipo:** DB  
**Prioridade:** P0  
**Dependências:** T000  
**Paralelo:** sim

---

## [ ] T241 — Criar AuditService

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T240  
**Paralelo:** não

---

## [ ] T242 — Criar enum/códigos de audit action

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T241  
**Paralelo:** sim

---

## [ ] T243 — Auditar escolas

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T241, T014–T017  
**Paralelo:** sim

---

## [ ] T244 — Auditar memberships

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T241, T050–T057  
**Paralelo:** sim

---

## [ ] T245 — Auditar assignments

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T241, T064–T069  
**Paralelo:** sim

---

## [ ] T246 — Auditar convites

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T241, T085–T088  
**Paralelo:** sim

---

## [ ] T247 — Auditar grants

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T241, T104–T106  
**Paralelo:** sim

---

## [ ] T248 — Auditar treinos e matching

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T241, T133, T176  
**Paralelo:** sim

---

## [ ] T249 — Auditar avaliações

**Tipo:** BE  
**Prioridade:** P1  
**Dependências:** T241, T226  
**Paralelo:** sim

---

# FASE 12 — FRONTEND ADMINISTRATIVO

## [ ] T250 — Criar rota/layout do módulo Escola

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T018  
**Paralelo:** sim

---

## [ ] T251 — Criar tela lista de escolas

**Tipo:** FE  
**Prioridade:** P1  
**Dependências:** T250  
**Paralelo:** sim

---

## [ ] T252 — Criar tela criar escola

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T250, T018  
**Paralelo:** sim

---

## [ ] T253 — Criar tela dashboard administrativo

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T250, T058, T068  
**Paralelo:** não

Mostrar:

- atletas;
- coaches;
- lobby;
- pendências;
- convites.

---

## [ ] T254 — Criar tela membros e papéis

**Tipo:** FE  
**Prioridade:** P1  
**Dependências:** T035, T036  
**Paralelo:** sim

---

## [ ] T255 — Criar tela professores

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T058  
**Paralelo:** sim

---

## [ ] T256 — Criar tela atletas

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T058  
**Paralelo:** sim

---

## [ ] T257 — Criar tela Lobby

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T068  
**Paralelo:** sim

---

## [ ] T258 — Criar modal atribuir professor

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T064  
**Paralelo:** sim

---

## [ ] T259 — Criar fluxo trocar professor

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T065  
**Paralelo:** sim

---

## [ ] T260 — Criar bulk transfer UI

**Tipo:** FE  
**Prioridade:** P1  
**Dependências:** T071  
**Paralelo:** sim

---

## [ ] T261 — Criar tela solicitações pendentes

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T050, T054  
**Paralelo:** sim

---

## [ ] T262 — Criar ações aprovar/recusar

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T261  
**Paralelo:** sim

---

## [ ] T263 — Criar tela de convites

**Tipo:** FE  
**Prioridade:** P1  
**Dependências:** T090  
**Paralelo:** sim

---

## [ ] T264 — Criar geração/copiar link

**Tipo:** FE  
**Prioridade:** P1  
**Dependências:** T263  
**Paralelo:** sim

---

## [ ] T265 — Criar ação desativar escola

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T079  
**Paralelo:** sim

---

# FASE 13 — FRONTEND PROFESSOR

## [ ] T270 — Criar dashboard do professor

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T058, T142  
**Paralelo:** sim

---

## [ ] T271 — Criar lista `Meus atletas`

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T270  
**Paralelo:** sim

---

## [ ] T272 — Criar detalhe do atleta

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T108, T142  
**Paralelo:** sim

Mostrar apenas dados permitidos.

---

## [ ] T273 — Criar editor de treino

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T141  
**Paralelo:** sim

---

## [ ] T274 — Criar editor de blocos

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T273  
**Paralelo:** sim

---

## [ ] T275 — Criar biblioteca de templates

**Tipo:** FE  
**Prioridade:** P1  
**Dependências:** T140  
**Paralelo:** sim

---

## [ ] T276 — Criar fluxo atribuir treino

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T136  
**Paralelo:** sim

---

## [ ] T277 — Criar visual Prescrito × Realizado

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T210  
**Paralelo:** não

---

## [ ] T278 — Mostrar compliance detalhado

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T210  
**Paralelo:** sim

---

## [ ] T279 — Criar formulário de avaliação

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T229  
**Paralelo:** sim

---

## [ ] T280 — Exibir feedback do atleta

**Tipo:** FE  
**Prioridade:** P1  
**Dependências:** T230  
**Paralelo:** sim

---

# FASE 14 — FRONTEND ATLETA

## [ ] T290 — Criar fluxo de convite

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T090  
**Paralelo:** sim

---

## [ ] T291 — Criar tela de busca de escola

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T092  
**Paralelo:** sim

---

## [ ] T292 — Criar tela de solicitação de vínculo

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T053  
**Paralelo:** sim

---

## [ ] T293 — Criar escolha de professor

**Tipo:** FE  
**Prioridade:** P1  
**Dependências:** T064  
**Paralelo:** sim

---

## [ ] T294 — Criar tela de calendário do atleta

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T142  
**Paralelo:** sim

---

## [ ] T295 — Criar detalhe do treino

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T141  
**Paralelo:** sim

---

## [ ] T296 — Exibir Prescrito × Realizado para atleta

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T210  
**Paralelo:** sim

---

## [ ] T297 — Criar formulário de feedback

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T230  
**Paralelo:** sim

---

## [ ] T298 — Criar tela de compartilhamento de histórico

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T111  
**Paralelo:** sim

---

## [ ] T299 — Criar seleção de período e escopo

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T298  
**Paralelo:** sim

---

## [ ] T300 — Criar revogação de compartilhamento

**Tipo:** FE  
**Prioridade:** P0  
**Dependências:** T298  
**Paralelo:** sim

---

# FASE 15 — OBSERVABILIDADE E HARDENING

## [ ] T310 — Padronizar domain errors

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** T003  
**Paralelo:** sim

---

## [ ] T311 — Criar correlationId

**Tipo:** OBS  
**Prioridade:** P1  
**Dependências:** T003  
**Paralelo:** sim

---

## [ ] T312 — Adicionar logs em use cases críticos

**Tipo:** OBS  
**Prioridade:** P0  
**Dependências:** T311  
**Paralelo:** sim

Cobrir:

- memberships;
- assignments;
- grants;
- matching;
- compliance.

---

## [ ] T313 — Adicionar métricas de matching

**Tipo:** OBS  
**Prioridade:** P1  
**Dependências:** T173  
**Paralelo:** sim

Métricas:

- matches automáticos;
- overrides;
- score médio;
- falhas.

---

## [ ] T314 — Adicionar métricas de compliance

**Tipo:** OBS  
**Prioridade:** P1  
**Dependências:** T207  
**Paralelo:** sim

---

## [ ] T315 — Adicionar paginação nas listagens

**Tipo:** BE  
**Prioridade:** P0  
**Dependências:** endpoints correspondentes  
**Paralelo:** sim

---

## [ ] T316 — Revisar índices com EXPLAIN

**Tipo:** DB  
**Prioridade:** P1  
**Dependências:** T315  
**Paralelo:** sim

---

## [ ] T317 — Revisão de segurança geral

**Tipo:** SEC  
**Prioridade:** P0  
**Dependências:** T109, T149, T299  
**Paralelo:** não

---

## [ ] T318 — Revisar exposição de histórico

**Tipo:** SEC  
**Prioridade:** P0  
**Dependências:** T109, T110  
**Paralelo:** não

---

## [ ] T319 — Revisar tokens de convite

**Tipo:** SEC  
**Prioridade:** P0  
**Dependências:** T084  
**Paralelo:** sim

---

# FASE 16 — TESTES INTEGRADOS E E2E

## [ ] T330 — E2E criar escola

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T252  
**Paralelo:** sim

---

## [ ] T331 — E2E admin + coach

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T254, T255  
**Paralelo:** sim

---

## [ ] T332 — E2E convite de atleta

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T290  
**Paralelo:** sim

---

## [ ] T333 — E2E aprovação de atleta

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T261, T292  
**Paralelo:** sim

---

## [ ] T334 — E2E atribuição de professor

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T258  
**Paralelo:** sim

---

## [ ] T335 — E2E remoção de professor → lobby

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T257, T259  
**Paralelo:** não

---

## [ ] T336 — E2E reatribuição de aluno

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T335  
**Paralelo:** sim

---

## [ ] T337 — E2E saída e retorno do atleta

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T057  
**Paralelo:** sim

---

## [ ] T338 — E2E desativação da escola

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T265  
**Paralelo:** sim

Validar histórico preservado.

---

## [ ] T339 — E2E criação e atribuição de treino

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T276  
**Paralelo:** sim

---

## [ ] T340 — E2E ingestão de atividade + matching

**Tipo:** TEST / INT  
**Prioridade:** P0  
**Dependências:** T179  
**Paralelo:** não

---

## [ ] T341 — E2E compliance

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T277  
**Paralelo:** sim

---

## [ ] T342 — E2E avaliação de coach

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T279  
**Paralelo:** sim

---

## [ ] T343 — E2E feedback do atleta

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T297  
**Paralelo:** sim

---

## [ ] T344 — E2E histórico compartilhado

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T298–T300  
**Paralelo:** não

---

## [ ] T345 — E2E revogação de histórico

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T344  
**Paralelo:** sim

---

## [ ] T346 — E2E professor não autorizado

**Tipo:** TEST / SEC  
**Prioridade:** P0  
**Dependências:** T317  
**Paralelo:** sim

---

## [ ] T347 — E2E admin de outra escola

**Tipo:** TEST / SEC  
**Prioridade:** P0  
**Dependências:** T317  
**Paralelo:** sim

---

## [ ] T348 — E2E convite expirado/revogado

**Tipo:** TEST  
**Prioridade:** P1  
**Dependências:** T095  
**Paralelo:** sim

---

# FASE 17 — DOCUMENTAÇÃO E ROLLOUT

## [ ] T360 — Atualizar documentação de arquitetura

**Tipo:** DOC  
**Prioridade:** P1  
**Dependências:** implementação concluída  
**Paralelo:** sim

---

## [ ] T361 — Documentar endpoints

**Tipo:** DOC  
**Prioridade:** P1  
**Dependências:** APIs concluídas  
**Paralelo:** sim

---

## [ ] T362 — Documentar eventos de domínio

**Tipo:** DOC  
**Prioridade:** P1  
**Dependências:** eventos concluídos  
**Paralelo:** sim

---

## [ ] T363 — Documentar regras de permissão

**Tipo:** DOC / SEC  
**Prioridade:** P0  
**Dependências:** T317  
**Paralelo:** sim

---

## [ ] T364 — Criar seed de desenvolvimento

**Tipo:** DATA  
**Prioridade:** P1  
**Dependências:** migrations concluídas  
**Paralelo:** sim

Criar:

- 1 escola;
- 2 admins;
- 3 coaches;
- atletas ativos;
- atletas no lobby;
- convites;
- treinos;
- atividades fake.

---

## [ ] T365 — Criar checklist de migration production

**Tipo:** DOC / DB  
**Prioridade:** P0  
**Dependências:** migrations concluídas  
**Paralelo:** sim

---

## [ ] T366 — Criar plano de rollback

**Tipo:** DOC / DB  
**Prioridade:** P0  
**Dependências:** T365  
**Paralelo:** sim

---

## [ ] T367 — Ativar em ambiente dev

**Tipo:** INT  
**Prioridade:** P0  
**Dependências:** E2Es principais  
**Paralelo:** não

---

## [ ] T368 — Ativar em staging

**Tipo:** INT  
**Prioridade:** P0  
**Dependências:** T367  
**Paralelo:** não

---

## [ ] T369 — Smoke test staging

**Tipo:** TEST  
**Prioridade:** P0  
**Dependências:** T368  
**Paralelo:** não

---

## [ ] T370 — Ativar feature flag para usuários internos

**Tipo:** INT  
**Prioridade:** P0  
**Dependências:** T369  
**Paralelo:** não

---

## [ ] T371 — Monitorar erros e métricas

**Tipo:** OBS  
**Prioridade:** P0  
**Dependências:** T370  
**Paralelo:** não

---

## [ ] T372 — Liberar gradualmente

**Tipo:** INT  
**Prioridade:** P1  
**Dependências:** T371  
**Paralelo:** não

---

# FASE 18 — FUTURO / MARKETPLACE

Estas tasks não fazem parte do MVP.

## [ ] T400 — Modelar TrainingProduct

**Tipo:** ARCH / DB  
**Prioridade:** P3  
**Dependências:** T120–T141

---

## [ ] T401 — Modelar TrainingProductVersion

**Tipo:** DB  
**Prioridade:** P3  
**Dependências:** T400

---

## [ ] T402 — Modelar TrainingPurchase

**Tipo:** DB  
**Prioridade:** P3  
**Dependências:** T400

---

## [ ] T403 — Modelar TrainingLicense

**Tipo:** DB  
**Prioridade:** P3  
**Dependências:** T402

---

## [ ] T404 — Criar catálogo

**Tipo:** BE / FE  
**Prioridade:** P3  
**Dependências:** T400–T403

---

## [ ] T405 — Criar compra

**Tipo:** BE  
**Prioridade:** P3  
**Dependências:** T404

---

## [ ] T406 — Instanciar plano comprado no calendário

**Tipo:** BE  
**Prioridade:** P3  
**Dependências:** T405, T136

---

## [ ] T407 — Integrar plano comprado ao compliance

**Tipo:** BE  
**Prioridade:** P3  
**Dependências:** T406, T207

---

# 5. Dependências críticas

## Núcleo de escola

```text
T000
 ↓
T010
 ↓
T011
 ↓
T012
 ↓
T013
 ↓
T014
```

## Memberships

```text
T012
 ↓
T020
 ↓
T021
 ↓
T025
 ↓
T026–T030
```

## Coach / Athlete

```text
T043 + T046
 ↓
T044 + T047
 ↓
T045 + T048
 ↓
T050–T057
```

## Assignments

```text
T043 + T046
 ↓
T060
 ↓
T061
 ↓
T062
 ↓
T064
 ↓
T065 / T069
```

## Lobby

```text
T048 + T062
 ↓
T067
 ↓
T068
```

## Histórico

```text
T101
 ↓
T102
 ↓
T104
 ↓
T107
 ↓
T109
```

## Treino

```text
T121
 ↓
T122
 ↓
T125
 ↓
T127
 ↓
T133
 ↓
T134
 ↓
T135
 ↓
T136
```

## Matching

```text
T160
 ↓
T161
 ↓
T162
 ↓
T163
 ↓
T164
 ↓
T171
 ↓
T173
 ↓
T174
```

## Compliance

```text
T190
 ↓
T191
 ↓
T192
 ↓
T193–T204
 ↓
T205
 ↓
T207
```

---

# 6. Paralelismo recomendado

Após T000, estes blocos podem avançar em paralelo:

```text
Bloco A
School core

Bloco B
Coach profile

Bloco C
Audit foundation

Bloco D
NormalizedActivity mapping

Bloco E
ADRs
```

Depois da fundação de memberships:

```text
Coach memberships
Athlete memberships
Role policies
```

podem ser desenvolvidos em paralelo.

Após `Workout` estar estável:

```text
Frontend editor
Matching
Avaliação
Templates
```

podem avançar em paralelo.

---

# 7. Tasks bloqueadoras do MVP

As tasks abaixo são obrigatórias antes de considerar o MVP utilizável:

```text
T000
T010–T019
T020–T039
T040–T059
T060–T079
T080–T099
T100–T119
T120–T149
T160–T184
T190–T213
T220–T232
T240–T249
T250–T265
T270–T280
T290–T300
T310–T319
T330–T347
T360–T371
```

Turmas podem ser adiadas:

```text
T150–T156
```

Marketplace:

```text
T400+
```

---

# 8. Definition of Done por task

Toda task de backend só poderá ser marcada como concluída quando:

- código compilando;
- lint passando;
- testes correspondentes passando;
- erros de domínio tratados;
- autorização aplicada quando necessária;
- logs adicionados quando crítica;
- nenhuma violação do `required.md`;
- nenhuma violação do `design.md`.

Toda task de banco:

- migration criada;
- migration up testada;
- rollback avaliado;
- índices revisados;
- constraints revisadas.

Toda task frontend:

- loading;
- empty state;
- error state;
- permission denied;
- responsividade;
- integração real com API;
- sem mock residual em produção.

---

# 9. Definition of Done por fase

Uma fase só termina quando:

1. todas as tasks P0 concluídas;
2. todos os testes P0 passando;
3. documentação técnica atualizada;
4. nenhuma regressão;
5. build passa;
6. regras de autorização verificadas;
7. histórico preservado.

---

# 10. Regras de execução para LLM / agente

Ao executar esta lista:

1. nunca pular dependência;
2. nunca alterar arquitetura para facilitar uma task sem registrar decisão;
3. consultar `required.md` antes de mudar comportamento;
4. consultar `design.md` antes de criar tabela/endpoint;
5. preservar o padrão já existente do repositório;
6. usar documentação oficial das bibliotecas e APIs quando houver dúvida;
7. executar testes após cada grupo de tasks;
8. evitar grandes PRs que misturem fases;
9. preferir uma migration por bloco coerente;
10. não implementar marketplace durante MVP;
11. não acoplar módulo Escola a Garmin/Strava diretamente;
12. não mover histórico fisicamente entre escolas;
13. não apagar histórico em desligamentos;
14. não sobrescrever vínculos temporais;
15. não introduzir autorização apenas no frontend.

---

# 11. Estratégia de PRs

Sugestão:

```text
PR-01 School foundation
PR-02 Memberships and roles
PR-03 Coach and athlete memberships
PR-04 Assignments and lobby
PR-05 Invitations
PR-06 History access grants
PR-07 Workout templates and prescriptions
PR-08 Workout assignments
PR-09 Activity matching
PR-10 Compliance engine
PR-11 Coach evaluation and athlete feedback
PR-12 Audit and security hardening
PR-13 Admin UI
PR-14 Coach UI
PR-15 Athlete UI
PR-16 E2E and rollout
```

---

# 12. Critérios finais do MVP

O MVP será considerado concluído quando for possível realizar este fluxo completo:

```text
1. Owner cria escola
2. Admin é adicionado
3. Coach entra na escola
4. Atleta recebe convite
5. Atleta entra/aguarda aprovação
6. Admin aprova
7. Coach é atribuído
8. Coach cria treino
9. Treino aparece para atleta
10. Atleta realiza atividade
11. NormalizedActivity chega
12. Ryvano identifica o treino
13. Prescrito × realizado é calculado
14. Compliance é exibido
15. Coach avalia
16. Atleta envia feedback
17. Coach é removido
18. Atleta vai para lobby
19. Admin atribui novo coach
20. Histórico continua intacto
21. Atleta sai da escola
22. Entra em nova escola
23. Decide compartilhar histórico
24. Nova escola acessa apenas o permitido
25. Atleta revoga compartilhamento
26. Dados continuam preservados
27. Escola antiga pode ser desativada sem apagar histórico
```

---

# 13. Regra final de implementação

> **Nenhuma task pode sacrificar histórico, autoria, temporalidade ou autorização para simplificar implementação.**

Esses quatro pontos são a base do módulo Escola:

```text
HISTÓRICO
AUTORIA
TEMPORALIDADE
AUTORIZAÇÃO
```

---

**Fim do `task-list.md`.**
