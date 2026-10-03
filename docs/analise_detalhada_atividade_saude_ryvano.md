# Análise detalhada das telas de atividade, calendário e indicadores de saúde
## Referência visual Garmin Connect → especificação funcional para o Ryvano

**Data de referência das capturas:** 02/10/2026  
**Atleta usado no exemplo:** Samuel Vermeuln  
**Atividade principal analisada:** “Serra Natação em alto mar”  
**Objetivo deste documento:** descrever com profundidade o que existe em cada captura, o significado funcional de cada bloco de informação e como esses dados podem ser reaproveitados na experiência do atleta, do professor independente e da escola dentro do Ryvano.

---

# 1. Visão geral das cinco imagens

As imagens não são telas isoladas. Elas formam um conjunto coerente de dados sobre a mesma rotina esportiva:

1. **Imagem 1 — Detalhe completo da atividade**
   - Identificação da atividade.
   - Resumo com KPIs.
   - Mapa/GPS.
   - Gráficos temporais.
   - Abas `Estatísticas`, `Voltas` e `Tempo em zonas`.
   - Na captura, a aba ativa é **Tempo em zonas**.

2. **Imagem 2 — Aba Estatísticas**
   - Detalha os dados consolidados da mesma atividade.
   - Mostra distância, calorias, hidratação, percepção de esforço, efeito de treino, frequência cardíaca, tempo, ritmo, braçadas, temperatura e impacto no Body Battery.

3. **Imagem 3 — Aba Voltas**
   - Divide a atividade em segmentos/voltas.
   - Permite comparar desempenho entre partes da sessão.
   - Exibe métricas por volta e um resumo final.

4. **Imagem 4 — Calendário mensal**
   - Posiciona atividades executadas no calendário.
   - Permite filtrar categorias.
   - Resume volume mensal.
   - É a referência mais importante para confrontar **treino prescrito x atividade realmente executada**.

5. **Imagem 5 — Indicadores gerais de saúde/recuperação**
   - Frequência cardíaca de repouso.
   - Body Battery.
   - Sono.
   - VFC/HRV.
   - São dados complementares para o professor avaliar contexto fisiológico, recuperação e prontidão.

---

# 2. Relação entre as imagens

As três primeiras imagens devem ser entendidas como partes da **mesma página de atividade**.

A estrutura conceitual é:

```text
Atividade
├── Cabeçalho / Resumo
├── Mapa / Trajeto
├── Gráficos temporais
└── Detalhamento
    ├── Estatísticas
    ├── Voltas
    └── Tempo em zonas
```

Ou seja, `Estatísticas`, `Voltas` e `Tempo em zonas` **não representam três atividades diferentes**. São três perspectivas diferentes sobre a mesma atividade.

No Ryvano, isso é importante porque o professor não deve precisar navegar para três módulos desconectados. Ao abrir uma atividade de um atleta, ele deve conseguir alternar entre essas três visões mantendo o contexto daquela atividade.

---

# 3. Imagem 1 — Detalhe completo da atividade

**Arquivo de referência:** `screencapture-connect-garmin-com-app-activity-24576692124-2026-10-02-09_06_38.png`

## 3.1. Identificação da atividade

No topo aparecem:

- Modalidade: **Natação em alto mar**.
- Atleta: **Samuel Vermeuln**.
- Data relativa: **Hoje**.
- Horário de início: **6:15 AM**.
- Nome da atividade: **Serra Natação em alto mar**.

Também aparecem metadados editáveis ou complementares:

- Evento.
- Tipo de evento.
- Categoria.
- Percurso.
- Equipamento.
- Ação para adicionar equipamento.
- Ícone de edição ao lado do nome da atividade.

### Interpretação funcional

O nome da atividade é uma camada editorial sobre o dado bruto.

Exemplo:

```text
tipo = OPEN_WATER_SWIMMING
nome = Serra Natação em alto mar
```

Isso significa que o sistema deve separar:

- tipo/modalidade da atividade;
- título amigável;
- data/hora;
- atleta;
- origem/importador;
- evento relacionado;
- percurso;
- equipamento.

No Ryvano, esses campos devem permanecer independentes.

---

## 3.2. KPIs principais

Logo abaixo do título aparecem quatro indicadores de alto nível:

| Indicador | Valor |
|---|---:|
| Distância | **672 m** |
| Tempo | **24:37** |
| Ritmo médio | **3:40 /100 m** |
| Calorias | **112** |

Esses quatro dados funcionam como o resumo imediato da atividade.

### Uso esperado no Ryvano

Ao professor abrir uma atividade, esses valores devem ficar visíveis antes de qualquer gráfico.

Para uma atividade de corrida, os KPIs mudariam semanticamente, por exemplo:

- distância;
- duração;
- ritmo médio em min/km;
- calorias.

