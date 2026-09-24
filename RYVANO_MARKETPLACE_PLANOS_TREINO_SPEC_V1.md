# Ryvano Marketplace — planos de treino, compra, calendário e acompanhamento independente

**Versão:** 1.1 · **Data:** 23/09/2026 · **Base de código consultada:** `samuelvermeuln/ryano`, commit `0f3120fc0f6fec31b6ebabe1ecf24a0a9466f6f8`.

> Especificação para implementar o marketplace. Conferir o estado do repositório ao iniciar; este documento distingue código existente de funcionalidades propostas. Deve ser lido junto de `RYVANO_JORNADA_ESCOLA_SPEC_V1.md`, mantendo o mesmo design system e os guards do Ryvano.

## 1. Visão do produto

O professor publica planos estruturados de corrida, natação ou outras modalidades suportadas. O atleta encontra, compara, compra ou adquire um plano gratuito, define a data de início ou a data da prova, e o plano passa a aparecer no **seu calendário de treinos**, com treinos prescritos, execução e progresso. O atleta pode seguir sozinho ou autorizar **outro professor** a acompanhá-lo e adaptar sua instância pessoal. Comprar um plano **não contrata automaticamente acompanhamento**, não cria vínculo com o autor, não dá ao vendedor acesso ao histórico pessoal do comprador e não altera o plano de outros compradores.

### O caso que o sistema deve resolver

**Professor Carlos** publica “Corrida 5 km — iniciante — 8 semanas”. **Atleta Ana** compra. Ana escolhe uma segunda-feira para começar; os treinos são associados à sua conta, aparecem em `/app/treinos` e podem ser registrados manualmente ou por integração disponível. Ana já treina com **professora Beatriz**, de outra escola ou independente. Ana permite que Beatriz acompanhe **essa instância do plano**. Beatriz ajusta a quarta semana para a disponibilidade de Ana, registra motivo e autoria; o produto original do Carlos e a cópia de qualquer outro comprador não mudam. Carlos aparece como autor do plano; Beatriz aparece como responsável pelos ajustes individuais.

**Outro exemplo:** Paulo compra “Natação — 750 m contínuos — 10 semanas”. Ele não usa relógio. Usa calendário, descrições dos blocos, check-ins/registro manual e feedback. Depois contrata uma professora de natação para acompanhar o plano; o vínculo começa nessa data, sem dar acesso automático às atividades anteriores.

## 2. Princípios obrigatórios

1. **Autoria, venda, licença e acompanhamento são coisas diferentes.** Autor criou; vendedor recebe pela oferta; atleta adquiriu direito de uso; professor acompanhante atua numa instância autorizada. Uma pessoa pode acumular papéis, mas o sistema não os presume.
2. **Plano comprado é executável no Ryvano.** Não é somente PDF: contém semanas, dias, sessões, blocos/objetivos, descanso, instruções e links para treinos do calendário.
3. **Venda não cria vínculo professor–atleta.** O criador só vê venda, status e métricas agregadas apropriadas; não vê biometria, comentários pessoais, execução individual ou contatos além dos dados estritamente necessários ao recibo/gestão autorizada.
4. **Acompanhamento é escolha separada do atleta.** Professor B só recebe acesso após convite/aceite e vínculo válido ou permissão individual explícita; escopo, duração e revogação visíveis.
5. **O original permanece estável.** Versão publicada e adquirida é imutável; alterações posteriores do autor criam nova versão para novas vendas ou atualização opcional explícita. Ajustes de B são revisões na instância de Ana, com histórico antes/depois, sem reescrever a versão comprada.
6. **Amplitude de modalidades, sem prometer falsamente “qualquer exercício” pronto.** Usar taxonomia canônica `RyvanoSportType` para as modalidades já suportadas; ampliar catálogo de exercícios, tipos de sessão e métricas por capability. Novas modalidades terão editor genérico seguro e extensões específicas quando disponíveis.
7. **Compra legítima e idempotente.** Uma referência de pagamento escrita pelo navegador nunca é prova de pagamento; licenças e calendário só são liberados após confirmação confiável do provedor, ou imediatamente para preço zero com validação no servidor.
8. **Sem relógio continua funcional.** Agenda, descrição, marcação manual, feedback e conclusão do plano não dependem de Garmin/Strava ou de qualquer provider.

## 3. Diagnóstico técnico do commit consultado

| Existente | Estado observado | Trabalho necessário |
|---|---|---|
| `TrainingProduct` | Autor exclusivo escola **ou** coach, título, modalidade, semanas, estado, visibilidade, preço e versão corrente. | UI de autor, catálogo, metadados comerciais/regras de publicação. Decidir vendedor jurídico/comercial de produtos de escola. |
| `TrainingProductVersion` | `planPayload` versionado, semanas/dias com `workoutTemplateId`, snapshot JSON; versão não deve ser alterada após publicação. | Editor, preview, validação de templates e snapshot completo de conteúdo essencial no momento de publicar. |
| `TrainingPurchase`/`TrainingLicense` | Modelos de compra, licença e direito de uso já definidos. | Checkout, confirmação confiável, deduplicação, reembolso, área “Meus planos”. |
| `CreateTrainingPurchase` | Caso de uso cria compra `COMPLETED` e licença `ACTIVE` se receber `paymentRef` para item pago. Não foi localizado endpoint público de compra no commit. | Não expor este caso diretamente ao cliente; receber confirmação via webhook assinado/reconciliação do provedor. Rever ordem de criação da compra e licença na transação; a licença tem FK para a compra. |
| `InstantiateLicenseCalendar` | Cria `WorkoutAssignment` com `trainingLicenseId`, `workoutTemplateId` e `workoutId=null`. Começa na segunda-feira UTC e usa `scheduledAt`/`dueAt` com um dia de 23 h. | Integrar após compra/ativação e corrigir ancoragem no fuso do atleta, calendário, títulos de template, idempotência concorrente e diferenças DST. Não associar ao coach vendedor automaticamente. |
| `planPayloadSchema` | Cada semana tem até 7 entradas de dia; cada entrada aponta para um template. | Permitir mais de uma sessão por dia e plano multimodal; preservar compatibilidade com versões antigas via versionamento/migração de payload. |
| `/api/training-products` | GET existente para lista. Filtros `status` e `visibility` vêm da query; a consulta aceita valores como `DRAFT`/`SCHOOL_ONLY` sem checar autorização no caso de uso. | Corrigir imediatamente: catálogo público retorna só `PUBLISHED` e `PUBLIC` com versão; `UNLISTED` via link sob regra; `SCHOOL_ONLY` e rascunhos somente para público autorizado. |
| `/app/treinos` | Calendário do atleta tem visões dia/semana/mês/ano/lista e cruza prescrito com realizado. | Mostrar origem “Marketplace”, nome do plano, autoria e ajuste; queries/componentes devem suportar `workoutId=null` + `workoutTemplateId`. |
| Taxonomia | `modules/shared/activities/sport-types/index.ts` já define muitas modalidades e mapeamentos. | Editor e filtros usam fonte única; colorir pela modalidade usando tokens existentes e fallback claro para esportes não mapeados. |

