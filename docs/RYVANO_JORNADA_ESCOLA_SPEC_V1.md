# Ryvano Jornada — especificação de produto, telas e implementação

**Versão:** 1.0 · **Data:** 23/09/2026 · **Base analisada:** `samuelvermeuln/ryano`, commit `0f3120fc0f6fec31b6ebabe1ecf24a0a9466f6f8`.

> Documento para implementar a Jornada Ryvano e evoluir a área da escola. Conferir o código atual antes de implementar: nomes de arquivos, regras e componentes podem mudar após o commit analisado. Esta proposta é uma hipótese de diferenciação; não afirma exclusividade de mercado.

## 1. Resultado esperado

Uma escola esportiva consegue receber um atleta, associá-lo a professores e turmas, ajudá-lo a escolher uma meta, acompanhar uma **jornada com marcos**, prescrever treinos, analisar a execução, fazer revisões e decidir o próximo passo. O atleta participa, conserva seu histórico e controla o compartilhamento. O professor tem uma fila objetiva de decisões. A escola vê o trabalho que precisa fazer hoje e consegue demonstrar o valor do acompanhamento.

**Princípio existente do Ryvano:** vínculos podem acabar; o histórico esportivo do atleta não. A jornada respeita isso. O objetivo é transformar o fluxo `meta → plano → execução → feedback → decisão → próximo marco` na unidade principal da experiência, com as funções comuns de gestão da escola funcionando plenamente.

### Público e proposta de valor

| Perfil | Ação recorrente | Valor recebido |
|---|---|---|
| Atleta | Conferir próximo marco, executar/registrar treino, informar dificuldade, aprovar revisões | Entende progresso e próximos passos sem depender de relógio conectado. |
| Professor | Planejar, avaliar exceções, ajustar o próximo bloco | Sabe a quem responder e por quê; mantém sua autoria. |
| OWNER/ADMIN da escola | Resolver pendências, organizar turmas e carga dos professores, acompanhar jornadas | Enxerga capacidade, continuidade e qualidade do serviço. |
| Outra escola, **fase posterior** | Participar de um marco com convite e consentimento explícito | Coopera sem assumir acesso geral ao histórico. |

**Não confundir:** jornada não é uma sequência automática de mensagens, ranking de alunos, ficha médica, nova cópia das atividades importadas ou substituto do professor. IA pode futuramente sugerir ações, mas nunca alterar o plano ou conceder acesso sozinha.

## 2. Fonte de verdade e restrições do repositório

Ler antes de alterar o código:

- `.agents/skills/ryvano-telas/SKILL.md` e `references/screen-map.md`, `references/access-matrix.md`; executar `audit-routes.sh` antes e `audit-access.sh` após mudanças de telas.
- `architecture/PROJECT_MAP.md`, `architecture/modules/school.yaml`, `architecture/escola-permission-rules.md` e `.kiro/specs/ryvano-escola-spec/required.md`.
- `app/escola/[schoolId]/layout.tsx` e as páginas da escola; `app/app/dashboard/page.tsx`, `components/dashboard/dashboard-redesign.tsx`, `components/layout/customizable-card-grid.tsx`, `app/actions/dashboard-layout.ts`, `components/activities/activity-visual-dashboard.tsx`, `components/app-shell.tsx`, `components/app-header.tsx`, `app/globals.css`.
- `prisma/schema.prisma` e casos de uso de `modules/school/application/**` relevantes. Se a implementação modificar escopos de leitura, auditar também todas as rotas de API; proteção do layout não protege automaticamente uma API.

### Situação confirmada no commit analisado

| Peça | Estado observado | Consequência para a implementação |
|---|---|---|
| Escola | Dashboard, atletas/lobby, professores, membros, solicitações e convites existem. | Reusar os fluxos existentes e adicionar ações contextuais. |
| Turmas | `Team`, `TeamAthlete`, `TeamCoach` e casos de uso de gestão/prescrição coletiva existem. `/escola/[schoolId]/turmas` está linkada mas não possui página; conferir exposição HTTP atual. | Entregar uma tela funcional, sem deixar card/menu com 404. |
| Prescrição | `WorkoutAssignment`, execuções, compliance, feedback e avaliação existem. | Relacionar registros existentes aos marcos; não replicar treinos. |
| Histórico/consentimento | `HistoryAccessGrant`, permissões temporais e log escolar existem. | Acesso entre organizações sempre explícito e revogável. |
| Layout personalizável | `CustomizableCardGrid` ordena, redimensiona e salva cards; `UserProfile.dashboardLayoutOrder` guarda o dashboard pessoal. | Reusar o componente e criar chave separada para o painel escolar. |
| Indicadores atuais | Solicitações do painel contam apenas atletas, embora a página inclua professores; professor exibe número de prescrições; atrasados usam consulta limitada a 200. | Corrigir significado, cobertura e paginação antes de confiar nas métricas. |

## 3. Escopo em ondas

**Onda 0 — base operacional obrigatória:** corrigir `/escola/{id}/turmas`; gestão de turma com atletas e professores; ação de atribuir professor no lobby; links profundos e indicadores corretos. Se a etapa não estiver pronta, remover temporariamente o link quebrado durante o desenvolvimento, nunca apresentar uma rota 404 em entrega.

**Onda 1 — MVP da Jornada, uma escola:** meta, marcos, professor responsável, planos vinculados, check-in do atleta, revisão humana, fila de atenção e card de jornada no espaço pessoal. Preservar todas as funções administrativas da onda 0.