Para ciclismo:

- distância;
- duração;
- velocidade média;
- calorias.

Para musculação:

- duração;
- volume;
- número de séries;
- carga total ou outro indicador adequado.

Portanto, o cabeçalho deve ser **adaptativo por modalidade**.

---

## 3.3. Mapa e trajeto GPS

A captura mostra um mapa grande com o trajeto no mar.

Elementos observáveis:

- mapa cartográfico;
- área terrestre e marítima;
- linha vermelha representando o percurso;
- marcador verde indicando o início;
- marcador vermelho indicando o fim;
- um ponto preto sobre o trajeto;
- controles de zoom;
- controle de camadas;
- botão de reprodução/visualização temporal;
- escala do mapa;
- indicação climática de aproximadamente **22,8°**;
- existe também um pequeno indicador numérico `7`, mas a captura não mostra legenda suficiente para afirmar sua unidade ou significado.

### Importante

O mapa não é apenas decorativo.

Ele permite responder:

- onde a atividade começou;
- onde terminou;
- qual trajeto foi executado;
- se houve desvio;
- se o atleta retornou pelo mesmo caminho;
- onde ocorreram alterações de ritmo;
- onde houve pausas;
- eventualmente, onde houve alterações de frequência cardíaca ou cadência.

### Requisito de dados

Para reproduzir uma experiência desse tipo, não basta salvar apenas:

```text
distance = 672
duration = 1477 segundos
```

É necessário possuir, quando disponível, uma série GPS:

```text
timestamp
latitude
longitude
altitude
distance_accumulated
speed / pace
heart_rate
cadence / stroke_rate
temperature
```

O timestamp é o elo que permite sincronizar o mapa com os gráficos.

---

# 4. Gráficos temporais da atividade

Abaixo do mapa existe a ação **“Personalizar gráficos”**.

Isso mostra que a visualização é configurável e que as séries devem ser tratadas separadamente.

Também existe um seletor:

- **Tempo**
- **Distância**

Na captura, a visualização está orientada por **tempo**.

Isso significa que o eixo X dos gráficos pode representar:

```text
tempo decorrido
```

ou:

```text
distância acumulada
```

Essa possibilidade é extremamente útil para análise esportiva.

---

## 4.1. Gráfico de ritmo

Cor visual: azul.

Dado principal apresentado:

- **Ritmo médio: 3:40 /100 m**

O gráfico mostra a evolução do ritmo ao longo da atividade.

Há vários intervalos em branco.

Esses intervalos podem representar, dependendo da origem dos dados:

- pausa;
- falta de movimento;
- perda de amostragem;
- intervalo sem valor calculável;
- trecho removido/filtrado.

Não se deve converter automaticamente todo espaço em branco em “pausa” sem validar o dado original.

### Valor para o professor

O ritmo médio sozinho não mostra como o atleta executou o treino.

Com a série temporal, o professor consegue observar:

- constância;
- aceleração;
- desaceleração;
- quebra de ritmo;
- retomada;
- diferença entre início e final;
- possíveis paradas.

---

## 4.2. Gráfico de frequência cardíaca

Cor visual: vermelho.

Dado principal:

- **FC média: 86 bpm**

O gráfico mostra a frequência cardíaca variando ao longo da sessão.

Visualmente, a frequência ficou predominantemente em uma faixa baixa e apresentou alguns pequenos picos.

### Importante

A frequência cardíaca deve ser armazenada como série temporal, não apenas como:

```text
avg_heart_rate
max_heart_rate
```

Isso é necessário para:

- calcular zonas;
- cruzar FC x ritmo;
- identificar deriva cardiovascular;
- identificar picos;
- calcular tempo acima/abaixo de determinada zona;
- comparar partes do treino.

---

## 4.3. Gráfico de braçadas

Cor visual: laranja.

Dado principal:

- **Média: 20 epm**

`epm` representa a taxa de eventos/braçadas por minuto exibida pelo Garmin.

A série mostra momentos de maior e menor frequência de braçadas.

### Uso analítico

Em natação, a combinação entre:

- ritmo;
- taxa de braçadas;
- distância por braçada;
- SWOLF;

permite analisar eficiência.

Por exemplo, aumentar muito a taxa de braçadas sem aumento proporcional de velocidade pode indicar perda de eficiência.

---

## 4.4. Gráfico de temperatura

Cor visual: cinza.

Dado principal:

- **Temperatura média: 22,7 °C**

A linha varia ao longo da atividade.

A captura indica valores aproximadamente entre:

- 21 °C;
- 28 °C.

A aba Estatísticas confirma:

- mínima: **22,0 °C**;
- média: **22,7 °C**;
- máxima: **28,0 °C**.

### Observação

