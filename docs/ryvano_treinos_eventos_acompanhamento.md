# Ryvano — Prescrição pelo professor, catálogo de treinos e preparação para eventos

**Especificação funcional e técnica de referência · versão 1.0 · 03/10/2026**

**Abrangência:** natação em piscina, natação em águas abertas e travessias, corrida, ciclismo e triathlon. Aplicável ao professor independente e ao professor vinculado a uma escola/assessoria, com acompanhamento individual mesmo quando a prescrição é distribuída em grupo.

> **Decisão central e obrigatória:** a Ryvano não gera treinos, não escolhe sessões, não monta periodização e não altera a prescrição por conta própria. O professor cadastra, organiza, seleciona, individualiza e publica os treinos. A plataforma registra eventos e objetivos, notifica responsáveis, calcula o que foi explicitamente definido, organiza evidências e compara prescrito versus realizado.

## 1. Como ler e utilizar este documento

Este documento reúne pesquisa de mercado, referências bibliográficas e uma proposta original de produto. As regras descritas para a Ryvano são requisitos propostos, não afirmações sobre funcionalidades já implementadas. Não houve inspeção do repositório ou teste da aplicação nesta pesquisa.

As referências do mercado foram consultadas em páginas oficiais e centrais de ajuda. Livros foram verificados por páginas editoriais, descrições e sumários disponíveis; não se afirma leitura integral de obras pagas. Artigos científicos e guias públicos complementam a fundamentação. Não foram copiados programas completos dos livros.

Os exemplos de sessões e cronogramas são originais e ilustram o que o sistema precisa conseguir representar. São modelos de cadastro para revisão profissional, não prescrições universais nem um catálogo que a Ryvano deve atribuir automaticamente. Frequência, volume, intensidade, descanso e duração da preparação dependem da avaliação do aluno.

As referências aparecem como `[Mxx]` para mercado, `[Lxx]` para livros e `[Txx]` para textos técnicos. Os links completos e o alcance de cada consulta estão na seção 25. Quando uma dúvida permanecer, aplicar o roteiro de pesquisa da seção 26 antes de implementar a regra.

### 1.1 Índice

1. Uso e alcance do documento.
2. Decisões de produto e limites da automação.
3. Mercado e implicações para a Ryvano.
4. Modelo esportivo e níveis do aluno.
5. Eventos, participação e objetivos.
6. Fluxo do cadastro ao acompanhamento.
7. Alertas, responsáveis e prazos.
8. Preparação, periodização e revisão.
9. Catálogo de autoria do professor.
10. Atribuição individual e coletiva.
11. Construtor manual de sessões.
12. Natação em piscina.
13. Águas abertas, travessias e eventos aquáticos.
14. Corrida.
15. Ciclismo.
16. Triathlon.
17. Prescrito versus realizado.
18. Zonas, avaliações e qualidade de dados.
19. Telas e navegação.
20. Permissões e contexto da escola.
21. Modelo de dados e serviços.
22. Cenários completos.
23. Critérios de aceitação.
24. Ordem de implementação.
25. Referências verificadas.
26. Instruções para pesquisar dúvidas.
27. Glossário e decisões pendentes.

## 2. Decisões de produto e limites da automação

### 2.1 O que cada participante faz

| Participante | Responsabilidade |
|---|---|
| Aluno | Cadastrar eventos, informar objetivos e disponibilidade, registrar execução e sensações, acompanhar o planejamento e pedir alterações. |
| Professor | Avaliar o aluno, negociar metas, definir fases e marcos, cadastrar sessões, manter catálogo, atribuir treinos, analisar execução e revisar o planejamento. |
| Escola/assessoria | Organizar professores e alunos autorizados, definir responsáveis, manter catálogo institucional e acompanhar pendências dentro do seu escopo. |
| Ryvano | Persistir dados, calcular totais e comparações, resolver unidades, emitir alertas, registrar histórico e facilitar o trabalho do professor. |

### 2.2 Automações permitidas

- Somar distâncias, repetições, tempos de esforço e descansos explicitamente cadastrados.
- Calcular uma faixa individual a partir de fórmula escolhida pelo professor e avaliação válida do atleta, com prévia antes da publicação.
- Criar pendência de acompanhamento quando o aluno registra um evento.
- Calcular dias até a prova e vencimentos de marcos definidos pelo professor.
- Notificar criação, alteração, cancelamento, atividade recebida e revisão pendente.
- Importar atividades por integrações disponíveis e autorizadas; aceitar registro manual e arquivos suportados.
- Sugerir a associação entre uma atividade e uma prescrição, explicando os critérios.
- Apresentar desvios, tendências e dados ausentes sem decidir a nova prescrição.

### 2.3 Automações fora do escopo

- Gerar treino, plano, microciclo ou taper usando IA ou regras automáticas.
- Selecionar sessões do catálogo com base no evento sem ação do professor.
- Aumentar volume ou intensidade porque o aluno cumpriu a semana anterior.
- Recuperar treino perdido encaixando-o automaticamente em outro dia.
- Reduzir ou aumentar carga devido a relógio, HRV, sono ou indicador de prontidão.
- Alterar zonas de sessões publicadas após novo teste sem revisão explícita.
- Declarar que o aluno está apto, seguro ou garantido para completar uma prova.
- Diagnosticar lesão, overtraining ou condição clínica com base nos dados esportivos.

**Teste de fronteira:** se o sistema está decidindo qual estímulo o aluno deve realizar, ultrapassou seu papel. Se está calculando ou exibindo uma decisão previamente registrada pelo professor, está dentro do escopo.

## 3. Análise de mercado

### 3.1 Comparação de funcionalidades observadas

| Plataforma | Evidência pública consultada | Aprendizado para a Ryvano | Limite da evidência |
|---|---|---|---|
| TrainingPeaks | Bibliotecas de sessões; eventos com objetivos e resultados; planos padrão e dinâmicos aplicados a calendários de atletas. [M01–M03] | Separar modelo reutilizável, prescrição no calendário e atividade executada; associar planejamento a eventos. | Não assumir que todos os alertas e políticas propostos aqui existem no produto. |
| Final Surge | Biblioteca, calendário de equipes, planos reutilizáveis, comentários e associação de arquivos a sessões planejadas. [M04] | Reduzir trabalho repetitivo do treinador e evitar duplicação visual entre planejado e realizado. | A página reúne funcionalidades publicadas em diferentes épocas; não prova paridade entre todos os aplicativos. |
| Nolio | Previsto/realizado, competições, modelos, atribuição individual ou por grupo, dados objetivos e subjetivos e notificações de novas competições. [M05] | Integrar prescrição, feedback e comunicação no contexto da sessão e do evento. | A pesquisa documental não equivale a teste de uso ou validação de todos os planos comerciais. |
| Intervals.icu | Calendário, biblioteca, totais semanais, comparação planejado/realizado e aplicação de planos a múltiplos atletas. [M06] | Exibir séries temporais e carga com contexto, sem fazer do dashboard um substituto da decisão profissional. | Não presumir que uma integração disponível no concorrente estará disponível para a Ryvano. |
| Treinus | Atleta ou treinador pode indicar prova-alvo; professor visualiza alvo e evento mais próximo, com filtros. [M07] | Distinguir próximo evento de objetivo principal da temporada. | A documentação consultada não comprova um fluxo completo de marcos e revisão com prazos. |
| SisRUN | Aluno cadastra provas/metas, informa prioridade, vê contagem regressiva e o treinador recebe aviso. [M08] | É o paralelo mais direto ao fluxo solicitado pelo usuário. | A central distingue metas pessoais do calendário de provas gerenciado pela assessoria; a Ryvano precisa tornar isso claro. |

### 3.2 Conclusões da comparação

O fluxo aluno → objetivo/evento → aviso ao treinador já possui precedente verificável. A Ryvano deve executá-lo bem, sem apresentá-lo como exclusividade. Bibliotecas e distribuição coletiva também são capacidades estabelecidas no mercado.

A oportunidade de produto proposta é integrar esse fluxo às necessidades de escola e professor independente, com clareza de responsabilidade, histórico de revisão, individualização ao atribuir em lote e análise específica de águas abertas. Essa oportunidade é uma inferência desta pesquisa, não uma demonstração de ausência dessas capacidades em todos os concorrentes.

Não é necessário copiar a automação de prescrição de qualquer plataforma. O catálogo deve economizar digitação mantendo o professor como autor e responsável.

### 3.3 Critérios práticos para avaliar concorrentes em pesquisas futuras

Em demonstrações ou contas de teste autorizadas, verificar: quantos passos o aluno usa para cadastrar uma travessia; quem recebe o alerta; se o aviso possui estado de tratamento; como editar metas sem apagar as anteriores; como atribuir a 20 alunos com ritmos diferentes; o que acontece quando o modelo muda; como lidar com atividade não prescrita; e como comparar uma sessão parcialmente realizada.

Registrar evidências e plano comercial testado. Ausência de menção em uma página não significa ausência de recurso. Preços, limites por aluno e contratos de integração não foram analisados neste documento.

## 4. Modelo esportivo e níveis do aluno

### 4.1 Modalidade, ambiente e objetivo são dimensões diferentes

| Dimensão | Exemplos |
|---|---|
| Modalidade | Natação, corrida, ciclismo, triathlon. |
| Ambiente/disciplina | Piscina curta/longa; mar/lago/rio; rua/pista/trail; estrada/MTB/gravel/indoor. |
| Finalidade | Saúde, aprendizagem, participação, travessia, competição, recorde pessoal, classificação. |
| Capacidade trabalhada | Técnica, resistência, velocidade, limiar, habilidade tática, recuperação. |
| Fase da preparação | Avaliação, base, desenvolvimento, específico, redução pré-prova, competição, recuperação. |

Natação em águas abertas deve possuir experiência própria na interface, mesmo quando internamente pertence à modalidade natação. Treino de piscina preparatório para travessia mantém ambiente “piscina” e objetivo “águas abertas”.

Triathlon é uma preparação integrada, não a soma automática de três programas independentes. O aluno pode praticar duas modalidades sem ser triatleta. Eventos pessoais podem pertencer a modalidades diferentes sem alterar sua classificação principal.

### 4.2 Níveis independentes por modalidade e ambiente

| Nível | Caracterização funcional | O sistema deve permitir |
|---|---|---|
| Iniciante | Pouca experiência na modalidade ou retorno após interrupção; capacidade ainda em avaliação. | Instruções detalhadas, metas de processo, volume individual, pausas, caminhada/corrida e acompanhamento de habilidade. |
| Intermediário | Rotina consistente e familiaridade com sessões estruturadas. | Zonas individualizadas, blocos específicos, testes e revisão de marcos. |
| Avançado | Histórico consistente e tolerância demonstrada às demandas de treinamento. | Análises por repetição, ciclos específicos, simulados e maior detalhamento técnico. |
| Profissional/elite | Contexto competitivo especializado, com equipe e calendário próprios. | Múltiplas sessões diárias, etapas, baterias, colaboração técnica e indicadores customizados. |

**Não vincular nível a quantidade fixa de quilômetros ou horas.** “Profissional” é um contexto esportivo, não autorização para dobrar carga. Um nadador avançado em piscina pode ser iniciante em mar; um ciclista experiente pode ser iniciante na corrida.

Registrar nível, data da avaliação, avaliador, experiência em eventos, histórico recente, disponibilidade e restrições relevantes. O perfil precisa distinguir experiência histórica de condição atual.

## 5. Cadastro de eventos, participação e objetivos

### 5.1 Separação fundamental

**Evento:** a prova ou encontro — nome, edição, local, percurso, organização e data.

**Participação:** a intenção daquele aluno — distância escolhida, inscrição, categoria, prioridade e objetivo.

**Acompanhamento:** o trabalho do professor para aquela participação — responsável, avaliação, fases, marcos, sessões vinculadas e revisões.

Vinte alunos podem participar do mesmo evento e ter vinte objetivos diferentes. Não duplicar o evento para representar cada meta. Um evento pode conter várias distâncias, baterias ou etapas.

### 5.2 Dados do evento

| Campo | Regra |
|---|---|
| Nome e edição | Obrigatórios; distinguir edições anuais. |
| Tipo | Competição, travessia organizada, desafio pessoal, evento recreativo, simulado ou avaliação. |
| Modalidade e disciplina | Obrigatórias; incluir águas abertas e triathlon. |
| Data e fuso | Obrigatórios; horário pode estar “a confirmar”. Não inventar horário de largada. |
| Período | Data inicial/final para eventos de vários dias. |
| Local | Cidade e local/percurso; posição exata opcional e com visibilidade controlada. |
| Distâncias e etapas | Valor e unidade por opção; triathlon por segmento. |
| Organizador e URL | Opcionais; identificar fonte oficial quando informada. |
| Regulamento | Link/anexo, data de consulta e versão; não transformar regulamento antigo em regra atual. |
| Percurso | Mapa/arquivo opcional, altimetria ou circuito quando disponíveis. |
| Cortes | Tempo limite total e por etapa, incluindo a referência de início. |
| Situação | Previsto, confirmado, adiado ou cancelado. |
| Origem | Cadastrado pelo aluno, professor, escola ou catálogo compartilhado. |

