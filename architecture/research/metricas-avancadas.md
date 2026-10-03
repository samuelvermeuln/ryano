# Fichas de pesquisa — métricas avançadas (SAM-79, §17.6, §18.4, §26.3)

Consulta em **03/10/2026**. Cada ficha segue o modelo do §26.3. Nenhuma métrica desta página é exposta ao usuário por esta issue; o que já existe (hrTSS, ADR-007) continua como está. Paráfrases; nada copiado literalmente.

Regra comum a todas (§17.6): números de fornecedores diferentes (TSS da Garmin, do TrainingPeaks, do Intervals.icu…) **não são somados nem equivalidos**; razão de cargas nunca vira probabilidade de lesão; qualquer valor exibido leva método e referência no rótulo.

---

## 1. TSS por potência (ciclismo)

```text
Dúvida: calcular TSS a partir da potência medida, como carga comparável entre sessões de ciclismo?
Por que afeta a funcionalidade: carga semanal por modalidade (§16.4) e comparativo de sessões de bike com medidor de potência (§15.6).
Modalidade/ambiente/população: ciclismo com medidor de potência calibrado; adultos treinados (base original).
Fonte primária e URL: Allen & Coggan, "Training and Racing with a Power Meter" (TSS/NP/IF); definição pública em TrainingPeaks "Training Stress Scores (TSS) Explained" — https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained ; "The Science of the Performance Manager" (Coggan) — https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/
Data da consulta e edição/versão: 03/10/2026 (páginas atuais; a de ajuda devolveu 403 ao robô e foi lida pelo resumo indexado + artigo rTSS/hrTSS do mesmo site).
O que foi efetivamente lido: fórmula TSS = (s × NP × IF) ÷ (FTP × 3600) × 100, equivalente a IF² × horas × 100; uma hora em FTP = 100; depende de NP (potência normalizada, janela de 30 s elevada à 4ª potência) e de FTP válido.
Achado confirmado: a fórmula é pública e estável; exige série de potência por segundo (ou ao menos por amostra) e FTP vigente do atleta.
Limitações e divergências: FTP de fornecedores/protocolos diferentes não é comparável (§15.6); medidores diferentes divergem; sem série, não há NP (resumo por potência média subestima sessões variáveis). Trocar FTP muda a carga retroativa se recalculada — a Ryvano congela referência por prescrição (§18.2).
Decisão de produto: ENTRA como configuração do professor em issue filha: "carga por potência (TSS, Allen & Coggan)" só quando a atividade tiver série de potência (ActivityStream.power) e a ficha tiver FTP com protocolo (SAM-70); rótulo obrigatório "TSS por potência — método Coggan — FTP 240 W (avaliação de 10/09)". Nunca somado ao hrTSS.
O que continuará sob decisão do professor: adotar ou não a métrica por atleta; qual FTP/protocolo; ler o número como contexto, não como prescrição.
Critério de aceitação: sessão de 1 h a FTP constante = 100 ± 1; sessão sem série de potência = "não calculado"; dois FTPs de origens diferentes nunca produzem um só TSS.
Responsável pela validação: responsável técnico da Ryvano + professor validador de ciclismo.
```

## 2. rTSS (corrida)

```text
Dúvida: usar rTSS (ritmo graduado normalizado × ritmo de limiar) para carga de corrida?
Por que afeta a funcionalidade: carga de corrida comparável entre sessões de um mesmo atleta (§14.4).
Modalidade/ambiente/população: corrida com GPS confiável (rua/pista); trilha e esteira degradam a estimativa.
Fonte primária e URL: McGregor, "Running Training Stress Score (rTSS) Explained" — https://www.trainingpeaks.com/learn/articles/running-training-stress-score-rtss-explained/
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: rTSS usa NGP (ritmo graduado normalizado, ajustado por subida/descida), ritmo de limiar funcional (≈ 1 h máxima) e duração; 1 h no limiar ≈ 100; o ritmo fica "mais caro" quanto mais tempo sustentado.
Achado confirmado: a composição é pública; **o algoritmo de NGP é proprietário** (ajuste por gradiente não publicado em forma reprodutível).
Limitações e divergências: sem NGP reprodutível, qualquer "rTSS" da Ryvano seria uma aproximação diferente da do TrainingPeaks e não poderia usar o mesmo nome sem rótulo; exige elevação por amostra e ritmo de limiar com protocolo.
Decisão de produto: NÃO ENTRA com o nome rTSS. Fica aberta uma variante própria, rotulada "carga por ritmo (sem ajuste de gradiente)", só se um professor validador pedir — issue filha condicionada.
O que continuará sob decisão do professor: usar RPE/sRPE (já existe, SAM-63) ou hrTSS como carga de corrida.
Critério de aceitação: nenhuma tela exibe "rTSS".
Responsável pela validação: responsável técnico + professor validador de corrida.
```

## 3. sTSS (natação)