**Nota:** a análise é estática; não presume que compra paga, transferência de valor ou preview já estejam operacionais. Verificar as regras atuais em `architecture/modules/school.yaml`, `.agents/skills/ryvano-telas/` e schema antes de programar.

## 4. Fluxos completos

### 4.1 Professor cria e vende

**Porta de entrada obrigatória:** a vitrine é pública, mas “Criar plano” encaminha visitante para login/cadastro Ryvano com retorno ao Estúdio. O servidor só admite `POST/PUT/publish` quando existir sessão válida e `CoachProfile` ativo, com verificação da titularidade do produto e da permissão de publicar pela escola quando ela for a vendedora. Um usuário logado apenas como atleta não adquire poderes de professor; o onboarding profissional deve ser concluído antes de criar. Logout, sessão expirada ou perfil suspenso bloqueiam as mutações no servidor, inclusive quando a URL for acessada diretamente.

1. Coach com `CoachProfile` ativo abre **Estúdio de Planos** → “Novo plano”; define proprietário comercial `COACH` ou `SCHOOL` segundo permissão. Escola proprietária exige OWNER/ADMIN autorizado; autoria individual continua explícita.
2. Informa nome, proposta, modalidade(s), objetivo, nível, pré-requisitos, semanas, sessões/semana, equipamento opcional, idioma, preço/currency, tipo de licença e se acompanhamento está incluído. Por padrão **não está incluído**.
3. Monta semanas no editor por lista/calendário; seleciona/cria templates de sua biblioteca, especifica blocos, duração/distância/repetições/zonas quando aplicável, descanso, alternativa sem wearable e material de apoio opcional. Pode duplicar semana, arrastar sessão, criar dia de descanso e inserir duas sessões no mesmo dia.
4. Preview por atleta: semana grátis/amostra, lista das semanas, métricas só quando mensuráveis, exemplos de treinos, instruções e limitações. Verificação de links, consistência, tempo total, preço e direitos dos templates.
5. Publicação cria `TrainingProductVersion` **imutável** com snapshot suficiente para funcionar mesmo se o autor arquivar o template da biblioteca. A página do produto distingue “Autor”, “Vendido por”, “Acompanhamento incluído: não/sim” e versão.
6. Edição de descrição/foto pode ser permitida conforme política; mudança de estrutura do plano, preço ou condições de uso cria nova versão/oferta efetiva para novas compras. Licenças existentes preservam preço e versão contratados.
7. Autor recebe painel de vendas e pagamentos sem ganhar acesso automático a dados de treino individuais. Para acompanhar comprador, usa o mesmo convite/autorização de qualquer outro professor.

### 4.2 Atleta encontra, compra e inicia

**Descoberta sem cadastro; compra com cadastro:** visitante anônimo pode pesquisar, filtrar, abrir `/marketplace/[idDoTreino]`, ver vídeos públicos e avaliações. Ao tocar “Comprar plano” ou “Adquirir grátis”, deve entrar/criar conta Ryvano antes de abrir checkout ou emitir licença. Preservar `productId`, versão e intenção numa URL interna de retorno validada pelo servidor (ex.: `/entrar?callbackUrl=/marketplace/abc123/checkout`); depois do login, voltar ao checkout, refazer preço/visibilidade/estoque e obter aceite dos termos. Proibir `callbackUrl` externo/open redirect. Se já possuir licença ativa, CTA “Abrir meu plano” em vez de cobrar de novo. A autenticação é exigida também para plano gratuito.

1. Busca por objetivo (“correr 5 km”, “nadar 750 m”), modalidade, nível, duração, dias por semana, preço, equipamento, disponibilidade de acompanhamento, idioma e avaliação verificada.
2. Abre detalhe e vê **para quem serve, o que inclui, amostra, autor/vendedor, valor total, política de uso, requisitos e aviso de que comprar não contrata professor**. Planos incompatíveis podem aparecer com orientação, sem diagnóstico automático.
3. Checkout com resumo imutável `productId + versionId + price + currency`, idempotency key e provedor. Para plano gratuito, aquisição registrada com licença; para plano pago, status `PENDING` até confirmação assinada. Redirecionamento do checkout não é confirmação.
4. Após confirmação, licença `ACTIVE` fica em **Meus planos**. Atleta escolhe “Começar agora”, data inicial ou data-alvo/prova e fuso; preview mostra distribuição antes de aplicar. A escolha pode ser feita depois, sem perder compra.
5. Ao confirmar início, o Ryvano cria treinos vinculados à licença no calendário uma única vez, respeita dias locais e identifica conflitos com treinos já existentes; atleta pode escolher nova data antes de ativar. Treinos sincronizáveis são enviados a provider somente mediante ação/capability apropriada.
6. Em `/app/treinos`, atleta filtra por plano, modalidade, origem, estado e período. Cada treino mostra meta planejada, execução associada, feedback, revisão e link para “Meu plano”.
7. Pausa e reagenda a instância conforme regras da licença, com histórico e preservação das execuções. Conclui o plano ao fim da sequência/decisão do atleta, não apenas por passar a data.

### 4.3 Atleta escolhe outro professor

1. Em “Meu plano” → “Adicionar professor acompanhante”, atleta escolhe coach independente ou com vínculo na escola adequada. Mostra exatamente o que ele poderá ler e editar, duração e se poderá ver atividades anteriores. **Nenhum grant de biometria é presumido.**
2. Convite pendente não abre dados. Coach aceita; serviço verifica status `ACTIVE`, identidade, vínculo/permissões e ausência de conflito de atribuição primária conforme política vigente.
3. Acompanhante enxerga **a instância comprada**, o plano base somente no escopo necessário e registros do atleta autorizados. Pode propor ajustes por sessão/semana: data, volume, blocos ou substituição; atleta vê diferenças, razão e autoria e aceita quando altera compromisso.
4. Alteração aprovada gera `PlanAdaptation` e snapshot da atribuição concreta; `WorkoutAssignmentHistory` registra o evento. Sessões executadas continuam imutáveis. O autor do produto não recebe notificação com dados individuais e o produto publicado continua inalterado.
5. Atleta pode remover/trocar professor; acesso futuro cessa, histórico de autoria permanece. Professor novo recebe apenas escopo e período concedidos. Compra/licença permanecem com atleta quando o vínculo com escola ou coach termina.

### 4.4 Casos especiais