Evento privado criado por aluno não entra automaticamente em catálogo público. Evitar duplicados por nome/data/local, mas permitir que o usuário confirme eventos realmente distintos.

### 5.3 Dados da participação

- Aluno, opção de distância, categoria informada e papel em eventual revezamento.
- Interesse, participação planejada, inscrito, participação cancelada ou comparecimento confirmado.
- Prioridade sugerida pelo aluno: principal, secundária ou experiência; professor pode pactuar outra prioridade sem apagar a sugestão.
- Objetivo textual e objetivos mensuráveis.
- Disponibilidade até a prova, viagens e outros compromissos relevantes.
- Professor responsável e eventual escola; se ausente, acompanhamento permanece sem responsável.
- Comprovante de inscrição opcional. Marcar presença na Ryvano não significa inscrição concluída no organizador.
- Resultado: concluiu, não largou, abandonou, desclassificado, evento cancelado ou resultado pendente; campos oficiais preservam contexto.

### 5.4 Objetivos de resultado, desempenho e processo

| Tipo | Exemplo | Evidência |
|---|---|---|
| Resultado | Concluir a travessia; classificação na categoria. | Resultado oficial ou registro confirmado. |
| Desempenho | Completar 10 km abaixo de determinado tempo. | Tempo oficial e condições da prova. |
| Processo | Controlar a largada; cumprir pontos de hidratação; orientar-se sem perder boias. | Feedback, observação técnica e dados disponíveis. |
| Preparação | Executar um simulado definido pelo professor até certa data. | Sessão e parecer de revisão. |

Cada objetivo deve registrar: tipo, descrição, indicador, unidade, valor inicial quando conhecido, alvo ou faixa, prazo, método de avaliação, evidência aceita, responsável e situação.

Separar **objetivo desejado pelo aluno** de **objetivo pactuado com o professor**. Uma meta de tempo pode continuar registrada como desejo mesmo quando o professor orienta inicialmente a meta de concluir.

### 5.5 Situações que exigem atenção

- Duas provas principais próximas: abrir pendência de conciliação, sem cancelar participação.
- Evento cadastrado com pouco prazo: sinalizar intervalo disponível; não compactar semanas de treinamento.
- Mudança de distância ou percurso: manter versão anterior e pedir revisão de metas e sessões futuras.
- Evento passado: permitir registrar resultado e histórico sem criar avisos pré-prova vencidos.
- Viagem entre fusos: conservar fuso do evento e mostrar horário no contexto do usuário.
- Evento sem data confirmada: permitir rascunho, mas não agendar contagem regressiva exata.

## 6. Fluxo completo: do cadastro ao acompanhamento

1. O aluno abre **Calendário → Adicionar evento** ou **Meus eventos → Novo**.
2. Seleciona evento existente ou cadastra um evento pessoal.
3. Informa participação, distância, objetivo e prioridade.
4. Ao salvar, a Ryvano registra a participação, cria acompanhamento pendente e notifica o responsável autorizado.
5. O aluno vê “Evento registrado — aguardando avaliação do professor”, com o nome do responsável quando houver.
6. O professor abre o aviso e vê data, prazo restante, meta, histórico disponível, outros eventos e planejamento atual.
7. O professor registra análise, confirma responsabilidade e pactua objetivo e prazo da primeira revisão.
8. Define fases, marcos e datas. Cadastra sessões ou utiliza itens de seu catálogo, adaptando para aquele aluno.
9. Publica a prescrição; o aluno recebe a versão publicada.
10. As atividades realizadas chegam por integração, arquivo ou registro manual, inclusive as não prescritas.
11. A Ryvano vincula ou sugere associação e apresenta diferenças com qualidade dos dados.
12. O professor revisa o resultado, registra observações e altera sessões futuras quando considerar necessário.
13. Após a prova, ambos registram resultado e percepções; o professor encerra a preparação ou abre revisão para o próximo evento.

**O acompanhamento administrativo começa no cadastro. A preparação prescrita começa quando o professor publica o planejamento.** Não exibir “plano em andamento” quando ainda não existe prescrição.

### 6.1 Estados independentes

| Objeto | Estados propostos |
|---|---|
| Participação | Interesse, planejada, inscrito, cancelada, concluída, não largou, abandonou, desclassificado. |
| Acompanhamento | Sem responsável, aguardando avaliação, em planejamento, ativo, revisão pendente, pausado, encerrado. |
| Marco | Previsto, em andamento, evidência recebida, em revisão, atingido, parcialmente atingido, não atingido, cancelado. |
| Publicação de sessão | Rascunho, publicada, substituída, cancelada. |
| Execução | Futura, aguardando registro, associada, parcial, não realizada confirmada, sem registro. |

Não usar um único status para representar inscrição, prescrição, execução e revisão. “Treino realizado” e “treino revisado pelo professor” são informações distintas.

## 7. Alertas, responsáveis e prazos

### 7.1 Matriz de alertas

| Gatilho | Destinatário | Informação e ação |
|---|---|---|
| Aluno registra evento | Professor responsável; fila autorizada da escola se não houver atribuição | Aluno, evento, data, prazo e objetivo; abrir análise. |
| Aluno altera data, distância ou objetivo | Responsável pelo acompanhamento | Mostrar antes/depois e abrir revisão. |
| Evento cancelado/adiado | Participantes e responsáveis afetados | Revisar futuro; preservar histórico realizado. |
| Novo acompanhamento sem responsável | Coordenação autorizada ou próprio aluno independente | Definir professor; não enviar dados a profissionais aleatórios. |
| Prazo de primeira análise vence | Responsável e, se configurado, coordenação | Pendência vencida e ação para assumir/reagendar. |
| Marco se aproxima | Aluno e professor conforme configuração | Evidência esperada e data. |
| Evidência de marco recebida | Professor | Revisar e registrar resultado. |
| Sessão prevista passa sem registro | Aluno; resumo ao professor | Perguntar se realizou e informar possíveis atrasos de sincronização. |
| Atividade não prescrita chega | Professor autorizado | Mostrar sessão extra e seu impacto no histórico; sem punição automática. |
| Desvio configurado ocorre | Professor | Diferença observada, referência usada e cobertura dos dados. |
| Feedback relata dor ou dificuldade relevante | Professor responsável | Destacar relato e solicitar revisão; aplicativo não é canal de emergência. |
| Evento se aproxima | Aluno e responsável | Preparação, logística e marcos pendentes. |
| Evento passou sem resultado | Aluno e professor | Solicitar registro ou confirmação de não participação. |

### 7.2 Configuração e tratamento

Prazos como primeira análise em dois dias úteis e lembretes D−30, D−14, D−7 e D−1 são **opções de produto**, não normas de treinamento. A escola/professor configura e o aluno vê a expectativa de atendimento. Se a prova estiver mais próxima, a pendência recebe destaque, sem promessa de resposta imediata.

Todo alerta operacional possui entidade de origem, responsável, prazo, prioridade, data de criação e histórico. Estados: novo, visto, em tratamento e resolvido. Marcar como lido não resolve a tarefa. “Reagendado” exige nova data e motivo.

Persistir o aviso interno mesmo quando push/e-mail falhar. Os canais externos dependem de preferência e conexão do usuário; o produto deve registrar entrega, falha e repetição. Conteúdo sensível não deve aparecer em detalhes na tela bloqueada.

### 7.3 Prevenção de ruído e duplicidade

- Uma mesma alteração gera um aviso lógico, ainda que haja múltiplas tentativas de processamento.
- Alterações sucessivas próximas podem compor um resumo com acesso ao histórico.
- Alertas de volume rotineiros podem ir ao resumo diário; eventos e pendências relevantes ficam acessíveis imediatamente.
- Vínculo revogado impede novos alertas e acesso ao detalhe pelo professor anterior.
- Mudança de professor transfere pendências abertas segundo a decisão autorizada da escola/aluno.
- Recalcular avisos ainda não enviados quando a data muda; cancelar os obsoletos.
- Agendas e lembretes respeitam fuso, horário silencioso e calendário de trabalho configurado.

## 8. Preparação para competição, travessia e eventos

### 8.1 Estrutura que o professor cadastra

| Etapa | Decisões do professor | Evidência de acompanhamento |
|---|---|---|
| Avaliação inicial | Histórico, habilidades, disponibilidade, referências de intensidade e viabilidade da meta. | Avaliação, testes apropriados e meta pactuada. |
| Base | Capacidades fundamentais e rotina sustentável. | Consistência, execução técnica e resposta percebida. |
| Desenvolvimento | Capacidades limitantes e progressão individual. | Repetições, testes e comparação longitudinal. |
| Específico | Demandas do percurso, duração, ambiente, transições e estratégia. | Simulados e sessões relacionadas ao evento. |
| Redução pré-prova | Ajuste da carga para a competição. | Volume planejado, sensações e sessões-chave. |
| Competição | Estratégia, horários, equipamento e critérios do evento. | Resultado e execução da estratégia. |
| Recuperação/revisão | Retorno, aprendizados e próximo objetivo. | Feedback e decisão sobre continuidade. |

A periodização é uma organização do trabalho definida pelo professor. A Ryvano deve aceitar fases de duração variável, ausência de alguma fase e sobreposição planejada entre modalidades. Não impor progressão semanal de 5–8%, regra de 10%, ciclos 3:1 ou proporção 80/20 para todos.

Os conceitos de planejamento e individualização são discutidos em [L06]. A literatura sobre taper indica benefícios de determinadas reduções de volume em populações estudadas, mas não fornece uma regra universal de dias e percentuais para cada aluno. A plataforma deve registrar o protocolo escolhido, não aplicá-lo automaticamente. [T05–T06]

### 8.2 Cronograma ilustrativo de acompanhamento de 12 semanas

Este é um exemplo de organização administrativa. Não indica que 12 semanas sejam suficientes para qualquer prova.

| Momento | Entrega do professor | Evidência/decisão |
|---|---|---|
| Cadastro / início | Avaliação, prioridades e objetivo pactuado. | Saber de onde o atleta parte. |
| Semanas 1–3 | Sessões iniciais e critérios de observação. | Confirmar disponibilidade e tolerância à rotina. |
| Semana 4 | Primeira revisão formal. | Manter, adaptar ou renegociar objetivo. |
| Semanas 5–7 | Trabalho específico definido pelo professor. | Evolução das capacidades selecionadas. |
| Semana 8 | Marco ou simulado apropriado. | Revisar estratégia e lacunas. |
| Semanas 9–10 | Ajustes específicos e logística. | Equipamentos, percurso e plano de prova. |
| Semanas finais | Redução pré-prova conforme decisão individual. | Revisão de carga e condições. |
| Evento | Execução e registro do resultado. | Comparação com a meta pactuada. |
| Pós-evento | Revisão e recuperação individualizada. | Aprendizados e próximo ciclo. |

### 8.3 Marcos devem ser verificáveis

“Melhorar resistência” é objetivo amplo. Um marco de produto precisa explicitar o que será observado, por exemplo: “realizar a sessão de referência cadastrada pelo professor até 12/11, registrar percepção de esforço e revisar estabilidade do ritmo”. O alvo fisiológico e a sessão são definidos pelo profissional.

Cada marco deve aceitar evidência automática, manual, observação presencial ou combinação. Não marcar marco como atingido apenas porque o arquivo sincronizou. O professor confirma a interpretação, sobretudo em habilidades técnicas e águas abertas.

### 8.4 Múltiplos eventos

Uma sessão pode contribuir para vários eventos, mas sua carga entra apenas uma vez nos totais do atleta. Pode haver um evento principal de planejamento por período e eventos secundários; conflitos ficam visíveis para decisão profissional.

Trocar a prova-alvo não reescreve a história. A versão anterior do objetivo e a prescrição vigente naquela data permanecem consultáveis. As mudanças futuras mostram autor, justificativa e alunos afetados.

## 9. Catálogo de treinos do professor

### 9.1 Organização

O professor cria seu acervo por formulário, duplicação de sessão própria ou importação suportada sujeita a revisão. A escola pode ter um catálogo institucional separado. Nenhum aluno recebe uma sessão só porque ela existe no catálogo.