```text
Dúvida: sTSS pelo ritmo versus CSS para carga de natação?
Por que afeta a funcionalidade: carga de natação em piscina (§12.3) e águas abertas (§13).
Modalidade/ambiente/população: piscina com ritmo por 100 m confiável; águas abertas sem GPS confiável ficam fora.
Fonte primária e URL: TrainingPeaks "Training Stress Scores (TSS) Explained" (sTSS compara o ritmo ao CSS) — https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained ; CSS: Wakayoshi et al. (1992), ver ficha 7.
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: sTSS usa o ritmo da sessão relativo ao CSS; o expoente aplicado ao IF (3, segundo a prática do TrainingPeaks) não está na fonte primária acessível.
Achado confirmado: existe como métrica de produto de terceiro; a fórmula exata não é publicada de forma reprodutível na fonte oficial.
Limitações e divergências: piscinas de 25 m, 25 jd e 50 m não são intercambiáveis (AC16); relógios contam piscinas com erro; águas abertas sem comparabilidade (§13).
Decisão de produto: NÃO ENTRA. Carga de natação segue por sRPE (SAM-63) ou hrTSS; a Ryvano não publica "sTSS".
O que continuará sob decisão do professor: usar CSS como referência de zonas (SAM-70) e julgar a carga pelo roteiro + relato.
Critério de aceitação: nenhuma tela exibe "sTSS".
Responsável pela validação: responsável técnico + professor validador de natação.
```

## 4. hrTSS (já existe — manter)

```text
Dúvida: manter o hrTSS como está (ADR-007)?
Por que afeta a funcionalidade: é a carga exibida hoje na análise do atleta.
Modalidade/ambiente/população: qualquer modalidade com FC média e ficha com repouso/limiar/máx coerentes.
Fonte primária e URL: TrainingPeaks "Training with TSS vs. hrTSS" — https://www.trainingpeaks.com/learn/articles/training-with-tss-vs-hrtss-whats-the-difference/ ; ADR-007 (leitura do Intervals.icu).
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: hrTSS parte do tempo em zonas de FC relativas ao limiar; subestima esforços curtos e intensos (a FC não responde rápido) e serve melhor a trabalho contínuo abaixo do limiar.
Achado confirmado: as limitações batem com o que a ADR-007 já declara.
Limitações e divergências: deriva cardíaca, calor, cafeína e intervalos curtos distorcem; sessões por série de FC (hoje disponíveis via ActivityStream) permitiriam tempo em zona por amostra em vez de média — melhoria possível, não obrigatória.
Decisão de produto: MANTER. Rótulo na tela passa a dizer "carga por FC (hrTSS, método da ADR-007)"; sem somar com TSS por potência. Melhoria por amostra fica como issue filha opcional.
O que continuará sob decisão do professor: interpretar a carga; escolher sRPE em vez de hrTSS (SAM-63).
Critério de aceitação: teste da ADR-007 continua verde; rótulo com método visível.
Responsável pela validação: responsável técnico.
```

## 5. CTL / ATL / TSB (Performance Manager)

```text
Dúvida: exibir forma crônica (CTL, 42 d), aguda (ATL, 7 d) e balanço (TSB = CTL − ATL)?
Por que afeta a funcionalidade: "evolução para o evento" (§17.7) poderia tentar usar TSB como prontidão — exatamente o que o §17.7 proíbe.
Modalidade/ambiente/população: qualquer; o modelo original (Banister/Coggan) foi ajustado em ciclistas com potência.
Fonte primária e URL: Coggan, "The Science of the Performance Manager" — https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: CTL e ATL são médias móveis exponenciais do TSS diário (constantes 42 e 7 dias, ajustáveis); TSB = CTL − ATL; "parte ciência, parte arte"; resposta individual varia; dias sem dado distorcem a CTL; depende de FTP correto.
Achado confirmado: exige série diária contínua de uma carga homogênea (mesmo método) por semanas; qualquer lacuna de sincronização ou mistura de métodos (hrTSS + TSS por potência) invalida a curva.
Limitações e divergências: a Ryvano tem lacunas por design (nada obrigatório, §18.3) e cargas de métodos diferentes; TSB lido como "pronto" viola §17.7/§2.3.
Decisão de produto: NÃO ENTRA (confirma ADR-007). Reavaliar só quando houver (a) carga por um método único declarado por atleta, (b) cobertura de dias documentada, (c) rótulo "não é prontidão" testado. Nenhum "TSB" ou "forma" aparece em tela.
O que continuará sob decisão do professor: periodizar pela leitura do calendário, do relato e dos marcos (SAM-71/76).
Critério de aceitação: busca textual por CTL/ATL/TSB na UI retorna zero.
Responsável pela validação: responsável técnico + produto.
```

## 6. Sweet spot e zonas de potência de Coggan