**Onda 2 — operação escolar completa, obrigatória na visão final:** modelos de jornada por modalidade, duplicação de planos com edição individual, agenda de aulas/eventos, capacidade por turma, presença/ausência e justificativa, comunicação por turma e individual, matrícula/plano comercial, mensalidade/cobrança e painel financeiro. Entregar em fatias, mas não tratar esses módulos como dispensáveis. Escola remota pode ocultar agenda de aula/presença física por configuração, preservando os registros quando utilizados.

**Onda 3 — cooperação multi-escola:** convite de outra organização para um marco, aceite do atleta, escopo mínimo de leitura, expiração/revogação, coordenação de horários/carga apenas com os dados autorizados. Validar demanda real antes de executar.

**Onda 4 — expansão:** responsável legal com permissões e aceite apropriados, contratos digitais, remarcação de aula, lista de espera, integrações de pagamento e relatórios avançados. A base deve comportar essa evolução. Evitar misturar presença física em aula com execução de treino prescrito.

## 4. Jornada ponta a ponta

1. Atleta vincula-se à escola por convite/busca. OWNER/ADMIN aprova conforme política da escola.
2. Escola atribui professor e, se aplicável, uma turma. O lobby sai da fila somente quando existe atribuição **ativa**.
3. Atleta cria uma meta ou aceita proposta de escola/professor: por exemplo, “Completar 750 m de natação contínua até 15/12”. Define modalidade, prazo, disponibilidade e compartilhamento.
4. Professor responsável propõe 2–5 marcos com resultado observável, prazo aproximado e plano de treinos. O atleta vê a proposta e a aceita. Sem aceite, status `AWAITING_ATHLETE`, sem apresentar o plano como acordado.
5. Cada treino segue o ciclo existente: prescrição, atividade normalizada ou registro manual, matching, avaliação e feedback. O marco aponta para as atribuições; não armazena uma segunda execução.
6. O atleta pode registrar check-in curto: “consegui”, “difícil”, “não fiz”, com nota opcional. Isso não altera automaticamente o status do treino nem produz dado fisiológico inventado.
7. Um sinal verificável coloca uma tarefa na fila de atenção: prazo de marco próximo, duas ausências consecutivas, feedback pedindo ajuda, falta de professor, avaliação pendente. O professor confirma contexto e toma a decisão: manter, ajustar, pausar ou concluir o marco.
8. O atleta recebe uma síntese compreensível do que foi observado, do que mudou e do próximo passo. Ele pode corrigir um registro próprio sem apagar a trilha anterior.
9. Ao encerrar vínculo com a escola, a jornada mantém autoria, marcos e fatos históricos; a escola perde leitura futura além do que sua autoria e consentimentos vigentes permitem. Um vínculo posterior começa novo período.

### Exemplo concreto

**Ana** entra em uma escola de natação para completar 750 m sem parar. A escola a coloca na turma Intermediário e atribui a professora Bia. Ana aceita três marcos: 250 m, 500 m, 750 m. Depois de dois treinos não realizados, a fila de Bia mostra “Ana: dois treinos sem execução confirmada”; Bia pergunta se houve problema. Ana informa incompatibilidade de horário. Bia ajusta o plano e registra o motivo. O painel da escola passa a mostrar a pendência resolvida e o marco seguinte; Ana vê a mesma decisão em linguagem simples. Sem relógio, Ana continua usando check-ins manuais e avaliações da professora.

## 5. Mapa de telas e navegação

Todas as rotas abaixo são **propostas**, salvo as indicadas como existentes. Implementar atrás de `SCHOOL_MODULE_ENABLED` e dos guards atuais. Não duplicar o shell nem alterar a identidade visual global.

| Rota | Perfil | Tela e conteúdo obrigatório |
|---|---|---|
| `/escola/[schoolId]` | OWNER/ADMIN | **Existente, redesenhar:** visão operacional com cabeçalho, indicadores corretos, fila de ações, jornadas por estágio, turmas e execuções. Cards reorganizáveis. |
| `/escola/[schoolId]/turmas` | OWNER/ADMIN | **Nova, reparar 404:** lista/busca, modalidade, professores, atletas, estado, criar/editar/arquivar, incluir/remover, detalhar. |
| `/escola/[schoolId]/turmas/[teamId]` | OWNER/ADMIN | Resumo da turma, participantes, responsáveis, calendário/treinos coletivos e jornadas relacionadas. |
| `/escola/[schoolId]/agenda` | OWNER/ADMIN | Aulas, eventos e treinos coletivos por dia/semana/mês, filtros por turma, modalidade e professor; capacidade, local, conflito e ações de presença. |
| `/escola/[schoolId]/presencas` | OWNER/ADMIN | Chamada por sessão/turma, falta justificada, acompanhamento de frequência e exportação autorizada. |
| `/escola/[schoolId]/comunicacao` | OWNER/ADMIN | Avisos para turma ou atleta, rascunho, histórico de entrega, filtros e preferências de comunicação. |
| `/escola/[schoolId]/financeiro` | OWNER/ADMIN com permissão financeira específica | Planos, matrículas, cobranças, vencimentos, recebimentos, conciliação e relatórios; ocultar valores de perfis sem permissão. |
| `/escola/[schoolId]/atletas` | OWNER/ADMIN | **Existente, evoluir:** filtros, lobby acionável, professor atual, turma, marco atual e link para detalhe. |
| `/escola/[schoolId]/atletas/[athleteId]` | OWNER/ADMIN | Somente informações que a escola pode ler: vínculo, professor, turmas, jornadas escolares, treinos da escola, permissões; link para histórico apenas quando autorizado. |
| `/escola/[schoolId]/jornadas` | OWNER/ADMIN | Lista filtrável por status, modalidade, professor, turma, prazo, necessidade de ação; ações em lote somente com autorização e confirmação adequada. |
| `/escola/[schoolId]/jornadas/[journeyId]` | OWNER/ADMIN | Linha do tempo e marcos, responsáveis, decisões, próximos passos, auditoria. |
| `/professor/[schoolId]/jornadas` | Professor ativo | “Preciso agir hoje”, atletas atribuídos, avaliações e revisões pendentes. Guard duplo atual: `CoachProfile` e `CoachSchoolMembership` ativos. |
| `/professor/[schoolId]/jornadas/[journeyId]` | Professor responsável/autorizado | Planejamento, avaliação, revisão e comentários com autoria; não expor outros atletas da escola. |
| `/professor/[schoolId]/agenda` | Professor ativo | Aulas próprias, lista de chamada de suas turmas, avisos destinados a ele e acesso a jornada dos atletas atribuídos. |
| `/app/jornadas` | Usuário onboarded | Todas as jornadas do próprio atleta, inclusive históricas; diferencia escola e fase. |
| `/app/jornadas/[journeyId]` | Atleta dono | Meta, marco, próximo treino, feedback, histórico, aceite de proposta e controles de compartilhamento. |
| `/app/dashboard` | Usuário onboarded | Card “Minha jornada” na grade já existente, com próximo passo e estado vazio; usuário sem jornada conserva dashboard coerente. |
| `/app/agenda` | Usuário onboarded | Próximas aulas/eventos em que está inscrito, presenças e justificativas; distinguir aula coletiva de treino individual prescrito. |
| `/atleta/[schoolId]` | Atleta vinculado | Resumo da jornada daquela escola; histórico de período encerrado continua acessível conforme regra atual. |

