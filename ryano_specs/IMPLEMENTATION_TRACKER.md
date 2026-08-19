# RYANO — Plano e progresso de implementação

## Como retomar trabalho
1. Ler este arquivo primeiro.
2. Ver `Último checkpoint concluído`.
3. Executar `Próxima tarefa`.
4. Ao terminar tarefa, atualizar status da etapa, log de checkpoints e arquivos alterados.

## Referências obrigatórias já lidas
- `ryano_specs/00_RYANO_MASTER_PROMPT.md`
- `ryano_specs/01_PRODUCT_UX_SPEC.md`
- `ryano_specs/02_TECHNICAL_ARCHITECTURE.md`
- `ryano_specs/03_INTEGRATIONS_GARMIN_WHATSAPP.md`
- `ryano_specs/04_DATA_SECURITY_AUTH.md`
- `ryano_specs/05_ACCEPTANCE_CRITERIA_ROADMAP.md`
- `C:/Users/samuelv/Documents/Projetos pessoais/zap/zap-deals/.kiro/agents/skills/design-system.skill.md`
- `C:/Users/samuelv/Documents/Projetos pessoais/zap/zap-deals/.cave/agents/designer.md`
- `node_modules/next/dist/docs/01-app/index.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md`

## Macroetapas 00 → 05

| Etapa | Base | Objetivo | Status | Observação de retomada |
| --- | --- | --- | --- | --- |
| 00 | `00_RYANO_MASTER_PROMPT.md` | auditoria, plano persistente, base visual pública, estrutura inicial | `concluído` | base pública, tracker e estrutura inicial entregues |
| 01 | `01_PRODUCT_UX_SPEC.md` | landing, login, cadastro, onboarding, dashboard, atividades, integrações, perfil, admin | `em andamento` | telas principais + filtros/paginação/admin detail entregues; falta validação operacional real |
| 02 | `02_TECHNICAL_ARCHITECTURE.md` | estrutura modular, APIs internas, provider abstraction, services, testes base | `em andamento` | `server/*`, providers, services, route handlers e testes base criados |
| 03 | `03_INTEGRATIONS_GARMIN_WHATSAPP.md` | Garmin, Evolution, webhook, ativação WhatsApp, reports | `em andamento` | connect valida e sync inicial; webhook endurecido; falta validação real com serviços externos |
| 04 | `04_DATA_SECURITY_AUTH.md` | Prisma models, Auth.js, criptografia, hashing, roles, validações | `em andamento` | reset rate-limited, sessões revogadas no reset, guards e vault entregues |
| 05 | `05_ACCEPTANCE_CRITERIA_ROADMAP.md` | hardening, estados finais, lint/typecheck/build, testes mínimos, checklist | `em andamento` | hardening avançou; checklist final e validação com env real ainda abertos |

## Backlog priorizado

### T00 — fundação
- [x] Ler specs 00–05
- [x] Ler design system obrigatório
- [x] Auditar base atual do projeto
- [x] Criar tracker persistente
- [x] Substituir visual default do Create Next App por base RYANO pública
- [x] Criar páginas públicas mínimas para CTA (`/entrar`, `/cadastro`, `/termos`, `/privacidade`)
- [x] Preparar fundação de dados e auth

### T01 — produto/UX
- [x] Ligar login email/senha
- [x] Ligar cadastro
- [x] Ligar Google OAuth
- [x] Implementar onboarding completo
- [x] Estruturar dashboard, atividades, integrações, perfil, admin

### T02 — arquitetura
- [x] Criar estrutura server/lib/features coerente com specs
- [x] Definir contratos de provider e serviços
- [x] Criar route handlers prioritários

### T03 — integrações
- [x] Garmin connect/disconnect/sync
- [x] Normalização de atividades
- [x] Evolution admin QR/status
- [x] Ativação WhatsApp por token
- [x] Report pós-atividade

### T04 — dados, auth e segurança
- [x] Prisma schema + migrations
- [x] Auth.js + Prisma adapter
- [x] hashing de senha
- [x] Secret vault para Garmin
- [x] roles/admin guard
- [x] validação de env e input

### T05 — aceite e fechamento
- [x] loading/empty/error/success states
- [x] lint
- [x] typecheck
- [x] build
- [x] testes mínimos proporcionais
- [ ] revisão contra checklist 05