- **Autor também acompanha:** precisa de convite/contrato de acompanhamento separado; preço do plano não presume esse serviço.
- **Compra de plano escolar por atleta fora da escola:** apenas se `PUBLIC`; compra não matricula atleta nem concede papel em escola.
- **Plano `SCHOOL_ONLY`:** aquisição apenas por atleta elegível na escola; não aparece na vitrine pública.
- **Plano `UNLISTED`:** link não indexado, mas compra sujeita às mesmas validações; URL sozinha não concede acesso a rascunho.
- **Oferta gratuita:** trilha de aquisição e licença idempotentes sem provedor.
- **Recompra:** mostrar licença ativa e política de segunda utilização antes de cobrar; não criar duas agendas idênticas sem escolha explícita.
- **Reembolso/chargeback:** revogar direito de criar novas sessões segundo termos, congelar futuros não executados conforme política; não apagar treinos já realizados, histórico ou autoria. Exibir ao atleta o estado e caminho de suporte.
- **Produto arquivado:** sai da vitrine, mas licenças válidas e seus snapshots continuam utilizáveis conforme termos da compra.
- **Mudança de versão do vendedor:** não substitui plano comprado; oferecer atualização opt-in se compatível, preservar comparação e histórico.
- **Mudança de modalidade:** plano pode misturar `run`, `swim`, `bike`, `gym` etc.; cada sessão informa modalidade canônica própria. Filtro do produto pode ser “Triathlon/multimodalidade”.

## 5. Telas e navegação

Rotas abaixo são propostas, exceto as marcadas existentes. Todas precisam de estados vazio, loading, erro, sem permissão, mobile e dados reais. Não adicionar menu que aponte para página vazia.

| Rota | Quem | Conteúdo e ações |
|---|---|---|
| `/marketplace` | Público ou usuário onboarded | Hero, busca, filtros, destaques editoriais verificáveis, grid de produtos paginado, preço e autoria; visitante pode navegar, login no checkout. |
| `/marketplace/[idDoTreino]` | Público conforme visibilidade | Detalhe com galeria de foto/vídeo, descrição, objetivos/prova, estrutura, professor, avaliações, preço e CTA. ID estável identifica produto; slug legível opcional com URL canônica. |
| `/marketplace/[idDoTreino]/checkout` | Atleta autenticado | Resumo da versão/preço, provedor, estado de pagamento, retorno seguro; sem expor dados de cartão ao app. Visitante vai a login e retorna à rota interna. |
| `/app/planos` | Atleta | Minhas licenças: aguardando pagamento, não iniciado, em andamento, pausado, concluído, reembolsado; CTA “Escolher data de início”. |
| `/app/planos/[licenseId]` | Atleta dono | Progresso por semana, próximos treinos, autor, professor acompanhante, ajustes, iniciar/pausar, permissões e histórico. |
| `/app/treinos` | Atleta | **Existente, evoluir:** sessão do marketplace com badge de origem/plano, filtro e links cruzados; não renderizar “Treino agendado” genérico quando template tiver título. |
| `/professor/estudio/planos` | Coach ativo | Lista dos próprios produtos, estados, rascunhos, versões, vendas agregadas e ações. Um professor independente pode publicar sem escola. |
| `/professor/estudio/planos/novo` | Coach ativo | Editor estruturado com rascunho e preview do atleta. |
| `/professor/estudio/planos/[productId]` | Autor autorizado | Edição antes de publicar, versionamento, preço, visibilidade, métricas agregadas; não mostra treino pessoal dos compradores. |
| `/professor/acompanhar/planos` | Coach autorizado | Convites pendentes, atletas que o escolheram, planos em acompanhamento, ajustes pendentes e avaliações. Separado do Estúdio. |
| `/professor/acompanhar/planos/[licenseId]` | Coach acompanhante | Instância do atleta com semanas e ajustes permitidos; nunca editar a versão do autor. |
| `/escola/[schoolId]/marketplace` | OWNER/ADMIN da escola | Produtos de titularidade da escola, autores, vendas/resumos e regras de aprovação; sem acesso geral aos compradores externos. |

**Navegação:** catálogo global em `/marketplace`; “Meus planos” próximo de “Treinos” no app pessoal; Estúdio e Acompanhamentos separados no espaço do professor. Sidebar/dock seguem `AppShell`, `AppHeader`, `MobileDock` e o mapa de rotas. O comprador não deve precisar entrar na área administrativa de uma escola para usar a licença.

### Conteúdo do card de produto

Imagem/capa acessível obrigatória na publicação (foto enviada ou arte padrão do Ryvano), indicador de vídeo quando houver, chip de modalidade, título, autor com nome/foto, duração em semanas, sessões/semana, nível, objetivo/prova, preço, média de estrelas e número de avaliações verificadas. Sem avaliações, mostrar “Novo”, nunca “0 estrelas”. Mostrar rótulo “Plano independente” ou “Acompanhamento incluído” **somente se existir serviço contratado**. Todo card abre o detalhe por link “Ver treino”; controles internos acessíveis separadamente, sem link aninhado. Não apresentar selo de resultado garantido. Ordenação comercial precisa ser transparente e não sugerir popularidade com dados inventados.

### 5.1 Vitrine pública `/marketplace`: layout e comportamento

**Desktop:** hero no padrão do atleta (título “Encontre seu próximo treino”, subtítulo e busca por nome, modalidade, meta e prova); abaixo, linha de quantidade real de resultados, ordenação e chips dos filtros ativos. Duas áreas: **filtros persistentes à esquerda** (largura aproximada 260–300 px, painel sticky sem encobrir header) e **cards de treinos à direita** em grade de até três colunas. Cada card é uma oferta, como um produto de loja; a unidade comprada é o plano versionado. No tablet, grade de duas colunas; no mobile, uma coluna e botão “Filtros (N)” abre drawer com “Aplicar”, “Limpar tudo” e fechamento pelo teclado. Se a janela não comportar painel lateral e resultados legíveis, usar drawer.

| Grupo de filtro lateral | UI / semântica | Dado e regra |
|---|---|---|
| Modalidade | Multi-seleção (corrida, natação, ciclismo, triathlon, força e demais modalidades existentes). | Taxonomia canônica; plano multimodal aparece em cada modalidade presente. |
| Duração | Faixa de semanas e sessões por semana; opcionalmente tempo por sessão e carga semanal. | Rotular unidades separadamente; não confundir “8 semanas” com “45 min por treino”. Valores reais da versão publicada. |
| Dificuldade | Iniciante, intermediário, avançado; “todos os níveis” só quando o produto declarar adaptação. | Campos estruturados na oferta, não adivinhar pela descrição. |
| Objetivo e prova | Ex.: começar, condicionamento, completar prova, melhorar tempo; tipos de prova e distâncias por modalidade. | 5/10/21/42 km, 750 m/1,5 km e outras opções vêm de taxonomia extensível; campo de prova é opcional, sem forçar esporte sem evento. |
| Avaliação | “A partir de 4★”, “A partir de 4,5★” e ordenação “Mais bem avaliados”. | Somente avaliações verificadas e públicas; sem notas, plano segue visível em “Todos”. Exibir contagem ao lado da média. |
| Preço e requisitos | Gratuito/pago, faixa de preço, equipamento e acompanhamento incluído quando real. | Faixa na moeda da oferta; explicar que compra do plano não inclui professor por padrão. |