### Estrutura visual da tela principal da escola

**Linha 1, cabeçalho:** avatar/logo da escola; eyebrow “ESCOLA”; `h1` nome da escola; subtítulo com diagnóstico operacional (“3 ações precisam de atenção hoje”); chips de status e modalidade; à direita seletor de período 7/30/90 dias, ação primária “Criar jornada” e ação secundária “Ver turmas”. No mobile, empilhar controles sem esconder ações essenciais. A barra global `AppHeader` continua pertencendo ao `AppShell`; este cabeçalho é **o hero da página**, dentro do conteúdo, como em `DashboardRedesign`.

**Linha 2, cards personalizáveis:** “Ações de hoje” (largura 2), “Jornadas ativas”, “Atletas sem professor”, “Solicitações”, “Treinos previstos × realizados”, “Turmas” e “Avaliações pendentes”. Cada card leva à tela filtrada correspondente. Cards com 0 exibem estado útil, sem hífen ou promessa de dado inexistente. Card de segurança/consentimento só aparece se houver um evento autorizado relevante.

**Linha 3, fluxo de atenção:** lista curta e paginada de tarefas por prioridade: `tipo`, atleta, professor, prazo, motivo, status, ação contextual. Nunca mostrar só um número sem permitir chegar ao caso. Resolvido sai do estado “pendente”, mas permanece no histórico.

**Linha 4, progresso e atividade recente:** visão por marcos e período; execução recente da própria escola. Não exibir prontidão, sono, HRV ou Body Battery por padrão. Mesmo com grant, métricas pessoais devem estar em área específica, escopo e explicação claros.

**Menu da escola, alvo final:** Painel, Jornadas, Atletas, Professores, Turmas, Agenda, Presenças, Comunicação, Financeiro, Solicitações, Convites e Membros/Configurações. Agrupar itens no sidebar para evitar uma lista longa no mobile; no dock mostrar apenas destinos principais e uma entrada “Mais”. Esconder item condicionado a permissão, sem depender disso para a segurança da rota/API.

### Telas da operação escolar básica

**Turmas:** listagem com capacidade `ocupação/capacidade`, modalidade, faixa/nível quando aplicável, horários e professor; no detalhe, abas/seções `Visão geral`, `Atletas`, `Professores`, `Agenda`, `Presenças`, `Treinos`. Modalidade esportiva usa cor de `--sport-*`; lotação tem chip semântico. Arquivar preserva histórico e impede novas inscrições; não deletar turma com registros históricos. A estrutura atual de `Team` contém essencialmente nome e vínculos: nível, capacidade, local e horários exigem evolução de schema.

**Agenda:** grade dia/semana e alternativa em lista móvel; sessões recorrentes geram ocorrências identificáveis, cancelamento de uma ocorrência não cancela a série, trocas de professor ficam auditadas. Card mostra hora local, modalidade, turma, local, responsável, vagas e estado. Bloquear conflitos relevantes de professor/local conforme regra configurada; `WorkoutAssignment` não representa sozinho uma aula presencial.

**Presenças:** professor autorizado abre sessão, marca presente/ausente/justificado, revisa até fechamento e registra motivo de correção posterior. Atleta vê suas próprias presenças. Ausência em aula e treino não executado são métricas diferentes. Histórico com data, sessão e autor. Check-in por QR ou localização fica para onda 4 e não é exigido na base.

**Comunicação:** rascunho → prévia de destinatários → envio → histórico/estado de entrega; canais escolhidos e consentidos (in-app/e-mail/WhatsApp se integração ativa), sem assumir WhatsApp sempre disponível. Aviso coletivo não expõe lista de destinatários uns aos outros. Rate limits, preferências e deduplicação. Conteúdo sobre saúde ou biometria não entra em mensagens em massa.

