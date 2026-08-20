# RYANO — Plano de Melhoria da Landing Page

## Objetivo

Aplicar uma melhoria completa e incremental na landing page atual do RYANO, preservando a identidade visual existente, mas elevando a página de uma aparência de protótipo/conceito para uma experiência de produto esportivo real, confiável, clara e orientada à conversão.

O trabalho deve melhorar:

- textos e microcopy;
- hierarquia visual;
- clareza da proposta de valor;
- cores e uso semântico das modalidades;
- ícones e SVGs;
- imagens e elementos esportivos;
- gráficos;
- interações;
- demonstração do produto;
- responsividade;
- acessibilidade;
- SEO;
- estados vazios/loading;
- consistência visual e semântica.

A implementação deve ser feita sobre o projeto existente.

**NÃO redesenhar tudo do zero.**

---

# 1. Regra obrigatória: investigar antes de alterar

Antes de escrever qualquer código:

1. Identificar a estrutura atual da landing.
2. Identificar os componentes reutilizáveis.
3. Identificar o design system existente.
4. Identificar os tokens de cor atuais.
5. Identificar as animações existentes.
6. Identificar a biblioteca de ícones.
7. Identificar a biblioteca de gráficos, se houver.
8. Identificar helpers de formatação já existentes.
9. Identificar componentes de botão, card, badge, tabs, carousel e tooltip.
10. Identificar código duplicado.
11. Identificar textos que são claramente linguagem interna de design/produto e que não deveriam estar visíveis ao usuário.
12. Identificar se os dados apresentados na landing são reais, mockados ou apenas demonstrativos.

Não criar um novo componente se já existir um equivalente reutilizável.

Não substituir uma biblioteca funcionando sem justificativa técnica.

---

# 2. Problema atual da landing

A landing possui uma base visual interessante, com:

- fundo azul-petróleo;
- glassmorphism;
- gradientes;
- mock visual do WhatsApp;
- cores diferentes por modalidade;
- carrossel de atletas;
- cards de modalidades;
- gráficos demonstrativos.

Porém, vários textos e visualizações ainda passam sensação de protótipo ou apresentação interna.

Exemplos que NÃO devem continuar visíveis ao usuário:

- "Hero visual esportivo"
- "Simulação visual de atletas"
- "Prova de intenção de produto"
- "Visual Premium"
- "leitura do perfil"
- "eixo Y · carga"
- "eixo X · tendência"
- textos explicando que o "carrossel troca sozinho"

Essas frases descrevem o design ou a implementação.

O usuário final precisa ver benefícios e informações esportivas.

---

# 3. Posicionamento do produto

A landing deve comunicar rapidamente:

> O RYANO transforma os dados do treino em uma leitura simples, visual e útil, entregue direto no WhatsApp.

O visitante precisa entender em poucos segundos:

1. o que o produto faz;
2. para quem ele serve;
3. quais esportes suporta;
4. que tipo de informação recebe;
5. onde recebe;
6. por que isso é melhor do que abrir relatórios complexos;
7. como começar.

---

# 4. Novo HERO

## Badge

Substituir:

> O treino termina. A leitura começa no WhatsApp.

por:

> Terminou o treino? Seu resumo já está no WhatsApp.

Se ficar visualmente longo, usar:

> Seu pós-treino, direto no WhatsApp.

---

## Headline principal

Substituir:

> Pós-treino com cara de app.  
> Sem relatório cansativo.

por:

> Entenda seu treino em segundos.

Complemento:

> Seus dados esportivos, direto no WhatsApp.

A hierarquia visual deve deixar "Entenda seu treino em segundos." como mensagem principal.

---

## Descrição

Usar:

> Conecte seus treinos e receba distância, ritmo, frequência cardíaca, evolução e os principais destaques logo após cada atividade.

Se necessário, complementar:

> Para corrida, ciclismo, natação e triathlon.

Evitar:

- "mensagem bonita";
- "visual premium";
- "menos texto inútil";
- linguagem subjetiva sem explicar valor.

---

# 5. CTAs

Padronizar toda a landing.

## CTA principal

Preferência:

> Criar minha conta

Se o produto realmente tiver plano gratuito:

> Começar grátis

Não utilizar "grátis" se isso não for verdade.

---

## CTA secundário