Para natação em alto mar, a temperatura pode ter valor contextual importante.

Deve ser tratada como métrica temporal quando houver dados suficientes.

---

# 5. As três abas da atividade

A primeira imagem contém claramente três abas:

```text
Estatísticas
Voltas
Tempo em zonas
```

Na primeira imagem, a aba selecionada é:

> **Tempo em zonas**

A Imagem 2 mostra a aba:

> **Estatísticas**

A Imagem 3 mostra a aba:

> **Voltas**

Essa relação precisa ser preservada no Ryvano.

---

# 6. Aba “Tempo em zonas”

Na parte inferior da primeira imagem aparece:

## Zonas de frequência cardíaca

A configuração visível é:

| Zona | Faixa | Nome | Tempo | Percentual |
|---|---|---|---:|---:|
| Zona 5 | > 167 bpm | Máximo | 0:00 | 0% |
| Zona 4 | 150–167 bpm | Limite | 0:00 | 0% |
| Zona 3 | 131–149 bpm | Aeróbico | 0:00 | 0% |
| Zona 2 | 112–130 bpm | Fácil | 0:00 | 0% |
| Zona 1 | 94–111 bpm | Aquecimento | **2:20** | **9%** |

Como a frequência cardíaca média foi de **86 bpm**, grande parte do treino ficou abaixo do limite inferior da Zona 1 exibida.

Por isso, o fato de somente 9% aparecer dentro das zonas listadas não é necessariamente erro.

### O sistema deve guardar

As zonas não devem ser salvas apenas como texto.

Estrutura recomendada:

```text
zone_number
zone_name
min_bpm
max_bpm
duration_seconds
percentage
zone_configuration_id
```

Também é importante guardar **qual configuração de zonas estava válida na data da atividade**, porque o professor pode alterar as zonas posteriormente.

---

# 7. Imagem 2 — Aba Estatísticas

**Arquivo de referência:** `Captura de tela 2026-10-02 090825.png`

Essa tela é o detalhamento consolidado da atividade.

Ela está organizada em colunas e grupos semânticos.

---

## 7.1. Distância

- **672 m**

É o volume total percorrido.

---

# 8. Nutrição & hidratação

Dados exibidos:

| Campo | Valor |
|---|---:|
| Calorias em repouso | **36** |
| Calorias ativas | **76** |
| Total de calorias queimadas | **112** |
| Calorias ingeridas | **--** |
| Calorias líquidas | **-112** |
| Perda de suor estimada | **172 ml** |
| Fluido consumido | **-- ml** |
| Fluido líquido | **-172 ml** |

### Relação matemática visível

```text
36 calorias em repouso
+ 76 calorias ativas
= 112 calorias totais
```

Como não há calorias ingeridas registradas:

```text
calorias líquidas = -112
```

Como não há fluido consumido registrado:

```text
fluido líquido = -172 ml
```

### Requisito funcional

O sistema deve diferenciar:

- dado medido;
- dado estimado;
- dado informado manualmente;
- dado ausente.

`--` não deve virar `0`.

Ausência de informação e valor zero são semanticamente diferentes.

---

# 9. Autoavaliação

A tela mostra:

### Como você se sentiu?

- **Normal**

### Esforço percebido

- **1/10 — Muito leve**

Isso é extremamente relevante para o professor porque adiciona uma camada subjetiva aos dados objetivos.

Uma atividade pode ter:

- FC alta, mas percepção leve;
- ritmo baixo, mas percepção muito pesada;
- carga baixa, mas sensação ruim.

Essas divergências são informação de treinamento.

### Modelo de dados sugerido

```text
feeling
perceived_exertion_score
athlete_comment
evaluated_at
```

---

# 10. Efeito de treino

Valores:

### Aeróbico
- **0.3**
- classificação: **Nenhum benefício**

### Anaeróbico
- **0.0**
- classificação: **Nenhum benefício**

### Carga de exercício
- **3**

Esses indicadores representam interpretação calculada da sessão.

No Ryvano, é importante separar:

```text
valor bruto
classificação textual
origem do cálculo
```

Exemplo:

```text
aerobic_effect_value = 0.3
aerobic_effect_label = "Nenhum benefício"
source = "Garmin"
```

Isso evita que a plataforma tente reproduzir cálculos proprietários sem ter a mesma metodologia.

---

# 11. Frequência cardíaca consolidada

Dados:

- **FC média: 86 bpm**
- **FC máxima: 102 bpm**

A interface também mostra opções conceituais:

- bpm;
- % máx.;
- zonas.

Isso indica três formas diferentes de enxergar o mesmo dado:

1. valor absoluto;
2. percentual da FC máxima;
3. distribuição por zonas.

---

# 12. Cronometragem

A captura diferencia três conceitos fundamentais:

| Métrica | Valor |
|---|---:|
| Tempo | **24:37** |
| Tempo em movimento | **18:15** |
| Tempo transcorrido | **40:27** |

Esses campos não são equivalentes.

### Tempo

É a duração registrada considerada pela atividade.

### Tempo em movimento

É o tempo em que houve movimento detectável ou válido.

### Tempo transcorrido

É o intervalo total entre início e fim, incluindo períodos parados.

### Consequência

Para análises de treino, não deve existir um único campo genérico `duration`.

O ideal é manter ao menos:

```text
timer_time
moving_time
elapsed_time
```

---

# 13. Ritmo / velocidade

A tela possui um seletor:

```text
Ritmo | Velocidade
```

No modo capturado, `Ritmo` está selecionado.

Valores:

- **Ritmo médio: 3:40 /100 m**
- **Ritmo médio em movimento: 2:43 /100 m**

Isso reforça a diferença entre média considerando a sessão total e média considerando apenas movimento.

---

# 14. Braçadas

Dados exibidos:

| Campo | Valor |
|---|---:|
| Total de braçadas | **479** |
| Taxa média de braçadas | **20 epm** |
| Taxa máxima de braçadas | **40 epm** |
| Distância média por braçada | **1,40 m** |
| Média de SWOLF | **73** |

### Distância média por braçada

Ajuda a medir eficiência mecânica.

### Taxa de braçadas

Indica a frequência do movimento.

### SWOLF

É uma métrica de eficiência usada em natação.

O professor deve conseguir comparar esses indicadores ao longo do tempo, principalmente:

- treino a treino;
- piscina x alto mar;
- mesmo atleta em diferentes ritmos;
- períodos antes/depois de intervenção técnica.

---

# 15. Temperatura

Valores:

- **Média: 22,7 °C**
- **Mínima: 22,0 °C**
- **Máxima: 28,0 °C**

É um bom exemplo de uma métrica que possui:

```text
min
avg
max
```

e também pode possuir uma série temporal completa.

---

# 16. Body Battery da atividade

Na parte inferior aparece:

- **Impacto líquido: -4**

Esse dado relaciona a atividade ao estado energético calculado pelo ecossistema Garmin.

No Ryvano, se a origem da integração fornecer esse valor, ele pode ser mostrado como dado importado.

Não se deve recalcular ou imitar o algoritmo proprietário sem uma metodologia própria bem definida.

---

# 17. Imagem 3 — Aba Voltas

**Arquivo de referência:** `Captura de tela 2026-10-02 090813.png`

A aba ativa é:

> **Voltas**

A tela apresenta uma tabela horizontal detalhada.

---

# 18. Colunas visíveis da tabela de voltas

As colunas legíveis são:

- Voltas;
- Tempo;
- Tempo acumulado;
- Distância;
- Ritmo médio;
- FC média;
- FC máxima;
- Distância média por braçada;
- Cadência média de nado;
- Calorias;
- Temperatura média;
- existe pelo menos mais uma coluna começando por `Tempo em ...`, parcialmente cortada na captura.

Como a última coluna está truncada, não é correto afirmar seu nome completo sem outra evidência.

---

# 19. Volta 1

Dados:

| Campo | Valor |
|---|---:|
| Volta | **1** |
| Tempo | **17:56** |
| Tempo acumulado | **17:56** |
| Distância | **500 m** |
| Ritmo médio | **3:35 /100 m** |
| FC média | **88 bpm** |
| FC máxima | **102 bpm** |
| Distância média por braçada | **1,47 m** |
| Cadência média de nado | **20** |
| Calorias | **86** |
| Temperatura média | **23,0 °C** |

---

# 20. Volta 2

Dados:

| Campo | Valor |
|---|---:|
| Volta | **2** |
| Tempo | **6:40.7** |
| Tempo acumulado | **24:37** |
| Distância | **172 m** |
| Ritmo médio | **3:53 /100 m** |
| FC média | **83 bpm** |
| FC máxima | **98 bpm** |
| Distância média por braçada | **1,23 m** |
| Cadência média de nado | **21** |
| Calorias | **26** |
| Temperatura média | **22,0 °C** |

---

# 21. Linha Resumo

A última linha agrega a atividade:

| Campo | Valor |
|---|---:|
| Tempo | **24:37** |
| Tempo acumulado | **24:37** |
| Distância | **672 m** |
| Ritmo médio | **3:40 /100 m** |
| FC média | **86 bpm** |
| FC máxima | **102 bpm** |
| Distância média por braçada | **1,40 m** |
| Cadência média | **20** |
| Calorias | **112** |
| Temperatura média | **22,7 °C** |

---

# 22. O que as voltas revelam que o resumo não mostra

A Volta 1 foi:

- mais longa;
- mais rápida;
- com FC média ligeiramente maior;
- com maior distância por braçada.

A Volta 2 teve:

- ritmo mais lento;
- FC média menor;
- menor distância por braçada;
- cadência ligeiramente maior.

Isso é um exemplo perfeito de como o desempenho pode mudar dentro do mesmo treino.

Só olhar:

```text
ritmo médio = 3:40/100 m
```

esconde essa variação.

Para o professor, a tabela de voltas é essencial para identificar:

- perda de eficiência;
- fadiga;
- alteração de técnica;
- pacing;
- comportamento após uma pausa;
- diferença entre blocos.

---

# 23. Estrutura recomendada para voltas

```text
ActivityLap
- id
- activity_id
- lap_number
- start_time
- end_time
- duration
- accumulated_duration
- distance
- avg_pace
- avg_speed
- avg_heart_rate
- max_heart_rate
- avg_stroke_distance
- avg_stroke_rate
- max_stroke_rate
- calories
- avg_temperature
- moving_time
- source
```

Não é obrigatório que todas as modalidades preencham todos os campos.

A estrutura deve aceitar valores nulos.

---

# 24. Imagem 4 — Calendário mensal

**Arquivo de referência:** `Captura de tela 2026-10-02 085545.png`

A tela apresenta o calendário de:

> **Outubro 2026**

O modo ativo é:

> **Mês**

Também existem:

- Semana;
- Mês;
- Ano.

Há um botão `Hoje`, navegação por mês e menu adicional.

---

# 25. Filtros do calendário

O painel à esquerda mostra:

## Calendário

Itens marcados:

- Eventos;
- Objetivos;
- Exercícios;
- Viagens.

## Atividades

Marcado:

- Natação.

## Registros de saúde

Não marcado na captura:

- Resumo de saúde.

## Planos de treinamento

Existe a ação:

- `Adicionar um plano de treino`.

A badge `5` em “Filtrar por categoria” é compatível visualmente com os cinco itens ativos apresentados na captura.

---

# 26. Atividades visíveis no calendário

### Segunda-feira, 28/09

- **Natação em piscina**
- **1.025 m**
- **0:24:26**

Essa data é do mês anterior, mas aparece na primeira semana da grade de outubro.

### Quinta-feira, 01/10

- **Natação em piscina**
- **850 m**
- **0:22:03**

### Sexta-feira, 02/10

- **Serra Natação em alto mar**
- **672 m**
- **0:24:37**

O dia 02 está visualmente destacado.

---

# 27. Totais do mês

Na barra inferior aparecem:

| Indicador | Valor |
|---|---:|
| Atividades | **2** |
| Distância | **1,52 km** |
| Tempo | **0:46:40** |
| Calorias | **348** |

Os totais correspondem ao período de outubro visível, e não incluem necessariamente a atividade de 28/09.

A soma de distância das atividades de 01/10 e 02/10 confirma aproximadamente:

```text
850 m + 672 m = 1.522 m ≈ 1,52 km
```

A soma de duração também fecha:

```text
22:03 + 24:37 = 46:40
```

Isso mostra que o calendário agrega dados, não apenas posiciona eventos.

---

# 28. Área de objetivos

Abaixo do calendário existe:

- seção `Objetivos`;
- ação `Adicionar um objetivo`.

Isso mostra que o calendário pode misturar:

- atividades executadas;
- eventos;
- metas;
- exercícios;
- planos.

No Ryvano, é melhor diferenciar visualmente cada tipo.

---

# 29. Ponto crítico para o Ryvano: prescrito x executado

Essa imagem é a principal referência para o comportamento descrito no produto.

Exemplo:

```text
Professor prescreveu:
02/10/2026 — Bike

Atleta realmente executou:
02/10/2026 — Natação em alto mar
```

O sistema precisa mostrar os dois fatos.

Não se deve substituir automaticamente o treino prescrito pela atividade executada.

A estrutura deve permitir:

```text
Treino planejado
Treino executado
Vínculo entre os dois
Status da correspondência
```

Status possíveis:

```text
PLANEJADO_NAO_EXECUTADO
EXECUTADO_CONFORME_PLANEJADO
EXECUTADO_PARCIALMENTE
EXECUTADO_DIFERENTE_DO_PLANEJADO
ATIVIDADE_NAO_PLANEJADA
```

---

# 30. Como uma atividade não planejada deve aparecer

Se Samuel fizer uma atividade que não estava prescrita, o professor deve perceber isso sem abrir cada treino manualmente.

Exemplo de card no calendário:

```text
02/10
Natação em alto mar
672 m · 24:37

[Não planejado]
```

Se havia Bike prescrita no mesmo dia:

```text
Planejado
Bike · 60 min
[Não executado]

Executado
Natação em alto mar · 672 m · 24:37
[Atividade diferente do planejado]
```