**Financeiro:** definir ofertas/mensalidades, registrar matrícula e competência, emitir cobrança via provedor integrado quando houver, registrar recebimento manual com comprovante e conciliar. Estados `DRAFT`, `OPEN`, `PAID`, `OVERDUE`, `CANCELLED`, `REFUNDED` com regras de transição e histórico. Valor em centavos/currency, datas e fuso consistentes, dinheiro e permissões separados do acompanhamento esportivo. Não presumir que o `TrainingProduct` do marketplace seja mensalidade escolar. Escolher provedor de pagamentos em decisão técnica posterior; nunca guardar dados sensíveis de cartão no Ryvano.

### Tela de jornada

Cabeçalho com meta, modalidade, data-alvo, status, escola, professor responsável e controle de compartilhamento. Logo abaixo: **marco atual** com descrição, critério de conclusão e próximo passo. Depois: grade de cards (próximos treinos, check-ins, feedback, decisões, cronologia). Linha do tempo em ordem, cada evento com data, autor, tipo, resumo e link para registro original. Professores conseguem propor ajuste; atleta visualiza diferença entre plano anterior e proposto antes de aceitar. Um marco encerrado torna-se somente leitura; retificação cria evento de correção.

### Formulários e microfluxos

- **Criar meta:** título claro, modalidade canônica, prazo, descrição de sucesso, escola opcional, visibilidade; validação inline; rascunho antes de publicar.
- **Propor marcos:** 2–5 marcos sugeridos por padrão, ordem explícita, nome, condição verificável, prazo, professor; salvar como rascunho ou enviar para aceite.
- **Aceitar/recusar proposta:** mostrar quem propôs, marcos, dados compartilhados e o que acontece ao aceitar; recusa com motivo opcional.
- **Ajustar plano:** diff de prazo/treinos/marcos; motivo obrigatório para decisão do professor, aceite do atleta quando altera compromisso do atleta; status permanece até confirmação.
- **Check-in:** opções rápidas e campo livre opcional; indicar claramente que não é laudo nem leitura do relógio.
- **Atribuir professor:** selecionar apenas `CoachProfile` com vínculo ativo nesta escola; checar ausência de atribuição primária ativa ou usar fluxo de troca existente; confirmação e auditoria.
- **Turma:** validar escola, modalidade, professores ativos, atleta ativo e impedimento de edição quando arquivada; vincular pessoas existentes, nunca criar duplicatas por conveniência da tela.

## 6. Design system — requisito obrigatório

**O código existente é a fonte de verdade.** Não inventar uma paleta paralela, novos componentes de navegação ou outro estilo de cards. Se um padrão atual apresentar problema de contraste ou teclado, corrigir o componente compartilhado para todas as telas afetadas.

| Elemento | Referência e regra de implementação |
|---|---|
| Shell e navegação | Reusar `AppShell`, `AppHeader`, sidebar, `MobileDock` e `lib/navigation`. Novo item de menu com ícone do catálogo existente; verificar estados ativo e mobile. |
| Cabeçalho da página | Espelhar o hero de `components/dashboard/dashboard-redesign.tsx` e `activity-visual-dashboard.tsx`: `rounded-[24px]`, borda/superfície translúcida, avatar, eyebrow, título, subtítulo, chips e filtros. Não inserir segundo header global. |
| Grade de cards | Reusar `CustomizableCardGrid` com ID estável, `label`, `defaultSpan`, `accentClassName` e `content`; 1 coluna no mobile, 3 no desktop quando a composição permitir. Permitir reordenar e redimensionar como no dashboard do atleta. |
| Persistência do layout | Salvar por **usuário + escola + superfície** (`school-dashboard`), nunca em `UserProfile.dashboardLayoutOrder` do atleta. Validar IDs permitidos, spans 1–3, escola e papel no servidor; descartar IDs obsoletos e adicionar cards novos ao fim. Erro de rede preserva edição local com opção de tentar salvar; “Descartar” restaura último layout confirmado. |
| Contêiner de card | Partir do `CustomizableCardGrid`: raio 24 px, borda suave, superfície translúcida, sombra leve e linha de cor superior. Respeitar tema claro/escuro. Não envolver uma tabela extensa em card estreito. |
| Cores | Semânticas existentes `theme-pill-*` e `theme-panel-*`: informação azul/ciano, sucesso verde, atenção âmbar, erro/risco rosa/vermelho, neutro. Cores de modalidade vêm de `--sport-*` em `app/globals.css`; não confundir modalidade com estado. Cores são apoio, sempre acompanhadas de texto/ícone. |
| Ícones | Usar `@tabler/icons-react` como nas telas atuais. Mesmo conceito usa mesmo ícone em cards/listas; ícone com `aria-hidden` quando redundante. |
| Botões/filtros | Reusar padrão de pills do dashboard (`min-h-11`, borda suave, seleção evidente); ação principal apenas uma por região. Links profundos preservam filtro e período em query string. |
| Motion | Reusar `motion/react`, entrada discreta e transições do dashboard; `useReducedMotion` elimina efeitos dispensáveis. Não animar números constantemente nem atrasar ações críticas. |
| Tipografia | Geist via tokens globais; `h1` equivalente ao dashboard, labels curtas, valores legíveis, textos auxiliares `text-foreground/66` com contraste verificado. Não usar texto minúsculo como único modo de ler status. |
| Tema | Conferir visual e contraste em `:root` (escuro) e `[data-theme="light"]`; preferir tokens e classes temáticas, evitando fundos escuros fixos em novos componentes. |
| Responsividade | 320/375/768/1024/1440 px; filtros quebram linha; tabelas viram cards ou rolagem horizontal identificada; botões e alvos ≥44 px; barra de salvar não cobre dock móvel. |
| Estados | Skeleton com geometria do resultado, erro com repetição da ação, vazio com explicação e próxima ação, sem permissão com mensagem adequada, conteúdo parcialmente disponível sem tela travada. |