Tipos de conteúdo reutilizável: exercício/educativo, sessão completa e conjunto de sessões ou plano criado pelo professor. Um plano é uma sequência autoral reutilizável, não um gerador automático.

### 9.2 Campos do modelo de sessão

| Grupo | Campos |
|---|---|
| Identidade | Título, código, autor, proprietário, escopo, versão, criação e atualização. |
| Classificação | Modalidade, ambiente, tipo, capacidades, nível indicativo, fase e etiquetas. |
| Conteúdo | Objetivo, instruções, blocos, repetições, intensidade, recuperação, volta à calma. |
| Pré-requisitos | Habilidades necessárias, equipamentos, local, supervisão e avaliações requeridas. |
| Parametrização | Valores absolutos ou percentuais/referências escolhidas pelo professor. |
| Acompanhamento | Critério de sucesso, feedback desejado e métricas prioritárias. |
| Material | Vídeo/link/anexo com descrição; origem e direitos de uso quando aplicável. |
| Resumo calculado | Distância exata, duração exata ou estimada, partes sem duração e motivo. |
| Estado | Rascunho, disponível ou arquivado. |

### 9.3 Busca e produtividade

Filtros por modalidade, ambiente, objetivo, nível, fase, duração, distância, equipamento e autoria. Permitir favoritos, pastas/etiquetas, duplicação e prévia. Pesquisa por “orientação mar”, “corrida 10 km”, “cadência”, “transição” e nomes próprios do professor deve funcionar sem exigir uma taxonomia rígida.

Salvar uma variante “adaptação para piscina de 25 m” não altera o modelo original. Conteúdo arquivado deixa de aparecer nas opções de novas atribuições, mas permanece no histórico.

### 9.4 Versionamento obrigatório

- Editar o catálogo cria nova versão.
- A prescrição atribuída guarda uma cópia imutável da versão utilizada e suas adaptações.
- Alterar o modelo não atualiza alunos silenciosamente.
- Atualizar sessões futuras é uma ação separada: selecionar destinatários, visualizar diferenças e publicar.
- Sessões já realizadas preservam a prescrição que o aluno recebeu. Correções posteriores são registradas como emendas.
- O professor pode salvar uma adaptação individual como novo modelo, removendo dados pessoais do aluno.

## 10. Atribuição para um ou vários alunos

### 10.1 Fluxo de atribuição

1. Selecionar um modelo ou criar uma sessão.
2. Escolher aluno, vários alunos ou turma/grupo autorizado.
3. Selecionar data/horário ou datas relativas de um plano.
4. Escolher evento e marco de cada aluno, se houver; não pressupor que todos participam da mesma prova.
5. Visualizar uma linha por aluno com duração, distância, metas resolvidas, referência de zona e conflitos.
6. Individualizar repetições, intensidade, descansos, equipamento e instruções.
7. Tratar referências ausentes ou incompatíveis.
8. Publicar as prescrições selecionadas.
9. Receber comprovante do resultado por aluno, com falhas específicas e possibilidade de repetir somente as que falharam.

### 10.2 Individualizar sem redigitar tudo

Exemplo de parametrização cadastrada pelo professor: três blocos de oito minutos com alvo de 70–75% do FTP, recuperação definida e aquecimento. Para FTP de 200 W, a faixa é 140–150 W; para FTP de 260 W, 182–195 W. São cálculos da mesma regra autoral, não escolha automática de estímulo.

Se faltar FTP válido, a plataforma não inventa watts. O professor cadastra referência ou escolhe outra forma de orientar o esforço. RPE e frequência cardíaca não são substitutos matematicamente equivalentes ao FTP.

### 10.3 Regras de grupo

- Lista de destinatários fica congelada no momento da publicação; aluno que entra depois na turma não recebe histórico automaticamente.
- Remover aluno da turma não apaga suas sessões e execuções.
- Cada destinatário tem prescrição, status, atividade associada e feedback próprios.
- Ajuste de um aluno não muda os outros.
- Conflitos de horário e sessões já existentes aparecem antes da publicação; nunca sobrescrever sem ação explícita.
- Publicações em lote possuem identificador para auditoria e desfazimento controlado de sessões futuras.
- Não expor ao aluno dados, zonas, relatos ou resultados privados dos colegas.
- Nível semelhante não comprova adequação de uma mesma sessão: ambiente, experiência, avaliações e calendário também precisam ser considerados.

## 11. Construtor manual de sessões

### 11.1 Blocos suportados

Aquecimento, técnica/educativos, preparação, principal, recuperação, complementar, força, transição, simulado e volta à calma. O professor pode renomear blocos e criar blocos personalizados.

Cada passo aceita duração por tempo, distância, repetições ou término manual. Intensidade pode ser texto, RPE, ritmo, velocidade, frequência cardíaca, potência, zona ou combinação de alvo principal e referências secundárias. A combinação não deve exigir que métricas fisiologicamente diferentes coincidam o tempo inteiro.

### 11.2 Recuperação sem ambiguidade

Registrar se o descanso ocorre entre repetições, entre séries ou após todas as repetições; se é parado ou ativo; e se entra no total de distância/tempo. Distinguir descanso fixo de saída a cada intervalo.

Exemplo: `6 × 100 m com 20 s entre repetições` contém cinco pausas, salvo instrução explícita de descanso após a última. `6 × 100 m saindo a cada 2:00` define intervalo de saída; o descanso depende do tempo nadado.

### 11.3 Totais confiáveis

- Somar repetições e blocos aninhados com unidades normalizadas.
- Distinguir distância exata de estimativa por tempo/ritmo.
- Não apresentar duração total exata quando há “recuperação completa” sem valor ou etapa aberta.
- Em piscina, considerar comprimento e unidade; jardas e metros não são intercambiáveis.
- Exibir separado: tempo de esforço, recuperação prevista e duração total estimada.
- Evitar inconsistência entre título e soma: o título pode usar o total calculado.

**Correção do material anterior:** a sessão rotulada “natação iniciante — 1.400 m” soma 1.900 m; a sessão “CSS — 2.600 m” soma 3.200 m. Esses números não devem ser copiados como totais válidos. A Ryvano precisa detectar esse tipo de divergência.

### 11.4 Instruções e anexos

Cada educativo deve ter propósito, execução, duração, descanso e orientação do professor. Vídeo é apoio, não substituto do texto. Permitir impressão legível para borda da piscina e visualização móvel com bloco atual em destaque.

Exportação para relógio só deve aparecer quando modalidade, campos e integração forem suportados. Mostrar passos omitidos ou convertidos; não comunicar exportação fiel quando o dispositivo não aceita o conteúdo.

## 12. Natação em piscina — preparação independente

### 12.1 Objetivos e provas

Permitir aprendizagem, condicionamento, técnica, velocidade, meio-fundo/fundo, medley, competição master e preparação de piscina para águas abertas. Registrar prova-alvo por distância e estilo, piscina de 25/50 m ou outra medida, cronometragem manual/eletrônica quando conhecida, saída do bloco ou da parede e eventual bateria/final.

Não comparar diretamente resultados de piscina curta e longa como se fossem idênticos. Viradas, saídas e submersos alteram o contexto. Não converter automaticamente desempenho para outro tamanho de piscina sem método explicitado.

### 12.2 Tipos de sessão que o catálogo deve comportar

| Tipo | Conteúdo que o professor pode cadastrar | Evidência prioritária |
|---|---|---|
| Técnica | Alinhamento, apoio, rotação, respiração e coordenação. | Observação, vídeo autorizado e manutenção da execução. |
| Aeróbico | Nado contínuo ou fracionado com alvo individual. | Ritmo, estabilidade, pausas e RPE. |
| Limiar/CSS | Séries com referência de teste e intervalo definido. | Tempos por repetição e aderência ao alvo. |
| Velocidade | Trechos curtos com recuperação escolhida. | Tempo de cada estímulo e qualidade técnica. |
| Ritmo de prova | Frações relacionadas à distância competitiva. | Parciais, consistência e contexto de saída. |
| Pernada | Prancha ou outras posições definidas pelo professor. | Execução, esforço e medição manual quando necessário. |
| Pull/material | Pull buoy, palmar e outros recursos autorizados. | Tipo/tamanho do material e resposta do aluno. |
| Saídas/viradas | Repetições de habilidade com supervisão apropriada. | Observação técnica; não apenas metros. |
| Recuperação | Conteúdo leve escolhido pelo professor. | Percepção e execução. |
| Simulado/teste | Protocolo identificado e repetível. | Resultado, condições e parecer. |

Saída de bloco depende de instalação adequada e supervisão. O sistema não deve induzir exercícios de apneia prolongada ou hiperventilação como requisito genérico de desempenho.

### 12.3 Campos específicos

Estilo, comprimento da piscina, material, braço único/lado, padrão respiratório quando prescrito, intervalo de saída, descanso, referência de ritmo por 100 m ou 100 yd, contagem de braçadas quando disponível e observações técnicas.

CSS é uma referência estimada por protocolo, não garantia de equivalência com todos os conceitos de limiar. Na documentação da USMS há uso de testes de 400 e 200 para individualização; aplicações diferem na interpretação do intervalo. A Ryvano deve separar claramente ritmo-alvo e intervalo de saída. [T01]

### 12.4 Como a preparação muda por nível

| Nível | Trabalho que precisa ser representado | Marco adequado ao contexto |
|---|---|---|
| Iniciante | Habilidade básica, regularidade, pausas suficientes e sessões explicadas. | Professor confirma domínio da tarefa antes de aumentar sua complexidade. |
| Intermediário | Variação de capacidades, referências de ritmo e introdução de especificidade. | Repetir sessão/teste com protocolo comparável. |
| Avançado | Parciais de prova, saídas, viradas e manutenção técnica sob fadiga. | Avaliação técnica e desempenho específico combinados. |
| Profissional | Planejamento por prova, múltiplas sessões e calendário de baterias/finais. | Decisões integradas à temporada e equipe técnica. |

### 12.5 Exemplo de modelo manual — técnica e regularidade

**Código:** NAT-PISC-001. **Contexto ilustrativo:** aluno já avaliado para essa distância. **Objetivo:** manter execução e parciais consistentes; critério e ritmo preenchidos pelo professor.

| Bloco | Cadastro | Distância |
|---|---|---:|
| Aquecimento | 200 m livre fácil + 100 m de outro estilo definido. | 300 m |
| Técnica | 4 × 50 m; cada repetição com educativo e descanso descritos. | 200 m |
| Principal | 6 × 100 m em faixa individual; 20 s entre repetições. | 600 m |
| Habilidade | 4 × 50 m com foco técnico definido. | 200 m |
| Soltura | 100 m fácil. | 100 m |
| **Total** | Demais pausas preenchidas no editor; duração depende do ritmo. | **1.400 m** |

Ao atribuir, o professor decide se mantém estrutura, reduz repetições, muda estilos ou escolhe outro modelo. O sistema não faz essa seleção por nível.

### 12.6 Preparação para competição de piscina

O acompanhamento liga evento, provas inscritas, tempos de referência, metas de parciais, habilidades técnicas e datas de revisão. Incluir aquecimento disponível no local, chamada, intervalo entre provas e eventual revezamento. Cada prova do mesmo torneio tem resultado próprio.

No pós-evento, separar tempo oficial, reação/saída se medida, parciais, avaliação de viradas e percepção. Um recorde pessoal não comprova sozinho adequação de toda a preparação; um tempo pior também exige contexto.

## 13. Águas abertas, travessias e eventos aquáticos

### 13.1 Por que precisa de tratamento próprio

A ausência de paredes e referências fixas, as condições ambientais, a navegação e o apoio mudam o significado dos dados. Um ritmo mais lento pode ocorrer por corrente contrária; distância GPS maior pode ser erro ou desvio de navegação. Esses fatores exigem campos e análise específicos.

Guias públicos de USMS e Swim England destacam orientação, percurso, condições locais e preparação. O livro de Munatones cobre demandas e táticas de águas abertas. Esses materiais fundamentam a inclusão desses domínios; o desenho de campos abaixo é uma proposta para a Ryvano. [L02, T02–T04]

### 13.2 Classificação dos eventos

- Travessia organizada com ponto de chegada diferente da saída.
- Circuito de boias com uma ou várias voltas.
- Evento recreativo ou participativo.
- Competição por distância e categoria.
- Desafio pessoal com apoio.
- Prova longa, ultradistância ou por etapas.
- Revezamento.
- Etapa aquática de triathlon, com vínculo ao evento multiesporte.

Registrar distância real informada pelo organizador; não deduzir o formato apenas pelo nome “travessia”. Mar, rio e lago são ambientes distintos. Piscina usada para preparar águas abertas continua identificada como piscina.

### 13.3 Cadastro específico do evento e da sessão