**Busca e estado:** query string sincroniza filtros, ordenação e página (`?q=...&sportType=run&level=beginner&weeksMin=6&weeksMax=12&goal=finish-race&eventDistance=5k&minRating=4&sort=best-rated`); links de paginação preservam filtros. Filtros aplicados aparecem como chips removíveis; “Limpar tudo” restaura padrão. Ordenação: relevância quando há busca, recentes, mais comprados (compras confirmadas), mais bem avaliados (com volume de avaliações considerado) e preço ascendente/descendente. Contar e paginar no servidor; URL inválida é normalizada sem expor rascunhos. Sem resultados: mensagem contextual e botão para remover filtros. Skeleton mantém geometria e foco; cards e filtros funcionam com teclado e leitor de tela.

### 5.2 Página pública `/marketplace/[idDoTreino]`

**Cabeçalho:** breadcrumbs “Marketplace › modalidade › plano”, título, tags de dificuldade/meta e professor autor. **Coluna principal:** capa panorâmica e galeria de imagens; player para vídeo opcional com poster e legendas quando houver fala, acionado pelo usuário, sem reprodução automática; descrição curta e completa; objetivos mensuráveis quando possível; para quem serve/para quem não serve; pré-requisitos, equipamento, duração, sessões por semana, tempo aproximado e estrutura por semanas; uma semana/sessão de amostra deliberadamente pública, sem liberar todo o plano; professor com bio, credenciais declaradas e vínculo com escola quando pertinente; reviews com média, contagem, distribuição e comentários moderados. Mídias devem ter texto alternativo, proporção estável, processamento/tamanho limitado e URLs seguras; vídeo de treino privado permanece protegido. Não publicar depoimentos, tempos ou biometria de alunos sem consentimento.

**Resumo de compra na lateral (desktop) ou bloco após introdução (mobile):** preço final e moeda, versão/atualizações incluídas, acesso e requisitos, regras de cancelamento/reembolso, aviso “Acompanhamento com professor é opcional e separado” ou escopo exato quando incluído, CTA principal “Comprar plano”/“Adquirir grátis”. Visitante pode navegar sem login; CTA encaminha a autenticação com retorno interno e resumo revalidado. Usuário com licença vê “Abrir meu plano”. Produto retirado da venda mantém página informativa conforme política, sem CTA de compra, e quem já possui licença usa `/app/planos/[licenseId]`. SEO/canonical e metadados não devem revelar produtos privados ou `SCHOOL_ONLY`.

### 5.3 Estrelas e avaliações verificadas

Atleta autenticado com compra confirmada e licença ativa pode avaliar após iniciar de fato o plano (critério inicial: ao menos uma sessão registrada). Uma avaliação corrente por `(purchaseId, athleteId, productId)`; permitir editar com trilha de auditoria, bloquear autoavaliação do autor, fraude e spam. Nota inteira de 1 a 5; comentário opcional moderado; “Compra verificada” deriva da compra, nunca de texto enviado pelo navegador. Exibir média aritmética e **número** de avaliações publicadas (ex.: `4,7 ★ · 28 avaliações`), além da distribuição. Para ordenação “mais bem avaliados”, exigir volume mínimo ou ranking ponderado para evitar que uma única nota 5 supere dezenas de notas 4,9; filtros “4★+” comparam média pública. Na ausência de reviews, exibir “Ainda sem avaliações”. Permitir denúncia/moderação e guardar snapshots suficientes para avaliar a versão adquirida, sem divulgar histórico clínico, nome completo por padrão ou contato.

### Layout da tela “Meu plano”

Hero com título, objetivo, modalidade(s), semana atual, início, autor e professor acompanhante se houver. Abaixo, cards reordenáveis: **Próximo treino**, **Progresso**, **Semana atual**, **Ajustes propostos**, **Feedback**, **Permissões de acompanhamento**. Cronologia com versão comprada, ativação, mudanças e execução. Ação principal contextual: `Escolher início`, `Abrir próximo treino`, `Analisar ajuste` ou `Concluir`. No mobile, a ação principal fica visível sem cobrir dock.

## 6. Design system obrigatório

Manter o padrão do dashboard do atleta e da especificação da Jornada. Código de referência: `components/dashboard/dashboard-redesign.tsx`, `components/layout/customizable-card-grid.tsx`, `components/activities/activity-visual-dashboard.tsx`, `components/app-shell.tsx`, `components/app-header.tsx`, `app/globals.css`.

- Hero de página como o dashboard: superfície translúcida, borda suave, raio ~24 px, eyebrow, `h1`, subtítulo, chips e ações; `AppHeader` global permanece único.
- Cards com `CustomizableCardGrid`: handles de arrastar e redimensionar, salvar/descartar, ordem persistida por usuário **e superfície** (`marketplace-catalog`, `athlete-plan`, `coach-studio`). Nunca sobrescrever `UserProfile.dashboardLayoutOrder` do dashboard do atleta. No catálogo, personalização pode ser restrita aos blocos editoriais; filtros e resultados seguem ordem determinística.
- Paleta usa tokens semânticos de `app/globals.css`, `theme-pill-*`/`theme-panel-*` e modalidades `--sport-*`. Corrida laranja, natação azul, ciclismo verde, triathlon violeta conforme mapeamento existente; fallback neutro para demais esportes. Estado comercial (rascunho, publicado, reembolsado) não usa cor de modalidade como sinal único.
- Ícones `@tabler/icons-react`; fonte Geist; botões/pills de altura mínima 44 px; temas claro/escuro; contraste verificado; movimento reduzido respeitado.
- Grade 1 coluna no mobile, 2 no tablet e até 3 no desktop conforme conteúdo; detalhes extensos em página própria. Preço completo e conteúdo incluído sempre visíveis antes de clicar “Comprar”.
- Evoluir o grid compartilhado para mover cards por teclado, anunciar mudança por `aria-live` e adaptar o banner de salvamento aos dois temas, mantendo telas atuais funcionais.
- Skeleton preserva geometria do card; compra pendente mostra status do servidor com atualização/retry; plano sem execução explica o próximo passo. Erro de conexão não deve reiniciar checkout nem criar licença duplicada.

## 7. Modalidades, exercícios e editor