> Ver exemplo

ou:

> Ver um relatório real

Se o conteúdo for apenas demonstrativo/mock:

> Ver exemplo de relatório

Não chamar de "real" se os dados forem fictícios.

---

# 6. Cards abaixo do Hero

Atualmente existem conceitos como:

- Canal / WhatsApp
- Visual / Premium
- Leitura / Rápida

Substituir por benefícios claros.

## Card 1

**Automático**

> O treino terminou, o relatório chega.

Ícone sugerido:

- bolt;
- activity;
- zap.

---

## Card 2

**Fácil de entender**

> As métricas importantes ficam em destaque.

Ícone sugerido:

- chart;
- eye;
- gauge.

---

## Card 3

**No WhatsApp**

> Sem precisar abrir outro aplicativo.

Ícone:

- usar ícone adequado de mensagem/chat;
- evitar copiar marca oficial do WhatsApp de forma incorreta;
- se usar logo oficial, respeitar guidelines da marca.

---

# 7. Navegação

Substituir:

- Como funciona
- Visual
- Segurança

por:

- Como funciona
- Veja na prática
- Modalidades
- Segurança

Se precisar reduzir:

- Como funciona
- Modalidades
- Segurança

O item "Visual" não é orientado ao usuário.

---

# 8. Seção "Como funciona"

Título:

> Como funciona

Headline:

> Do treino ao resumo em poucos segundos.

ou:

> Treine normalmente. O RYANO cuida do resto.

---

## Etapa 01

### Conecte seus treinos

> Crie sua conta e conecte sua fonte de atividades.

Se atualmente só Garmin estiver disponível, pode utilizar:

> Conecte seu Garmin.

Mas estruturar o código para múltiplas integrações futuras.

---

## Etapa 02

### Treine normalmente

> Corra, pedale ou nade sem mudar sua rotina.

---

## Etapa 03

### Receba sua análise

> Assim que a atividade sincronizar, seu resumo chega no WhatsApp.

---

# 9. Transformar a área visual em Demo Interativa

A seção atual deve deixar de parecer uma "simulação de design".

## Novo título

> Veja seus treinos de um jeito mais claro

## Subtítulo

> Corrida, ciclismo ou natação: cada modalidade destaca as métricas que realmente importam.

---

# 10. Modalidades interativas

Criar tabs/chips clicáveis:

- Natação
- Ciclismo
- Corrida
- Triathlon

Usar `SportIcon`.

Exemplo:

```tsx
<SportIcon sport="swimming" />
<SportIcon sport="cycling" />
<SportIcon sport="running" />
<SportIcon sport="triathlon" />
```

Ao trocar modalidade, atualizar de forma sincronizada:

- cor da seção;
- ícone;
- atleta demonstrativo;
- métricas;
- gráfico;
- texto de destaque;
- mock do WhatsApp.

Não deixar modalidades desabilitadas apenas porque o perfil atual representa uma modalidade.

A landing é uma demonstração do produto.

---

# 11. Cores semânticas por modalidade

Usar os tokens já definidos ou centralizar em tokens equivalentes.

## Natação

Light:

```text
#0284C7
```

Dark:

```text
#38BDF8
```

---

## Ciclismo

Light:

```text
#16A34A
```

Dark:

```text
#4ADE80
```

---

## Corrida

Light:

```text
#EA580C
```

Dark:

```text
#FB923C
```

---

## Triathlon

Light:

```text
#7C3AED
```

Dark:

```text
#A78BFA
```

---

## Multisport

Light:

```text
#4F46E5
```

Dark:

```text
#818CF8
```

---

# 12. Cor da marca versus cor das modalidades

A marca RYANO pode continuar com:

- azul petróleo;
- cyan;
- aqua;
- teal escuro.

Evitar usar verde puro como principal identificador da marca porque verde já representa ciclismo.

Separar:

- **Brand** → aqua/cyan/teal;
- **Swimming** → azul;
- **Cycling** → verde;
- **Running** → laranja;
- **Triathlon** → violeta.

---

# 13. Uso do glassmorphism

Hoje há excesso de cards glass.

Não remover completamente.

Reduzir o uso para criar hierarquia.

## Usar glass principalmente em:

- header;
- CTA especial;
- mock principal;
- elementos flutuantes;
- overlays;
- modal ou destaque contextual.

## Cards de conteúdo

Preferir superfícies mais sólidas e discretas.

Criar três níveis:

### Background

Azul petróleo escuro.

### Surface

Card um pouco mais claro e quase sólido.

### Glass

Somente componentes de maior destaque.

Se tudo for glass, nada se destaca.

---

# 14. Sistema de ícones

## Fonte principal

Iconify.

Pacote esperado:

```bash
npm install @iconify/react
```

---

## Fonte secundária

Tabler Icons para interface geral.

```bash
npm install @tabler/icons-react
```

Usar principalmente para:

- calendário;
- configurações;
- filtro;
- usuário;
- seta;
- gráfico;
- relógio;
- mapa;
- navegação.

---

# 15. Regra de SportIcon

Nenhuma página deve escolher diretamente um SVG esportivo.

Centralizar em:

```text
components/icons/SportIcon.tsx
```

Uso:

```tsx
<SportIcon sport="swimming" />
<SportIcon sport="cycling" />
<SportIcon sport="running" />
<SportIcon sport="triathlon" />
```

---

# 16. SVG

SVG reutilizável deve usar:

```svg
fill="currentColor"
```

ou:

```svg
stroke="currentColor"
```

Não fixar:

```svg
fill="#0284C7"
```

A cor deve vir do componente ou token.

---

# 17. Mistura de ícones

Na interface do produto:

- evitar misturar emoji e SVG;
- evitar vários estilos de ícone;
- manter espessura visual consistente.

Emoji pode permanecer no mock de conversa/WhatsApp quando fizer sentido contextual.

Exemplo aceitável dentro da mensagem:

> 🏊 Natação concluída

Na interface RYANO, usar `SportIcon`.

---

# 18. Perfis demonstrativos

O perfil atual deve mostrar dados esportivos, não frases de design.

Remover:

- "leitura do perfil";
- "uma atleta de modalidade única com leitura visual mais calma e objetiva";
- tags genéricas como "base", "controle", "fluidez" se não forem dados reais.

---

# 19. Exemplo de perfil — Natação

## Elisa Santos

> Natação · Hoje, 06:42

Métricas:

**2.100 m**  
Distância

**39:12**  
Tempo

**1:52 /100 m**  
Ritmo médio

**142 bpm**  
FC média

Caso algum dado não exista, não inventar.

---

## Destaque do treino

Pode mostrar:

> Ritmo mais constante nos últimos 800 m.

Ou:

> Últimos 800 m foram 4 s/100 m mais rápidos que a primeira metade.

Mas somente se a informação puder ser calculada a partir dos dados.

Não gerar insight falso.

---

# 20. Métricas por modalidade

## Corrida

Priorizar:

- distância;
- duração;
- ritmo médio;
- frequência cardíaca média;
- frequência cardíaca máxima;
- cadência;
- ganho de elevação.

---

## Ciclismo

Priorizar:

- distância;
- duração;
- velocidade média;
- frequência cardíaca;
- cadência;
- potência;
- ganho de elevação.

Potência somente quando disponível.

---

## Natação

Priorizar:

- distância;
- duração;
- ritmo /100 m;
- SWOLF;
- frequência cardíaca;
- piscinas/voltas.

---

## Triathlon

Priorizar:

- tempo total;
- swim;
- T1;
- bike;
- T2;
- run.

Se transições não existirem nos dados, não inventar.

---

# 21. Mock do WhatsApp

O mock do celular é uma das partes mais fortes da landing.

Manter e melhorar.

A mensagem deve demonstrar valor real.

## Exemplo

**Relatório pós-atividade**

### Natação concluída

> Bom treino! Você nadou 2.100 m em 39min12s.

Cards:

**2.100 m**  
Distância

**39:12**  
Tempo

**1:52 /100 m**  
Ritmo médio

**142 bpm**  
FC média

---

## Destaque

> Seu ritmo nos últimos 800 m foi mais constante.

ou, se calculável:

> Nos últimos 800 m você ficou 4 s/100 m mais rápido.

---

# 22. Não fingir que o WhatsApp é o aplicativo real

A simulação deve parecer familiar, mas não precisa copiar cada detalhe de UI do WhatsApp.

Priorizar:

- clareza;
- demonstração do relatório;
- coerência visual;
- acessibilidade.

---

# 23. Gráficos — regra principal

Os gráficos atuais são demonstrativos demais.

Precisam mostrar informação esportiva compreensível.

Cada gráfico deve responder a uma pergunta.

Exemplos:

- Quanto eu treinei?
- Em qual modalidade treinei mais?
- Meu ritmo melhorou?
- Minha frequência cardíaca mudou?
- Estou treinando com consistência?

---

# 24. Gráfico "Evolução semanal"

Substituir a ideia genérica de:

> Carga distribuída da semana

por:

# Volume de treino

Subtítulo:

> Quanto você treinou nos últimos 7 dias.

---

## Resumo acima do gráfico

Exemplo:

**6h 42min**

> +12% em relação à semana anterior

Só mostrar comparação se houver dados válidos.

---

# 25. Barras semanais

Preferir gráfico de barras.

Dias:

- Seg
- Ter
- Qua
- Qui
- Sex
- Sáb
- Dom

Não usar:

- S
- T
- Q
- Q
- S
- S
- D

porque causa ambiguidade.

---

# 26. Barras por modalidade

Se houver mais de uma modalidade, usar stacked bars.

Exemplo:

- azul → natação;
- verde → ciclismo;
- laranja → corrida.

Não usar mais de uma cor apenas para decoração.

---

# 27. Tooltip semanal

Desktop: hover.

Mobile: tap.

Exemplo:

**Quarta, 19 ago**

Natação  
1.800 m · 34 min

Corrida  
7,2 km · 41 min

**Total: 1h15**

---

# 28. Remover textos técnicos dos gráficos

Não exibir para o usuário:

> eixo Y · carga

> eixo X · tendência

O usuário não precisa saber o nome do eixo.

O significado deve estar claro pelo título, unidade e tooltip.

---

# 29. Substituir gráfico mensal artificial

A seção atual com:

- alto;
- médio;
- base;
- sem 1;
- sem 2;
- pico;
- agora;

deve ser substituída.

Ela aparenta usar dado artificial e não explica o que está sendo medido.

---

# 30. Nova visualização de consistência

## Opção preferida

# Consistência dos treinos

Subtítulo:

> Quantos treinos você realizou em cada semana.

Exemplo:

- Semana 1 → 4 treinos
- Semana 2 → 5 treinos
- Semana 3 → 3 treinos
- Semana 4 → 6 treinos
- Semana 5 → 5 treinos
- Esta semana → 6 treinos

---

# 31. Segunda opção de gráfico

# Evolução

Tabs:

- Distância
- Tempo
- Ritmo
- FC
- Elevação

Ao mudar a opção, alterar:

- unidade;
- tooltip;
- label;
- valores;
- gráfico.

Não misturar métricas incompatíveis.

---

# 32. Nunca misturar unidades incompatíveis

Não colocar no mesmo eixo:

- km;
- bpm;
- min/km;
- minutos;
- kcal;
- metros;
- watts.

Cada visualização precisa ter uma unidade clara.

---

# 33. Unidades

## Corrida

Ritmo:

```text
5:24 /km
```

## Natação

Ritmo:

```text
1:52 /100 m
```

## Ciclismo

Velocidade:

```text
31,4 km/h
```

## Frequência cardíaca

```text
148 bpm
```

## Potência

```text
228 W
```

## Elevação

```text
486 m
```

---

# 34. Formatação

Nunca apresentar valores crus como:

```text
5.483452
```

Criar ou reutilizar helpers:

```text
formatDistance()
formatDuration()
formatPace()
formatSwimPace()
formatSpeed()
formatHeartRate()
formatElevation()
formatCalories()
formatCadence()
formatPower()
```

---

# 35. Interações dos gráficos

Adicionar quando fizer sentido:

- hover;
- tap;
- tooltip;
- seleção de período;
- seleção de métrica;
- highlight de ponto;
- transição suave;
- loading skeleton;
- empty state.

Evitar animações exageradas.

---

# 36. Período dos gráficos

Quando houver dados suficientes:

- 7 dias
- 30 dias
- 3 meses
- 6 meses
- 1 ano

Não criar filtros sem dados para sustentar a visualização.

---

# 37. Seção de modalidades