| Grupo | Informações |
|---|---|
| Percurso | Ponto a ponto/circuito; voltas; boias; sentido; largada e saída; referência visual. |
| Ambiente | Mar, lago, rio ou represa; exposição; água doce/salgada; informações locais relevantes. |
| Condições | Temperatura da água/ar, vento, ondulação, corrente, maré e visibilidade quando conhecidos. |
| Proveniência | Medido, informado pelo organizador, previsão ou relato; fonte, local e horário. |
| Segurança operacional | Responsável, apoio disponível, comunicação, pontos de saída e critérios locais de cancelamento. |
| Equipamentos | Roupa usada, óculos, touca, boia de sinalização quando aplicável e regras do evento. |
| Apoio de prova | Postos/plataformas de alimentação, assistência e regras de contato. |
| Logística | Transporte, credenciamento, largada, corte e resgate conforme organizador. |
| Experiência do atleta | Experiência nesse ambiente, confiança relatada e habilidades observadas. |

Dados ambientais desconhecidos aparecem como desconhecidos. Não preencher temperatura do mar usando temperatura do ar nem tratar previsão como medição feita no local.

### 13.4 Catálogo de capacidades e sessões

| Tipo | Objetivo de cadastro | Como avaliar |
|---|---|---|
| Familiarização supervisionada | Entrada, saída, ajuste de equipamento e adaptação ao ambiente. | Observação e relato, sem impor distância mínima universal. |
| Orientação/sighting | Localizar referência e manter trajetória. | Cumprimento do percurso e observação; GPS como apoio. |
| Contorno de boia | Aproximação, escolha de trajetória e retomada. | Qualidade técnica e cumprimento da orientação. |
| Largada | Organização espacial, ritmo inicial e retomada controlada. | Estratégia e percepção, em situação supervisionada. |
| Nado em grupo/vácuo | Posicionamento e convivência, conforme regras aplicáveis. | Observação técnica e respeito às regras. |
| Resistência contínua | Sustentar esforço em percurso conhecido. | Tempo, RPE, estabilidade e condições. |
| Intervalado por tempo | Trabalhar intensidade sem depender de distância GPS exata. | Duração dos blocos, percepção e referências escolhidas. |
| Mudança de ritmo | Treinar alteração controlada do esforço. | Execução dos blocos e manutenção de habilidade. |
| Alimentação em movimento/parada | Ensaiar logística definida para evento longo. | Cumprimento, tolerância relatada e tempo de parada. |
| Simulado | Integrar habilidades e estratégia do evento. | Parecer do professor sobre vários critérios. |
| Piscina para águas abertas | Educativos e séries apropriados ao objetivo. | Habilidades observadas; não confundir com experiência real no ambiente. |

### 13.5 Níveis e progressão

| Nível em águas abertas | Prioridades de planejamento | Evidência antes de evoluir |
|---|---|---|
| Iniciante | Familiarização, orientação básica, comunicação e percurso supervisionado apropriado. | Observação presencial e confiança/controle relatados. |
| Intermediário | Navegação consistente, contorno, ritmo e experiência em condições adequadas. | Sessões contextualizadas e habilidades demonstradas. |
| Avançado | Tática, duração específica, logística de apoio e estratégia de percurso. | Simulado pertinente e revisão de alimentação/equipamento. |
| Profissional | Exigências competitivas, condições particulares e planejamento especializado. | Análise conjunta de desempenho, habilidade, ambiente e calendário. |

Não promover o aluno automaticamente ao atingir uma metragem. A avaliação de piscina não substitui a avaliação de águas abertas.

### 13.6 Exemplo de modelo manual — orientação em circuito supervisionado

**Código:** NAT-AA-001. **Objetivo:** executar orientação e percurso definidos pelo professor. **Pré-requisito:** avaliação individual e organização local adequadas. Não é sessão para execução solitária.

| Bloco | Cadastro ilustrativo | Tempo |
|---|---|---:|
| Início | 8 min de nado fácil conforme percurso orientado. | 8 min |
| Técnica | 6 × 1 min com tarefa de orientação; 1 min fácil entre repetições, apenas cinco recuperações. | 11 min |
| Principal | 3 × 6 min em esforço escolhido; 2 min fáceis entre blocos, apenas duas recuperações. | 22 min |
| Final | 5 min fácil até saída definida. | 5 min |
| **Total aquático previsto** | Briefing e conferência de entrada/saída registrados separadamente. | **46 min** |

O professor preenche referência visual, trajeto, intensidade e sinais de comunicação. Distância permanece estimativa ou sem previsão, conforme o caso. Feedback: orientação, dificuldade ambiental, confiança, equipamento e percepção de esforço.

### 13.7 Preparação de travessia

O professor começa pela distância, ambiente, duração esperada, corte, regras, apoio disponível e experiência do aluno. Depois registra lacunas e marcos: domínio de navegação, exposição supervisionada apropriada, sustentação de esforço, logística de alimentação quando pertinente e simulado.

Não exigir que o aluno complete a distância integral da prova em um único treino como regra de prontidão. O professor define as evidências necessárias. Eventos longos requerem planejamento próprio; não são uma multiplicação automática de uma sessão curta.

Na aproximação do evento, incluir revisão do regulamento, pontos de apoio, percurso, equipamento testado e condições comunicadas pelo organizador. A condição observada no dia prevalece sobre o plano antigo; alterações são registradas pelo responsável.

### 13.8 Segurança como parte do contexto operacional

A orientação pública de segurança destaca perigos locais, condições, entradas/saídas e supervisão. [T02–T03] Para a Ryvano, propõe-se registrar o responsável pela sessão e o plano de apoio, permitir cancelamento por condições e preservar a justificativa.

Não usar checkboxes como “certificado de segurança”. Boia de sinalização não substitui supervisão ou resgate; GPS e aplicativo não garantem monitoramento em tempo real. Evitar prescrever sessão solitária em ambiente desconhecido. O produto deve permitir informar que a atividade foi interrompida por segurança sem classificá-la como fracasso esportivo.

Temperaturas, uso de neoprene, equipamento permitido, vácuo e regras de apoio devem ser consultados no regulamento da edição e nas orientações aplicáveis ao local. Não codificar números universais a partir de um guia estrangeiro. Requisitos de seguro da USMS não são regras brasileiras.

### 13.9 Comparação específica

- Tempo e distância previstos/realizados, com qualidade do GPS.
- Percurso previsto e trajeto registrado, sem inventar precisão.
- Paradas e retomadas, distinguindo apoio, espera e recuperação.
- Cumprimento das tarefas técnicas, confirmado pelo professor/aluno.
- Esforço percebido e condições observadas.
- Alimentação planejada/relatada quando cadastrada.
- Incidentes, decisões de interrupção e aprendizado.
- Comparabilidade com sessões anteriores: local, percurso, equipamento e condições.

Uma prova com corrente favorável não deve ser marcada automaticamente como melhora fisiológica. A interface pode dizer “tempo menor em condições diferentes — comparação limitada”.

## 14. Corrida — preparação independente

### 14.1 Segmentos de aplicação

Iniciação com caminhada/corrida, rua, pista, cross-country, trail e provas por etapas. Distinguir 5 km, 10 km, meia, maratona e distâncias personalizadas; trilha requer altimetria, terreno, tecnicidade e duração além da quilometragem.

O professor registra experiência recente com impacto, superfície habitual, disponibilidade e referências de desempenho. Metas de uma modalidade não determinam automaticamente tolerância à corrida.

### 14.2 Tipos de sessão

| Tipo | Campos essenciais | Comparação prioritária |
|---|---|---|
| Caminhada/corrida | Duração de cada parte, repetições e instruções. | Execução da alternância e percepção. |
| Fácil/recuperação | Tempo/distância e referência individual. | Esforço e duração, com contexto. |
| Técnica/strides | Exercício, trecho, recuperação e intenção. | Qualidade de execução e repetições. |
| Longo | Duração/distância, esforço, percurso e eventual alimentação. | Sustentação, esforço e logística. |
| Progressivo | Etapas com alvos independentes. | Comparação por bloco. |
| Tempo/limiar | Referência de ritmo/esforço e recuperação. | Tempo útil e estabilidade nos blocos. |
| Intervalado | Repetições, distância/tempo, ritmo e pausa. | Parciais e recuperação real. |
| Fartlek | Alternância por tempo ou referências de percurso. | Blocos e percepção; GPS não é obrigatório. |
| Subidas/trail | Duração, inclinação/terreno, descida e instruções. | Esforço, desnível e habilidade. |
| Ritmo de prova/simulado | Evento e trecho de referência. | Sustentação do alvo em contexto comparável. |

Um rótulo “VO₂” descreve intenção da sessão; não significa que o dispositivo mediu consumo de oxigênio. Métodos de ritmo e individualização podem ter como referência livros como [L03], mas o professor escolhe e documenta o protocolo.

### 14.3 Níveis

| Nível | Necessidades de prescrição | Acompanhamento |
|---|---|---|
| Iniciante | Alternância, rotina, tarefas simples e orientação clara de esforço. | Regularidade, tolerância relatada e evolução gradual decidida pelo professor. |
| Intermediário | Sessões diferenciadas e especificidade da distância. | Tempo em blocos, longos e referências recentes. |
| Avançado | Ritmo específico, estratégia, ambiente e recuperação planejada. | Parciais, consistência e resposta ao conjunto da semana. |
| Profissional | Calendário competitivo, viagens, sessões duplas quando prescritas e especialização. | Revisão especializada, carga e objetivos de competição. |

### 14.4 Exemplo de modelo manual — blocos por tempo

**Código:** COR-001. **Objetivo:** executar três blocos no esforço individual definido pelo professor.

- Aquecimento: 10 min fácil.
- Principal: 3 × 6 min no alvo prescrito; 2 min fáceis entre blocos, duas recuperações.
- Final: 8 min fácil.
- **Total: 40 min = 10 + 18 + 4 + 8.** Distância estimada, não fixa.
- Professor informa superfície, alvo, adequação e critérios de interrupção específicos quando necessários.
- Comparação: cada bloco de seis minutos; aquecimento e recuperações não entram no denominador da aderência ao ritmo da série principal.

### 14.5 Preparação para eventos

Para provas de rua, registrar percurso, elevação, superfície, horários, postos, corte e meta. Para trail, incluir ganho/perda de elevação, tecnicidade, equipamento exigido, autonomia entre apoios e logística. “Ritmo de prova” deve considerar esses dados; ritmo de asfalto não é transferido automaticamente para trilha.

Marcos possíveis escolhidos pelo professor: avaliação padronizada, sessão específica, longo pertinente, teste de equipamento e alimentação, estratégia de largada e revisão final. A Ryvano acompanha datas e evidências; não exige longão máximo ou teste exaustivo universal antes da competição.

### 14.6 Dados e interpretação

Separar tempo decorrido, tempo em movimento e pausas. Diferenciar distância medida, GPS e corrigida manualmente. Comparar ritmo por bloco e não apenas média total. Pace menor em segundos/km representa velocidade maior; os rótulos devem dizer “mais rápido/mais lento”, evitando sinais ambíguos.

Relatos de dor, fadiga ou interrupção acompanham os números. Ausência de frequência cardíaca não impede registro da sessão. Uma atividade extra pode contribuir para carga total, mas não substitui automaticamente o treino prescrito para outra finalidade.

## 15. Ciclismo — preparação independente

### 15.1 Disciplinas e contexto

Estrada, contrarrelógio, MTB, gravel, indoor e passeios/eventos de endurance. Registrar tipo de bicicleta, equipamento de medição, ambiente, percurso, altimetria e eventual uso de assistência elétrica, para evitar comparação indevida entre atividades.

Velocidade depende de vento, terreno, vácuo, equipamento e paradas. Quando disponível e apropriada, potência pode ser usada como alvo escolhido pelo professor. Sem medidor, permitir outras referências claramente identificadas. [L04]

### 15.2 Catálogo

| Tipo | Conteúdo | Métricas/contexto |
|---|---|---|
| Recuperação | Giro com orientação individual. | Tempo e esforço percebido. |
| Endurance | Continuidade, duração e percurso. | Potência/FC/RPE escolhidos e duração. |
| Cadência/técnica | Faixas de rpm e tarefa técnica. | Cadência quando medida; observação. |
| Tempo/sweet spot | Blocos definidos pelo professor e método adotado. | Tempo na faixa e referência de limiar. |
| Limiar | Esforços sustentados e recuperações. | Potência/FC/RPE e estabilidade. |
| Intervalos intensos | Repetições curtas/médias e recuperação. | Blocos efetivos e contexto. |
| Sprint | Esforços e recuperação com local apropriado. | Duração, potência quando válida e execução. |
| Subida | Perfil, duração e esforço. | Ganho de elevação e potência/esforço. |
| Longo | Duração, terreno, alimentação e equipamento. | Execução, paradas e tolerância. |
| Habilidade | Curvas, frenagem, obstáculos e condução. | Avaliação técnica em ambiente apropriado. |
| Específico/simulado | Demandas do evento. | Estratégia, equipamentos e desempenho contextualizado. |