## Último checkpoint concluído
- `2026-08-19 / T05.2 parcial + compose operacional`
- Entrega:
  - hardening de auth com rate limit em cadastro/login/reset
  - reset de senha agora revoga sessões ativas e invalida tokens abertos
  - Garmin agora valida conexão, executa sync inicial e persiste erro quando sync falha
  - sync Garmin agora pagina múltiplas páginas
  - normalização Garmin agora rejeita payload sem ID estável
  - dedupe de `MessageDelivery` movido para constraint única no banco
  - webhook Evolution agora valida tamanho/json e mantém consumo de token mais seguro contra retry paralelo
  - atividades agora possuem filtros por período/provider/modalidade + paginação
  - admin usuários agora possuem busca e detalhe por usuário
  - admin WhatsApp agora possui refresh QR/reconnect, teste de mensagem e auditoria básica
  - migration inicial atualizada
  - Dockerfile + docker-compose gerados sem rodar migrations no startup
  - `.env.example` e `README.md` ajustados para operação via Compose
  - `npm run lint` OK
  - `npm test` OK
  - `npm run build` OK
- Limite honesto desta etapa:
  - implementação ainda não está validada com PostgreSQL real nem `.env` real
  - Google OAuth depende de credenciais configuradas
  - Garmin/Evolution ainda precisam de validação de ponta a ponta com serviços reais
  - fluxo de email transacional para reset ainda não existe
  - checklist 05 ainda precisa revisão item a item para declarar V1 fechada

## Próxima tarefa
- `T05.3 / validação operacional e fechamento`
- Ordem sugerida de continuação:
  1. subir PostgreSQL real e executar migration
  2. testar Auth.js com env real (`AUTH_SECRET`, Google)
  3. testar Garmin connect/sync com credenciais reais de homologação
  4. testar Evolution QR/webhook/ativação em ambiente real
  5. revisar checklist `05_ACCEPTANCE_CRITERIA_ROADMAP.md` item por item
  6. corrigir gaps restantes antes de chamar de concluído

## Arquivos alterados na rodada atual
- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `README.md`
- `package.json`
- `package-lock.json`
- `.env.example`
- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `vitest.config.mts`
- `tests/phone.test.ts`
- `tests/secret-vault.test.ts`
- `tests/garmin-normalizer.test.ts`
- `server/db.ts`
- `server/env.ts`
- `server/auth.ts`
- `server/auth-guards.ts`
- `server/queries.ts`
- `server/rate-limit.ts`
- `server/logging/logger.ts`
- `server/crypto/password.ts`
- `server/crypto/secret-vault.ts`
- `server/users/onboarding.ts`
- `server/utils/cpf.ts`
- `server/utils/phone.ts`
- `server/utils/token.ts`
- `server/validators/auth.ts`
- `server/validators/profile.ts`
- `server/validators/integrations.ts`
- `server/providers/wearables/types.ts`
- `server/providers/wearables/garmin.ts`
- `server/providers/messaging/types.ts`
- `server/providers/messaging/evolution.ts`
- `server/services/activity-normalizer.ts`
- `server/services/garmin-service.ts`
- `server/services/report-builder.ts`
- `server/services/whatsapp-activation.ts`
- `types/next-auth.d.ts`
- `lib/format.ts`
- `components/app-shell.tsx`
- `components/section-card.tsx`
- `components/empty-state.tsx`
- `components/status-badge.tsx`
- `components/submit-button.tsx`
- `components/admin/evolution-tools.tsx`
- `components/auth/google-sign-in-button.tsx`
- `components/auth/logout-button.tsx`
- `components/auth/login-form.tsx`
- `components/auth/signup-form.tsx`
- `components/auth/request-reset-form.tsx`
- `components/auth/reset-password-form.tsx`
- `components/profile/onboarding-form.tsx`
- `components/profile/preferences-form.tsx`
- `components/profile/change-password-form.tsx`
- `components/integrations/garmin-connect-form.tsx`
- `components/integrations/whatsapp-activation-card.tsx`
- `app/actions/auth.ts`
- `app/actions/profile.ts`
- `app/actions/integrations.ts`
- `app/actions/admin.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/health/route.ts`
- `app/api/me/route.ts`
- `app/api/integrations/garmin/route.ts`
- `app/api/integrations/garmin/connect/route.ts`
- `app/api/integrations/garmin/sync/route.ts`
- `app/api/whatsapp/activation/route.ts`
- `app/api/whatsapp/activation/status/route.ts`
- `app/api/webhooks/evolution/route.ts`
- `app/entrar/page.tsx`
- `app/cadastro/page.tsx`
- `app/recuperar-senha/page.tsx`
- `app/redefinir-senha/page.tsx`
- `app/onboarding/page.tsx`
- `app/app/layout.tsx`
- `app/app/page.tsx`
- `app/app/dashboard/page.tsx`
- `app/app/atividades/page.tsx`
- `app/app/atividades/[id]/page.tsx`
- `app/app/integracoes/page.tsx`
- `app/app/relatorios/page.tsx`
- `app/app/perfil/page.tsx`
- `app/app/seguranca/page.tsx`
- `app/admin/layout.tsx`
- `app/admin/page.tsx`
- `app/admin/usuarios/page.tsx`
- `app/admin/usuarios/[id]/page.tsx`
- `app/admin/whatsapp/page.tsx`
- `app/admin/integracoes/page.tsx`