Substituir a atual área de "Público / Produto / Hábito" por conteúdo real.

# Feito para quem leva o treino a sério

---

## Natação

> Ritmo, distância, SWOLF e evolução.

---

## Ciclismo

> Velocidade, potência, elevação e carga.

---

## Corrida

> Ritmo, frequência cardíaca, cadência e distância.

---

## Triathlon

> Suas três modalidades em uma visão única.

Usar SportIcon e a cor semântica de cada modalidade.

---

# 38. Remover seção com linguagem de pitch interno

Eliminar ou reescrever completamente:

- Hábito;
- Por que isso converte em hábito;
- Público;
- Para quem isso faz sentido;
- Produto;
- Prova de intenção de produto.

Esses conceitos podem existir internamente no projeto, mas não como copy pública.

---

# 39. Segurança

O menu "Segurança" deve levar a uma seção realmente dedicada a segurança e privacidade.

Título sugerido:

# Seus dados esportivos continuam seus

Subtítulo:

> Segurança e privacidade desde a conexão até o relatório.

---

## Itens possíveis

Usar apenas itens que sejam verdadeiros na implementação:

- Conexões protegidas;
- Credenciais armazenadas com segurança;
- Dados não públicos;
- Possibilidade de desconectar integração;
- Controle sobre os próprios dados;
- Exclusão de conta;
- Exclusão de dados.

Não afirmar algo que o sistema ainda não implementa.

---

# 40. Integrações

Se Garmin for a primeira integração real, adicionar uma seção discreta:

# Conecte seus treinos

**Garmin**

> Sincronize suas atividades automaticamente.

Próximas integrações podem aparecer como:

> Em breve

Somente se isso fizer parte do roadmap real.

Não colocar Apple Watch, Strava etc. como disponíveis se ainda não estiverem.

---

# 41. Imagens

Não encher a landing com stock photos genéricas.

Se usar imagem fotográfica, preferir apenas uma seção forte.

Sugestões:

- nadador;
- ciclista;
- corredor;
- triatleta;
- composição das três modalidades.

Aplicar:

- baixa opacidade;
- overlay escuro;
- tratamento consistente;
- não competir com os textos.

---

# 42. Alternativa preferida a muitas fotos

O produto pode continuar com identidade baseada em:

- SVG;
- ícones;
- gráficos;
- mock de celular;
- ilustrações esportivas;
- formas abstratas.

Essa abordagem combina mais com o design atual.

---

# 43. CTA final

Substituir:

> Faça treino virar mensagem que dá vontade de abrir.

por algo mais direto.

## Opção preferida

# Termine o treino. O RYANO mostra o que importa.

Texto:

> Conecte suas atividades e receba um resumo claro do seu desempenho direto no WhatsApp.

CTA:

> Criar minha conta

Secundário:

> Já tenho conta

---

# 44. Footer

Substituir:

> RYANO · relatórios esportivos no WhatsApp com leitura rápida, clara e visual premium.

por:

> RYANO · seus treinos, mais fáceis de entender.

ou:

> RYANO · seus dados esportivos, direto no WhatsApp.

Evitar "visual premium".

---

# 45. Mobile

Garantir comportamento correto em telas pequenas.

## Regras

- nenhum gráfico deve causar scroll horizontal;
- labels devem reduzir quantidade;
- tooltip deve funcionar por toque;
- tabs podem rolar horizontalmente se necessário;
- CTAs devem continuar fáceis de clicar;
- área mínima de toque ~44 px;
- header não deve ocupar altura excessiva;
- mock do celular deve caber sem cortar;
- textos não devem ficar pequenos demais;
- bottom navigation não deve esconder conteúdo.

---

# 46. Bottom navigation mobile

A navegação mobile atual com:

- Home
- Entrar
- Cadastro

deve ser avaliada.

Na landing pública, pode ser mais útil ter:

- Início
- Exemplo
- Começar

ou:

- Início
- Como funciona
- Criar conta

Se "Entrar" for necessário, ele pode ficar no header ou menu.

Evitar duplicar muitas ações de login/cadastro.

---

# 47. Acessibilidade

Todos os componentes precisam respeitar:

- contraste suficiente;
- foco visível;
- navegação por teclado;
- `aria-label` quando necessário;
- `aria-hidden="true"` para ícones decorativos;
- não depender apenas de cor;
- labels legíveis;
- `prefers-reduced-motion`.

---

# 48. Motion

Manter animações suaves já existentes.

Evitar:

- excesso de blur;
- elementos constantemente se movendo;
- autoplay rápido;
- animações que atrapalhem leitura.

Para carrossel automático:

- permitir interação manual;
- pausar quando usuário interagir;
- respeitar reduced motion;
- não mudar rápido demais.

---

# 49. SEO

Corrigir o canonical de produção.

Não deixar:

```html
<link rel="canonical" href="http://localhost:3000/">
```

Usar o domínio oficial de produção do RYANO.

---

# 50. Title

Substituir:

```text
RYANO
```

por algo mais descritivo, por exemplo:

```text
RYANO — Seus treinos analisados no WhatsApp
```

---

# 51. Meta description

Sugestão:

> Acompanhe corrida, ciclismo, natação e triathlon com relatórios claros de desempenho entregues direto no WhatsApp.

Adaptar se alguma modalidade ainda não estiver realmente suportada.

---

# 52. Open Graph

Adicionar/verificar:

- `og:title`;
- `og:description`;
- `og:image`;
- `og:url`;
- `og:type`;
- Twitter Card.

Criar uma imagem de compartilhamento coerente com a marca.

---

# 53. Estados de carregamento

Caso componentes dependam de dados:

Usar skeleton coerente com o layout.

Não deixar:

- gráfico vazio;
- card pulando de tamanho;
- layout shift excessivo.

---

# 54. Estados sem dados

Exemplo:

## Nenhuma atividade neste período

> Quando um treino for sincronizado, seus dados aparecerão aqui.

Por modalidade:

## Nenhuma corrida encontrada

> Suas próximas corridas sincronizadas aparecerão aqui.

---

# 55. Dados demonstrativos

Na landing pública pode haver dados demonstrativos.

Mas deixar claro internamente no código que são fixtures/demo.

Exemplo:

```text
demoAthletes
demoActivities
demoMetrics
```

Não misturar mock com dados reais do usuário.

---

# 56. Copy — regra geral

Toda frase deve responder pelo menos uma destas perguntas:

- O que isso faz?
- Por que isso é útil?
- O que vou receber?
- O que preciso fazer?
- Como isso melhora meu acompanhamento?

Se o texto apenas descreve o layout, removê-lo.

---

# 57. Evitar estas palavras como argumento de venda

Evitar excesso de:

- premium;
- bonito;
- visual;
- moderno;
- sofisticado;
- elegante.

Demonstrar qualidade pelo design.

Não dizer que o design é premium.

---

# 58. Linguagem

Tom:

- esportivo;
- direto;
- simples;
- confiante;
- sem excesso de marketing;
- sem jargão técnico desnecessário.

---

# 59. Consistência

Padronizar:

- "ritmo" em vez de alternar sem necessidade com "pace";
- utilizar "pace" apenas se for uma decisão intencional do produto;
- "frequência cardíaca" na primeira aparição;
- "FC" em cards compactos;
- "ciclismo" em vez de alternar com "bike" na UI principal;
- "triathlon" ou "triatlo": escolher uma forma e manter consistente.

Recomendação:

- usar "Triathlon" como nome da modalidade se esse for o posicionamento da marca;
- textos em português nas explicações.

---

# 60. Hierarquia visual

Em cada seção:

1. eyebrow/label opcional;
2. título;
3. subtítulo;
4. conteúdo;
5. CTA ou interação.

Não usar label técnica apenas para preencher espaço.

---

# 61. Tamanho de cards

Evitar cards grandes contendo pouca informação.

Se um card contém apenas:

> Visual  
> Premium

ele deve ser removido ou receber conteúdo útil.

---

# 62. Tooltips

Todo gráfico deve usar tooltip útil.

Exemplo ruim:

```text
Aug 18
42.29384
```

Exemplo correto:

```text
18 de agosto

Distância
42,3 km

Tempo
1h34min
```

---

# 63. Design dos gráficos

Usar:

- grid discreto;
- poucos ticks;
- unidade clara;
- tooltip customizado;
- legenda simples;
- linha ou barra com cor semântica;
- bom contraste;
- pontos apenas quando ajudam;
- bordas e radius coerentes.

