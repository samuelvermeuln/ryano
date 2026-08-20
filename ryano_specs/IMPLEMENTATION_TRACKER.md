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
- `2026-08-19 / landing QA final 72–78 + ajustes`
- Entrega:
  - dashboard agora possui período selecionável real (`7/30/90/365` dias)
  - resumo do dashboard agora usa atividades reais do período, não apenas últimos 5 registros
  - dashboard agora mostra cards prioritários exigidos: Garmin, WhatsApp, última sync, última atividade
  - dashboard agora mostra evolução agregada por bucket do período
  - onboarding agora possui stepper visual de 5 etapas com progresso claro
  - onboarding agora incorpora Garmin e WhatsApp no próprio fluxo da página
  - formulário de onboarding agora explicita etapas 1–3 e exibe email da conta
  - admin WhatsApp agora mostra status de webhook, refresh de painel e disconnect operacional inicial
  - contract/provider Evolution agora expõem `disconnect()`
  - rate limit crítico agora usa persistência em banco com transação serializable e retry
  - schema/migration ganharam `RateLimitBucket` em migration aditiva `0002_rate_limit_bucket`
  - endpoints e server actions principais agora tratam `RATE_LIMIT_EXCEEDED` explicitamente
  - fluxo de reset ganhou provider SMTP + envio real por email quando ambiente estiver configurado
  - tela `/recuperar-senha` agora comunica modo real SMTP, fallback dev ou indisponibilidade em produção de forma honesta
  - `.env.example`, `docker-compose.yml` e `README.md` agora incluem variáveis SMTP
  - health endpoint agora expõe readiness honesta com checagem de DB/config
  - script `npm run ops:health` adicionado para smoke operacional
  - runbook de validação real criado em `ryano_specs/VALIDATION_RUNBOOK.md`
  - Dockerfile corrigido para `npm ci --ignore-scripts`, `prisma generate` após `COPY . .` e instalação de `openssl`
  - docker-compose ajustado para expor PostgreSQL em `9596` e app em `19595` por padrão, evitando conflito comum com portas já ocupadas no host
  - parser de env corrigido para tratar strings vazias do Docker Compose como `undefined`, evitando crash de `ZodError` em envs opcionais
  - landing page reescrita com foco em conversão para relatórios esportivos no WhatsApp e mock visual de mensagem recebida no telefone
  - biblioteca `motion` incorporada para animações mais premium no marketing e shell autenticado
  - shell autenticado agora possui barra inferior mobile com estética inspirada em app nativo/glass estilo Apple
  - bottom nav pública/mobile agora troca opções quando existe sessão válida
  - páginas públicas de login/cadastro/recuperação agora redirecionam automaticamente quando sessão válida já existe
  - `/redefinir-senha` agora também redireciona automaticamente quando sessão válida já existe
  - transições de rota com `motion` aplicadas via `app/template.tsx`
  - bottom nav autenticada foi simplificada para mobile com comportamento mais próximo de app/iOS
  - header autenticado agora é sticky e mais próximo de app nativo
  - landing corrigida para hash `/#seguranca`, scroll mais estável no topo e fundo azul/verde sem preto pesado
  - mock do telefone foi refeito para parecer conversa de WhatsApp real, sem layout quebrado
  - build/container pipeline otimizado com `next output: standalone`, cache de npm/`.next` no Dockerfile e healthchecks mais rápidos no Compose
  - workflow de CI criado com cache, cancelamento de runs antigos e skip para mudanças só em docs/specs
  - mock do telefone removendo badge lateral extra e landing remodelada para menos texto e mais sinal visual
  - blocos de conversão/credibilidade ganharam espaçamento melhor, chips curtos e seção visual para triatleta com natação/bike/corrida + gráfico
  - próximo passo de conversão aplicado: hero secundário visual para triatleta, ilustrações SVG inline mais premium e gráficos de evolução semanal/mensal
  - hero visual agora virou carrossel interativo animado com nomes `Ryvano Souza`, `Elisa Santos` e `Rosa Maria`, troca automática horizontal e filtros clicáveis para natação/bike/corrida alterando gráficos
  - mock do WhatsApp agora sincroniza com atleta/modalidade do carrossel, com autopause em hover/toque e swipe no mobile para trocar atleta
  - landing foi reorganizada: FAQ removido, hero visual ganhou mais espaço/cor/leitura, cards `Hábito/Público/Confiança/Produto` foram movidos para baixo e perfis simulados agora cobrem triatleta, nadadora e corredora
  - próximos passos aplicados com cuidado: drag com snapping, indicadores de carrossel, barra de autoplay e mock WhatsApp trocando horário/status/bolhas por perfil/modalidade
  - refinamento premium adicional: labels visuais nos eixos dos gráficos, avatar mais realista no mock WhatsApp, status `digitando...` animado e transições de mensagem mais naturais com typing bubble
  - sistema centralizado de ícones esportivos criado em `components/icons/SportIcon.tsx` com `@iconify/react`, tokens de cor por esporte em `app/globals.css` e avatares/bolhas agora variando por perfil simulado
  - páginas públicas agora falham em modo anônimo quando auth/session atrasam, evitando timeout de landing e shells públicos por dependência opcional de sessão
  - SEO/crawlability pública evoluiu para camada dinâmica centralizada com `server/site-discovery.ts`, `server/seo.ts`, `app/robots.ts`, `app/sitemap.ts`, `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts` e headers reais em `next.config.ts`
  - rotas públicas indexáveis e rotas `noindex` agora compartilham fonte única para sitemap/robots/llms/headers, reduzindo drift operacional
  - melhorias de `RYANO_UI_UX_MELHORIAS.md` aplicadas na landing: nova copy do hero, CTAs padronizados, navegação pública reescrita, demo por modalidade com `Natação/Ciclismo/Corrida/Triathlon`, gráficos com tooltip e unidades claras, seção real de modalidades, integrações, segurança e OG image dinâmica
  - demo pública agora usa fixtures centralizadas por modalidade em `components/landing-athlete-data.ts`, `lib/sports.ts` e `lib/format.ts`, sem textos internos de design nem modalidades desabilitadas
  - rodada final de QA contra critérios `72..78` aplicada com ajustes: CTA autenticado padronizado, demo marcada explicitamente como ilustrativa, autoplay pausando em foco de teclado, reduced motion cobrindo smooth scroll/animações CSS, mock WhatsApp fluido para mobile, footer com folga para bottom dock e remoção de emojis estruturais do mock
  - ajuste final de layout no bloco `Veja na prática`: card interno da demo agora ocupa 100% da largura disponível do container externo em desktop, sem coluna vazia reservada
  - refinamento seguinte aplicado na demo: mais respiro horizontal interno, nova proporção desktop favorecendo leitura do painel direito e mock WhatsApp agora simula recebimento com estado de loading antes das mensagens aparecerem
  - navegação por hash da landing corrigida: header público agora permanece visível com comportamento sticky, `scroll-padding-top` global foi ampliado e âncoras `#top`, `#como-funciona`, `#veja-na-pratica`, `#modalidades`, `#seguranca` passaram a usar offset consistente
  - dock mobile público foi movido para fora de `AuroraBackground` e elevado para `z-50`, evitando sumiço durante scroll por clipping do container visual
  - `LandingWhatsappPhone` deixou de usar animações com sensação de escala/crescimento; mock agora mantém tamanho constante durante entrada e troca de mensagens
  - largura estrutural do `LandingWhatsappPhone` foi desacoplada do conteúdo: wrapper da landing e componente agora usam largura explícita/capada (`w-[min(100%,378px)]` + `max-w-[378px]`) para impedir mock menor quando vazio e maior quando cheio
  - versão mobile da landing foi simplificada: header público ocultado em telas pequenas e seções `Como funciona` + `Segurança` removidas do fluxo mobile para manter foco em hero, demo e CTA principal
  - dock mobile foi extraído para componente reutilizável server-side em `components/mobile-dock.tsx`, com renderização compartilhada entre landing pública, `/app`, `/admin` e `/onboarding`; quando existe sessão, dock agora recebe nome/foto e pode exibir avatar do usuário
  - landing pública mobile agora deixa conteúdo rolar atrás do `MobileDock`: padding inferior extra de compensação foi removido do `main` e do `footer` mobile em `app/page.tsx`
  - overlay do `MobileDock` público foi reforçado no mobile com `z-[120]` e footer público ocultado em telas pequenas, evitando bloco final competir visualmente com dock fixo
  - `MobileDock` agora renderiza via portal para `document.body` em `components/mobile-dock-client.tsx`, removendo competição com stacking contexts locais e garantindo overlay real sobre todo conteúdo no mobile
  - `MobileDock` foi redesenhado para padrão app-like: barra sólida clara sem glassmorphism, 4 itens distribuídos, pedestal integrado + botão ativo flutuante com spring horizontal, ícones Tabler, detecção de rota por prefixo, suporte a subrotas, avatar no item de perfil quando há sessão e safe-area mobile respeitada
  - refinamento visual do `MobileDock` aproximado à referência `Screenshot_2.png`: proporção mais compacta, superfície creme sólida, pedestal circular maior, botão ativo mais destacado e espaçamento/altura dos itens recalibrados usando tokens RYANO
  - estado ativo do `MobileDock` agora acompanha rota/hash corretamente: subrotas continuam no item certo e âncoras públicas (`#top`, `#veja-na-pratica`, `#modalidades`) passam a destacar item correspondente no mobile
  - refinamento adicional do dock mobile: label ativa agora usa cor própria abaixo do ícone, botão ativo passa a subir com deslocamento suave em `bottom: 2rem`, cada item possui acento cromático próprio dentro da paleta RYANO e altura da barra foi reduzida para leitura mais próxima da referência
  - etapa seguinte aplicada no dock mobile: barra estreitada ainda mais, pedestal reintroduzido e colado à base, círculo ativo reduzido, labels menores e proporções recalibradas para aproximar mais da referência visual enviada
  - `MobileDock` cliente foi refeito seguindo padrão `NotchNav`: base SVG com notch dinâmico, botão ativo colorido por item, label visível só no estado ativo, animação horizontal via `requestAnimationFrame`, navegação por `button` + `router/hash` e uso exclusivo de ícones SVG no menu
  - páginas públicas que usam `PublicPageShell` agora também renderizam `MobileDock`, substituindo dock legado; conjunto de itens passa a variar entre contexto público e contexto autenticado, sem misturar navegação pública com layout privado
  - bloco `Veja exemplo de relatório por modalidade` ganhou redesign específico para mobile em `components/landing-athlete-carousel.tsx`: menos dados por tela, métricas principais reduzidas, leitura semanal compacta, card de constância simplificado e remoção dos gráficos densos no breakpoint pequeno para evitar compressão excessiva
  - landing ganhou seção de credibilidade, seção de perfis e mock de telefone mais realista
  - teste unitário de email de reset adicionado
  - `npm run db:generate` OK
  - `npm run lint` OK
  - `npm test` OK
  - `npm run build` OK