Isso evita uma associação falsa.

---

# 31. Imagem 5 — Indicadores de saúde e recuperação

**Arquivo de referência:** `Captura de tela 2026-10-02 085441.png`

A captura apresenta quatro cards.

Eles não são métricas da atividade isolada. São indicadores do estado geral do atleta.

---

# 32. Card “Frequência cardíaca”

Valores:

- **52 bpm — média de repouso de 7 dias**
- **50 bpm — repouso**

A parte inferior mostra:

- gráfico das **últimas 4 horas**.

O gráfico apresenta uma linha de tendência e um aumento no trecho final.

### Separação conceitual

Não confundir:

```text
FC média durante treino = 86 bpm
```

com:

```text
FC de repouso = 50 bpm
média de repouso em 7 dias = 52 bpm
```

São contextos completamente diferentes.

---

# 33. Card “Body Battery”

Valor principal:

- **80**

Detalhamento:

- **+64 carregada**
- **-2 esgotada**

Há um gráfico circular mostrando o nível atual.

### Uso para o professor

Pode ser uma sinalização contextual de recuperação.

Exemplo:

- atividade intensa;
- sono ruim;
- Body Battery baixo;
- VFC fora do padrão.

A combinação pode ser mais importante do que qualquer métrica isolada.

---

# 34. Card “Sleep Score”

Valor:

- **79**

Duração:

- **6 h 27 min**

Janela visual:

- início aproximadamente **11:06 PM**
- fim aproximadamente **5:36 AM**

Abaixo existe uma representação em barras de diferentes fases/períodos do sono.

### Dados conceituais possíveis

```text
sleep_score
sleep_start
sleep_end
sleep_duration
deep_sleep
light_sleep
rem_sleep
awake_time
```

A captura não fornece valores numéricos para todas as fases, portanto não devem ser inventados.

---

# 35. Card “Status de VFC”

VFC = variabilidade da frequência cardíaca.

Estado:

- **Equilibrado**

Valor:

- **63 ms — média de 7 dias**

A interface mostra:

- barra de referência;
- posição do valor atual;
- gráfico das **últimas 4 semanas**.

### Importante

A VFC não deve ser tratada como “quanto maior, melhor” de forma absoluta.

O mais importante normalmente é o comportamento do atleta em relação ao próprio histórico e à faixa de referência fornecida pela origem dos dados.

---

# 36. Como os cinco conjuntos de dados se conectam

O professor não deveria enxergar os dados em cinco módulos desconectados.

A visão ideal é:

```text
ATLETA
│
├── Estado atual
│   ├── FC de repouso
│   ├── Sono
│   ├── VFC
│   └── Body Battery
│
├── Calendário
│   ├── Treinos prescritos
│   └── Atividades realizadas
│
└── Atividades
    ├── Resumo
    ├── Mapa
    ├── Séries temporais
    ├── Estatísticas
    ├── Voltas
    └── Zonas
```

---

# 37. Aplicação no fluxo do atleta

Rota de referência mencionada para o produto:

```text
/app/atividades
```

O atleta deve conseguir:

- ver atividades importadas;
- distinguir a origem da atividade;
- abrir uma atividade;
- ver resumo;
- ver mapa;
- ver gráficos;
- ver Estatísticas;
- ver Voltas;
- ver Tempo em zonas;
- ver percepção de esforço;
- eventualmente complementar dados manuais;
- visualizar se a atividade estava ou não relacionada a um treino prescrito.

---

# 38. Aplicação no professor independente

Na área:

```text
/professor/independente/...
```

a sidebar deve possuir pelo menos:

- **Meus atletas**
- **Calendário**

## Meus atletas

Deve listar os atletas acompanhados pelo professor.

Cada card pode trazer resumo como:

```text
Nome
Última atividade
Atividade hoje?
Treino prescrito hoje?
Status prescrito x realizado
Carga recente
Alertas/contexto
```

## Calendário

O professor deve conseguir enxergar:

- atividades planejadas;
- atividades executadas;
- atividades não planejadas;
- ausência de execução;
- divergência entre prescrição e execução.

---

# 39. Aplicação na escola

A escola precisa ter o mesmo domínio de dados, porém dentro do contexto organizacional.

A diferença principal não deve estar nos dados esportivos e sim em:

- escopo de acesso;
- atletas pertencentes à escola;
- professores vinculados;
- permissões;
- visibilidade.

Exemplo:

```text
Escola
└── Professor Carlos Mendes
    └── Samuel
        ├── Calendário
        ├── Atividades
        ├── Métricas
        └── Histórico
```

O professor independente e o professor vinculado a uma escola devem enxergar a mesma qualidade de informação esportiva quando possuem permissão sobre o atleta.