Evitar:

- 3D;
- sombras pesadas;
- gradiente excessivo;
- animação exagerada;
- múltiplas cores sem significado.

---

# 64. Gráficos por modalidade na Demo

## Natação

Exibir exemplo de:

- distância por sessão;
- ritmo /100 m;
- consistência.

## Ciclismo

Exibir exemplo de:

- distância;
- velocidade média;
- elevação;
- potência se aplicável.

## Corrida

Exibir exemplo de:

- distância;
- ritmo;
- FC;
- cadência.

## Triathlon

Exibir:

- split swim;
- bike;
- run;
- total.

---

# 65. Não inventar insights

É proibido exibir:

> Você melhorou 18%

sem cálculo real.

É proibido exibir:

> Seu treino foi excelente

sem regra definida para isso.

É proibido criar recomendações médicas ou fisiológicas não suportadas.

---

# 66. Componentização recomendada

Reutilizar o que já existir.

Se a estrutura ainda não existir, considerar:

```text
components/
  landing/
    LandingHero.tsx
    HowItWorks.tsx
    SportDemo.tsx
    SportTabs.tsx
    AthletePreview.tsx
    WhatsAppPreview.tsx
    TrainingVolumeChart.tsx
    ConsistencyChart.tsx
    SportsSection.tsx
    SecuritySection.tsx
    FinalCTA.tsx

  icons/
    SportIcon.tsx
```

Não criar essa estrutura cegamente se o projeto já possuir uma organização equivalente.

---

# 67. Configuração das modalidades

Centralizar.

Exemplo:

```ts
export const sports = {
  swimming: {
    label: "Natação",
    color: "var(--sport-swimming)",
    icon: "...",
  },
  cycling: {
    label: "Ciclismo",
    color: "var(--sport-cycling)",
    icon: "...",
  },
  running: {
    label: "Corrida",
    color: "var(--sport-running)",
    icon: "...",
  },
  triathlon: {
    label: "Triathlon",
    color: "var(--sport-triathlon)",
    icon: "...",
  },
};
```

Não repetir nomes, cores e ícones em vários componentes.

---

# 68. Interação da Demo — comportamento esperado

Ao clicar em "Corrida":

1. selecionar tab Corrida;
2. usar cor laranja;
3. atualizar SportIcon;
4. atualizar métricas;
5. atualizar atleta demonstrativo;
6. atualizar gráfico;
7. atualizar texto;
8. atualizar mock do WhatsApp;
9. animar transição suavemente.

Mesmo comportamento para outras modalidades.

---

# 69. Autoplay

Se o carrossel continuar automático:

- intervalo mínimo confortável;
- não trocar enquanto usuário estiver interagindo;
- reiniciar timer após interação;
- permitir clique nos indicadores;
- permitir swipe no mobile;
- respeitar `prefers-reduced-motion`.

---

# 70. Não quebrar

Preservar:

- login;
- cadastro;
- rotas;
- termos;
- privacidade;
- navegação;
- autenticação;
- integrações;
- analytics;
- tracking;
- SEO já válido;
- responsividade existente.

---

# 71. Performance

Verificar:

- JS desnecessário;
- imagens;
- fontes;
- animações;
- componentes client-side;
- bundles;
- hydration;
- lazy loading.

Não transformar toda a landing em Client Component se não for necessário.

---

# 72. Critérios de aceite — Copy

Antes de considerar concluído:

- [ ] não existe "Hero visual esportivo";
- [ ] não existe "Simulação visual de atletas";
- [ ] não existe "Prova de intenção de produto";
- [ ] não existe "Visual Premium" como argumento;
- [ ] não existe texto descrevendo carrossel para usuário;
- [ ] cada seção comunica benefício real;
- [ ] CTAs estão padronizados;
- [ ] copy está em português consistente.

---

# 73. Critérios de aceite — Gráficos

- [ ] dias da semana são legíveis;
- [ ] nenhum gráfico usa S/T/Q/Q/S/S/D;
- [ ] unidades estão claras;
- [ ] "eixo X" e "eixo Y" não aparecem como copy;
- [ ] gráficos têm tooltip;
- [ ] gráficos funcionam no mobile;
- [ ] não há unidades incompatíveis no mesmo eixo;
- [ ] dados demonstrativos não fingem ser dados reais do usuário;
- [ ] cores representam modalidades consistentemente.