**Taxonomia:** usar `RyvanoSportType` e `isRyvanoSportType`. Campos de pesquisa indexam modalidade canônica, objetivos e nível. Mostrar rótulo via `getRyvanoSportLabel`. Não adicionar tipo livre de provider diretamente ao produto. Professor pode solicitar nova modalidade, mas a inclusão exige mapeamento, rótulo, fallback visual e testes; não afirmar compatibilidade técnica com todos os relógios.

**Camada genérica por sessão:** título, modalidade, finalidade, duração planejada, distância opcional, intensidade opcional, blocos ordenados, recuperação, instrução textual, nota de segurança e opção de registro manual. Para esportes coletivos/aulas: exercícios e objetivos podem ser por repetições/técnica e avaliação qualitativa, sem forçar pace/FC. Para força: séries, repetições, carga/RPE quando cabíveis. Para natação: piscina/águas abertas, metros, séries, descanso. Para corrida: tempo/distância, ritmos/zonas opcionais. Cada modalidade pode adicionar schema de extensão validado; editor genérico continua funcional se o plugin específico não existe.

**Modelo de plano multimodal proposto:** `weeks[] → days[] → sessions[]` com `sessionId`, `workoutSnapshot` ou template versionado, `sportType`, `order`, `alternative`, `note`; incluir dias de descanso. Migrar/ler formato antigo `day.workoutTemplateId` sem alterar versões publicadas. Pode haver treino de corrida e força no mesmo dia; cada sessão tem ID estável para auditoria e reconciliação.

**Integridade na publicação:** todos os templates existem, pertencem ao autor/escola ou possuem licença de uso, não estão inacessíveis, e o snapshot preserva conteúdo necessário para executar e renderizar o treino. Arquivamento posterior da biblioteca não quebra compra. Anexos devem ter armazenamento com política de acesso; não incluir arquivo não autorizado em amostra pública.

## 8. Propriedade, permissão e consentimento

| Recurso/operação | Autor/vendedor | Atleta comprador | Outro coach acompanhante | Escola do atleta |
|---|---|---|---|---|
| Editar produto e publicar nova versão | Sim, com verificação de proprietário | Não | Não | Só se escola for proprietária e usuário autorizado |
| Ver volume de vendas/receita do próprio produto | Proprietário autorizado | Apenas própria compra | Não | Só produtos de titularidade da escola e papel financeiro |
| Usar plano no próprio calendário | Não por vender | Sim com licença ativa | Não diretamente | Não automaticamente |
| Ver execução individual do comprador | Não pela venda | Sim | Apenas escopo concedido/vínculo válido | Apenas seus treinos/consentimento válido |
| Ajustar instância do comprador | Não pela autoria | Pode aceitar/propor conforme regra | Sim após autorização específica | Apenas coach autorizado, não OWNER por padrão |
| Alterar versão comprada | Nova versão para futuras compras; migração por opt-in | Não altera versão-base | Não | Não |
| Revogar acompanhamento | Não se não é participante | Sim | Pode encerrar o seu vínculo | Conforme regras de vínculo, sem usurpar vontade do atleta |

**Contrato de acompanhamento:** entidade/uso separado de compra, por `(licenseId, athleteId, coachId)` com `requestedAt`, `acceptedAt`, `startedAt`, `endedAt`, `scope`, `status`. Capacidade de ajustes de plano não equivale a acesso integral a todas as atividades ou biometria. Integrar `HistoryAccessGrant` quando o coach pedir histórico/health, com categoria/prazo específicos. Para professor independente, não exigir schoolId; para escola, validar `CoachSchoolMembership` e atribuição adequadas. Troca preserva períodos temporais e autoria dos ajustes anteriores.

**Direitos e licença:** condições da oferta registradas no checkout: uso pessoal, período/acesso, atualizações, redistribuição de templates, reembolso e presença ou ausência de acompanhamento. Vendedor não pode retirar conteúdo já licenciado por simples edição. Definir permissões de exportação/cópia no produto; coach acompanhante só altera **a instância de treino daquele atleta**, não recebe direito automático de revender/copiar a biblioteca do autor.

## 9. Dados e evolução do schema

Usar os modelos existentes e acrescentar só o que faltar, em migration versionada. Campos propostos abaixo exigem validação de impacto no schema atual.

| Modelo | Alteração proposta |
|---|---|
| `TrainingProduct` | ID estável na rota pública; `slug` opcional, `coverMediaId`, `objective`, `difficulty`, `goalType`, `targetEventType?`, `targetDistance?`, `durationWeeks`, `sessionsPerWeek`, `sessionDurationMin/Max?`, `weeklyMinutesMin/Max?`, `sessionCount`, `equipment`, `language`, `availability`, `sellerPolicyVersion`, `previewVersionId`; se multimodal, índice/tabela de modalidades secundárias; preço/versionamento comercial. Campos de filtro estruturados e indexados. |
| `TrainingProductVersion` | `schemaVersion`, snapshot integral das sessões/templates, `publishedAt`, hash/versionamento de conteúdos/anexos; depois de publicado, imutável. |
| `TrainingPurchase` | `versionId`, `offerSnapshot` (preço, moeda, vendedor, termos), `checkoutId`, `provider`, `providerEventId`, `idempotencyKey`, `confirmedAt`, razão de estorno; unique adequado por checkout/provider. |
| `TrainingLicense` | `activationMode`, `timezone`, `chosenStartLocalDate`, `anchorEventLocalDate?`, `activationStatus`, `calendarInstantiatedAt`, `completedAt?`; vínculo permanente à versão adquirida. |
| `WorkoutAssignment` | Origem `trainingLicenseId` existente + `planSessionId`, `originalSnapshot`, `effectiveRevisionId?`, `adjustedByCoachId?`, `sourceLabel` derivado; manter campos existentes `workoutId`/`workoutTemplateId` compatíveis. |
| Novo `LicenseCoachEngagement` | `licenseId, athleteId, coachId, schoolId?, scope, status, requestedAt, acceptedAt?, endedAt?`, validade e períodos sem sobreposição indevida. |
| Novo `PlanAdaptation` | `licenseId, assignmentId/sessionId, coachId, actorUserId, beforeSnapshot, proposedSnapshot, reason, status, acceptedByAthleteAt?, createdAt`, regra de versão concorrente; alterações futuras e passadas separadas. |
| Novo `MarketplaceMedia` | `productId, kind(IMAGE/VIDEO), storageKey, thumbnailKey?, altText, caption?, sortOrder, access(PUBLIC/PREVIEW/PRIVATE), processingStatus`; exigir capa ou arte padrão antes de publicar; vídeo opcional, poster e legendas quando necessário. Armazenar no serviço de mídia adotado no projeto, com autorização e URL controlada. |
| Novo `MarketplaceReview` | `productId, purchaseId, athleteId, versionId, stars(1..5), comment?, moderationStatus, createdAt, updatedAt`; unique para avaliação corrente por compra. Elegibilidade por compra confirmada e sessão executada. Média/contagem pública calculada somente sobre reviews elegíveis e aprovados; agregado/cache pode ser recalculado. Não divulgar dados esportivos privados. |
| Novo `SellerAccount`/ledger | Vendedor, conta de payout no provedor, KYC/status, divisão de receita, taxas, eventos financeiros, estornos; guardar apenas referências/tokenização permitidas, sem dados sensíveis de pagamento. |

