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
   | `prescribe-workout-to-athlete.ts`, `assign-workout.ts`, `assign-workout-to-team.ts`, `create-workout.ts`, `fulfill-workout-request.ts` | professor |
   | `log-unplanned-workout.ts` | atleta registrando o que já fez (não é prescrição a cumprir) |
   | `instantiate-license-calendar.ts` | atleta ativando plano autoral publicado |
   | `workout-repository.ts` | infraestrutura chamada pelos anteriores |

   Um escritor novo exige atualizar esta tabela com o ator e a justificativa.
7. **Exclusão no provedor** (§17.3, decidido aqui para SAM-62): a atividade removida no provedor é marcada como tal; vínculo, feedback e revisão feitos na Ryvano continuam para auditoria. Nada some em silêncio.

## Consequências

- O mapa conceito → modelo do épico está em `architecture/modules/training-events.yaml`; ele impede duplicar entidades que já existem.
- Decisões já tomadas não são reabertas: desfecho prescrito × executado é derivado (school.yaml), zonas padrão são derivadas da ficha, fora da escola não há turma (ADR-009), snapshot de prescrição é imutável (ADR-004).
- Revisão de produto: qualquer issue nova que mencione "sugerir treino", "ajustar automaticamente" ou "prontidão %" precisa citar este ADR e passar no teste de fronteira.

## Referências

- `docs/ryvano_treinos_eventos_acompanhamento.md` §2, §17.6, §21, §24, §26.4
- ADR-003 (reconciliação nunca automática), ADR-004 (snapshots), ADR-006 (compliance), ADR-009 (independente)
- `tests/prescription-authorship-guard.test.ts`
