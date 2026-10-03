# Escola ADR-010 — A Ryvano não prescreve: o professor é o autor

## Status

Aceito (SAM-47, épico SAM-46). Fonte: `docs/ryvano_treinos_eventos_acompanhamento.md` §2, §21, §26.4.

## Contexto

O épico de eventos, catálogo e acompanhamento acrescenta eventos, objetivos, fases, marcos, catálogo versionado, atribuição em lote e alertas. Cada uma dessas peças tenta a plataforma a "ajudar" escolhendo sessões, ajustando carga ou declarando prontidão. O documento proíbe isso como decisão central de produto.

## Decisão

1. **O professor cadastra, seleciona, individualiza e publica.** A Ryvano persiste, calcula o que foi explicitamente definido, resolve unidades, emite alertas, registra histórico e compara prescrito × realizado.
2. **Teste de fronteira (§2.3).** Se o sistema decide qual estímulo o aluno deve realizar, ultrapassou seu papel. Se calcula ou exibe uma decisão registrada pelo professor, está dentro.
3. **Automações permitidas (§2.2):**
   - somar distâncias, repetições, tempos de esforço e descansos cadastrados;
   - calcular faixa individual por fórmula escolhida pelo professor e avaliação válida, com prévia antes da publicação;
   - criar a pendência de acompanhamento quando o aluno registra um evento;
   - calcular dias até a prova e vencimentos de marcos definidos pelo professor;
   - notificar criação, alteração, cancelamento, atividade recebida e revisão pendente;
   - importar atividades por integrações autorizadas, registro manual e arquivos suportados;
   - sugerir a associação atividade ↔ prescrição explicando os critérios;
   - apresentar desvios, tendências e dados ausentes sem decidir a nova prescrição.
4. **Fora de escopo em qualquer fase (§2.3, §24):**
   - gerar treino, plano, microciclo ou taper (IA ou regra);
   - escolher sessão do catálogo pelo evento sem ação do professor;
   - aumentar volume/intensidade porque a semana anterior foi cumprida;
   - encaixar treino perdido em outro dia;
   - reduzir ou aumentar carga por relógio, HRV, sono ou prontidão;
   - alterar zonas de sessões publicadas após novo teste sem revisão explícita;
   - declarar aptidão, segurança ou garantia de completar uma prova;
   - diagnosticar lesão, overtraining ou condição clínica.
5. **Automações que já existem e continuam, por quê:**
   - *Matching* (SAM-33): associa uma atividade a uma prescrição já publicada; nunca cria nem altera a prescrição. A associação é sugestão auditável e reversível (SAM-62).
   - *Compliance* recalculado (ADR-006): é cálculo sobre a decisão do professor.
   - *Instanciação da licença* (marketplace): o atleta escolhe ativar um plano que o professor escreveu e publicou; a plataforma só posiciona as sessões no calendário. A adaptação continua exigindo decisão do atleta (marketplace.yaml).
   - *Alerta de recuperação* (SAM-43): só avisa o professor; nunca muda carga.
6. **Quem pode escrever uma prescrição** está numa lista fechada, verificada por `tests/prescription-authorship-guard.test.ts`:

   | Escritor | Ator |
   |---|---|
   | `prescribe-workout-to-athlete.ts`, `assign-workout.ts`, `create-workout.ts`, `fulfill-workout-request.ts` | professor (o lote da SAM-60 passa por `prescribe-workout-to-athlete.ts`; `assign-workout-to-team.ts`, sem chamador, foi removido) |
   | `log-unplanned-workout.ts` | atleta registrando o que já fez (não é prescrição a cumprir) |
   | `instantiate-license-calendar.ts` | atleta ativando plano autoral publicado |
   | `workout-repository.ts` | infraestrutura chamada pelos anteriores |

   Um escritor novo exige atualizar esta tabela com o ator e a justificativa.
7. **Exclusão no provedor** (§17.3, implementado na SAM-62): a cópia da atividade é apagada como o provedor exige (ex.: webhook de exclusão da Strava). Antes disso, no mesmo trabalho, a execução ligada a uma sessão prescrita recebe `WorkoutExecution.providerRemovedAt` (`markExecutionsRemovedAtProvider`). O vínculo, o resumo já guardado na execução, a revisão do professor e o feedback ficam para auditoria, e a tela mostra "removida no provedor". O relato do atleta sobre uma atividade **fora do plano** (`AthleteFeedback.activityId`) descreve só aquela atividade e sai junto com ela, porque foi o próprio atleta quem a excluiu. Nenhum dado do provedor é mantido além do resumo que a execução já tinha.
8. **Associação auditável** (SAM-62): cada associar/confirmar/trocar/desfazer grava `WorkoutAssignmentHistory` (`MATCH_LINKED`/`MATCH_CONFIRMED`/`MATCH_UNLINKED`) com quem, quando, método e confiança. A execução guarda o critério (`matchDetail`). Desfazer não apaga nada e pode ser refeito. Atividade de outra modalidade só é associada pelo professor.

9. **Métricas avançadas e conectores só com método documentado** (§17.6, §21.6, SAM-79, fichas em `architecture/research/`, consulta 03/10/2026):
   - TSS por potência (Allen & Coggan): entra como configuração do professor em issue filha, só com série de potência e FTP com protocolo, rótulo com método e referência; nunca somado ao hrTSS.
   - rTSS e sTSS: não entram (NGP e expoente não reprodutíveis pela fonte oficial); carga de corrida/natação segue por sRPE ou hrTSS.
   - hrTSS (ADR-007): mantido, com rótulo de método; melhoria por amostra opcional.
   - CTL/ATL/TSB: não entram (exigem série diária contínua de método único e seriam lidos como prontidão, §17.7).
   - Sweet spot e 7 níveis de Coggan: configuração do professor via perfil de zonas (SAM-70); nada pré-cadastrado.
   - FTP por 20 min e CSS 400/200: a Ryvano nunca deriva de atividade; calculadores auxiliares só na ficha de avaliação, com protocolo nomeado e fonte "estimativa".
   - Provedores: Polar aprovado para issue filha (sem envio de treino); Suunto condicional à parceria; COROS, Fitbit (API em fim de vida em 30/10/2026) e Amazfit/Zepp não entram. Todos continuam `COMING_SOON` no catálogo.
   - Análise por blocos (SAM-72) só é divulgada como "verificada" após arquivos reais autorizados por modalidade/dispositivo (tabela na ficha).
## Consequências

- O mapa conceito → modelo do épico está em `architecture/modules/training-events.yaml`; ele impede duplicar entidades que já existem.
- Decisões já tomadas não são reabertas: desfecho prescrito × executado é derivado (school.yaml), zonas padrão são derivadas da ficha, fora da escola não há turma (ADR-009), snapshot de prescrição é imutável (ADR-004).
- Revisão de produto: qualquer issue nova que mencione "sugerir treino", "ajustar automaticamente" ou "prontidão %" precisa citar este ADR e passar no teste de fronteira.

## Referências

- `docs/ryvano_treinos_eventos_acompanhamento.md` §2, §17.6, §21, §24, §26.4
- `architecture/research/metricas-avancadas.md`, `architecture/research/provedores-candidatos.md` (SAM-79)
- ADR-003 (reconciliação nunca automática), ADR-004 (snapshots), ADR-006 (compliance), ADR-009 (independente)
- `tests/prescription-authorship-guard.test.ts`
