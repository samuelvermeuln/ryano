# Mapa de telas do Ryvano

53 páginas (`page.tsx`), 69 rotas de API, 5 áreas com layout próprio.
Verificado por varredura em 2026-09-23. Regenerar com `scripts/audit-routes.sh`.

## Áreas e seus guards

Cada área tem um `layout.tsx` que aplica o guard. **O guard da área é a
fronteira de segurança real** — as páginas internas confiam nele.

| Área | Layout | Guard aplicado | Falha → |
|---|---|---|---|
| `/admin/*` | `app/admin/layout.tsx` | `requireAdmin()` (`User.role === ADMIN`) | `/app/dashboard` |
| `/app/*` | `app/app/layout.tsx` | `requireOnboardedSession()` | `/entrar` ou `/onboarding` |
| `/escola/[schoolId]/*` | idem | membership ACTIVE + role OWNER\|ADMIN | `redirect("/app/dashboard")` |
| `/professor/[schoolId]/*` | idem | `CoachProfile` ACTIVE + `CoachSchoolMembership` ACTIVE/`endedAt:null` | `redirect("/app/dashboard")` |
| `/atleta/[schoolId]/*` | idem | `SchoolAthleteMembership` ACTIVE (ENDED → só histórico) | `redirect("/app/dashboard")` |
| públicas | — | nenhum | — |

Todas as áreas de escola chamam `isSchoolModuleEnabled()` primeiro; flag off → `notFound()`.

## Área do atleta — `/app/*` e `/atleta/*`

`/app/*` é o **espaço pessoal do atleta** (dados do próprio relógio).
`/atleta/[schoolId]/*` é a **visão do atleta dentro de uma escola**.

| Rota | Conteúdo | Observações |
|---|---|---|
| `/app/dashboard` | Prontidão, Body Battery, FC, sono, `SchoolPanel`, `WeeklyWorkouts` | Widgets de wearable. OWNER/ADMIN sem vínculo de atleta é redirecionado para `/escola/{id}`; `?stay=1` mantém. `?days=N` ajusta janela. |
| `/app/atividades` | Lista de atividades sincronizadas | Filtros: `q`, `sort`, `sportType`, `provider`, `page` |
| `/app/atividades/[id]` | Detalhe multi-provider | Spec: `.kiro/specs/detalhe-atividade-multi-provider` |
| `/app/treinos` | Treinos do atleta | `view-switcher.tsx` — único componente de abas do sistema |
| `/app/treinos/nova-atividade` | Registro manual | |
| `/app/treinos/solicitar` | Solicitar treino ao professor | `WorkoutRequestStatus` |
| `/app/relatorios` | **Redireciona** para `/app/perfil#notificacoes` | Não é tela real — todos os perfis caem no perfil |
| `/app/integracoes` | Conectar Garmin/Strava | |
| `/app/perfil` | Dados pessoais, notificações | Âncora `#notificacoes` |
| `/app/seguranca` | Senha, sessões | |
| `/app/escola` | **Descoberta** de escolas (atleta procura escola) | Não confundir com `/escola` (administração) |
| `/app/professor` | Visão de professor dentro do app pessoal | |
| `/atleta/semana` | Calendário cross-escola | `?week=YYYY-MM-DD` |
| `/atleta/[schoolId]` | Painel do atleta na escola | |
| `/atleta/[schoolId]/calendario` | Calendário da escola | `?view=day&date=` / `?view=month&month=` |
| `/atleta/[schoolId]/historico` | Histórico | Acessível com membership ENDED |
| `/atleta/[schoolId]/treinos/[assignmentId]` | Blocos, alvos, `PushToWatchButton` | Envia ao Garmin |
| `/app/planos` | **TM043 (marketplace)** — licenças do atleta por estado | Atrás de `isMarketplaceEnabled()`, flag própria — ver `marketplace.yaml` |
| `/app/planos/[licenseId]` | **TM044** — "Meu plano": progresso, próximo treino, acompanhamento, ajustes | Ownership por `(id, athleteId)`; superfície `athlete-plan` do `CustomizableCardGrid` (TM050); **TM084 (marketplace, Onda 3)** acrescenta convidar/revogar professor e aceitar/recusar ajuste nos mesmos cards; **TM066 (marketplace, Onda 2)** acrescenta o banner "Reembolsado" (estado já mapeado desde a TM044, `deriveLicenseState`) |
| `/marketplace/[idDoTreino]/checkout` | **TM063 (marketplace, Onda 2)** — estado do checkout pago (Stripe): resumo imutável, nunca se auto-ativa | Exige sessão; ownership por `(purchaseId, athleteId)` (RNF-001); consulta o servidor — a confirmação só vem do webhook assinado (TM060/TM061) |

## Área da escola — `/escola/*`

Administração. Exige OWNER ou ADMIN.