“Sweet spot” e zonas não devem receber limites rígidos sem identificação do método. Percentual de FTP, frequência cardíaca de limiar e sensação de esforço não são a mesma escala.

### 15.3 Níveis

| Nível | Prioridades representadas | Evidência |
|---|---|---|
| Iniciante | Condução, equipamento, regularidade e controle de esforço. | Domínio básico e sessões toleradas conforme avaliação. |
| Intermediário | Referências individuais, subidas e duração específica. | Execução das sessões e testes comparáveis. |
| Avançado | Tática, potência/duração, repetição de esforços e alimentação. | Simulados e resposta ao conjunto de carga. |
| Profissional | Calendário, etapas, funções táticas e planejamento especializado. | Dados técnicos integrados à equipe e contexto competitivo. |

### 15.4 Exemplo de modelo manual — blocos com referência individual

**Código:** CIC-001.

- Aquecimento: 15 min.
- Principal: 3 × 8 min em faixa definida pelo professor; 3 min fáceis entre blocos, duas recuperações.
- Final: 10 min.
- **Total: 55 min = 15 + 24 + 6 + 10.**
- Campo de cadência opcional; não converter cadência em obrigação universal.
- Fonte da potência e teste de referência ficam registrados. Se faltarem dados, a análise exibe limitação em vez de estimar cumprimento inexistente.

### 15.5 Preparação para competição ou evento

Gran fondo/passeio: duração, relevo, apoio, cortes, equipamento e alimentação. Contrarrelógio: sustentação, posição, percurso e pacing. MTB/gravel: habilidade, terreno e exigências de suporte. Prova por etapas: vários dias, deslocamento e recuperação entre etapas.

Planejamento deve incluir testes de equipamento e logística pertinentes, não apenas treino mais longo. A plataforma armazena estratégia do professor para trechos relevantes e permite registrar desvios por clima, tráfego ou problemas mecânicos.

### 15.6 Comparação específica

Comparar potência-alvo/real quando sensor válido, duração dos esforços, recuperações, cadência, desnível e percepção. Distância inferior com tempo e estímulo adequados pode ocorrer por relevo/vento. Média de velocidade não define qualidade da sessão.

Indicar cobertura do sensor, pausas, pedal sem potência e troca de medidor. Não comparar FTP estimado por provedores diferentes como se todos utilizassem o mesmo protocolo.

## 16. Triathlon — preparação integrada

### 16.1 Estrutura do evento

Cadastrar natação, T1, ciclismo, T2 e corrida, permitindo distâncias personalizadas, revezamento e formatos alternativos explicitamente identificados. Nome comercial não substitui distâncias oficiais. Os campos comportam sprint, olímpico, média e longa distância, sem presumir que todos os organizadores usem o mesmo percurso.

Registrar largada, ambiente aquático, bicicleta permitida, regras de vácuo, neoprene, cortes por segmento, transições e logística. Regras específicas devem vir do regulamento atual do evento.

### 16.2 Objetivos integrados

- Resultado total e, se desejado, faixas de tempo por segmento e transição.
- Estratégia de esforço da bike compatível com a corrida posterior, definida pelo professor.
- Habilidades aquáticas pertinentes ao local.
- Execução de T1/T2 e checklist do equipamento.
- Alimentação/hidratação planejadas pelo profissional responsável e testadas quando apropriado.
- Gestão do calendário com outras competições e vida diária.

Os livros de Friel e Vance são referências para planejamento e interpretação de dados multiesporte. Não autorizam somar três programas de especialistas em uma semana única. [L05, L07]

### 16.3 Catálogo específico

Além dos tipos de cada modalidade, permitir técnica de transição, bike→corrida, natação→bike, simulado parcial e simulado completo quando cadastrado pelo professor. Um conjunto pode ter sessões encadeadas no mesmo dia ou atividades separadas com vínculo.

Brick deve registrar ordem, tempo entre modalidades, objetivo de cada etapa e contexto do evento. Uma corrida realizada horas após o pedal pode ser válida como treino separado, mas não equivale automaticamente a uma transição imediata.

### 16.4 Níveis por disciplina e nível integrado

| Nível integrado | Foco de planejamento | O que evitar no produto |
|---|---|---|
| Iniciante | Domínio básico de cada etapa, rotina compatível e transições simples supervisionadas quando necessário. | Presumir experiência aquática por boa capacidade na bike. |
| Intermediário | Especificidade de distância, referências individuais e coordenação das sessões. | Três calendários sem visão de carga e descanso conjunto. |
| Avançado | Estratégia integrada, simulados e resposta após a bike. | Avaliar a etapa isolada ignorando seu efeito na seguinte. |
| Profissional | Calendário especializado e colaboração entre responsáveis. | Decisões automáticas de prontidão ou classificação. |

O perfil guarda níveis separados em natação, águas abertas, bike e corrida. Havendo professores por disciplina, deve existir um responsável pelo planejamento integrado e uma visão comum autorizada para evitar prescrições conflitantes.

### 16.5 Exemplo de modelo manual — bike e corrida encadeadas

**Código:** TRI-BRICK-001. **Uso:** apenas após o professor avaliar a adequação.

| Etapa | Conteúdo ilustrativo | Duração |
|---|---|---:|
| Bike | 10 min inicial + 30 min em alvo individual + 5 min final. | 45 min |
| Transição | Organização/troca conforme instrução. | 5 min |
| Corrida | 5 min inicial + 10 min em alvo definido. | 15 min |
| **Total decorrido previsto** | Treino ativo de 60 min + transição de 5 min. | **65 min** |

O modelo não define watts ou pace universais. A análise mostra a etapa de bike, o intervalo real até a corrida e a corrida subsequente. Não conta o arquivo multiesporte completo e os subarquivos novamente nos totais.

### 16.6 Preparação para o evento

O professor define metas por etapa, referências iniciais, prioridade semanal e marcos integrados. Deve poder planejar uma semana com foco aquático e outra com foco diferente, sem o sistema exigir proporção fixa.

Pré-prova: estratégia, horários, montagem da área de transição, equipamento, percurso, apoio e regras atualizados. Pós-prova: tempo total, segmentos, transições, cortes, alimentação relatada e execução da estratégia.

Se o aluno abandona após a bike, preservar o esforço realizado e o motivo. O evento fica “abandonado”, mas as atividades continuam contribuindo para o histórico de carga. Não transformar abandono em ausência de treino.

### 16.7 Força, recuperação e nutrição como apoio

Para todas as modalidades, permitir sessões complementares de força e mobilidade cadastradas pelo professor, com exercícios, séries, repetições, carga, intervalo e observações. Elas não mudam automaticamente a modalidade principal do aluno.

Registrar descanso planejado, indisponibilidade e recuperação pós-evento sem tratá-los como falhas de aderência. Nutrição/hidratação podem ser instruções vinculadas à sessão e ao evento, com autoria do profissional responsável; não gerar doses universais por distância ou nível. O escopo é registrar orientação e execução, não fornecer prescrição nutricional automática.

## 17. Cruzamento do prescrito com o realizado

### 17.1 Cinco perguntas diferentes

1. **Houve atividade?** Existe registro associado ou confirmação manual?
2. **Quanto foi realizado?** Duração, distância, repetições e recuperação.
3. **Como foi executado?** Intensidade, sequência, parciais, técnica e contexto.
4. **Qual foi a resposta?** Percepção, dificuldade, sintomas relatados e observação profissional.
5. **Como isso se relaciona à meta?** Evidência para o marco e decisão do professor.

O produto não deve condensar essas cinco perguntas em um único “100% concluído”. Uma sessão pode ter toda a distância e intensidade incompatível com a intenção. Outra pode ser encurtada por decisão apropriada e conter evidência relevante.

### 17.2 Camadas do comparativo

| Camada | Dados |
|---|---|
| Sessão | Previsto/realizado de tempo, distância, repetições e referência principal. |
| Bloco | Aquecimento, principal, recuperação, técnica e final separados. |
| Repetição | Alvo, parcial, pausa, desvio e cobertura da medição. |
| Semana | Sessões previstas, confirmadas, extras, canceladas e sem registro. |
| Preparação | Marcos, testes, revisões e sessões vinculadas ao evento. |
| Evento | Meta pactuada, resultado oficial/relatado e parecer final. |

### 17.3 Regras de associação

Preferir identificador de treino estruturado quando preservado pelo provedor. Na ausência, usar atleta, modalidade, data no fuso apropriado, horário e proximidade de duração/distância como evidências, sem tratar coincidência como certeza.

| Caso | Comportamento |
|---|---|
| Um treino e uma atividade com vínculo inequívoco | Associar e informar origem do vínculo. |
| Duas sessões da mesma modalidade no mesmo dia | Sugerir candidatos; pedir escolha se não houver identificação suficiente. |
| Atividade extra | Manter visível como não prescrita e notificar conforme preferência. |
| Uma sessão gravada em dois arquivos | Permitir associação múltipla com deduplicação e revisão. |
| Um arquivo cobre aquecimento, treino e volta à calma | Mapear trechos; não exigir arquivos separados. |
| Um arquivo cobre duas prescrições | Permitir seleção de segmentos sem contar os mesmos segundos duas vezes. |
| Arquivo multiesporte e arquivos por etapa | Criar relação pai/filhos e impedir dupla contagem. |
| Atividade em dia diferente | Sugerir reagendamento/associação, preservando data originalmente prescrita. |
| Aluno realiza outra modalidade | Registrar atividade; substituição de prescrição depende do professor. |
| Integração atrasada | Manter “aguardando registro” até a política de sincronização; não concluir falta. |

Manter trilha de quem associou, quando, método, confiança e correções. Permitir desfazer vínculo sem apagar a atividade. Exclusão no provedor não deve apagar silenciosamente a revisão feita na Ryvano; aplicar política explícita de sincronização.

### 17.4 Métricas transparentes

**Volume de distância:** `100 × distância realizada comparável / distância prescrita`. Só calcular com denominador positivo e escopo equivalente. Exibir valores acima de 100%; fazer mais não significa fazer melhor.

**Volume de tempo:** `100 × tempo realizado comparável / tempo prescrito`. Usar o mesmo conceito dos dois lados: ativo com ativo, decorrido com decorrido. Transições e descansos precisam de regra explícita.

**Aderência à intensidade:** `100 × tempo medido dentro da faixa / tempo com medição válida nos blocos avaliáveis`. Exibir junto a **cobertura:** `100 × tempo medido válido / tempo total dos blocos avaliáveis`. Nunca esconder baixa cobertura dentro de um percentual alto.

**Exemplo original:** série principal prevista de 18 min; só 12 min possuem dados válidos; 9 min desses ficaram na faixa. Aderência observada: 75%; cobertura: 66,7%. Não afirmar “75% do treino inteiro foi correto”.

**Repetições:** mostrar contagem prevista/identificada/confirmada. Volta automática de relógio não é necessariamente repetição da prescrição.

**Regularidade semanal:** informar separadamente sessões realizadas integralmente, parcialmente, sem registro e não realizadas confirmadas. Sessões canceladas pelo professor ficam fora do denominador da agenda vigente. Preservar também o resumo do planejamento original para auditoria de mudanças.

**Carga por percepção de esforço:** quando o método for escolhido, registrar duração da sessão em minutos × RPE da sessão, em unidades arbitrárias, com escala e protocolo de coleta identificados. É instrumento de acompanhamento, não medida exata de estresse fisiológico nem diagnóstico. [T07]

### 17.5 Intensidade e direção dos desvios

Alvos em segundos/km ou segundos/100 m devem ser comparados numericamente após normalização. Tempo menor significa mais rápido. Alvos de potência/velocidade têm direção inversa à do pace. Exibir “acima da faixa”, “mais rápido” ou “mais lento”, conforme a grandeza, com números legíveis.

Frequência cardíaca demora a responder a estímulos curtos; se a prescrição for por ritmo ou potência, não reprovar automaticamente a repetição por FC fora da zona. Permitir métrica principal escolhida e métricas secundárias de contexto.

### 17.6 O que não pode ser concluído automaticamente