### Correção recomendada no componente compartilhado

O `CustomizableCardGrid` hoje usa `pointerdown` para arrastar/redimensionar e um banner de salvamento com fundo escuro literal. Antes de reutilizá-lo na escola, melhorar **operação por teclado** (foco no handle, mover com setas e anúncio por `aria-live` ou ações “Mover para cima/baixo”; alternativa explícita para redimensionar) e ajustar superfícies do banner para ambos os temas. Manter a compatibilidade com dashboard do atleta, atividades e integrações. Não criar um segundo grid divergente.

### Mapa semântico de cards propostos

| Card | Acento visual sugerido | Valor e CTA |
|---|---|---|
| Ações de hoje | âmbar | Número de tarefas abertas; “Abrir fila”. |
| Jornadas ativas | violeta/índigo | Quantidade de jornadas ativas da escola; “Ver jornadas”. |
| Atletas sem professor | âmbar | Atletas ativos sem atribuição primária ativa; “Atribuir”. |
| Solicitações | azul/ciano | Atletas + professores pendentes; “Analisar”. |
| Treinos da semana | verde quando concluído; neutro quando agendado | Fração de realizados elegíveis e período explícito; “Ver treinos”. |
| Turmas | cor da modalidade no detalhe, acento neutro no resumo | Turmas não arquivadas; “Gerenciar turmas”. |
| Avaliações pendentes | rosa/âmbar conforme prazo | Avaliações elegíveis esperando ação; “Avaliar”. |

**Cálculo das métricas:** definir denominador de cada indicador na consulta/DTO e em tooltip. Treinos `CANCELLED`, `RESCHEDULED` e futuros não contam como execução esperada; `JUSTIFIED` tem tratamento separado. Não classificar ausência de sincronização automaticamente como falta. O painel atual usa `scheduledAt < início do dia` para atrasados e limita busca a 200; substituir por consulta paginada/contagem consistente usando `dueAt` quando aplicável e janela bem definida.

## 7. Regras de negócio e estados

### Estados de jornada

`DRAFT → PROPOSED → ACTIVE → COMPLETED`; de `ACTIVE` pode ir a `PAUSED`, depois `ACTIVE`, `COMPLETED` ou `CANCELLED`. `PROPOSED → DECLINED` ou retorno a `DRAFT` pelo autor. Conclusão exige pelo menos um marco concluído ou justificativa registrada para encerramento antecipado; não inferir conclusão só por data. `CANCELLED` e `DECLINED` permanecem no histórico.

### Estados de marco

`PLANNED → IN_PROGRESS → REVIEW_REQUIRED → COMPLETED`; pode ir a `PAUSED` ou `SKIPPED` com motivo. Só um marco é o principal em progresso por jornada no MVP, mas treinos futuros podem ser planejados. Alterações importantes de meta, critério, prazo e responsável criam revisão com antes/depois.

### Regras invariantes

1. `athleteId` é `User.id`; não criar `AthleteProfile` duplicado. IDs de escola, coach e turma devem ser os IDs dos respectivos modelos.
2. Jornada pertence ao atleta; a escola participa no período de vínculo. Autor da proposta, da prescrição e da avaliação permanece identificável.
3. OWNER/ADMIN de escola não equivale a `User.role = ADMIN`; professor só lê/edita jornadas de atletas atribuídos conforme vínculo ativo e regra do use case.
4. Escola só vê execuções dos treinos prescritos por ela; histórico bruto, biometria, prontidão e dados de outras escolas exigem grant específico não revogado. Novo consentimento não pode ser implícito no aceite de uma meta.
5. Treino realizado deriva de `WorkoutExecution`/atividade normalizada ou fluxo manual existente; check-in curto não falsifica execução nem score de compliance.
6. Encerrar vínculo não apaga jornada, histórico, audit log ou autoria. Eventos históricos têm data UTC e fonte; correção acrescenta versão/evento.
7. Alterações de status/atribuição, aceite de plano, revisão e auditoria ocorrem na mesma transação. Operações repetidas por retry são idempotentes.
8. Nenhum indicador, alerta ou score pode diagnosticar lesão ou impor treino. Sinal automatizado explica os fatos e pede decisão humana.

### Alertas de trabalho inicial

| Evento | Critério verificável | Destinatário | Desfecho |
|---|---|---|---|
| Atleta sem professor | membership atleta ativo e nenhuma atribuição primária `ACTIVE` com `endedAt = null` | Escola | Atribuir/trocar/adiar com motivo. |
| Treinos sem execução confirmada | 2 atribuições vencidas elegíveis, sem execução confirmada/justificativa | Professor responsável | Contatar, justificar, ajustar ou aguardar. |
| Avaliação pendente | execução vinculada à escola sem avaliação dentro da janela configurada | Professor autor/responsável | Avaliar ou dispensar com motivo. |
| Marco próximo do prazo | prazo em 7 dias e marco não concluído | Professor e atleta | Revisar, ajustar ou concluir. |
| Feedback pede ajuda | atleta sinalizou dificuldade explicitamente | Professor | Responder/ajustar. |

Armazenar `dedupeKey` por evento/entidade/janela, `status`, destinatário e resolução. Atualização do treino não pode criar alertas duplicados; permitir silenciar regras não críticas por escola/atleta. Não notificar toda a escola sobre dados individuais sem necessidade.

## 8. Modelo de dados proposto

Confirmar no `schema.prisma` antes de criar migration. Nomes abaixo são proposta de contrato, não declaração de que já existam.