---

# 40. Visão que o professor deve ter ao abrir uma atividade

Uma atividade deveria abrir em algo equivalente a:

```text
Samuel
02/10/2026 · Natação em alto mar

672 m
24:37
3:40/100 m
112 kcal

Status:
[Não planejada]

Mapa

Gráficos:
- Ritmo
- Frequência cardíaca
- Braçadas
- Temperatura

Abas:
[Estatísticas] [Voltas] [Tempo em zonas]
```

O professor não precisa entrar na conta do atleta.

A visão é uma representação compartilhada do mesmo registro de atividade.

---

# 41. Dados mínimos recomendados para uma atividade

## Identificação

```text
id
athlete_id
source
source_activity_id
sport_type
sub_sport_type
title
started_at
timezone
```

## Tempo

```text
timer_time
moving_time
elapsed_time
```

## Volume

```text
distance
calories_total
calories_active
calories_resting
```

## Intensidade

```text
avg_heart_rate
max_heart_rate
avg_pace
avg_speed
training_load
aerobic_effect
anaerobic_effect
```

## Natação

```text
total_strokes
avg_stroke_rate
max_stroke_rate
avg_distance_per_stroke
avg_swolf
```

## Ambiente

```text
avg_temperature
min_temperature
max_temperature
```

## Percepção

```text
feeling
perceived_exertion
athlete_notes
```

## Hidratação

```text
estimated_sweat_loss
fluid_consumed
net_fluid
```

## GPS

```text
route_polyline
start_latitude
start_longitude
end_latitude
end_longitude
```

---

# 42. Séries temporais necessárias

Para permitir gráficos como os da Imagem 1:

```text
ActivitySample
- activity_id
- timestamp
- elapsed_seconds
- distance
- latitude
- longitude
- altitude
- heart_rate
- pace
- speed
- stroke_rate
- cadence
- temperature
```

Nem todas as atividades terão todos os campos.

A estrutura deve aceitar dados esparsos.

---

# 43. Dados de zonas

```text
ActivityZone
- activity_id
- zone_type
- zone_number
- label
- lower_bound
- upper_bound
- duration_seconds
- percentage
```

`zone_type` pode futuramente permitir:

```text
HEART_RATE
PACE
POWER
```

---

# 44. Dados de saúde geral do atleta

Esses dados devem ficar separados da atividade.

Exemplo:

```text
AthleteDailyHealth
- athlete_id
- date
- resting_heart_rate
- resting_heart_rate_7d_avg
- body_battery
- body_battery_charged
- body_battery_drained
- sleep_score
- sleep_duration
- hrv_status
- hrv_7d_avg
```

Isso evita gravar dados diários como se pertencessem a uma atividade específica.

---

# 45. Relação com prescrição

Modelo conceitual:

```text
WorkoutPrescription
    ↓
ActivityMatch
    ↓
ImportedActivity
```

O vínculo deve permitir:

```text
prescription_id
activity_id
match_status
match_score
matched_by
matched_at
```

O sistema pode sugerir correspondência, mas o professor deve conseguir confirmar ou corrigir.

---

# 46. Regra para atividade não prescrita

Quando uma atividade chega do Strava, Garmin ou outra origem:

1. importar a atividade;
2. identificar atleta;
3. verificar treinos prescritos próximos à data/hora;
4. comparar modalidade;
5. comparar duração/distância;
6. não encontrar correspondência suficiente;
7. marcar como:

```text
ATIVIDADE_NAO_PLANEJADA
```

8. mostrar automaticamente no calendário;
9. mostrar em `/app/atividades`;
10. mostrar na visão do professor;
11. refletir nos gráficos e histórico do atleta.

---

# 47. Exemplo baseado no cenário de Samuel

## Planejamento

```text
02/10/2026
Treino prescrito: Bike
Professor: Carlos Mendes
```

## Execução encontrada

```text
02/10/2026 06:15
Natação em alto mar
672 m
24:37
3:40/100 m
112 kcal
```

## Resultado

```text
Bike:
PLANEJADO_NAO_EXECUTADO

Natação:
ATIVIDADE_NAO_PLANEJADA
```

Isso é melhor do que forçar a natação a “cumprir” o treino de bike.

---

# 48. Informações prioritárias para os gráficos do professor

## Evolução por atividade

- distância;
- duração;
- ritmo;
- FC média;
- FC máxima;
- carga;
- percepção de esforço.

## Natação

- ritmo /100 m;
- braçadas/min;
- distância por braçada;
- SWOLF;
- FC;
- distância.

## Recuperação

- FC repouso;
- sono;
- VFC;
- Body Battery.

## Aderência

- planejado x executado;
- atividade correta x diferente;
- volume planejado x volume realizado;
- frequência semanal.

---

