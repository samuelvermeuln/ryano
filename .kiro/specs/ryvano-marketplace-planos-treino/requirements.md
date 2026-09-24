# Ryvano Marketplace de Planos de Treino — Requisitos

**Spec:** `ryvano-marketplace-planos-treino` · **Base verificada:** `b6017cc`
**Spec de produto:** `RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md` v1.1

> Este arquivo contém os requisitos **normativos**. A spec de produto tem o
> racional, os fluxos completos, as telas e o design. Quando houver divergência,
> **este arquivo vence** para efeito de implementação — e a divergência deve ser
> corrigida na spec de produto.
>
> Vocabulário: **DEVE** = obrigatório; **NÃO DEVE** = proibido; **PODE** = opcional.

---

# 1. Contexto e objetivo

Professor publica plano estruturado; atleta descobre, adquire (grátis ou pago) e o
plano passa a existir no calendário pessoal do atleta, executável com ou sem
relógio. Comprar não contrata acompanhamento nem cria vínculo — isso é convite
separado para outro professor, escopo explícito, revogável, sem alterar o produto
original nem as licenças de outros compradores.

**Princípios herdados que este spec não pode violar:**

- **ADR-001 escola** (`architecture/adr/school/ADR-001-athlete-owns-history.md`):
  vínculo pode acabar; histórico do atleta não. O mesmo vale para o histórico de
  execução de um plano comprado.
- **ADR-001 multi-provider** (`architecture/adr/ADR-001-multi-provider.md`): módulo
  algum ramifica por identidade de provider; decisão é por capability.

---

# 2. Requisitos de correção e fundação — Onda 0

Estes requisitos corrigem **defeitos verificados no código** em `b6017cc` e criam a
base de schema sem a qual nenhuma feature de Onda 1+ pode ser implementada com
segurança. Reconfirmar antes de implementar: a base pode ter mudado.

## RF-001 — Catálogo público nunca vaza rascunho ou SCHOOL_ONLY

**Defeito verificado:** `app/api/training-products/route.ts:14-18` responde sem
checar sessão; `modules/school/application/list-training-products.ts:40,57` aplica
`status` e `visibility` vindos da query string sem checar autorização — uma
chamada anônima com `?status=DRAFT` ou `?visibility=SCHOOL_ONLY` retorna produtos
que não deveriam ser públicos.

- Toda listagem/detalhe **sem sessão autenticada e autorizada** **DEVE** ignorar
  `status`/`visibility` vindos do cliente e forçar `status=PUBLISHED` e
  `visibility=PUBLIC`.
- `UNLISTED` **PODE** ser lido por `GET` de detalhe por ID/slug direto, mas **NÃO
  DEVE** aparecer em listagem/busca.
- `SCHOOL_ONLY` e `DRAFT`/`ARCHIVED` **NÃO DEVEM** ser retornados a chamador sem
  vínculo válido (autor, escola proprietária autorizada, ou comprador com licença).
- A listagem "meus produtos" do professor **DEVE** ser uma rota autenticada
  separada (`schoolResponse`, ator obrigatório), nunca um parâmetro elevando a
  rota pública.

## RF-002 — Compra e licença na ordem correta dentro da transação

**Defeito verificado:** `create-training-purchase.ts:90-110` cria `TrainingPurchase`
e `TrainingLicense` com `Promise.all`, mas `TrainingLicense.purchaseId` é FK para
`TrainingPurchase.id` — as duas escritas não podem ser disparadas concorrentemente
dentro da mesma transação interativa.

- A compra **DEVE** ser criada e confirmada (`await`) antes da licença.
- Ambas **DEVEM** permanecer na mesma transação serializável.
- **NÃO DEVE** haver caminho em que uma licença exista sem compra correspondente
  válida (ou vice-versa) por falha parcial.

## RF-003 — Proprietário comercial exclusivo do produto

`TrainingProduct.schoolId` e `.coachId` são ambos opcionais hoje, sem checagem de
banco. Exatamente um dos dois **DEVE** estar preenchido (XOR), reforçado por
constraint de banco, não apenas por validação de aplicação.

## RF-004 — Versão publicada é imutável

`TrainingProductVersion` não tem proteção alguma contra `UPDATE` após
`publishedAt`. Uma vez publicada, `planPayload` e `changeNote` **NÃO DEVEM** ser
alteráveis por nenhum caminho de aplicação; mudança de conteúdo **DEVE** criar
nova versão.

## RF-005 — Plano multimodal e multi-sessão por dia