- SWOLF menor não prova isoladamente melhor técnica em condições diferentes.
- Ritmo melhor em águas abertas não prova aumento de capacidade sem considerar corrente e percurso.
- Maior distância de bike não significa maior carga que outra sessão mais curta.
- FC média semelhante não significa estímulo semelhante entre modalidades.
- Estimativas de relógio não são medições laboratoriais.
- CTL, ATL, TSB, TSS e métricas de diferentes fornecedores não devem ser somados ou equivalidos sem especificação de método e disponibilidade.
- Razão de cargas ou indicador de prontidão não deve virar probabilidade individual de lesão.

Para uma primeira versão, priorizar tempo, distância por modalidade, execução dos blocos, RPE e comentários. Métricas avançadas só entram com método documentado, dados necessários e validação própria.

### 17.7 Relatório de evolução para evento

Mostrar período analisado, metas pactuadas, marcos, sessões-chave, histórico comparável e parecer do professor. Usar estados objetivos: “marco atingido”, “precisa de revisão”, “faltam evidências” e “aguardando avaliação”.

Evitar “87% pronto para a prova” se não existir um modelo validado e adequado ao caso. Cumprimento de tarefas não é probabilidade de sucesso. Uma lista de marcos concluídos pode ser quantificada, desde que rotulada como conclusão administrativa, não aptidão.

## 18. Avaliações, zonas e qualidade dos dados

### 18.1 Registro de referências

Cada avaliação deve conter modalidade, ambiente, data, protocolo, avaliador, resultado, unidade, condições, fonte, limitações e próxima revisão quando definida. FTP, CSS, FC de limiar e resultados de corrida são referências distintas.

Um perfil de zonas possui nome do método, versão, limites, unidade, modalidade, vigência e referência que o originou. Não existe “Z2 universal”. A Ryvano pode aceitar modelos de três, cinco, sete ou outro número de zonas escolhidos pelo professor.

### 18.2 Congelamento da prescrição

Ao publicar uma sessão com alvo relativo, guardar referência usada, fórmula e valores resolvidos. Um teste novo pode ser usado em novas prescrições, mas não altera silenciosamente as antigas. Atualizar sessões futuras requer prévia e nova publicação.

Na análise histórica, o padrão é comparar com a referência vigente na prescrição. Uma análise usando zonas atuais deve ser uma visão separada, claramente identificada.

### 18.3 Dados ausentes, manuais e estimados

| Situação | Exibição |
|---|---|
| Sensor não utilizado | “Não medido”, nunca zero. |
| Arquivo sem série temporal | Comparação por resumo; intervalos indisponíveis. |
| Registro manual | Identificar autor e origem manual, sem desvalorizar o registro. |
| Estimativa | Mostrar método e que o número é estimado. |
| GPS inconsistente | Sinalizar limitação e permitir correção com histórico. |
| Distância de piscina editada | Preservar original e justificativa da alteração. |
| Arquivo inválido | Falha compreensível; possibilidade de registro manual. |

Não exigir relógio ou integração para o aluno usar o produto. A publicação e o feedback precisam funcionar manualmente.

### 18.4 Pesquisa antes de implementar métodos

Não converter automaticamente categorias de Daniels, zonas de potência ou nomenclaturas de natação para uma tabela única. Confirmar nomenclatura, protocolo e unidade com literatura e professor. Termos semelhantes podem ter significados diferentes entre autores.

## 19. Telas e experiência de uso

### 19.1 Aluno

**Calendário:** visões mês/semana/lista, filtros de modalidade e distinção visual entre evento, prescrição, atividade e indisponibilidade. Atividade associada aparece junto à prescrição, sem duplicar o treino na contagem. Ícones/legendas acompanham cores.

**Meus eventos:** próximo evento, prova principal, prazo restante, meta desejada/pactuada e status do acompanhamento. Ação de cadastrar disponível mesmo sem professor, com estado claro de ausência de responsável.

**Detalhe do evento:** abas Visão geral, Objetivos, Preparação, Treinos relacionados, Resultados e Histórico. Exibir data, local, percurso e origem das informações, responsável, próximos marcos e última revisão.

**Detalhe do treino:** propósito, blocos, alvos, equipamentos e instruções; depois da execução, comparar previsto/realizado e registrar feedback. Ação “Solicitar alteração” preserva a prescrição do professor.

**Feedback:** realizou integral/parcial/não realizou; RPE quando solicitado; dificuldade; motivo de adaptação/interrupção; observação e anexo opcional. Relato do aluno não modifica a sessão prescrita.

### 19.2 Professor

**Painel:** novos eventos, acompanhamentos sem análise, marcos vencidos, atividades extras, revisões pendentes e sessões sem registro. Contadores devem ter definição e filtro de período.

**Meus atletas:** próximo evento e prova principal, prazo, responsável, última revisão e pendências. Filtros por escola, turma, modalidade, evento e situação, respeitando autorização.

**Calendário do aluno:** histórico e futuro, metas e marcos, referência de zonas e capacidade de atribuir do catálogo sem sair do contexto. Alterações mostram diferenças antes da publicação.

**Catálogo:** busca, filtros, versões e prévia. Ação “Atribuir” abre seleção de destinatários e individualização.

**Comparativo:** abas Resumo, Blocos/voltas, Gráficos, Tempo em zonas, Feedback e Revisão. Em águas abertas, adicionar Percurso e condições; em triathlon, separar segmentos e transições.

**Revisão:** observação técnica, decisão sobre marco/meta, justificativa, data da próxima revisão e links para alterações futuras. Salvar análise não deve alterar treinos sem ação específica.

### 19.3 Escola/assessoria

Visão de distribuição de responsabilidade, eventos com participantes, pendências por professor e catálogo institucional. A coordenação pode organizar acompanhamento dentro de suas permissões; não recebe automaticamente acesso irrestrito a toda informação sensível dos atletas.

### 19.4 Consistência de navegação

Preservar contexto de professor independente, professor da escola e aluno ao navegar para perfil, calendário ou evento. Apenas um item principal da sidebar fica ativo por rota. Links de alertas abrem no contexto autorizado correto e fornecem retorno à origem.

No celular, permitir seleção de alunos por busca e filtros, com resumo da quantidade selecionada. A ação em lote deve mostrar nomes e exceções antes de publicar, evitando seleção invisível de turma inteira.

## 20. Permissões, propriedade e acesso

| Ação | Aluno | Professor responsável | Escola autorizada |
|---|---|---|---|
| Criar participação pessoal | Sim, própria. | Sim, para aluno autorizado, registrando autoria. | Conforme papel e vínculo. |
| Informar objetivo desejado | Sim. | Pode registrar em nome do aluno com histórico. | Conforme atribuição. |
| Pactuar planejamento e prescrever | Não. | Sim, no escopo autorizado. | Professor/coordenador com permissão específica. |
| Registrar execução/feedback | Sim. | Pode complementar observação sem sobrescrever relato. | Conforme função. |
| Editar catálogo pessoal do professor | Não. | Proprietário ou colaborador autorizado. | Não por padrão. |
| Editar catálogo institucional | Não. | Se autorizado. | Responsável autorizado. |
| Ver colegas | Não por receber o mesmo treino. | Apenas alunos autorizados. | Apenas escopo permitido. |
| Encerrar acompanhamento | Pode cancelar participação/solicitar encerramento. | Encerra acompanhamento técnico com histórico. | Conforme responsabilidade. |

Participação e dados pessoais pertencem ao contexto do atleta; acesso de professores depende de vínculo válido. Modelos pessoais e institucionais têm propriedade explícita. Desligamento de professor não apaga o histórico dos alunos nem transfere silenciosamente seu catálogo pessoal à escola.

Arquivos de atividade, mapas, comentários e anexos precisam da mesma autorização das telas; esconder um botão não protege a API. Caches também precisam ser separados por usuário, organização e contexto de atuação.

## 21. Modelo de dados e serviços — proposta para implementação

Os nomes abaixo são conceituais. Devem ser mapeados para o modelo existente após leitura do repositório. Evitar criar duplicações de entidades já existentes.

### 21.1 Entidades principais

| Entidade | Conteúdo/relacionamentos |
|---|---|
| SportProfile | Aluno, modalidade, ambiente, nível avaliado, histórico e disponibilidade. |
| Event | Identidade do evento, edição, local, fuso, período, origem e visibilidade. |
| EventDiscipline | Distância, segmento, etapa, bateria ou opção de participação. |
| AthleteEvent | Relação aluno/evento, inscrição, prioridade e resultado. |
| Goal / GoalRevision | Meta desejada/pactuada, tipo, alvo, prazo, evidência e versões. |
| Preparation | Participação, responsável, organização, status e início/fim. |
| PreparationPhase | Fase, datas, finalidade e versão. |
| Milestone | Prazo, critério, evidências e parecer. |
| WorkoutTemplate | Modelo autoral, proprietário, filtros e estado. |
| WorkoutTemplateVersion | Conteúdo imutável e autoria. |
| WorkoutBlock | Estrutura de passos e repetições, com alvos e recuperação. |
| WorkoutAssignment | Aluno, data, contexto, versão publicada e adaptações. |
| AssignmentBatch | Ação coletiva, destinatários, resultado individual e idempotência. |
| Activity | Registro importado/manual, fonte, identificador externo e resumo. |
| ActivitySegment | Etapa multiesporte, bloco ou seleção de trecho do arquivo. |
| WorkoutActivityLink | Associação, método, trechos e autoria da confirmação. |
| Assessment / ZoneProfileVersion | Avaliações e zonas versionadas por modalidade. |
| SessionFeedback | Relato do aluno e observações com autores separados. |
| Review | Análise técnica, decisão e próximo prazo. |
| Notification / FollowUpTask | Aviso e pendência operacional relacionados, mas independentes. |
| AuditEvent | Alterações, autor, origem, contexto e data. |

### 21.2 Invariantes

- Um modelo não é uma prescrição; uma prescrição não é uma atividade.
- Uma atividade pode existir sem prescrição.
- Prescrição publicada mantém conteúdo e referência usados naquele momento.
- Atividade e trechos não entram duas vezes nos mesmos totais.
- Responsável e escopo de acesso são verificados no servidor.
- Objetivo não exige evento competitivo; pode existir desafio pessoal.
- Preparação pode relacionar sessões de várias modalidades sem converter o aluno automaticamente em triatleta.
- Distâncias de modalidades diferentes permanecem separadas. Não exibir soma de metros nadados e quilômetros pedalados como métrica esportiva útil.
- Duração total multiesporte pode ser somada com legenda; carga exige método comparável.
- Valores desconhecidos são nulos com motivo, não zeros artificiais.

### 21.3 Serviços de aplicação

Criar participação; alterar evento; assumir acompanhamento; pactuar meta; definir marco; salvar versão de modelo; atribuir individual/em lote; publicar revisão; importar atividade; associar execução; calcular comparativo; registrar parecer; encerrar preparação.

Esses serviços devem centralizar autorização e validação. Interfaces do aluno, professor independente e escola chamam as mesmas regras de domínio, com escopo diferente.

### 21.4 Eventos internos e confiabilidade

Publicar eventos internos como participação criada/alterada, prescrição publicada, atividade recebida e marco revisado. Usar entrega confiável, idempotência e repetição com limite. A gravação da participação e o registro da intenção de notificar devem ser consistentes; uma falha de e-mail não pode fazer o evento desaparecer.

Importações usam origem e identificador externo para deduplicação; considerar duplicidade entre provedores sem apagar automaticamente registros distintos parecidos. Gravar payload original quando permitido e necessário, com política de acesso e retenção definida.

### 21.5 Datas, concorrência e atualização de tela

- Guardar data local de eventos de dia inteiro; não convertê-la cegamente em meia-noite UTC.
- Guardar instante e fuso IANA de eventos com horário.
- Avisos D−N seguem a data do evento; deadlines de trabalho seguem a política da organização.
- Duas edições simultâneas não podem sobrescrever silenciosamente versões; apresentar conflito recuperável.
- Atualizar calendário, alertas e acompanhamento após mutação sem exigir reload.
- Se houver cache cliente, sua chave deve incluir aluno, contexto e período; dados derivados não podem permanecer incompatíveis com a última publicação.
- Para publicação coletiva, preferir resultado por destinatário com transação individual e resumo claro; falha parcial não deve ser exibida como sucesso total.

### 21.6 Integrações e exportações

Não prometer Garmin, Polar, Fitbit, Amazfit ou outra integração porque concorrentes as possuem. Cada integração exige verificação técnica/comercial própria. O núcleo deve funcionar com registro manual; formatos de arquivo suportados precisam ser testados com exemplos reais autorizados.

Uma integração pode trazer apenas resumo, sem voltas ou séries temporais. A interface adapta o nível de análise ao que existe. Exportação para relógio e importação da execução são capacidades separadas.

## 22. Cenários completos de funcionamento

### 22.1 Samuel cadastra uma travessia