| Entidade | Campos principais | Relações/regras |
|---|---|---|
| `AthleteJourney` | `id, athleteId, schoolId?, title, sportType, successCriteria, targetAt?, status, proposedByUserId?, acceptedAt?, createdAt, updatedAt, endedAt?, version` | `athleteId → User.id`; `schoolId` opcional para meta pessoal; índice `(schoolId,status,targetAt,id)` e `(athleteId,status,id)`; período escolar preservado. |
| `JourneyMilestone` | `id, journeyId, ordinal, title, successCriteria, targetAt?, status, responsibleCoachId?, startedAt?, completedAt?` | Ordenação única por jornada; coach é `CoachProfile.id`; mudanças versionadas. |
| `JourneyAssignmentLink` | `id, milestoneId, workoutAssignmentId, createdAt` | Link para treino existente, sem duplicar prescrição; unique `(milestoneId,workoutAssignmentId)`. |
| `JourneyCheckIn` | `id, milestoneId, athleteId, kind, note?, createdAt` | Só o próprio atleta; `kind` enum explícito; nunca equivaler automaticamente a `WorkoutExecution`. |
| `JourneyReview` | `id, milestoneId, actorUserId, decision, reason, proposalJson?, acceptedByAthleteAt?, createdAt` | Proposta e decisão humana com autoria e diff; nenhuma edição silenciosa. |
| `JourneyEvent` | `id, journeyId, actorUserId?, type, entityId?, payload, createdAt` | Trilha append-only para feed; não armazenar tokens, segredos nem dados clínicos no payload. |
| `JourneyAttentionItem` | `id, schoolId, journeyId?, athleteId, assignedToUserId?, type, dedupeKey, status, dueAt?, resolvedBy?, resolvedAt?` | Fila materializada para operar, índices `(schoolId,status,dueAt,id)` e `dedupeKey` único; dados mínimos. |
| `DashboardLayoutPreference` | `id, userId, schoolId?, surface, layoutJson, updatedAt` | Unique `(userId,schoolId,surface)` ou chave normalizada para `schoolId=null`; isolar do layout do atleta. |
| `SchoolClassSession` | `id, schoolId, teamId, coachId?, startsAt, endsAt, timezone, location?, capacity?, status, recurrenceId?, createdAt` | Ocorrência de aula/evento coletivo; conflito e cancelamento por ocorrência; não confundir com prescrição. |
| `ClassAttendance` | `id, sessionId, athleteId, status, reason?, markedByUserId?, markedAt?, updatedAt` | Unique `(sessionId,athleteId)`; somente atleta ativo/inscrito; correção auditada. |
| `SchoolNotice` e `NoticeDelivery` | aviso: `schoolId, authorId, audience, content, status`; entrega: `channel, recipientId, status, providerRef?, sentAt?` | Audiência resolvida e congelada na expedição, idempotência por aviso/destinatário/canal; opt-out aplicável. |
| `SchoolMembershipPlan` e `SchoolEnrollment` | oferta: `name, priceCents, currency, recurrence, status`; matrícula: `schoolId, athleteId, planId, startedAt, endedAt?, status` | Contrato comercial separado de jornada e produto do marketplace; versão de preço preservada na matrícula. |
| `SchoolInvoice` e `SchoolPayment` | fatura: `enrollmentId, period, amountCents, dueAt, status`; pagamento: `amountCents, paidAt, method, providerRef?, status` | Cobrança idempotente por competência; atualização e conciliação auditadas; estorno separado. |

**MVP pragmático:** se o volume de tarefas for pequeno, `JourneyAttentionItem` pode ser derivado por consulta antes de materializar, desde que permita status de resolução persistente e deduplicação. `JourneyEvent` pode aproveitar infraestrutura de auditoria escolar para o rastro técnico, mas a timeline exibida ao atleta deve ter DTO próprio, texto compreensível e filtragem por visibilidade; não expor o JSON bruto do audit log.

**Templates, marketplace e colaboração entre escolas:** não antecipar tabelas para a onda 3. `TrainingProduct` existente é plano comercializável, distinto de `AthleteJourney` e de mensalidade escolar; só vincular explicitamente quando houver caso real. Evitar migração invasiva desnecessária.

## 9. Contratos HTTP e DTOs propostos

Usar Zod `strictObject`, ID opaco não vazio, datas ISO 8601 no HTTP, UTC em persistência, autenticação derivada da sessão. Retorno de lista `items/nextCursor`, limite padrão 20, máximo 100 e ordenação estável com `id` como desempate. Erros com código estável, mensagem segura e status 400/401/403/404/409.