`planPayloadSchema` (`modules/school/domain/training-product-version.ts:7-21`)
permite no máximo uma sessão por dia (`planDaySchema` referencia um único
`workoutTemplateId`). O schema de plano **DEVE** suportar `weeks[] → days[] →
sessions[]`, com `sportType` por sessão, permitindo corrida e força no mesmo dia.

- O leitor **DEVE** continuar aceitando o formato antigo (`day.workoutTemplateId`)
  sem invalidar versões já publicadas — migração de leitura, não reescrita de dado.
- Cada sessão **DEVE** ter identificador estável (`planSessionId`) para
  rastreabilidade e ajuste posterior.

## RF-006 — Calendário ancorado no fuso do atleta

**Defeito verificado:** `toMonday()`
(`modules/school/application/instantiate-license-calendar.ts:25-32`) sempre ancora
em meia-noite UTC, ignorando o fuso do atleta e o horário de verão.

- A ativação **DEVE** receber timezone IANA e `LocalDate` de início ou de prova.
- A instanciação **DEVE** calcular o dia local corretamente em fusos positivos e
  negativos, e em dias de 23 h/25 h (mudança de horário de verão) sem deslocar
  sessões para o dia seguinte.

## RF-007 — Módulo documentado no mapa de arquitetura

`architecture/modules/school.yaml` não lista `app/api/training-products` nem
qualquer caminho de marketplace em `paths:`, embora o código já viva sob
`modules/school/`. A documentação de arquitetura **DEVE** refletir onde o
marketplace vive e quais invariantes ele herda do módulo escola.

---

# 3. Requisitos funcionais — Onda 1 (produto completo, sem pagamento real)

## RF-101 — Porta de entrada do professor

Criar/editar/publicar produto **DEVE** exigir sessão válida e `CoachProfile`
ativo. Escola proprietária **DEVE** exigir OWNER/ADMIN autorizado da escola. Um
usuário logado só como atleta **NÃO DEVE** adquirir poderes de professor.
Servidor **DEVE** rejeitar essas mutações mesmo com URL acessada diretamente,
sessão expirada ou perfil suspenso.

## RF-102 — Editor estruturado

O editor **DEVE** permitir montar `weeks[] → days[] → sessions[]` a partir da
biblioteca de templates do próprio autor, com blocos, duração/distância/
repetições/zonas quando aplicável, descanso, alternativa sem wearable e nota de
segurança. **DEVE** permitir duplicar semana, arrastar sessão, dia de descanso e
mais de uma sessão por dia. **DEVE** oferecer preview no ponto de vista do atleta
antes de publicar.

## RF-103 — Publicação cria versão imutável íntegra

Publicar **DEVE** verificar que todo template referenciado existe, pertence ao
autor/escola ou tem licença de uso, e **DEVE** gravar snapshot suficiente para
executar e renderizar o plano mesmo se o template de origem for arquivado depois
(RF-004 garante que essa versão não muda mais).

## RF-104 — Painel de vendas sem dado individual

O autor **DEVE** ver volume de vendas, receita e status agregados do próprio
produto. **NÃO DEVE** ver biometria, execução individual, comentários pessoais ou
contato do comprador além do estritamente necessário à gestão/recibo autorizados
por vender — vender não cria vínculo (ver RNF-002).

## RF-105 — Descoberta pública sem cadastro

Visitante anônimo **DEVE** poder pesquisar, filtrar (modalidade, duração,
dificuldade, objetivo/prova, avaliação, preço, equipamento, idioma) e paginar o
catálogo. Filtros, ordenação e página **DEVEM** sincronizar com a query string e
sobreviver a recarga. Contagem e paginação **DEVEM** ocorrer no servidor.

## RF-106 — Detalhe público conforme visibilidade

`/marketplace/[idDoTreino]` **DEVE** exibir para quem serve, o que inclui, amostra
(uma semana/sessão pública deliberada, nunca o plano inteiro), autor, preço,
política de uso e aviso explícito de que **comprar não inclui acompanhamento**,
exceto quando o produto declarar o serviço incluído.

## RF-107 — Porta de entrada do comprador

CTA de compra/aquisição **DEVE** exigir login/cadastro antes de abrir checkout ou
emitir licença — inclusive para plano gratuito. O retorno **DEVE** usar uma URL
interna de callback validada pelo servidor (`productId`, versão e intenção
preservados); `callbackUrl` externo **NÃO DEVE** ser aceito (proteção contra open
redirect). Usuário com licença ativa **DEVE** ver "Abrir meu plano" em vez de CTA
de cobrança.