Exemplo fictício: Samuel cadastra travessia de 2 km para 20/12/2026 e informa “concluir com controle e boa orientação”. A Ryvano cria participação, acompanhamento pendente e aviso para Carlos Mendes, desde que ele seja o responsável autorizado.

Carlos analisa experiência aquática, disponibilidade e calendário. Registra objetivo pactuado, primeira revisão e marcos de habilidade. Seleciona sessões próprias de piscina e águas abertas; adapta e publica.

Samuel realiza uma sessão de 46 min e registra dificuldade de orientação. O relógio informa distância incerta. A Ryvano mostra duração, relato, cobertura dos dados e tarefa técnica pendente de revisão. Carlos revisa a habilidade e decide as próximas sessões. A plataforma não gera um novo treino nem declara prontidão.

### 22.2 Turma com 18 alunos na mesma corrida

O professor seleciona uma sessão do catálogo e 18 participantes autorizados. A prévia mostra referências de ritmo disponíveis, alunos sem avaliação e conflitos de agenda. Ele adapta os casos necessários e publica.

São criadas 18 prescrições independentes. Uma falha de publicação aparece apenas para o destinatário afetado e pode ser repetida sem duplicar as 17 concluídas. Se dois alunos realizarem parcialmente, isso não modifica o status dos demais.

### 22.3 Professor independente com treino extra do aluno

Aluno pedala no domingo sem prescrição. A atividade aparece como extra no calendário e no histórico acessível ao professor. Não é escondida por ausência de vínculo com modelo. O professor recebe resumo conforme sua preferência e decide se altera o futuro.

### 22.4 Evento muda de data

O aluno informa adiamento. O sistema registra a alteração, atualiza contagem regressiva e marca revisão pendente. Recalcula lembretes administrativos ainda não enviados. Sessões prescritas permanecem até o professor revisar; ele pode mover um bloco com prévia dos conflitos e versões.

### 22.5 Triatleta com arquivo multiesporte

O arquivo contém natação, transições, bike e corrida. A Ryvano apresenta os segmentos e o total decorrido. Se o provedor enviar cópias por esporte, identifica candidatos à duplicação e mantém a soma correta. Professor analisa cada etapa e a estratégia integrada.

### 22.6 Aluno sem professor

Pode cadastrar eventos, metas e atividades. Acompanhamento informa “sem professor responsável”. Não notificar profissionais sem vínculo, não publicar prescrição e não insinuar que existe análise em andamento. Quando um vínculo autorizado for estabelecido, o professor pode assumir os acompanhamentos pertinentes.

### 22.7 Dois professores e uma escola

Um professor cuida da natação e outro do planejamento integrado. A escola define permissões e responsável principal. Um novo evento gera uma pendência com responsável claro; colaboradores recebem visibilidade conforme função. Uma revisão não é considerada realizada porque um colaborador apenas abriu o aviso.

## 23. Critérios de aceitação e validação

### 23.1 Comportamentos obrigatórios

| ID | Critério verificável |
|---|---|
| AC01 | Aluno cadastra evento pessoal com data, modalidade e objetivo; recebe confirmação e estado de acompanhamento. |
| AC02 | Professor autorizado recebe exatamente um aviso lógico, com link funcional, mesmo após repetição do processamento. |
| AC03 | Sem responsável, evento continua salvo e não é divulgado a professores não vinculados. |
| AC04 | Alteração de data/distância/meta preserva antes/depois e cria revisão pendente. |
| AC05 | Professor cadastra modelo e o atribui a um aluno com conteúdo publicado verificável. |
| AC06 | Atribuição em lote cria prescrições individuais e mostra resultado por destinatário. |
| AC07 | Ausência de referência necessária impede resolver alvo relativo; não inventa valor. |
| AC08 | Editar catálogo não modifica sessões previamente atribuídas. |
| AC09 | Alterar uma prescrição individual não altera os outros alunos. |
| AC10 | Atividade não prescrita fica visível no calendário e no histórico autorizado. |
| AC11 | Comparativo distingue dado ausente de zero e apresenta cobertura da medição. |
| AC12 | Repouso, sessão cancelada e falta de sincronização não são classificados indistintamente como falta. |
| AC13 | Arquivo multiesporte e cópias por etapa não duplicam totais. |
| AC14 | Zonas novas não reescrevem metas históricas da prescrição. |
| AC15 | Água aberta apresenta campos de ambiente, percurso, apoio e feedback técnico. |
| AC16 | Piscina registra comprimento/unidade e descanso versus intervalo de saída. |
| AC17 | Total do editor corresponde à soma de blocos, repetições e recuperações configuradas. |
| AC18 | Professor independente e escola têm o mesmo núcleo de acompanhamento, com escopos separados. |
| AC19 | Aluno não edita diretamente prescrição do professor; pedido de alteração é separado. |
| AC20 | Evento passado permite resultado sem disparar lembretes pré-evento vencidos. |
| AC21 | Revogação de vínculo impede acesso por URL, API, anexos e cache. |
| AC22 | Calendário e alertas refletem mutações sem recarregar toda a página. |
| AC23 | Nenhum fluxo gera, escolhe ou altera treino automaticamente. |
| AC24 | Feedback e revisão preservam autoria e não sobrescrevem um ao outro. |
| AC25 | Resultado do evento aceita conclusão, não largada, abandono e desclassificação sem apagar esforço registrado. |

### 23.2 Testes significativos para a implementação futura

**E2E:** aluno cria evento → professor recebe alerta → assume acompanhamento → define marco → cadastra modelo → atribui → aluno registra execução → professor compara/revisa → registra resultado do evento. Repetir com professor independente e escola, incluindo tentativa de acesso indevido entre organizações.

**Cálculos:** repetição com descanso apenas entre esforços; intervalo de saída; tempo aberto; unidades m/yd; ritmo em segundos; comparação com cobertura parcial; multiesporte sem duplicação.

**Concorrência e falhas:** reenvio de atividade, repetição de publicação em lote, falha parcial, edição simultânea, integração atrasada e mudança de data com avisos agendados.

**Experiência:** teclado, leitura por tecnologias assistivas, legenda além de cor, celular, listas grandes e links de alertas. Não avaliar habilidade aquática com teste automatizado de software; validar campos e fluxo com professores reais.

**Entrega de código quando este documento virar tarefa:** ler instruções do repositório, sincronizar o trabalho conforme fluxo do projeto, implementar, executar E2E relevante e verificações necessárias, revisar mudanças e concluir commit/push conforme autorização e processo do repositório. Este documento não representa essas etapas como já executadas.

## 24. Ordem sugerida de implementação

### Fase 1 — Ciclo completo utilizável

Eventos pessoais, participação, meta desejada/pactuada, responsável, alertas internos, catálogo manual versionado, atribuição individual e coletiva, registro manual de execução, comparação básica, atividade extra, feedback e revisão. Todas as modalidades devem possuir classificação e campos essenciais desde essa fase, inclusive águas abertas.

**Saída:** professor consegue acompanhar do evento ao resultado sem depender de integração ou geração de treino.

### Fase 2 — Estrutura e evidências

Construtor de blocos, referências individuais, marcos e fases, comparação por blocos, importação de arquivos suportados, deduplicação, triathlon por segmentos e relatório da preparação.

**Saída:** prescrições estruturadas e comparações confiáveis, com limitações explícitas quando faltarem dados.

### Fase 3 — Escala e integrações validadas

Conectores efetivamente disponíveis, exportação compatível, catálogo institucional colaborativo, refinamento de filtros, acompanhamento de grandes turmas e métricas avançadas com metodologia documentada.

**Fora de todas as fases:** treinador automático, plano automático, alteração automática de carga e promessas de resultado.

### 24.1 Indicadores do próprio produto

- Tempo entre cadastro do evento e primeira análise profissional.
- Percentual de acompanhamentos com responsável e próxima revisão.
- Tempo gasto para atribuir uma sessão a uma turma.
- Frequência de uso do catálogo e proporção de adaptações individuais.
- Atividades extras visíveis e efetivamente revisadas.
- Falhas/duplicidades de importação e publicação.
- Eventos com resultado e parecer pós-evento.

Esses indicadores avaliam uso e confiabilidade da plataforma. Não devem virar ranking público de professores ou alunos sem definição, contexto e política apropriada.

## 25. Referenciais técnicos e fontes verificadas

**Data de consulta: 03/10/2026.** Datas exibidas em páginas ou resultados não são garantia de atualização funcional; confirmar novamente antes de depender de preços, APIs, regras esportivas ou permissões de integração.

### 25.1 Mercado — documentação oficial

**[M01] TrainingPeaks — Workout Libraries.**

Link: <https://help.trainingpeaks.com/hc/en-us/articles/204072434-Workout-Libraries>

Consulta: documentação da biblioteca e aplicação de sessões ao calendário. Sustenta a observação de modelos reutilizáveis; não fundamenta regras próprias de versionamento da Ryvano.

**[M02] TrainingPeaks — Events.**

Link: <https://help.trainingpeaks.com/hc/en-us/articles/205076770-Events>

Consulta: cadastro de provas, objetivos, vínculo de arquivo e resultado. A página também diferencia comentários de evento de notificações de comentários pós-treino; isso reforça a necessidade de especificar cada gatilho, em vez de presumir que todo comentário notifica.

**[M03] TrainingPeaks — Dynamic Training Plans.**

Link: <https://help.trainingpeaks.com/hc/en-us/articles/204072414-Dynamic-Training-Plans>

Consulta: diferença entre planos padrão e dinâmicos e uso em vários atletas. A proposta da Ryvano opta por cópias versionadas e atualização explícita; não reproduz automaticamente a propagação dinâmica do concorrente.

**[M04] Final Surge — Top Features.**

Link: <https://site.finalsurge.com/Features>

Consulta: página oficial que reúne recursos de biblioteca, planejamento, equipes, comentários e associação de arquivos. Parte do conteúdo é histórico. Para decisões sobre aplicativo/dispositivo atual, confirmar na central de ajuda correspondente.

**[M05] Nolio — Fonctionnalités.**

Link: <https://www.nolio.io/features/>

Consulta: previsto/realizado, modelos, atribuições, dados de sessão e notificações de competição. É evidência documental de funcionalidades anunciadas, sem auditoria de experiência real nesta pesquisa.

**[M06] Intervals.icu — Training Calendar.**

Link: <https://www.intervals.icu/features/training-calendar/>

Consulta: calendário, biblioteca, totais, planejado/realizado e aplicação de planos. Não é autorização nem contrato de uso de API para a Ryvano.

**[M07] Treinus — Como é o funcionamento da prova alvo.**

Link: <https://ajuda.treinus.com.br/hc/pt-br/articles/39955858756759-Como-%C3%A9-o-funcionamento-da-prova-alvo>

Consulta: indicação de prova-alvo pelo atleta/treinador e visualização para planejamento. Evidencia a utilidade de distinguir objetivo principal de evento cronologicamente mais próximo.

**[M08] SisRUN — Como adicionar as provas que vou participar.**

Link: <https://sisrun.zendesk.com/hc/pt-br/articles/18941956093715-Como-adicionar-as-provas-que-vou-participar>

Consulta: cadastro de metas/provas pelo aluno, prioridade, indicador regressivo e aviso ao treinador. É a referência mais próxima da interação central solicitada para a Ryvano.

### 25.2 Livros técnicos — alcance e aplicação

| ID | Obra e autoria | O que foi verificado | Uso proposto na Ryvano |
|---|---|---|---|
| L01 | **Swimming Fastest**, Ernest W. Maglischo, Human Kinetics, 2003. | Registro bibliográfico e sumário da prévia no Google Books; não leitura integral. | Referência para organizar temas de técnica, sessões, planejamento e análise em piscina. Por ser obra antiga, confrontar afirmações fisiológicas com literatura atual. |
| L02 | **Open Water Swimming**, Steven Munatones, Human Kinetics. | Descrição editorial e sumário. | Organizar demandas de ambiente, percurso, tática, preparação e provas aquáticas. |
| L03 | **Daniels’ Running Formula**, Jack Daniels, 4ª edição, Human Kinetics. | Página editorial, autoria e sumário; edição consultada com copyright 2022. | Separar tipos de corrida, referências individuais e especificidade de provas; não copiar tabelas de ritmo sem verificar uso e protocolo. |
| L04 | **Training and Racing with a Power Meter**, Hunter Allen, Andrew Coggan e Stephen McGregor, 3ª edição, VeloPress, 2019. | Página editorial e descrição da edição. | Referência para perfis de potência, avaliação e estratégia; não tratar qualquer estimativa de FTP como equivalente. |
| L05 | **The Triathlete’s Training Bible**, Joe Friel, 5ª edição. | Página editorial que identifica a quinta edição e seu escopo. | Planejamento individual integrado e organização da preparação conforme objetivos e rotina. |
| L06 | **Periodization: Theory and Methodology of Training**, Tudor O. Bompa e Carlo Buzzichelli, 6ª edição, Human Kinetics, 2019. | Página editorial e sumário. | Dar suporte conceitual a fases, ciclos, individualização e planejamento; não impor um modelo único. |
| L07 | **Triathlon 2.0: Data-Driven Performance Training**, Jim Vance, Human Kinetics. | Página editorial e apresentação dos temas. | Distinguir medição, interpretação e decisão no acompanhamento multiesporte. |