```text
Dúvida: pré-cadastrar "sweet spot" (≈ 84–94 % do FTP) e os 7 níveis de Coggan como perfil de zonas?
Por que afeta a funcionalidade: perfis de zona do professor (SAM-70) e rótulo "sweet spot" em prescrições de ciclismo (§15.2).
Modalidade/ambiente/população: ciclismo com potência; adultos treinados.
Fonte primária e URL: Allen & Coggan (níveis de potência); resumos públicos consultados (ex.: TrainerRoad "Cycling Power Zones" — https://www.trainerroad.com/blog/cycling-power-zones-training-zones-explained/ ) convergem em 7 níveis (<55, 55–75, 76–90, 91–105, 106–120, 121–150, >150 % FTP); "sweet spot" aparece como 84–94 % ou 88–94 % conforme a fonte.
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: os níveis são % do FTP; "sweet spot" não é um nível de Coggan e sim uma faixa de uso prático com limites divergentes entre fontes.
Achado confirmado: os 7 níveis são estáveis entre fontes; o sweet spot não tem limite único.
Limitações e divergências: 84 vs 88 % como início; depende de FTP com protocolo (§15.6).
Decisão de produto: FICA COMO CONFIGURAÇÃO DO PROFESSOR. O produto não pré-cadastra sweet spot; o professor cria um perfil de 7 zonas (SAM-70 já suporta N zonas) e nomeia a faixa que usa, com método identificado. Nenhum rótulo automático "sweet spot".
O que continuará sob decisão do professor: limites, nome e uso da faixa.
Critério de aceitação: o padrão derivado continua com 5 zonas (ADR escola 005/school.yaml); nenhum perfil vem pronto.
Responsável pela validação: responsável técnico + professor validador de ciclismo.
```

## 7. Limiares derivados (FTP por 20 min, CSS 400/200)

```text
Dúvida: calcular FTP = 95 % da potência média de 20 min e CSS = 200 ÷ (T400 − T200) automaticamente a partir de uma atividade?
Por que afeta a funcionalidade: a avaliação com protocolo (SAM-70) permite registrar o resultado; a dúvida é se a Ryvano deve DERIVAR o valor.
Modalidade/ambiente/população: ciclismo (FTP) e natação em piscina (CSS); adultos treinados.
Fonte primária e URL: FTP: Allen & Coggan (20 min × 0,95); revisão crítica "FTP estimated from a 20-min test is not linked to 1-hour…" — https://knowledgeiswatt.substack.com/p/190-ftp-estimated-from-a-20-min-test ; CSS: Wakayoshi et al. 1992 (CSS = 200 ÷ (T400 − T200)), resumo em https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10875687/
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: FTP por 20 min é uma convenção prática com erro individual relevante (o fator 0,95 não vale para todos); CSS 400/200 é um protocolo definido com condições (mesma piscina, descanso entre os dois esforços).
Achado confirmado: ambos exigem protocolo controlado; derivar de uma atividade qualquer (sem saber se foi um teste) produz limiar inválido.
Limitações e divergências: fator 0,95 contestado; CSS varia com piscina/estilo; relógios não marcam o que foi "teste".
Decisão de produto: NÃO DERIVAR. A Ryvano oferece o cálculo auxiliar NA FICHA DE AVALIAÇÃO (SAM-70) só quando o professor informa os tempos do protocolo (T400/T200 ou 20 min) e nomeia o protocolo; o resultado entra como avaliação com fonte "estimativa" e o professor decide levar à ficha. Issue filha pequena para os dois calculadores.
O que continuará sob decisão do professor: aplicar o protocolo, aceitar o fator, promover à ficha.
Critério de aceitação: nenhuma atividade sincronizada altera FTP/CSS sozinha (AC14).
Responsável pela validação: responsável técnico + professores validadores de ciclismo e natação.
```

## Precisão da análise por blocos (§27.3) — arquivos representativos

| Modalidade / dispositivo | Necessário | Situação em 03/10/2026 |
|---|---|---|
| Corrida, Garmin (voltas automáticas por km + voltas manuais) | FIT real autorizado com séries e lacuna | **Falta** — hoje só fixtures sintéticas (E2E 71) e amostra TCX escrita pela especificação (teste do parser). |
| Natação em piscina 25 m e 25 jd, Garmin/COROS | FIT com `length` e `poolLength` | **Falta** — FIT de teste codificado com o SDK oficial (parser), sem arquivo de relógio real. |
| Águas abertas com GPS inconsistente | FIT/GPX real | **Falta**. |
| Ciclismo com potência e queda de sensor | FIT com `power` e lacuna | **Falta**. |
| Triathlon multiesporte (pernas + cópias) | FIT multiesporte + 3 FIT filhos | **Falta** — coberto por fixture (E2E 74). |

Decisão: a precisão por blocos (SAM-72) está validada com arquivos sintéticos e amostras escritas pela especificação; **a validação com arquivos reais autorizados é condição para divulgar a análise por blocos como "verificada"** (§21.6). Issue filha: coletar 2 arquivos reais por linha da tabela, com autorização escrita dos atletas.