| Método e rota | Entrada | Saída/efeito | Autorização |
|---|---|---|---|
| `POST /api/journeys` | `{ athleteId?, schoolId?, title, sportType, successCriteria, targetAt? }` | Jornada `DRAFT` | Atleta tem `athleteId` fixado da sessão; proposta de escola/coach valida `athleteId` e vínculo no servidor. |
| `GET /api/journeys?schoolId&status&coachId&teamId&cursor` | Filtros | `items/nextCursor`, resumo sem dados externos | Atleta só próprias; escola/coach escopo explícito. |
| `GET /api/journeys/[id]` | ID | Meta, marcos, links de treino, eventos visíveis, ações permitidas | Guard no use case; negar IDs de outra escola. |
| `POST /api/journeys/[id]/propose` | Versão e marcos | `PROPOSED`, evento e audit | Autor autorizado; vínculo ativo. |
| `POST /api/journeys/[id]/accept` | `{ expectedVersion }` | `ACTIVE` | Somente atleta, ou fluxo futuro de responsável legal devidamente modelado. |
| `POST /api/journeys/[id]/milestones/[mid]/check-ins` | `{ kind, note? }` | Check-in | Atleta dono. |
| `POST /api/journeys/[id]/milestones/[mid]/reviews` | `{ decision, reason, expectedVersion, proposedChanges? }` | Revisão, evento e audit | Professor responsável; aceite do atleta quando necessário. |
| `POST /api/journeys/[id]/assignment-links` | `{ milestoneId, workoutAssignmentId }` | Vínculo | Coach autorizado; treino do mesmo atleta/escola. |
| `GET /api/schools/[id]/attention?status&type&cursor` | Filtros | Fila paginada | OWNER/ADMIN da escola; professor vê endpoint/consulta da sua atribuição. |
| `POST /api/schools/[id]/attention/[itemId]/resolve` | `{ outcome, note? }` | Estado resolvido, autor/data | Ator autorizado para o item. |
| `PUT /api/schools/[id]/dashboard-layout` | `{ layout:[{id,span}] }` | Layout persistido | OWNER/ADMIN; IDs de cards permitidos e `span ∈ 1..3`. |
| `GET/POST /api/schools/[id]/class-sessions` | intervalo/filtros ou `{ teamId, coachId, startsAt, endsAt, location?, recurrence? }` | Sessões paginadas ou criada | OWNER/ADMIN; professor apenas agenda atribuída quando leitura. |
| `PATCH /api/schools/[id]/class-sessions/[sessionId]/attendance` | `{ athleteId, status, reason?, expectedVersion }` | Presença e evento de correção | Professor da turma ou OWNER/ADMIN, com escopo da sessão. |
| `GET/POST /api/schools/[id]/notices` | filtros ou `{ audience, channels, content, scheduledAt? }` | Aviso, prévia de audiência e entregas | OWNER/ADMIN ou papel delegado; validar preferências antes de enviar. |
| `GET/POST /api/schools/[id]/invoices` | competência/filtros ou cobrança validada | Faturas e pagamentos sem duplicata | Permissão financeira; escrita idempotente e trilha de auditoria. |

DTO de resumo de card: `label`, `value`, `period`, `definition`, `href`, `statusTone`, `isPartial`. Se parcial, mostrar aviso e nunca percentual enganoso. Evitar N+1: consultas agregadas por escola/coach e seleção mínima de colunas. Paginação de filas e atletas por cursor.

## 10. Acesso, privacidade e auditoria

- Guard de página em `/escola/[schoolId]/layout.tsx` exige membership escolar ativa com OWNER/ADMIN. Rotas de API fazem checagem equivalente no servidor e filtram `schoolId` em **todas** as consultas; não confiar em `schoolId`, `coachId` ou `athleteId` de formulário para conceder papel.
- `CoachSchoolMembership.coachId` referencia `CoachProfile.id`, não `User.id`; ao filtrar por usuário usar relação `coach: { userId }`. Professor precisa de vínculo escolar e atribuição ao atleta conforme operação.
- Atleta visualiza sua própria jornada pessoal e fatos próprios; usuário onboarded de outra escola não recebe dados por adivinhar ID.
- Consentimento de histórico anterior/biometria usa `HistoryAccessGrant` não revogado, com escopo e prazo. A escola só lê execuções das prescrições próprias sem esse grant. Aceitar jornada não cria grant de histórico automaticamente.
- OWNER/ADMIN não concede consentimento pelo atleta. Compartilhamento futuro entre escolas explicita organização, categorias, período, finalidade e botão de revogação. Revogação interrompe leituras subsequentes; registro de autoria não é apagado.
- Gravar alterações de escola/coach/jornada em transação com `SchoolAuditLog` ou evento equivalente, incluindo ator, entidade, antes/depois relevante e horário; evitar payload excessivo ou PII em logs. Ser explícito sobre quem pode ler cada tipo de evento.
- Revalidar permissão no momento da mutação, não apenas quando a página carregou. Lidar com mudanças concorrentes usando `expectedVersion` e 409 para atualização obsoleta.

## 11. Acessibilidade e qualidade de experiência

- Ordem do teclado acompanha a ordem visual; foco visível; cards arrastáveis também podem ser movidos sem ponteiro; anúncios de mudança e erro por `aria-live`.
- Títulos hierárquicos (`h1` único), labels reais, descrição de erro ligada ao campo, estados não indicados somente por cor; contadores explicados por período e denominador.
- Datas no fuso da escola/usuário para apresentação, instantes em UTC no banco; não usar o início do dia UTC como equivalente silencioso do dia local.
- No mobile, hierarquia: próximo passo → ações pendentes → progresso → listas. Grade de uma coluna, hero compacto e dock navegável sem sobreposição do banner de salvar.
- Sem integração de relógio: jornada, prescrição, check-in e feedback seguem utilizáveis; nenhum card pessoal vazio de Garmin aparece para conta administrativa.
- Estado sem jornada: explicar “Defina um objetivo para organizar seus próximos treinos” e oferecer ação autorizada. Estado sem professor: CTA de atribuição para escola; para atleta, explicar que escola analisará vínculo.
- Erro no salvamento de plano ou layout: manter a edição local, mensagem clara e nova tentativa. Evitar perda de rascunho por navegação acidental.

## 12. Critérios de aceite por fluxo