## RF-108 — Aquisição gratuita idempotente

Para `priceCents = null`, a aquisição **DEVE** criar compra e licença na mesma
transação, sem duplicar em reenvio/retry/dupla aba. Nenhum provedor de pagamento
é necessário neste caminho.

## RF-109 — Ativação da licença

O atleta **DEVE** poder escolher "começar agora", data de início ou data-alvo/
prova, com preview do calendário resultante e detecção de conflito com treinos
existentes, antes de confirmar. A confirmação **DEVE** instanciar o calendário uma
única vez (idempotente mesmo com duas abas).

## RF-110 — Calendário do atleta mostra proveniência

`/app/treinos` **DEVE** mostrar origem "Marketplace", nome do plano e autoria para
sessões com `workoutId=null` + `workoutTemplateId`/`planSessionId` — **NÃO DEVE**
renderizar rótulo genérico ("Treino agendado") quando o template tiver título.

## RF-111 — "Meus planos" e "Meu plano" com estados corretos

`/app/planos` **DEVE** listar licenças por estado (aguardando pagamento, não
iniciado, em andamento, pausado, concluído, reembolsado). `/app/planos/[licenseId]`
**DEVE** mostrar progresso, próximo treino, autor, professor acompanhante (se
houver) e histórico de ajustes.

## RF-112 — Avaliações verificadas

Avaliar **DEVE** exigir compra confirmada, licença ativa e ao menos uma sessão
registrada. **DEVE** existir no máximo uma avaliação corrente por
`(purchaseId, athleteId, productId)`, editável com trilha de auditoria. Autor não
**DEVE** poder avaliar o próprio produto. Média e contagem exibidas **DEVEM**
derivar somente de avaliações elegíveis e aprovadas; sem avaliações, exibir
"Novo" — nunca "0 estrelas".

## RF-113 — Grid compartilhado com novas superfícies

`CustomizableCardGrid` **DEVE** aceitar as superfícies `marketplace-catalog`,
`athlete-plan` e `coach-studio` com ordem persistida por `(usuário, superfície)`,
**sem** sobrescrever `UserProfile.dashboardLayoutOrder` do dashboard do atleta nem
as demais telas que já consomem o componente (dashboard, atividades, integrações).

---

# 4. Requisitos funcionais — Onda 2 (venda paga)

## RF-201 — Checkout revalida tudo no servidor

`POST /api/marketplace/checkout` **DEVE** revalidar produto `PUBLISHED`,
visibilidade, versão, preço e moeda atuais no servidor e gravar
`offerSnapshot` congelado. **NÃO DEVE** aceitar preço, versão ou moeda vindos do
cliente.

## RF-202 — Confirmação de compra só por evento verificado

Nenhuma rota pública **DEVE** promover uma compra para `COMPLETED` a partir de um
`paymentRef` fornecido pelo navegador. A promoção **DEVE** ocorrer apenas por
webhook assinado do provedor ou por reconciliação servidor-a-servidor, validando
evento, titular, valor, moeda, produto/versão e ausência de processamento prévio
(`providerEventId` único).

## RF-203 — Idempotência de webhook e retry

Reenvio do mesmo evento de pagamento, callback do navegador antes do webhook, e
tentativa de reprocessar uma compra já `COMPLETED` **NÃO DEVEM** criar segunda
licença nem segunda instanciação de calendário.

## RF-204 — Reembolso auditado

Reembolso/estorno **DEVE** ocorrer apenas por evento do provedor verificado ou
ação administrativa auditada. **NÃO DEVE** apagar treinos já executados,
histórico ou autoria; efeito sobre sessões futuras segue política exibida ao
atleta antes da compra.

## RF-205 — Ledger sem percentual hardcoded

Split, taxa e repasse ao vendedor **DEVEM** ser parametrizáveis (configuração),
nunca uma constante no código. Todo evento financeiro **DEVE** gerar registro de
ledger auditável (bruto, taxa, líquido, repasse, reversão).

---

# 5. Requisitos funcionais — Onda 3 (acompanhamento independente)

## RF-301 — Convite separado da compra

Autorizar outro professor a acompanhar uma licença **DEVE** ser ação explícita do
atleta dono, distinta da compra, com escopo (o que o coach lê/edita), duração e
caminho de revogação visíveis antes do convite ser enviado. **Nenhum** grant de
biometria é presumido pelo convite.

## RF-302 — Aceite exclusivo do coach convidado

