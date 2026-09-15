# Ryvano Escola — integração com o repositório (T000)

## Base inspecionada

Branch `feat/ryvano-escola`, base `0ffbd6f`. Documentos normativos lidos integralmente na ordem implementation → required → design → task-list. Reutilizar as regras de `PROJECT_MAP.md`, descritores auth/persistence/shared-activities e regras security/api/database/activities.

## Identidade e persistência

- `prisma/schema.prisma`: PostgreSQL, Prisma 6; IDs existentes `String @default(cuid())`, tabelas PascalCase e campos camelCase. Novos modelos seguem esse padrão, não UUID obrigatório do desenho conceitual.
- Atleta é `User.id`. `UserProfile` contém dados pessoais e onboarding; não existe entidade AthleteProfile esportiva separada. Usar `athleteId` referenciando `User.id`, sem duplicar identidade nem criar novo atleta ao ingressar.
- CoachProfile terá FK única para User e nenhuma escola obrigatória.
- Models novos: School, SchoolMembership, SchoolMembershipRole, CoachProfile, CoachSchoolMembership, SchoolAthleteMembership, CoachAthleteAssignment, InvitationLink, InvitationUse, HistoryAccessGrant, WorkoutTemplate, Workout, WorkoutBlock, WorkoutAssignment, WorkoutAssignmentHistory, WorkoutExecution, WorkoutCompliance, CoachEvaluation, AthleteFeedback, Team/TeamMember/TeamCoach, SchoolAuditLog.
- SchoolAuditLog separado de AdminAuditLog: administração de escola não equivale ao Role.ADMIN global.
- `server/db.ts`: singleton Prisma; transações interativas para alterações compostas, índices parciais SQL para vínculos ativos únicos. Migrations existentes numeradas 0001–0008; novas migrations aditivas a partir de 0009, schema-first, FKs históricas Restrict.

## Auth e fronteiras

- `server/auth.ts` fornece `auth()` e identidade da sessão; `server/auth-guards.ts` centraliza guards de páginas e onboarding.
- Rotas HTTP devem autenticar, validar Zod, delegar. Casos de uso também validam ator/contexto; não confiar em IDs ou permissões enviados pelo cliente.
- School/coaching/training/athlete-history são módulos de domínio, não providers. Reutilizar logger, Prisma, sessão e esporte canônico; não alterar registros Garmin/Strava.
- Isolar permissões de gestão, prescrição, avaliação e leitura temporal. Grant explícito por período/categoria para passado de outra escola; nenhum acesso privado por status PENDING.

## Atividades e eventos

- Persistência: Activity.id/userId/sportType/startedAt/durationSeconds/distanceMeters/metrics; `NormalizedActivity` em `modules/shared/activities/contracts` não inclui ID local nem athleteId.
- TrainingActivityReader deverá compor envelope `{id, athleteId, activity: NormalizedActivity}` sem consumir raw DTOs. Métricas opcionais continuam ausentes, não zero artificial. Não criar SchoolGarminActivity/SchoolStravaActivity.
- Não foi encontrado barramento genérico de domínio nos caminhos inspecionados; eventos Garmin são constantes locais. Escola precisa contratos de eventos próprios e emissão transacional persistida, com handlers desacoplados dos canais. Integração futura de matching deve permanecer provider-agnostic/idempotente.
- `server/logging/logger.ts` fornece logs JSON com redação recursiva; contextos de Escola devem conter IDs/correlationId/result, nunca tokens nem conteúdo privado.

## Validação e grafo

- Vitest (`vitest.config.mts`, Node, alias @), testes em tests/ e módulos; ESLint via npm run lint; compilação via TypeScript/Next build. TDD para comportamento novo.
- MCP list_repos retornou registro vazio; fallback CLI funcional `node .gitnexus/run.cjs`.
- Índice estava em 2d466f3, reindexado com analyze --index-only; status confirmou 0ffbd6f e 456 arquivos cobertos atualizados.
- Impact requireSession: LOW, 2 callers diretos (requireOnboardedSession/requireUserRecord), 4 símbolos alcançados; sem necessidade de alterar guards existentes.
- Impact NormalizedActivity: UNKNOWN (zero edges resolvidas); busca textual confirmou consumidores em parsers, contratos e reconciliação. Não modificar esse contrato: compor adapter.
- Analyze advertiu truncamento da descoberta de flows; não interpretar ausência de processo como ausência de impacto. Análise de mudanças por task continua obrigatória.
- Docker CLI existe, daemon indisponível; PostgreSQL não está no PATH. Antes da primeira migration, provisionar PostgreSQL local isolado por alternativa disponível; nunca usar DATABASE_URL de produção.

## Ordem e escopo

Seguir checkboxes da spec sequencialmente por elegibilidade. T137 depende de T150: retomá-la após dependências reais, sem marcação fictícia. T400+ fora do MVP. T368+ requer staging/rollout explicitamente autorizado; não simular conclusão nem ativar produção.