---

# 74. Critérios de aceite — Ícones

- [ ] SportIcon centralizado;
- [ ] SVG utiliza currentColor;
- [ ] não há cores hex duplicadas dentro de SVGs reutilizáveis;
- [ ] interface principal não mistura emoji e ícones sem motivo;
- [ ] ícones têm estilo coerente.

---

# 75. Critérios de aceite — Interação

- [ ] usuário consegue trocar entre modalidades;
- [ ] conteúdo acompanha modalidade selecionada;
- [ ] gráfico acompanha modalidade;
- [ ] mock de mensagem acompanha modalidade;
- [ ] transição é suave;
- [ ] teclado funciona;
- [ ] swipe funciona quando aplicável;
- [ ] reduced motion é respeitado.

---

# 76. Critérios de aceite — Visual

- [ ] glassmorphism foi reduzido onde não agrega hierarquia;
- [ ] cards de conteúdo têm boa legibilidade;
- [ ] cor da marca não conflita com ciclismo;
- [ ] Natação é azul;
- [ ] Ciclismo é verde;
- [ ] Corrida é laranja;
- [ ] Triathlon é violeta;
- [ ] contraste está adequado.

---

# 77. Critérios de aceite — Mobile

- [ ] sem scroll horizontal;
- [ ] gráficos legíveis;
- [ ] tooltip por toque;
- [ ] botões com área adequada;
- [ ] bottom navigation não cobre conteúdo;
- [ ] mock do celular se adapta;
- [ ] textos não ficam minúsculos.

---

# 78. Critérios de aceite — SEO

- [ ] canonical não aponta para localhost;
- [ ] title é descritivo;
- [ ] meta description está correta;
- [ ] Open Graph configurado;
- [ ] favicon válido;
- [ ] domínio de produção usado corretamente.

---

# 79. Processo de implementação

Implementar em etapas.

## Etapa 1

Auditoria técnica e inventário de componentes.

## Etapa 2

Copy e estrutura semântica.

## Etapa 3

Sistema central de modalidades, ícones e cores.

## Etapa 4

Demo interativa.

## Etapa 5

Gráficos.

## Etapa 6

Segurança, modalidades e integrações.

## Etapa 7

Mobile e acessibilidade.

## Etapa 8

SEO e performance.

## Etapa 9

QA final.

---

# 80. Regra de commit/alteração

Não fazer alteração massiva sem entender dependências.

Preferir mudanças incrementais e revisáveis.

Não reescrever componentes funcionando apenas por preferência estética.

---

# 81. Resultado esperado

Ao terminar, a landing deve transmitir:

> Este é um produto esportivo real que entende corrida, ciclismo, natação e triathlon e transforma dados de treino em informação fácil de acompanhar.

O visitante deve conseguir responder rapidamente:

- O que é RYANO?
- O que ele recebe?
- Onde recebe?
- Quais esportes suporta?
- Como conecta?
- Como os relatórios aparecem?
- Quais métricas são mostradas?
- Como começar?
- Como seus dados são protegidos?

A página deve parecer produto pronto, não apresentação de conceito de design.

---

# 82. Instrução final para a IA implementadora

Antes de modificar qualquer arquivo:

1. estude o projeto;
2. encontre os componentes atuais;
3. identifique o design system;
4. identifique componentes reutilizáveis;
5. identifique fixtures e dados reais;
6. identifique bibliotecas já instaladas;
7. apresente mentalmente o menor conjunto de mudanças necessário;
8. implemente sem duplicação.

Depois de implementar:

1. execute lint;
2. execute typecheck;
3. execute testes existentes;
4. faça build de produção;
5. valide desktop;
6. valide mobile;
7. valide dark mode, se aplicável;
8. valide navegação por teclado;
9. valide tooltips;
10. valide todos os CTAs;
11. valide todas as rotas;
12. valide console do navegador;
13. valide que canonical não aponta para localhost;
14. valide que nenhum texto interno de design permaneceu na interface.

Não encerrar a tarefa enquanto houver erro de build, lint, TypeScript, console ou quebra visual introduzida pelas alterações.