- Limite honesto desta etapa:
  - envio SMTP foi implementado, mas não validado contra provedor real/caixa real
  - disconnect Evolution foi implementado, mas continua não validado contra instância real/versionamento real
  - rate limit distribuído foi implementado, mas ainda não validado em PostgreSQL real sob concorrência real
  - validação operacional real com PostgreSQL/Auth.js/Google/Garmin/Evolution/SMTP segue pendente
  - `APP_URL`/`AUTH_URL` públicos reais seguem obrigatórios para canonical/robots/sitemap/OG finais; sem isso `next build` ainda emite warning de `metadataBase` local ausente
  - V1 ainda não pode ser declarada concluída

## Próxima tarefa
- `T05.5 / validação operacional real`
- Ordem sugerida de continuação:
  1. executar runbook `ryano_specs/VALIDATION_RUNBOOK.md`
  2. validar PostgreSQL real + `prisma migrate deploy`
  3. testar rate limit em banco sob ambiente real
  4. testar Auth.js com env real (`AUTH_SECRET`, Google)
  5. testar reset por SMTP com caixa real
  6. testar Garmin connect/sync com credenciais reais de homologação
  7. testar Evolution QR/webhook/ativação/disconnect em ambiente real
  8. revisar `ryano_specs/SPEC_IMPLEMENTATION_AUDIT.md` e só então marcar fechamento