# 49. Requisitos de interface derivados das capturas

## Atividade

- resumo sempre visível;
- mapa quando houver GPS;
- gráficos empilhados e sincronizados;
- alternância Tempo/Distância;
- personalização dos gráficos;
- três abas principais:
  - Estatísticas;
  - Voltas;
  - Tempo em zonas.

## Calendário

- Semana/Mês/Ano;
- filtros;
- diferenciação visual entre prescrito e executado;
- indicador de atividade não planejada;
- total do período;
- clique em atividade abre detalhe.

## Professor

- Meus atletas na sidebar;
- Calendário na sidebar;
- card dos atletas;
- acesso ao histórico;
- acesso às mesmas informações técnicas da atividade do atleta.

---

# 50. Pontos que não devem ser simplificados demais

## 50.1. Não usar somente “duração”

Existem:

- tempo;
- tempo em movimento;
- tempo transcorrido.

## 50.2. Não usar somente “ritmo médio”

É necessário também:

- série temporal;
- ritmo em movimento;
- ritmo por volta.

## 50.3. Não usar somente “FC média”

Também existem:

- FC máxima;
- série temporal;
- zonas;
- FC de repouso;
- média de repouso.

## 50.4. Não tratar ausência como zero

Exemplo:

```text
fluido consumido = --
```

não significa:

```text
fluido consumido = 0
```

## 50.5. Não misturar atividade com saúde diária

Sono, VFC e Body Battery não são métricas específicas daquela natação.

## 50.6. Não substituir prescrição por execução

Um treino planejado de Bike e uma natação executada no mesmo dia são dois registros distintos.

---

# 51. Pontos de atenção da captura

Algumas informações não podem ser determinadas com segurança apenas pelas imagens:

1. O pequeno indicador `7` ao lado da temperatura no mapa não possui legenda visível suficiente.
2. A última coluna da tabela de voltas aparece cortada como `Tempo em ...`.
3. Os gráficos possuem lacunas, mas a captura sozinha não permite afirmar se cada lacuna é pausa, ausência de sensor ou outra condição.
4. Os valores proprietários de Garmin como Body Battery, Training Effect e algumas classificações devem ser tratados como dados importados, não como fórmulas conhecidas.
5. As fases do sono aparecem visualmente, mas a imagem não mostra valores numéricos suficientes para quantificar cada fase.

Esses pontos devem permanecer como `não determinado` em vez de serem inventados.

---

# 52. Critérios de aceite sugeridos para o Ryvano

- [ ] Uma atividade importada aparece em `/app/atividades`.
- [ ] A mesma atividade fica acessível ao professor autorizado.
- [ ] A escola autorizada consegue acessar a atividade dentro do contexto do atleta.
- [ ] A atividade mostra resumo.
- [ ] Mostra mapa quando houver GPS.
- [ ] Mostra gráficos temporais.
- [ ] Possui aba Estatísticas.
- [ ] Possui aba Voltas.
- [ ] Possui aba Tempo em zonas.
- [ ] Dados inexistentes aparecem como ausência, não como zero.
- [ ] Atividade não prescrita é marcada explicitamente.
- [ ] Treino prescrito não é sobrescrito por atividade diferente.
- [ ] Calendário mostra planejado e executado.
- [ ] Calendário permite abrir a atividade executada.
- [ ] Professor independente possui `Meus atletas`.
- [ ] Professor independente possui `Calendário`.
- [ ] Dados de saúde geral ficam separados dos dados da atividade.
- [ ] As permissões respeitam professor, escola e atleta.
- [ ] Importações repetidas não duplicam a mesma atividade.
- [ ] Os gráficos podem usar os samples temporais importados.
- [ ] As voltas permanecem vinculadas à atividade original.

---

# 53. Conclusão funcional

O conjunto de imagens mostra que uma “atividade” esportiva não deve ser modelada no Ryvano apenas como:

```text
tipo
data
distância
tempo
```

Ela é um objeto rico composto por:

```text
identificação
resumo
trajeto
séries temporais
estatísticas consolidadas
voltas
zonas
percepção do atleta
contexto ambiental
origem dos dados
relação com prescrição
```

Além disso, a análise do professor precisa combinar três camadas:

```text
1. O que foi planejado
2. O que o atleta realmente fez
3. Em que condição fisiológica o atleta estava
```

As cinco imagens, em conjunto, fornecem referência para essas três camadas.

Para o caso de Samuel em 02/10/2026, a atividade `Serra Natação em alto mar` deve existir como registro real de execução, independentemente de ter sido prescrita. Ela deve aparecer automaticamente para o atleta, para o professor autorizado e, quando aplicável, para a escola, mantendo íntegros os dados técnicos da atividade e deixando explícita sua relação — ou ausência de relação — com o treino planejado.