| Rota | Conteúdo | Observações |
|---|---|---|
| `/escola` | Dispatcher | 307 → `/escola/{id}` da escola do usuário |
| `/escola/[schoolId]` | Painel operacional | Contadores + atrasados por atleta + execuções recentes. **Sem widgets de wearable** (a escola não conecta relógio). |
| `/escola/[schoolId]/atletas` | Lobby de atletas | T256/T257 |
| `/escola/[schoolId]/professores` | Professores da escola | |
| `/escola/[schoolId]/membros` | Membros e papéis | |
| `/escola/[schoolId]/solicitacoes` | Aprovar/rejeitar entrada | |
| `/escola/[schoolId]/convites` | Convites por token | |
| `/escola/[schoolId]/turmas` | **404 — não implementada** | Pasta `app/escola/[schoolId]/turmas/` existe vazia, mas o menu lateral linka para ela. Link quebrado em produção. |
| `/escola/[schoolId]/marketplace` | **TM046 (marketplace)** — produtos de titularidade da escola, vendas | OWNER/ADMIN via `CanManageSchool`; sem acesso a compradores externos |
| `/escola/buscar` | Busca pública de escolas | Sem guard de escola |
| `/escola/criar` | Criação de escola | Sem guard de escola |

## Área do professor — `/professor/*`

| Rota | Conteúdo |
|---|---|
| `/professor` | Dispatcher para a escola do professor |
| `/professor/[schoolId]` | Painel do professor |
| `/professor/[schoolId]/atletas` | Atletas atribuídos |
| `/professor/[schoolId]/atletas/[athleteId]` | Detalhe do atleta |
| `/professor/[schoolId]/atletas/[athleteId]/avaliar` | Avaliação (`CoachEvaluation`) |
| `/professor/[schoolId]/treinos` | Prescrição de treinos |
| `/professor/[schoolId]/turmas` | Turmas (existe, diferente de `/escola/.../turmas`) |
| `/professor/independente` | Professor sem escola |
| `/professor/buscar-escola` | Vincular-se a escola |
| `/professor/estudio/planos` | **TM028 (marketplace)** — lista dos próprios produtos publicados/rascunho | Não usa `AppShell` (coach independente não tem `schoolId` de contexto) |
| `/professor/estudio/planos/novo` | **TM029** — editor multimodal (semanas/dias/sessões) | `expectedVersion` para concorrência |
| `/professor/estudio/planos/[productId]` | **TM030** — edição, versionamento, vendas | Sem dado individual de comprador; **TM068 (marketplace, Onda 2)** acrescenta o painel "Financeiro (ledger)" — bruto/taxa/líquido do `SellerLedgerEntry`, nunca um cálculo paralelo na UI |
| `/professor/acompanhar/planos` | **TM082 (marketplace, Onda 3)** — convites pendentes, atletas que escolheram este coach, ajustes aguardando decisão | Separado do Estúdio (TM028); convite `PENDING` nunca mostra dado do atleta (RF-302) |
| `/professor/acompanhar/planos/[licenseId]` | **TM083** — instância comprada pelo atleta: semanas, sessões, propor ajuste | Exige `LicenseCoachEngagement` `ACTIVE` (404 senão, RNF-001); nunca chama rota de edição do produto (TM025/TM026) — só rotas de adaptação |

## Área do admin de plataforma — `/admin/*`

Exige `User.role === "ADMIN"`. Distinto de `SchoolRole.ADMIN` — ver `access-matrix.md`.

| Rota | Conteúdo |
|---|---|
| `/admin` | Painel |
| `/admin/escolas`, `/admin/escolas/[id]` | Gestão de escolas |
| `/admin/usuarios`, `/admin/usuarios/[id]` | Gestão de usuários |
| `/admin/professores` | Professores da plataforma |
| `/admin/integracoes` | Estado das integrações |
| `/admin/whatsapp` | Entregas WhatsApp/Evolution |

## Públicas

`/`, `/entrar`, `/entrar/convite/[token]`, `/cadastro`, `/onboarding`,
`/recuperar-senha`, `/redefinir-senha`, `/privacidade`, `/termos`,
`/marketplace`, `/marketplace/[idDoTreino]` (marketplace, TM035/TM036 —
visitante anônimo navega; comprar exige login, ver `marketplace.yaml`).

`/entrar` aplica `resolveSmartLandingPath()` quando já autenticado:
OWNER/ADMIN de escola ativa → `/escola`; com `CoachProfile` → `/professor`.
Comprador vindo do marketplace (`?callbackUrl=/marketplace/...`) volta à
oferta em vez de cair no dispatcher padrão — validado por
`isSafeMarketplaceCallbackPath` (TM037, proteção contra open-redirect).

## Redirects que não são erro

Next.js dev **não emite 307 em redirect de Server Component** — injeta
`<meta id="__next-page-redirect" http-equiv="refresh" url=...>` com HTTP 200.
`curl -w "%{redirect_url}"` mostra vazio. Detectar o destino assim:

```bash
curl -s -b cookie.txt "$URL" | grep -oE '__next-page-redirect[^>]*url=[^"]*'
```

Um 200 não prova que a página renderizou o conteúdo esperado.