## Arquivos alterados na rodada atual
- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `README.md`
- `package.json`
- `next.config.ts`
- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
- `components/landing-whatsapp-phone.tsx`
- `app/robots.ts`
- `app/sitemap.ts`
- `app/llms.txt/route.ts`
- `app/llms-full.txt/route.ts`
- `app/opengraph-image.tsx`
- `app/twitter-image.tsx`
- `components/icons/SportIcon.tsx`
- `components/landing-whatsapp-phone.tsx`
- `components/landing-athlete-carousel.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `components/landing-athlete-data.ts`
- `components/landing-athlete-carousel.tsx`
- `components/landing-experience-context.tsx`
- `components/landing-whatsapp-phone.tsx`
- `components/motion-fade-in.tsx`
- `components/page-transition.tsx`
- `scripts/ops-health.mjs`
- `package-lock.json`
- `.env.example`
- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`
- `prisma/migrations/0002_rate_limit_bucket/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `vitest.config.mts`
- `tests/phone.test.ts`
- `tests/secret-vault.test.ts`
- `tests/garmin-normalizer.test.ts`
- `tests/password-reset-email.test.ts`
- `server/db.ts`
- `server/env.ts`
- `server/auth.ts`
- `server/auth-guards.ts`
- `server/site-discovery.ts`
- `server/seo.ts`
- `lib/sports.ts`
- `app/page.tsx`
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
- `server/providers/email/types.ts`
- `server/providers/email/smtp.ts`
- `server/providers/wearables/types.ts`
- `server/providers/wearables/garmin.ts`
- `server/providers/messaging/types.ts`
- `server/providers/messaging/evolution.ts`
- `server/services/activity-normalizer.ts`
- `server/services/password-reset-email.ts`
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
- `server/providers/messaging/types.ts`
- `server/providers/messaging/evolution.ts`
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
- `components/landing-whatsapp-phone.tsx`
- `components/app-shell.tsx`
- `app/actions/auth.ts`
- `app/actions/profile.ts`
- `app/actions/integrations.ts`
- `app/actions/admin.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `app/api/health/route.ts`
- `app/api/me/route.ts`
- `ryano_specs/VALIDATION_RUNBOOK.md`
- `ryano_specs/SPEC_IMPLEMENTATION_AUDIT.md`
- `app/api/integrations/garmin/route.ts`
- `app/api/integrations/garmin/connect/route.ts`
- `app/api/integrations/garmin/sync/route.ts`
- `app/api/whatsapp/activation/route.ts`
- `app/api/whatsapp/activation/status/route.ts`
- `app/api/webhooks/evolution/route.ts`
- `app/entrar/page.tsx`
- `app/page.tsx`
- `app/template.tsx`
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