**Snapshots e proveniência:** `productId`, `versionId`, `authorCoachId`, `sellerId`, `purchaseId`, `licenseId`, `planSessionId`, `originalWorkoutSnapshot`, `effectiveRevision` e `adjustingCoachId` precisam ser rastreáveis. Tela explica “Criado por Carlos; adaptado para você por Beatriz”. Histórico imutável após execução; correções são eventos anexados.

**Concorrência:** unique de `(licenseId,planSessionId)` na agenda; licença única por compra confirmada; `expectedVersion` em ajustes; transações curtas e serializáveis nos passos críticos; webhooks com `eventId` único. Abrir duas abas para iniciar o plano não duplica sessões.

## 10. Checkout, pagamento e repasse

1. Atleta pede checkout; servidor revalida produto `PUBLISHED`, visibilidade, versão, preço, moeda e elegibilidade, e grava oferta/versão congelada. Nunca aceita preço do cliente.
2. Servidor cria sessão no provedor escolhido e `TrainingPurchase(PENDING)` idempotente. O provedor trata cartão/PIX. Segredos somente no servidor e sem log de token/PII.
3. Webhook autenticado/assinado e conciliador consultam o provedor; validar evento, titular, valor, moeda, versão, produto, status e não processamento prévio. Apenas `paid/confirmed` promove `PENDING → COMPLETED` e cria licença `ACTIVE` na mesma transação; entregar calendário após escolha de data.
4. Callback/return do navegador apenas mostra estado e consulta servidor; webhook pode chegar antes/depois. Repetições, atraso, perda de evento, falha da app e cancelamento levam a estado recuperável, nunca a licença gratuita acidental.
5. Para `priceCents=null`, aquisição gratuita no servidor e licença na mesma transação, com índice contra duplicatas segundo política. `priceCents=0` pago versus `null` gratuito precisa regra comercial explícita; normalizar antes de publicar.
6. Payout ao vendedor é contabilidade separada da licença: split/taxa/tributação e reserva para reembolso parametrizáveis. Registrar ledger de venda bruta, taxa, valor líquido, repasse, reversão; UI de vendedor mostra valores conforme status. Não definir percentuais ou prazos no código sem decisão comercial.
7. Reembolso/cancelamento só por evento verificado ou operação administrativa autorizada e auditada. Política e consequências sobre licença exibidas antes da compra. Cobrança duplicada e estorno parcial precisam reconciliação e suporte.

**Risco concreto do código atual:** `CreateTrainingPurchase` aceita `paymentRef` como argumento; ele **não** verifica pagamento junto ao provedor. Não ligar uma API pública a esse caso de uso permitindo que o navegador envie uma string arbitrária. Também corrigir consulta pública que pode expor rascunhos ou produtos `SCHOOL_ONLY`. Essas duas frentes são pré-requisitos de lançamento.

## 11. APIs e DTOs propostos

Todos: entrada Zod estrita, sessão no servidor, cursor estável, padrão 20/máx.100, envelopes de erro seguros e checagem por recurso. Retornar apenas dados de preço/autor/preview permitidos ao público.

| Método/rota | Função | Quem |
|---|---|---|
| `GET /api/marketplace/products` | Busca pública `q,sportType,difficulty,goal,eventType,eventDistance,weeksMin,weeksMax,sessionsPerWeek,minRating,priceMin,priceMax,sort,cursor`; somente `PUBLIC+PUBLISHED+version`, contagem e avaliações aprovadas. Filtros executados no servidor com índices. | Público |
| `GET /api/marketplace/products/[idDoTreino]` | Detalhe, mídia pública, amostra aprovada, professor, reviews verificadas e oferta atual; unlisted apenas via URL quando permitido. | Público conforme visibilidade |
| `POST /api/coach/products` | Rascunho com ownership e conteúdo validado. | Coach ativo ou escola autorizada |
| `PUT /api/coach/products/[id]/draft` | Editar rascunho com `expectedVersion`; preview. | Proprietário |
| `POST /api/coach/products/[id]/publish` | Publicar nova versão imutável; revisar permissões dos templates. | Proprietário |
| `POST /api/marketplace/checkout` | `productId, versionId, idempotencyKey`; preço só do servidor, retorna checkout seguro. | Atleta |
| `POST /api/marketplace/payment-webhook` | Verifica assinatura e evento; ativa compra/licença idempotentes. | Provedor confiável |
| `GET /api/me/training-licenses` | Compras/licenças do próprio usuário e estado de ativação. | Atleta dono |
| `POST /api/me/training-licenses/[id]/activate` | `startLocalDate` **ou** `targetEventDate`, timezone, `expectedVersion`; preview/conflito e instanciação única. | Atleta dono |
| `POST /api/me/training-licenses/[id]/coach-invitations` | `coachId, scope, expiresAt`; cria convite pendente. | Atleta dono |
| `POST /api/coach/plan-invitations/[id]/accept` | Aceita vínculo após checagens atuais. | Coach convidado |
| `POST /api/coach/training-licenses/[id]/adaptations` | `planSessionId, proposedChanges, reason, expectedVersion`; não edita base. | Coach acompanhante autorizado |
| `POST /api/me/training-licenses/[id]/adaptations/[aid]/decide` | `accept/decline`; aplica revisão e auditoria. | Atleta dono |
| `DELETE /api/me/training-licenses/[id]/coach-engagement` | Revoga autorização futura e preserva autoria. | Atleta dono |
| `GET /api/coach/products/[id]/sales` | Volume, valores próprios e status agregados, sem execuções individuais. | Proprietário com permissão financeira |
| `POST /api/marketplace/products/[idDoTreino]/reviews` | `stars,comment?`; compra confirmada, autor distinto, sessão registrada, moderação/auditoria e limite de uma avaliação corrente. | Comprador elegível |

**DTO de detalhe de produto:** `id,slug?,title,description,objective,difficulty,goalType,targetEventType?,targetDistance?,sportTypes,durationWeeks,sessionsPerWeek,sessionDurationMinMax?,equipment,publicMedia,previewWeeks,author,seller,ratingAverage?,reviewCount,price,offerTerms,coachingIncluded,versionId,availability`. **DTO de licença:** `licenseId,productId,versionId,author,seller,athleteId,status,startLocalDate?,timezone,instantiatedAt?,weekProgress,coachEngagement?,nextAssignment?`. Nunca devolver `paymentRef` completo, credenciais, e-mail dos compradores no catálogo ou anexos privados na amostra.