Links das obras:

- **[L01]** <https://books.google.com/books/about/Swimming_Fastest.html?id=cSSW4RhZOiwC>
- **[L02]** <https://us.humankinetics.com/products/open-water-swimming-pdf>
- **[L03]** <https://us.humankinetics.com/products/daniels-running-formula-4th-edition>
- **[L04]** <https://www.stablebookgroup.com/products/training-and-racing-with-a-power-meter>
- **[L05]** <https://www.stablebookgroup.com/products/the-triathletes-training-bible>
- **[L06]** <https://us.humankinetics.com/products/periodization-6th-edition-pdf>
- **[L07]** <https://us.humankinetics.com/products/triathlon-2-0>

As páginas editoriais verificam existência, autoria, edição e temas. Elas não bastam para atribuir ao autor cada regra funcional deste documento. Os esquemas de dados, alertas, telas, critérios de aceite e sessões ilustrativas são propostas originais para o produto.

### 25.3 Guias técnicos e pesquisa científica

**[T01] U.S. Masters Swimming — How to Train With Critical Swim Speed Intervals.**

Link: <https://www.usms.org/fitness-and-training/articles-and-videos/articles/how-to-train-with-critical-swim-speed-intervals>

Uso: exemplo público de individualização e testes de natação. Limite: o texto usa uma interpretação particular de intervalo de saída e contém simplificações fisiológicas; não foi usado como fonte universal para mecanismos de fadiga. Protocolos e terminologia precisam de validação antes de implementação.

**[T02] Swim England — How to stay safe swimming outdoors.**

Link: <https://www.swimming.org/openwater/how-to-stay-safe-swimming-outdoors/>

Uso: considerar perigos locais, condições, trajeto e entradas/saídas. Limite: orientação pública estrangeira; não substitui avaliação local ou regulamento do evento. A Ryvano não transforma esse conteúdo em certificação de segurança.

**[T03] U.S. Masters Swimming — Guide to Running an Open Water Swim Practice.**

Link: <https://www.usms.org/open-water-central/clinic-and-practice-management/guide-to-running-an-open-water-swim-practice>

Uso: planejamento operacional, condições ambientais, comunicação e habilidades. Limite: a seção de seguro/membros aplica-se ao contexto USMS; não deve ser transposta como obrigação brasileira.

**[T04] U.S. Masters Swimming — How Open Water Swimmers Can Improve Their Sighting.**

Link: <https://www.usms.org/fitness-and-training/articles-and-videos/articles/how-open-water-swimmers-can-improve-their-sighting>

Uso: reconhecer orientação como habilidade específica. Não define uma frequência universal de olhar à frente que deva ser imposta a todos os alunos.

**[T05] Bosquet, Montpetit, Arvisais e Mujika — Effects of tapering on performance: a meta-analysis.** Medicine & Science in Sports & Exercise, 2007;39(8):1358–1365.

Link: <https://pubmed.ncbi.nlm.nih.gov/17762369/>

Uso: referência científica sobre manipulação da carga pré-competitiva. Limite: populações e estratégias estudadas não justificam um taper automático para qualquer modalidade, distância ou nível.

**[T06] Effects of tapering on performance in endurance athletes: A systematic review and meta-analysis.** 2023.

Link: <https://pmc.ncbi.nlm.nih.gov/articles/PMC10171681/>

Uso: atualização sobre resultados e variações de estratégias de taper. Limite: diferenças entre estudos e atletas precisam ser consideradas. Este documento não converte percentuais ou durações da revisão em padrões obrigatórios do software.

**[T07] Foster et al. — A new approach to monitoring exercise training.** Journal of Strength and Conditioning Research, 2001;15(1):109–115.

Link: <https://pubmed.ncbi.nlm.nih.gov/11708692/>

Complemento conceitual de mensuração da carga: <https://pubmed.ncbi.nlm.nih.gov/8693756/>

Uso: fundamentar acompanhamento por percepção de esforço da sessão e duração. Limite: carga subjetiva não equivale a diagnóstico ou intercambialidade perfeita entre todas as modalidades e contextos.

### 25.4 Mapa de rastreabilidade

| Decisão | Referencial | Natureza da decisão |
|---|---|---|
| Aluno informa evento/meta e professor é avisado | M08; M05 | Fluxo com precedente de mercado. |
| Próximo evento separado da prova principal | M07 | Referência de mercado adaptada ao produto. |
| Catálogo e aplicação para vários alunos | M01, M03, M04, M06 | Padrão de mercado; versionamento proposto pela Ryvano. |
| Águas abertas com habilidade e ambiente próprios | L02, T02–T04 | Fundamentação técnica; campos propostos. |
| Planejamento com fases individualizadas | L05–L06 | Referência conceitual; decisões mantidas com professor. |
| Preparação pré-competitiva revisável | T05–T06 | Evidência científica com limites de aplicação. |
| Dados objetivos e feedback juntos | M05, L07, T07 | Referenciais complementares; interface proposta. |
| Proibir geração automática de treinos | Instrução expressa do usuário | Requisito de produto, independentemente do mercado. |
| Congelar prescrição, tratar falhas e evitar dupla contagem | Necessidades de integridade da proposta | Requisito original de engenharia, não regra extraída de livro. |

## 26. Instruções para pesquisar quando houver dúvida

### 26.1 Procedimento obrigatório para quem desenvolver ou especificar

1. Formular a dúvida concreta: termo, comportamento do produto, cálculo, regra esportiva, integração ou permissão.
2. Verificar se o documento já decidiu o comportamento. Não usar pesquisa para contrariar a proibição de geração automática.
3. Consultar fontes primárias: documentação oficial, autor/editora, federação/organizador e artigos científicos.
4. Ler a seção relevante, não apenas resumo de busca ou material promocional.
5. Registrar URL, data, trecho/tema consultado, população/modalidade e alcance da evidência.
6. Separar fato documentado, interpretação e escolha de produto.
7. Havendo conflito, comparar protocolos, definições, edição e contexto; não misturar unidades ou métodos.
8. Se a regra depende da decisão do professor, criar configuração explícita em vez de inventar um padrão universal.
9. Se a incerteza afeta a segurança esportiva, a interpretação clínica ou uma regra de prova, obter validação qualificada/local antes de codificar a conclusão.
10. Entregar decisão com exemplo e critério de aceite. Informação não confirmada deve permanecer identificada como pendente.

### 26.2 Consultas sugeridas por assunto

| Dúvida | Onde começar | Exemplo de busca |
|---|---|---|
| Evento criado pelo aluno e aviso ao professor | Centrais oficiais SisRUN, Nolio, Treinus | `site:sisrun.zendesk.com provas participar objetivos metas treinador aviso` |
| Distribuição coletiva e bibliotecas | TrainingPeaks, Final Surge, Intervals.icu | `site:help.trainingpeaks.com workout libraries dynamic training plans` |
| Sighting, percurso e supervisão | USMS e Swim England | `site:usms.org open water sighting practice safety` |
| Travessia e regras locais | Organizador da edição e entidades responsáveis | Nome do evento + ano + `regulamento percurso apoio neoprene corte` |
| Descanso e intervalo de saída | Literatura de natação e protocolo do professor | `swimming rest interval send off difference coaching` |
| CSS e testes | Protocolo original ou estudo técnico e treinador | `critical swimming speed 200 400 protocol validation` |
| Corrida e intensidade | Obra de referência e artigos originais | `Daniels Running Formula training intensities VDOT protocol` |
| FTP e potência | Allen/Coggan/McGregor e documentação do instrumento | `functional threshold power testing protocol power duration` |
| Taper | PubMed e texto integral legítimo | `endurance taper systematic review swimming running cycling` |
| Carga por RPE | Artigo de Foster e validações posteriores | `session RPE training load duration protocol validity` |
| Exportação/importação | Documentação oficial de cada fornecedor | Nome do fornecedor + `developer workout activity API supported fields` |

Consultas são pontos de partida, não citações nem comprovação. Confirmar o resultado antes de usá-lo.

### 26.3 Registro de decisão de pesquisa

Usar esta ficha nas tarefas:

```text
Dúvida:
Por que afeta a funcionalidade:
Modalidade/ambiente/população:
Fonte primária e URL:
Data da consulta e edição/versão:
O que foi efetivamente lido:
Achado confirmado:
Limitações e divergências:
Decisão de produto:
O que continuará sob decisão do professor:
Critério de aceitação:
Responsável pela validação:
```

### 26.4 Antes de começar a implementação no repositório

Localizar entidades e regras existentes de aluno, professor, escola, turma, atividade, treino, integração e notificações. Ler instruções do projeto e fluxos já implementados. Mapear quais requisitos deste documento já existem, quais precisam de extensão e quais realmente exigem novos módulos.

Não criar um segundo calendário ou uma segunda ficha do atleta que concorra com a existente. Não mudar rotas e menus apenas para reproduzir nomes conceituais deste documento. Não assumir que o banco atual possui os campos aqui propostos.

### 26.5 Antes de cadastrar conteúdo técnico no catálogo

Confirmar autoria, direitos de uso dos materiais e adequação profissional. Não copiar integralmente planilhas pagas ou capítulos de livros. Um livro orienta a formação do professor; o catálogo contém sessões efetivamente cadastradas e revisadas por ele.

## 27. Glossário e decisões pendentes

### 27.1 Glossário

| Termo | Significado no produto |
|---|---|
| Prescrição | Instrução publicada pelo professor para um aluno e data. |
| Modelo | Conteúdo reutilizável do catálogo, sem destinatário obrigatório. |
| Atividade | Registro do que foi realizado, com ou sem prescrição. |
| Acompanhamento | Processo de planejamento, evidências e revisões em torno do objetivo. |
| Marco | Etapa verificável com prazo e critério de avaliação. |
| Microciclo | Unidade curta de organização do treinamento definida pelo professor; não necessariamente sete dias no modelo de dados. |
| Taper | Redução/ajuste pré-competitivo da carga planejado pelo professor. |
| CSS | Referência de velocidade/ritmo crítico de natação, dependente do protocolo e interpretação. |
| FTP | Referência de potência funcional de limiar, com protocolo e data. |
| RPE | Percepção de esforço; registrar escala e momento de coleta. |
| Sighting | Orientação visual durante o nado em águas abertas. |
| Vácuo/drafting | Posicionamento que aproveita deslocamento de outro atleta; permissibilidade depende do esporte e regulamento. |
| Brick | Sessões de modalidades encadeadas para uma finalidade definida, frequentemente bike e corrida. |
| T1/T2 | Transições do triathlon, analisadas separadamente dos segmentos. |
| Aderência | Grau observado de execução do que foi prescrito, com denominador e limites explícitos. |
| Prontidão | Julgamento contextual; não é sinônimo de percentual de treinos concluídos. |

### 27.2 Decisões que podem ser configuradas sem mudar a proposta

- Prazos de análise e revisão por professor/escola.
- Canal e frequência de avisos.
- Nomes e quantidade de zonas.
- Tipos de prova, prioridades e etiquetas.
- Critérios de comparabilidade e tolerância escolhidos pelo professor.
- Escopos de colaboração e publicação em catálogo institucional.

### 27.3 Pontos a validar na fase de implementação

| Ponto | Evidência necessária |
|---|---|
| Estrutura e rotas atuais | Leitura do repositório e uso dos fluxos existentes. |
| Provedores de atividade disponíveis | Documentação, autorização e testes com contas/dados permitidos. |
| Precisão da análise por blocos | Arquivos representativos de cada modalidade e dispositivo suportado. |
| Propriedade do catálogo ao desligar professor | Política explícita do produto e contratos aplicáveis. |
| Papéis de coordenação e colaboradores | Validação com operação real de escola e professor independente. |
| Fluxo de eventos e metas | Teste com alunos e professores, incluindo água aberta. |
| Regras esportivas de cada edição | Regulamento oficial atualizado e fonte registrada. |

**Definição de sucesso da Ryvano:** o aluno comunica onde quer chegar; o professor decide como prepará-lo; a plataforma mantém datas, responsabilidades, sessões e evidências conectadas, sem assumir a autoria da prescrição.
