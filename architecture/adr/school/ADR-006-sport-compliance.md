# Escola ADR-006 — Compliance por modalidade

## Status

Aceito para implementação (T001). Fórmula v2 e disparo automático aceitos (SAM-19, 2026-10-01). Fórmula v3 aceita (SAM-48, 2026-10-03). Fórmula v4 aceita (SAM-72, 2026-10-03).

## Contexto

Esportes possuem estruturas, unidades e métricas diferentes.

A v1 (`algorithmVersion = 1`) somava os blocos sem repetições (4×1 km = 1 km), comparava a FC média da atividade com a faixa do **primeiro** bloco que tivesse FC (o aquecimento em Z1 definia o alvo de um intervalado em Z4), tinha `zones` como stub e — fora do seed — nunca era calculada: `triggerComplianceCalculation` não tinha chamador.

## Decisão

Usar estratégias selecionadas pelo RyvanoSportType canônico, com versão do algoritmo persistida e detalhes dos scores. Métrica ausente não é zero nem sucesso. Ryvano Score permanece separado de avaliação do coach e feedback.

### Fórmula v2 (`algorithmVersion = 2`)

- **Totais planejados** = Σ reps × (duração + descanso) e Σ reps × distância, pela mesma função que as telas usam (`domain/workout-structure.ts`, `plannedTotals`). A duração é comparada ao tempo **decorrido** quando a prescrição tem descanso (o relógio continua rodando na recuperação) e ao tempo em movimento caso contrário.
- **Intensidade (FC, ritmo, potência) por bloco:** quando a atividade traz laps e a contagem bate com uma leitura da estrutura (`alignStructure`: descanso entre reps, após cada rep, ou só trabalho), cada segmento de trabalho é comparado ao seu próprio lap, ponderado pela duração do lap. Senão, o alvo é a média ponderada pela duração dos **blocos principais** — aquecimento, desaquecimento e recuperação excluídos — contra a média da atividade.
- **`zones`** = fração do tempo de esforço cujo lap ficou dentro da faixa de FC prescrita (tolerância de 3% nas bordas). Só existe com laps alinhados. Os "tempos em zona" dos provedores não são usados: as faixas são as do dispositivo, não as da prescrição.
- **Intervalos** usam reps e penalizam excesso tanto quanto falta (a v1 tratava qualquer excesso como conclusão).
- Pesos por modalidade mantidos; `zones` entra em corrida, bike e default com peso pequeno.

### Fórmula v3 (`algorithmVersion = 3`, SAM-48)

- **Descanso entre repetições.** O descanso de um bloco v1 conta `reps − 1` vezes (6 × 100 m com 20 s = cinco pausas, §11.2 do documento de eventos); bloco de uma repetição mantém o seu descanso. A v2 contava um descanso após cada repetição.
- **Total parcial explícito.** `plannedTotals` informa `durationIsPartial`/`distanceIsPartial` quando algum bloco não tem duração/distância; as telas mostram estimativa, nunca total exato.
- **Sem dimensão mensurável, sem registro.** `overallScore` nulo remove o registro da execução em vez de gravar 0.
- **Um só cálculo de total.** Toda tela e caso de uso que exibe ou compara a duração/distância planejada usa `plannedTotalsOfRows` (card e detalhe do atleta, semana, hub do professor, escola, matching).

### Fórmula v4 (`algorithmVersion = 4`, SAM-72)

- A nota continua a da v3. O `breakdown` ganha `adherence` e `coverage`, sempre juntos (§17.4): aderência = tempo medido dentro da faixa ÷ tempo com medição válida; cobertura = tempo com medição válida ÷ tempo dos blocos avaliáveis. Ambos vêm das amostras da atividade (`ActivityStream`) alinhadas às voltas (`alignStructure`), só na série principal (aquecimento, volta à calma e recuperações fora do denominador, §14.4).
- Bloco sem amostras é "não medido" e sai do cálculo; sessão sem amostras não grava o par — nunca um cumprimento estimado.
- A métrica que julga o bloco é a da prescrição (`target.primaryMetric`; padrão potência → ritmo → FC) e a tolerância da faixa é a do professor (`target.tolerancePct`, padrão 0). FC por estímulo curto não reprova repetição prescrita por ritmo/potência (§17.5).
- `DEVIATION_DETECTED` só dispara abaixo de `FollowUpPolicy.deviationAdherenceBelowPct`, configurado pela organização; sem valor, sem aviso (§27.2).
- Linhas gravadas nas versões 1–3 não são recalculadas.
### Disparo

- Calculada **automaticamente** pelo fluxo de match: match automático (`AUTO_MATCHED`), confirmação e substituição, logo após a transação de cada um — nunca dentro dela, e nunca fatal (uma falha de cálculo não desfaz o match).
- **Recalculada** quando uma adaptação de plano é aceita (`adaptationVersion` muda), com evento `COMPLIANCE_RECALCULATED` na trilha da prescrição.
- **Idempotente:** upsert por execução; a versão do algoritmo fica gravada. Linhas da v1 permanecem como v1 até serem recalculadas (`scripts/backfill-compliance.ts`, idempotente, `--all` para rescorar tudo).
- O leitor de laps é injetado pela camada app (módulos de provedor); o módulo school continua sem importar provedor.

## Consequências e validação

Recalcular deve preservar trilha da versão anterior. O adapter lê atividades persistidas normalizadas sem consultar providers. Telas mostram "—" quando não há cálculo para a janela, nunca zero.

## Referências

- `.kiro/specs/ryvano-escola-spec/required.md`
- `.kiro/specs/ryvano-escola-spec/design.md`
- `architecture/ryvano-escola-integration.md`
- `modules/school/domain/compliance-strategy.ts`, `modules/school/domain/workout-structure.ts`