## 12. Calendário, matching e plano adaptado

- O calendário pessoal mostra o produto comprado em todas as visões (`/app/treinos`), inclusive com `workoutId=null` e template/snapshot presente. Link contextual volta à licença. Treinos existentes de escola e de marketplace coexistem; `schoolId=null` no marketplace não significa treino órfão.
- Escolha de data: tratar `LocalDate` e timezone IANA; construir sessões conforme dia local e horário preferido, não “segunda-feira 00:00 UTC” universal; dias de 23/25 h por horário de verão não devem virar deslocamento para o dia seguinte.
- Preview antes de aplicar oferece calendário de semanas, conflitos e número de sessões; a confirmação fixa a versão e cria atribuições por `planSessionId`. Novas alterações por coach são versões efetivas locais, sem mudar comprado.
- Matching de atividade via taxonomia canônica e lógica específica por modalidade; registros Garmin/Strava são normalizados. Se não houver relógio, fluxo manual confirma execução sem inventar frequência cardíaca/potência. O atleta ou coach autorizado confirma/ajusta associações ambíguas.
- Reagendar preserva `WorkoutAssignmentHistory`; pausar congela sessões futuras conforme regra, não elimina execução passada. Justificativa e cancelamento são visíveis e separados de `MISSED`.
- Plano multimodal permite um coach de natação supervisionar só sessões `swim` se o atleta conceder escopo parcial; outro coach pode acompanhar corrida. Definir precedência por sessão e evitar ajustes simultâneos conflitantes. No MVP, permitir um responsável principal por licença ou por modalidade; vários coaches simultâneos exigem regra explícita e UI clara.

## 13. Estados, mensagens e erros

| Situação | Comportamento de UI |
|---|---|
| Catálogo sem resultado | Explicar filtro e oferecer limpar filtros; não exibir produtos privados. |
| Coach sem plano | CTA criar plano + descrição do primeiro passo; sem números inventados. |
| Pagamento aguardando | “Aguardando confirmação”; consultar servidor, não ativar licença no retorno do checkout. |
| Pagamento falhou | Mostrar tentativa segura, opção de tentar novamente sem duplicar compra ativa. |
| Licença sem início | “Seu plano está disponível. Escolha quando começar”; calendário ainda não preenchido. |
| Duas sessões no mesmo dia | Mostrar ambas e sua ordem; não sobrescrever uma. |
| Conflito com outro treino | Preview com data/treinos existentes; permitir ajustar início ou continuar conscientemente conforme política. |
| Coach convidado não aceitou | Plano segue utilizável sozinho; nenhuma leitura concedida. |
| Coach removido | Ações de ajuste bloqueadas no servidor imediatamente; plano e histórico do atleta preservados. |
| Produto arquivado após compra | Acesso via licença e snapshot intacto; vitrine indisponível. |
| Reembolso | Estado e efeitos sobre próximos treinos explicados, treinos já executados não desaparecem. |
| Provider indisponível | Treino manual acessível, sincronização mostra estado e tentativa posterior; não marca falta automática. |

## 14. Entrega incremental e critérios de aceite

### Conjunto mínimo para a jornada funcionar

| Prioridade | Entrega | Condição para considerar pronta |
|---|---|---|
| P0 | Perfil profissional, login, propriedade e editor | Professor autenticado com perfil ativo cria, pré-visualiza e publica; servidor rejeita demais usuários e protege rascunhos. |
| P0 | Vitrine e detalhe públicos | Busca, sidebar responsiva, filtros de modalidade/duração/dificuldade/prova/estrelas, cards com preço e nota real, página `/marketplace/[idDoTreino]` com foto e vídeo opcional, objetivos, conteúdo, professor e amostra. |
| P0 | Conta do comprador e aquisição | CTA exige login/cadastro e volta à oferta; produto gratuito emite licença idempotente; produto pago usa checkout e confirmação confiável antes de emitir licença. Termos e preço são revalidados no servidor. |
| P0 | Usar o treino adquirido | Licença em Meus planos, data inicial, sessões no calendário, registro manual e progresso; compra sem contratação de professor segue utilizável. |
| P0 | Avaliações e confiança | Somente compra confirmada com uso real gera nota; média, volume e distribuição honestos na vitrine/detalhe; filtro por estrelas funciona. |
| P1 | Acompanhamento por outro professor | Convite separado, aceite, escopo, revisão da instância, trilha de autoria e revogação, sem alterar produto original. |
| P1 | Exploração aprimorada | Recomendações explicáveis por meta/prova e tempo disponível; favoritos, comparação e prévia mais rica, sem substituir filtros fundamentais. |

**Dependência de lançamento:** a Fase 1 valida a jornada com oferta gratuita; planos pagos só entram na vitrine com CTA de compra após os gates da Fase 2. Para cumprir o cenário de professor diferente, a Fase 3 completa a proposta do produto; não anunciar esse serviço como disponível antes da entrega. Avaliações entram após o primeiro uso real e por isso o estado “Novo” é obrigatório desde o início.

**Fase 0 — segurança e base:** fechar listagem pública de rascunhos/SCHOOL_ONLY; restringir compra paga a confirmação confiável; auditar FK/transação, licença duplicada e consultas de treinos com `workoutId=null`. Sem esse gate, não habilitar checkout real.

**Fase 1 — produto completo sem pagamento real:** login e onboarding do professor, editor, publicação versionada, vitrine pública com filtros laterais/cards/estrelas, detalhe por ID com foto/vídeo opcional e reviews verificadas, login do comprador para aquisição gratuita, licença, escolha de início, calendário com corrida/natação/multimodalidade e registro manual. Validar o ciclo inteiro com usuários reais de teste.

**Fase 2 — venda paga:** checkout, webhook, conciliação, reembolso, ledger/repasse, recibos e estados de erro; preço e termos revisados com responsável comercial.

**Fase 3 — acompanhamento independente:** convite, aceite, escopo, ajustes versionados, revogação e troca de coach, comentários/avaliações e histórico de autoria.

### Aceites essenciais em E2E UI

- Visitante anônimo abre `/marketplace`, filtra por duração/nível/prova e 4★+, confere cards e detalhe `/marketplace/[idDoTreino]`, assiste vídeo público e vê contagem real de reviews. Em mobile, filtros abrem no drawer; URL preserva filtros após recarga.
- Visitante toca “Comprar”: vai para login/cadastro, retorna ao checkout da mesma oferta e vê preço atualizado. Sem login, API de checkout e aquisição gratuita devolvem não autorizado; callback externo é rejeitado.
- Professor deslogado toca “Criar plano” e volta ao Estúdio após autenticar. Atleta comum, coach inativo e coach sem propriedade recebem recusa do servidor ao criar/publicar/alterar plano; página não substitui guard.
- Comprador elegível avalia após primeira sessão registrada; avaliação aparece com média/contagem. Compra pendente, usuário sem compra e autor não conseguem avaliar; produto sem reviews exibe “Novo” e não 0 estrelas.