Convite pendente **NÃO DEVE** abrir nenhum dado ao coach. Somente o coach
convidado **DEVE** poder aceitar, após o servidor checar status `ACTIVE`,
identidade e ausência de conflito com a política de atribuição vigente.

## RF-303 — Ajustes versionados sem alterar o original

Um ajuste proposto pelo coach acompanhante **DEVE** gerar `PlanAdaptation`
(before/after, motivo obrigatório, autoria) e, quando alterar compromisso do
atleta, **DEVE** exigir aceite dele antes de valer. O produto publicado e as
licenças de outros compradores **NÃO DEVEM** ser afetados.

## RF-304 — Revogação preserva histórico

Remover/trocar o coach acompanhante **DEVE** cessar o acesso futuro imediatamente
no servidor (não só na UI) e **NÃO DEVE** apagar histórico, execuções ou autoria
dos ajustes já aplicados.

## RF-305 — Precedência entre coaches por modalidade

Quando o plano é multimodal, o sistema **DEVE** definir precedência clara por
sessão/modalidade (um responsável principal por licença, ou por modalidade com
escopo parcial concedido) e **NÃO DEVE** permitir ajustes simultâneos
conflitantes sem regra explícita.

---

# 6. Requisitos não funcionais

## RNF-001 — Autorização no servidor, por rota

- Toda rota nova **DEVE** ter checagem própria no servidor; o guard de
  `layout.tsx` protege a página, não a API.
- `schoolId`, `coachId`, `athleteId` vindos do corpo/query **NÃO DEVEM** conceder
  papel — o ator vem da sessão.
- Acesso a recurso fora do escopo do ator **DEVE** responder 404, não vazar
  existência.

## RNF-002 — Papéis não presumidos

Autoria, venda, licença e acompanhamento são conceitos distintos (princípio 1 da
spec de produto). Vender **NÃO DEVE** conceder acesso a dado individual; comprar
**NÃO DEVE** criar vínculo de acompanhamento; nenhuma tela **DEVE** apresentar um
papel como concedido antes da ação explícita que o concede.

## RNF-003 — Transação, idempotência e concorrência

- Mudança de estado + evento/auditoria **DEVEM** ocorrer na mesma transação.
- Operações repetidas por retry **DEVEM** ser idempotentes.
- Edição concorrente em entidade versionada (`TrainingProduct` em edição,
  `PlanAdaptation`, ativação de licença) **DEVE** usar `expectedVersion` → 409.

## RNF-004 — Contrato HTTP

Envelope `schoolResponse`/`publicSchoolResponse`; Zod `strictObject`; datas ISO
8601 no HTTP, UTC no banco; listas `{ items, nextCursor }`, `limit` padrão 20 e
máximo 100; erros do catálogo `SCHOOL_ERROR_STATUS`; `runtime = "nodejs"` e
`dynamic = "force-dynamic"`.

## RNF-005 — Design system

Reusar `AppShell`, `AppHeader`, `MobileDock`, `CustomizableCardGrid`, tokens
`theme-*` e `--sport-*`, ícones `@tabler/icons-react`. **NÃO DEVE** ser criada
paleta paralela nem segundo header global. Correção em componente compartilhado
**DEVE** ser feita nele, nunca por fork.

## RNF-006 — Taxonomia canônica

Todo campo de modalidade **DEVE** usar `RyvanoSportType`/`isRyvanoSportType`/
`getRyvanoSportLabel` (`modules/shared/activities/sport-types/index.ts`). **NÃO
DEVE** ser adicionado tipo livre de provider diretamente ao produto ou à sessão.

## RNF-007 — Sem relógio continua funcional

Agenda, descrição, marcação manual, feedback e conclusão do plano **NÃO DEVEM**
depender de Garmin/Strava ou de qualquer provider — princípio 8 da spec de
produto.

## RNF-008 — Observabilidade sem PII

Usar `schoolLogger`/`schoolMetrics`. **NÃO DEVE** registrar token, segredo,
número de cartão ou PII. Instrumentar ao menos: produto publicado, compra
concluída, licença ativada, avaliação criada, convite de acompanhamento aceito,
ajuste aprovado.

## RNF-009 — Feature flag de rollout

Toda rota/UI **DEVE** ficar atrás de flag (ver Q8 em `STATUS.md`/`design.md`
D-0X) com estado desligado retornando 404 seguro — mesma convenção de
`SCHOOL_MODULE_ENABLED`.

## RNF-010 — Acessibilidade