1. OWNER cria turma, associa professor e atletas ativos existentes; atleta sem professor pode ser atribuído no lobby. `/escola/{id}/turmas` deixa de responder 404.
2. Atleta cria meta; professor autorizado propõe marcos; atleta aceita; status, autoria e datas aparecem iguais nas três visões. Usuário sem vínculo não abre o recurso por URL direta nem API.
3. Um treino prescrito para marco aparece no calendário existente; execução confirmada é mostrada na jornada por vínculo, sem registro duplicado. Check-in manual sozinho não conta como execução automática.
4. Dois treinos elegíveis sem execução geram **um** item de atenção para a janela; resolver item registra autor e não apaga histórico. Ausência de sync sem confirmação não vira falta automaticamente.
5. Revisão de marco mostra antes/depois e motivo; atualização simultânea com `expectedVersion` antigo retorna 409, sem sobrescrever silenciosamente a decisão alheia.
6. Dashboard escolar salva ordenação/largura dos cards por usuário e escola; preferências de outra escola e do dashboard pessoal permanecem independentes; carregamento com card novo preserva layout salvo.
7. Modo claro/escuro, teclado, tela de 320 px e movimento reduzido são verificados nas telas novas; bandeja “Salvar layout” não encobre ações ou dock móvel.
8. Professor bloqueado em `/escola/*`, atleta bloqueado em `/professor/*`, usuário comum bloqueado em `/admin/*`; API retorna 403/404 apropriado para acesso cruzado. Atleta que deixou escola acessa seu próprio histórico autorizado, não a administração.
9. Sem relógio, sem escola, sem turma, sem treinos e sem jornada: cada tela apresenta próximo passo coerente, sem loading infinito ou falso dado.
10. Contadores de solicitações incluem atletas e professores pendentes; contagem de professores mostra claramente atletas sob responsabilidade ou prescrições, conforme rótulo; totais e listas concordam.
11. Turma define capacidade/horário; sessão recorrente é cancelável individualmente; presença de uma sessão pode ser corrigida com autoria e não altera automaticamente execução de `WorkoutAssignment`.
12. Mensagem coletiva respeita destinatários, preferências e idempotência; cobrança mensal não duplica na repetição da tarefa; somente perfil financeiro autorizado vê valores e executa estorno.

## 13. Verificação e entrega

1. Antes de implementar: `bash .agents/skills/ryvano-telas/scripts/audit-routes.sh`; inventariar rotas e confirmar 404 de turmas no estado corrente. Examinar as telas do atleta e o design system no commit de trabalho, não somente neste documento.
2. Separar mudanças em slices revisáveis: **turmas e correções**, **jornada/consentimento**, **telas**, **atenção e métricas**. Migration reversível e seed e2e sem criar equipes/profissionais duplicados desnecessariamente.
3. Verificar `npx tsc --noEmit`, `npx vitest run` e testes de integração dos use cases de permissão, transição e idempotência; testar consulta paginada e contadores com banco real quando relevante.
4. Com dev server + seed e2e, executar `bash .agents/skills/ryvano-telas/scripts/audit-access.sh` e exercitar os três perfis. Em Next dev, Server Component pode responder 200 com meta redirect; o script já interpreta isso.
5. Fazer revisão visual real das páginas em desktop/mobile e tema claro/escuro. Testar arrastar, alternativa por teclado, salvar/descartar e reload. Conferir que todas as ações e indicadores levam a telas funcionais com filtro aplicado.
6. Instrumentar sem PII: jornada criada, proposta aceita, marco revisado, item de atenção resolvido, retorno semanal por perfil. Medir adoção e resolução de pendências, não usar tempo no app como único sinal de valor.

### Indicadores para validar a hipótese de produto

| Indicador | Definição inicial | Leitura esperada |
|---|---|---|
| Ativação do atleta | Meta criada e ao menos um marco aceito até 7 dias após vínculo | O fluxo inicial comunica valor? |
| Ativação da escola | Primeiro atleta atribuído e primeira proposta de jornada enviada | A escola consegue operar? |
| Resposta do professor | Tempo até agir sobre um alerta legítimo | A fila ajuda ou causa ruído? |
| Continuidade | Atletas com revisão de marco e próximo passo após 4 semanas | Há acompanhamento real? |
| Qualidade dos alertas | Percentual de itens resolvidos como úteis versus descartados | Ajustar critérios e frequência. |

## 14. Limites da proposta e decisões em aberto

- A pesquisa de mercado já mostra produtos com passaporte esportivo e treinamento adaptativo. O diferencial aqui é uma **hipótese**: conectar meta, ações dos três perfis e continuidade entre organizações de modo consentido. Validar com escolas e atletas; não anunciar “primeiro do mundo”.
- Definir com usuários piloto se a primeira escola é principalmente assessoria remota, escola presencial ou ambas. Isso determina a ordem de entrega de horários, presença, cobrança e responsáveis, sem retirar agenda, comunicação e financeiro do produto escolar completo.
- Confirmar se metas pessoais sem escola entram no MVP ou apenas no modelo de dados. A proposta de UX acima suporta ambos, mas a primeira entrega pode focar em jornada escolar.
- Definir o limiar de alerta com pilotos; dois treinos é configuração inicial, não verdade clínica ou regra universal.
- Multi-escola, IA, responsáveis e integrações avançadas são fases explícitas. Agenda, presença, comunicação e financeiro integram a visão básica completa, mesmo que sejam entregues após a primeira versão da jornada. Não declarar funcionalidades propostas como prontas.

## Referências de produto e mercado

- Ryvano: `.kiro/specs/ryvano-escola-spec/required.md`, `architecture/modules/school.yaml`, `.agents/skills/ryvano-telas/SKILL.md` e os componentes apontados na seção 2.
- TrainingPeaks: https://www.trainingpeaks.com/get-started-coach/ ; Final Surge: https://www.finalsurge.com/coaches/ ; Spond: https://www.spond.com/en-us/activity/schools-and-education/ ; SisRUN: https://sisrun.com.br/ ; SCA: https://www.sistemasca.com/natacao .
- Soluções de passaporte/treino adaptativo já existentes: https://www.clubeshub.com/pt-BR ; https://www.myathletepassport.com/ ; https://www.athletica.ai/ .