1. Coach A cria plano de corrida de 8 semanas, publica; visitante vê só versão pública; rascunho e `SCHOOL_ONLY` não vazam por filtro de URL ou ID.
2. Ana adquire plano (gratuito ou pagamento confirmado), escolhe início, vê todas as sessões nas visões dia/semana/mês e segue sem escola nem wearable. Recarregar/reenviar ativação não duplica agenda.
3. Bruno compra plano de natação, mantém outra licença de corrida e registra treinos; filtros e progresso por plano não misturam os dados.
4. Ana convida coach B diferente do autor A; B só vê após aceitar e conceder escopo. B ajusta semana 4, Ana aprova, histórico mostra original e revisão; compra de Bruno e versão do autor A continuam idênticas.
5. Ana revoga B; B perde acesso à instância e API imediatamente. Ana conserva o plano, execuções e créditos de autoria. Um coach C autorizado posteriormente recebe apenas o período/escopo acordado.
6. Checkout pago com retorno do navegador antes do webhook continua `PENDING`; webhook assinado repetido cria **uma** licença e uma agenda. `paymentRef` arbitrário do navegador não ativa nada.
7. Reembolso e arquivo de produto conservam execução passada. Venda agregada não revela histórico pessoal do comprador.
8. Modo claro/escuro, 320/375/768/1440 px, teclado, motion reduzido, compra em mobile e retorno ao plano após login verificados visualmente.

**Testes de domínio/integração indispensáveis:** ownership, visibilidade, mudança de preço entre checkout e pagamento, dupla entrega de webhook, transação com rollback, FK compra/licença, fuso/horário de verão, duas sessões no mesmo dia, template arquivado, concessão/revogação, revisões concorrentes, matching manual e proteção de dados entre atletas.

**Auditoria de rotas:** antes `bash .agents/skills/ryvano-telas/scripts/audit-routes.sh`; depois `npx tsc --noEmit`, `npx vitest run` e `bash .agents/skills/ryvano-telas/scripts/audit-access.sh` com servidor/seed. Atualizar scripts para novas rotas e perfis. No Next dev, redirect de Server Component pode ser HTTP 200 com meta redirect.

## 15. Decisões de produto que precisam ficar explícitas na implementação

- Tipo de licença: uso pessoal permanente versus janela finita; número de vezes que pode iniciar o mesmo plano e política de pausas.
- Diferença entre “comprar plano” e “contratar acompanhamento” na oferta, preço, checkout, recibo e tela da licença.
- Propriedade de produtos criados por professor atuando numa escola: publicação em nome próprio ou da escola; regras de receita e continuidade quando professor sai.
- Direito de atualizar versão de quem já comprou: opt-in, gratuito/pago, compatibilidade com sessões já realizadas.
- Política comercial de preço, plataforma, repasse, impostos e reembolso definida fora deste documento; implementar configuração e ledger auditável.
- Review/avaliação apenas de compra verificada e critérios de moderação; avaliações não expõem dados pessoais ou médicos.
- Para modalidades ainda sem métricas específicas, oferecer plano estruturado genérico, não anunciar integração completa com dispositivos.

## 16. Referências

**Código Ryvano:** `prisma/schema.prisma` (`TrainingProduct`, `TrainingProductVersion`, `TrainingPurchase`, `TrainingLicense`, `WorkoutAssignment`); `modules/school/application/create-training-purchase.ts`, `instantiate-license-calendar.ts`, `list-training-products.ts`; `modules/school/domain/training-product-version.ts`; `app/api/training-products/route.ts`; `app/app/treinos/**`; `modules/shared/activities/sport-types/index.ts`; `.agents/skills/ryvano-telas/`.

**Comparação de mercado, sem copiar implementação:** TrainingPeaks já vende planos e compartilha com outros coaches, inclusive com direitos de edição, e Final Surge oferece marketplace de planos. O posicionamento proposto para Ryvano é separar com clareza **compra do conteúdo, licença individual e acompanhamento por outro professor**, preservando histórico e permissões. Fontes oficiais: https://help.trainingpeaks.com/hc/en-us/articles/204074104-How-do-I-share-my-training-plan-with-another-Coach-or-Athlete ; https://help.trainingpeaks.com/hc/en-us/articles/204071484-Where-is-my-TrainingPeaks-Training-Plan ; https://www.finalsurge.com/training-plan-marketplace .

### Projetos simples no GitHub estudados como referência de interface e fluxos

| Projeto e código | O que foi verificado no repositório | Aplicação possível na Ryvano e limite |
|---|---|---|
| [Epic-Design-Labs/nextjs-ecommerce-starter](https://github.com/Epic-Design-Labs/nextjs-ecommerce-starter) | `src/app/(store)/shop/page.tsx` implementa catálogo com query, ordenação, paginação e grade; `product-card.tsx` mostra foto, preço e estrelas; repositório contém detalhe, galeria, login e checkout por provedor configurável. | Base visual simples para cards/detalhe e URL filtrável. Os filtros de esporte/prova e a segurança de compra de licença são construção específica da Ryvano; o starter usa dados demonstrativos/estado local e não prova integração com os modelos existentes. |
| [DabbacheDjawad/MultiCommerce-MarketPlace](https://github.com/DabbacheDjawad/MultiCommerce-MarketPlace) | README e estrutura documentam cliente Next.js, backend Django, vitrine, filtros de categoria/preço, galeria, reviews, autenticação JWT, painel de vendedor e endpoints protegidos de CRUD. | Referência funcional para separação visitante/comprador/professor vendedor, reviews e catálogo com painel. Stack distinta e fluxo de produto físico com entrega: não copiar modelo de carrinho, frete, autenticação nem pagamento sem adaptação. |
| [codee-sh/payload-training-app](https://github.com/codee-sh/payload-training-app) | README descreve coach criando/atribuindo planos no admin e atleta entrando para registrar sessões; separa camada de plano da camada de logs. | Referência para editor e execução preservando autoria. Não oferece vitrine/checkout de planos independentes nem compra acompanhada por outro coach; implementar essas partes na Ryvano. |

**Decisão de composição:** usar o padrão de vitrine e detalhe do primeiro, as fronteiras de papel/avaliação do segundo e a distinção entre template e execução do terceiro, adaptados aos componentes, tokens, schema e permissões da Ryvano. Referências são pesquisa de padrões; revisar licenças dos repositórios antes de reutilizar código ou assets.