`h1` único por página, labels reais, foco visível, ordem de teclado igual à
visual, estado não indicado só por cor, alvos de toque ≥ 44 px, contraste e
`prefers-reduced-motion` respeitados nas larguras 320/375/768/1024/1440 px.

## RNF-011 — Degradação honesta

Catálogo vazio, coach sem plano, compra pendente, licença sem início, coach não
aceito, coach removido, produto arquivado, reembolso e provider indisponível
**DEVEM** ter estado de UI definido (§13 da spec de produto) — nenhuma tela nova
**DEVE** ter loading infinito ou dado inventado.

## RNF-012 — Nenhum dado comercial inventado

Selo de resultado garantido **NÃO DEVE** existir. Ordenação "mais bem avaliados"/
"mais comprados" **DEVE** ser transparente e baseada em dado real (volume mínimo
ou ranking ponderado), nunca popularidade simulada.

---

# 7. Fora de escopo

| Item | Onda |
|---|---|
| Responsável legal, contratos digitais de acompanhamento | Futuro — mesmo limite já registrado na spec da Jornada |
| Cooperação multi-escola sobre o mesmo produto | Futuro — validar demanda antes |
| Mais de um coach acompanhante simultâneo sem regra de precedência explícita | Futuro — MVP usa RF-305 (um responsável principal) |
| IA sugerindo ajuste de plano automaticamente | Futuro — **nunca** altera plano ou concede acesso sozinha |

**Regra de comunicação:** funcionalidade proposta **NÃO DEVE** ser declarada
pronta em release notes, telas ou material comercial antes de sua Onda concluir
os gates de `design.md` §6.

---

# 8. Rastreabilidade

| Requisito | Tasks | Critérios de aceite (spec de produto) |
|---|---|---|
| RF-001 | TM001 | Aceites essenciais §14, item 2 |
| RF-002 | TM002 | §14 item 6 |
| RF-003 | TM003 | §9 tabela `TrainingProduct` |
| RF-004 | TM004 | §9 tabela `TrainingProductVersion`, princípio 5 |
| RF-005 | TM010 | §7, AC de plano multimodal |
| RF-006 | TM011 | §12, princípio 8 |
| RF-007 | TM013 | — (dívida de documentação) |
| RF-101 | TM018, TM019, TM024 | §4.1 passo 1–2 |
| RF-102 | TM020, TM021, TM029 | §4.1 passo 3–4 |
| RF-103 | TM022, TM026 | §4.1 passo 5 |
| RF-104 | TM023, TM027, TM030 | §4.1 passo 7 |
| RF-105 | TM031, TM033, TM035 | §5.1, aceite §14 item "visitante" |
| RF-106 | TM032, TM034, TM036 | §5.2 |
| RF-107 | TM037 | §4.2 intro, aceite §14 item "toca Comprar" |
| RF-108 | TM002, TM038, TM039 | §4.2 passo 3–4 |
| RF-109 | TM041, TM042 | §4.2 passo 4–5 |
| RF-110 | TM007, TM045 | §5, linha `/app/treinos` |
| RF-111 | TM043, TM044 | §5.2 "Meu plano" |
| RF-112 | TM047, TM048, TM049 | §5.3 |
| RF-113 | TM050 | §6 |
| RF-201 | TM058, TM062 | §10 passo 1 |
| RF-202 | TM060, TM061 | §10 passo 3, "Risco concreto do código atual" |
| RF-203 | TM060, TM064, TM069 | §10 passo 4 |
| RF-204 | TM065, TM066 | §10 passo 7 |
| RF-205 | TM057, TM067 | §10 passo 6 |
| RF-301 | TM072, TM077 | §4.3 passo 1 |
| RF-302 | TM073, TM078 | §4.3 passo 2 |
| RF-303 | TM074, TM075, TM079, TM080 | §4.3 passo 3–4 |
| RF-304 | TM076, TM081 | §4.3 passo 5 |
| RF-305 | TM085 | §12 último item |
| RNF-001 | todas as tasks de rota | §14 item "coach deslogado" |
| RNF-003 | TM002, TM022, TM041, TM060, TM074 | §9 "Concorrência" |
| RNF-006 | TM010, TM031 | §7 |
| RNF-008 | TM052, TM070, TM086 | §14.4 (referência de instrumentação) |
| RNF-011 | TM051 | §13 |

Os critérios de aceite detalhados (`AC-*`) e os cenários E2E numerados estão em
`RYVANO_MARKETPLACE_PLANOS_TREINO_SPEC_V1.md` §14.
