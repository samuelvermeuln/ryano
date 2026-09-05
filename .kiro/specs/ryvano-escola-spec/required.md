# Ryvano Escola — Requirements

**Arquivo:** `required.md`  
**Módulo:** Escola  
**Status:** Especificação funcional inicial consolidada  
**Objetivo:** definir integralmente os requisitos funcionais, regras de negócio, atores, comportamentos, restrições e critérios de aceite do módulo Escola da Ryvano.

---

# 1. Objetivo do módulo

O módulo **Escola** da Ryvano deve permitir que escolas esportivas, assessorias, equipes, clubes, professores, treinadores e atletas se relacionem dentro da plataforma de forma flexível, preservando o histórico esportivo do atleta ao longo do tempo.

O módulo deve permitir:

- cadastrar uma ou mais escolas;
- vincular professores e treinadores às escolas;
- permitir professores independentes, sem escola;
- vincular atletas a escolas;
- vincular atletas a professores;
- permitir múltiplos papéis por usuário;
- aprovar ou recusar solicitações de vínculo;
- criar convites por link;
- permitir busca manual por escola;
- organizar alunos por professor;
- permitir mudança de professor;
- criar um lobby de atletas sem professor;
- cadastrar e prescrever treinos;
- registrar execução dos treinos;
- confrontar treino prescrito com treino realizado;
- atribuir notas e avaliações;
- registrar feedback do atleta;
- preservar histórico após desligamentos;
- permitir mudança entre escolas sem perda de histórico;
- permitir compartilhamento autorizado do histórico;
- preservar autoria de treinos, avaliações e comentários;
- suportar desativação de escola;
- preparar a arquitetura para marketplace de treinos e planos.

---

# 2. Princípio fundamental

A regra central do módulo será:

> **Vínculos podem acabar. O histórico esportivo não.**

O histórico esportivo deve acompanhar o atleta durante toda a sua trajetória dentro da Ryvano.

Escolas, professores e treinadores recebem acesso aos dados conforme:

- vínculo ativo;
- papel;
- associação;
- autorização do atleta;
- política da escola;
- escopo de compartilhamento.

Nenhum desligamento deve apagar automaticamente o histórico esportivo.

---

# 3. Princípios de domínio

## 3.1 O atleta é o centro do histórico

O histórico esportivo principal pertence ao atleta.

Exemplos:

- atividades importadas;
- distância;
- duração;
- frequência cardíaca;
- potência;
- ritmo;
- cadência;
- zonas;
- streams;
- resultados;
- evolução;
- histórico de treinos realizados.

Uma escola não se torna proprietária dessas informações apenas por acompanhar o atleta.

---

## 3.2 A escola é um contexto de acompanhamento

A escola representa um contexto organizacional.

Ela poderá:

- possuir membros;
- possuir professores;
- possuir administradores;
- possuir atletas;
- possuir turmas;
- possuir equipes;
- prescrever treinos;
- acompanhar atletas;
- avaliar atletas;
- organizar calendário;
- futuramente comercializar treinos e planos.

---

## 3.3 Professor e escola são conceitos independentes

Um professor poderá:

- atuar vinculado a uma escola;
- atuar em mais de uma escola;
- atuar sem escola;
- entrar em uma escola;
- sair de uma escola;
- retornar futuramente;
- possuir alunos independentes;
- possuir alunos vinculados via escola.

A modelagem não deverá obrigar todo professor a possuir uma escola.

---

## 3.4 Escola e professor não devem ser campos fixos no atleta

Não utilizar como solução principal:

```text
Athlete
  schoolId
  coachId
```

O relacionamento deve ser representado por entidades próprias de vínculo.

Isso é necessário para suportar:

- histórico temporal;
- múltiplas escolas;
- múltiplos professores;
- trocas;
- desligamentos;
- reativações;
- auditoria;
- compartilhamento.

---

# 4. Terminologia

## Escola

Organização esportiva dentro da Ryvano.

Pode representar:

- escola de natação;
- assessoria esportiva;
- equipe;
- clube;
- academia;
- box;
- centro de treinamento;
- grupo de treinamento;
- organização esportiva.

---

## Professor / Coach / Treinador

Pessoa responsável por:

- prescrever treinos;
- acompanhar atletas;
- avaliar atletas;
- atribuir notas;
- visualizar atividades autorizadas;
- acompanhar evolução.

---

## Atleta / Aluno

Usuário acompanhado pela escola ou professor.

---

## Vínculo

Relacionamento formal entre duas entidades.

Exemplos:

- atleta ↔ escola;
- professor ↔ escola;
- atleta ↔ professor.

---

## Lobby

Lista de atletas vinculados à escola que atualmente não possuem professor responsável.

---

## Histórico esportivo

Conjunto de dados acumulados ao longo da trajetória do atleta.

---

## Treino prescrito

Treino criado por professor, escola ou plano e atribuído a um atleta.

---

## Treino realizado

Atividade efetivamente executada pelo atleta.

---

## Compliance

Grau de aderência entre treino prescrito e treino realizado.

---

# 5. Atores

O módulo deve considerar pelo menos os seguintes atores.

## OWNER

Responsável máximo pela escola.

Pode:

- administrar a escola;
- administrar usuários;
- administrar permissões;
- vincular e remover professores;
- vincular e remover atletas;
- desativar a escola;
- acumular outros papéis.

---

## ADMIN

Administrador da escola.

Pode:

- gerenciar membros;
- gerenciar vínculos;
- aprovar solicitações;
- atribuir professores;
- movimentar atletas;
- gerenciar lobby;
- gerenciar convites;
- visualizar dashboards administrativos.

Pode também ser treinador.

---

## COACH

Professor ou treinador.

Pode:

- acompanhar atletas autorizados;
- criar treinos;
- atribuir treinos;
- visualizar atividades;
- avaliar atletas;
- atribuir notas;
- registrar comentários.

---

## ASSISTANT_COACH

Professor auxiliar.

Permissões específicas poderão ser limitadas pela escola.

---

## ATHLETE

Atleta/aluno.

Pode:

- participar de escolas;
- vincular-se a professores;
- visualizar treinos;
- executar treinos;
- enviar feedback;
- autorizar compartilhamento de histórico;
- revogar compartilhamento;
- pesquisar escolas;
- aceitar convites.

---

## STAFF

Membro operacional sem função esportiva obrigatória.

---

## GUARDIAN

Papel futuro para responsável legal de atleta.

---

# 6. Múltiplos papéis

Um usuário poderá possuir múltiplos papéis simultaneamente.

Exemplos:

```text
Maria
- OWNER
- ADMIN
- COACH
```

ou:

```text
Carlos
- ADMIN
- COACH
```

Os papéis não devem ser mutuamente exclusivos.

---

# 7. Cadastro de escolas

O sistema deverá permitir que um usuário autorizado crie uma escola.

Uma escola deverá possuir no mínimo:

- identificador;
- nome;
- status;
- proprietário;
- data de criação.

Campos futuros podem incluir:

- descrição;
- logo;
- endereço;
- modalidades;
- contatos;
- site;
- redes sociais;
- configurações de aprovação;
- configurações de convites;
- configurações de privacidade;
- política de ingresso;
- política de atribuição de professores.

---

# 8. Status da escola

Estados mínimos:

```text
ACTIVE
INACTIVE
```

Estados futuros possíveis:

```text
SUSPENDED
ARCHIVED
```

---

# 9. Desativação da escola

Quando uma escola for desativada:

- nenhum histórico do atleta deve ser apagado;
- nenhum treino histórico deve ser apagado;
- nenhuma atividade deve ser apagada;
- nenhuma avaliação histórica deve ser apagada;
- nenhuma nota deve ser apagada;
- nenhuma autoria deve ser apagada;
- os vínculos ativos devem ser encerrados ou inativados;
- os professores deixam de atuar no contexto ativo daquela escola;
- os atletas deixam de estar ativos naquele contexto;
- os dados continuam disponíveis conforme regras históricas e de privacidade.

A escola desativada deverá continuar aparecendo como origem histórica dos registros.

---

# 10. Professor vinculado à escola

O sistema deverá permitir:

- vincular professor a uma escola;
- aprovar vínculo de professor;
- rejeitar vínculo;
- remover professor;
- reativar professor;
- registrar início e fim do relacionamento;
- manter histórico de períodos anteriores.

Exemplo:

```text
Professor Carlos

Escola Aqua
01/01/2026 → 05/09/2026

Escola Performance
10/09/2026 → atual
```

---

# 11. Professor independente

O sistema deve permitir que um professor possua atletas sem estar vinculado a uma escola.

Exemplo:

```text
Atleta Samuel
   ↓
Professor Carlos
```

sem `schoolId` obrigatório.

---

# 12. Remoção de professor da escola

Quando um professor for removido de uma escola:

- seu vínculo com a escola deve ser encerrado;
- o histórico do vínculo deve ser preservado;
- treinos prescritos anteriormente permanecem;
- avaliações permanecem;
- notas permanecem;
- comentários permanecem;
- autoria permanece;
- ele perde acesso futuro aos dados privados da escola quando não houver outra autorização;
- seus alunos não devem ser removidos da escola.

Os alunos associados a esse professor deverão ir para o **Lobby**.

---

# 13. Lobby de atletas

O Lobby representa:

> atleta vinculado à escola, mas sem professor responsável ativo.

O lobby deve permitir ao ADMIN/OWNER:

- visualizar atletas sem professor;
- visualizar último professor;
- visualizar data desde a qual estão sem professor;
- atribuir um novo professor;
- realizar atribuições em lote;
- distribuir atletas entre professores.

Exemplo:

```text
ATLETAS SEM PROFESSOR

Samuel
Último professor: Carlos
Sem professor desde: 05/09/2026

[ Atribuir professor ]
```

---

# 14. Troca de professor

A escola poderá trocar o professor de um atleta a qualquer momento.

Exemplo:

```text
Samuel

Jan → Mar
Professor Carlos

Abr → Ago
Professora Ana

Set → atual
Professor João
```

A troca não deve sobrescrever o histórico anterior.

Cada associação deverá possuir seu próprio período.

---

# 15. Professor principal e múltiplos professores

O MVP poderá trabalhar com um professor principal por contexto de escola.

Entretanto, a arquitetura deverá permitir evolução para múltiplos professores.

Exemplo:

```text
Samuel

Natação
Professor Carlos

Corrida
Professora Ana

Musculação
Professor João
```

---

# 16. Vínculo do atleta com escola

O sistema deve permitir:

- atleta vincular-se a uma escola;
- escola convidar atleta;
- atleta solicitar vínculo;
- escola aprovar;
- escola rejeitar;
- atleta sair;
- escola remover atleta;
- atleta retornar futuramente;
- histórico permanecer.

---

# 17. Estados de vínculo

Estados mínimos sugeridos:

```text
PENDING
ACTIVE
REJECTED
REVOKED
ENDED
```

A implementação final será definida no `design.md`.

---

# 18. Aprovação de vínculo

Escolas e professores devem poder configurar se o vínculo é:

```text
AUTO_APPROVE
```

ou:

```text
REQUIRE_APPROVAL
```

Quando exigir aprovação:

```text
Solicitação
   ↓
PENDING
   ↓
[ APROVAR ] [ RECUSAR ]
```

Nenhum acesso privado deve ser concedido antes da aprovação.

---

# 19. Remoção do atleta

Quando o atleta for removido da escola ou professor:

- o vínculo deve ser encerrado;
- o histórico deve permanecer;
- o atleta perde acesso aos recursos privados ativos daquele vínculo;
- o professor/escola perde acesso futuro conforme regras de autorização;
- treinos históricos continuam registrados;
- atividades históricas permanecem;
- avaliações permanecem;
- notas permanecem;
- autoria permanece.

---

# 20. Retorno do atleta

Quando o atleta retornar:

- o relacionamento anterior não deverá ser sobrescrito;
- deverá ser criado novo período ou reativação auditável;
- o histórico anterior deverá continuar disponível.

Exemplo:

```text
Samuel × Escola Aqua

01/01/2026 → 05/09/2026
15/01/2027 → atual
```

---

# 21. Formas de ingresso do atleta

O sistema deve suportar múltiplos fluxos.

## Link da escola

Exemplo:

```text
ryvano.com/join/escola-aqua
```

O atleta se cadastra e:

- é vinculado automaticamente; ou
- entra como pendente;
- posteriormente escolhe professor; ou
- fica no lobby até atribuição.

---

## Link escola + professor

Exemplo:

```text
ryvano.com/join/escola-aqua/carlos
```

O vínculo deverá identificar:

- escola;
- professor.

O atleta poderá:

- entrar diretamente;
- aguardar aprovação;
- ficar previamente associado ao professor.

---

## Link do professor independente

Exemplo:

```text
ryvano.com/join/coach/carlos
```

O atleta fica vinculado diretamente ao professor.

---

## Busca manual

O atleta poderá buscar uma escola pelo nome.

Fluxo:

```text
Buscar escola
   ↓
Selecionar escola
   ↓
Solicitar associação
   ↓
Escolher professor ou aguardar atribuição
```

---

# 22. Convites

Deverá existir um mecanismo de convite.

Tipos iniciais:

```text
SCHOOL
SCHOOL_COACH
COACH
```

O convite poderá possuir:

- token;
- expiração;
- limite de usos;
- contador de usos;
- status;
- necessidade de aprovação;
- escola;
- professor;
- criador.

---

# 23. Busca de escola

O atleta deverá conseguir pesquisar escolas.

A busca poderá considerar:

- nome;
- modalidade;
- cidade;
- estado;
- futuramente distância/localização.

O atleta poderá então:

- visualizar escola;
- solicitar vínculo;
- escolher professor;
- aguardar atribuição.

---

# 24. Associação do atleta a professor

Um atleta poderá estar:

```text
apenas na escola
```

ou:

```text
na escola + professor
```

ou:

```text
apenas com professor independente
```

ou:

```text
sem vínculo
```

---

# 25. Histórico temporal

Relacionamentos importantes deverão guardar períodos.

Exemplo:

```text
startedAt
endedAt
```

Isso deve permitir responder perguntas históricas como:

> Qual professor acompanhava este atleta em maio de 2026?

---

# 26. Preservação do histórico

Nenhuma destas ações deverá apagar histórico:

- sair da escola;
- ser removido;
- professor sair;
- professor ser removido;
- trocar professor;
- escola ser desativada;
- vínculo ser revogado;
- compartilhamento ser revogado.

---

# 27. Propriedade dos dados

## Dados do atleta

Pertencem ao histórico esportivo do atleta.

Exemplos:

- Garmin;
- Strava;
- futuras integrações;
- atividades;
- streams;
- métricas;
- resultados.

---

## Dados produzidos por professor

Devem manter autoria.

Exemplos:

- treino prescrito;
- avaliação;
- nota;
- comentário;
- feedback técnico.

---

# 28. Origem dos registros

Registros criados por escola/professor deverão manter:

- autor;
- escola de origem, quando aplicável;
- data;
- contexto.

Mesmo se:

- professor sair;
- escola for desativada;
- atleta mudar de escola.

---

# 29. Compartilhamento do histórico

Quando o atleta entrar em uma nova escola ou contratar um novo professor, deverá poder escolher se deseja compartilhar histórico anterior.

Exemplo:

```text
Deseja compartilhar seu histórico com a Escola Performance?

[ Sim ]
[ Não ]
```

---

# 30. Escopo de compartilhamento

O atleta poderá selecionar período.

Opções sugeridas:

```text
Últimos 3 meses
Últimos 6 meses
Últimos 12 meses
Período personalizado
Histórico completo
```

Também deverá poder selecionar categorias.

Exemplo:

```text
[x] Atividades
[x] Métricas
[x] Treinos prescritos
[x] Prescrito × realizado
[x] Evolução
[ ] Notas anteriores
[ ] Avaliações anteriores
[ ] Comentários de treinadores
```

---

# 31. Histórico não deve ser movido fisicamente

Não deve existir conceito de transferir fisicamente o dado de uma escola para outra.

Evitar:

```text
MOVE athlete_history FROM school_a TO school_b
```

Preferir:

```text
AthleteHistory
      ↓
Access Grant
      ↓
School B
```

Assim:

- origem é preservada;
- autoria é preservada;
- integridade é preservada;
- acesso pode ser revogado;
- auditoria é possível.

---

# 32. Revogação de compartilhamento

O atleta deverá poder revogar permissões de compartilhamento.

Revogar acesso:

- não apaga o dado;
- não altera autoria;
- não altera origem;
- encerra permissão futura de leitura conforme regra definida.

---

# 33. Auditoria

Ações relevantes deverão gerar registro de auditoria.

Exemplos:

- criação de escola;
- desativação;
- ingresso de professor;
- remoção de professor;
- ingresso de atleta;
- remoção de atleta;
- aprovação;
- rejeição;
- mudança de professor;
- movimentação para lobby;
- atribuição a novo professor;
- criação de convite;
- uso de convite;
- compartilhamento de histórico;
- revogação de compartilhamento;
- alteração de papéis;
- criação de treino;
- alteração de treino prescrito;
- avaliação;
- nota.

O log deve identificar:

- quem;
- o quê;
- quando;
- contexto;
- alvo;
- valores relevantes.

---

# 34. Turmas e equipes

O módulo deverá ser preparado para suportar turmas e equipes.

Exemplos:

```text
Iniciante
Intermediário
Avançado
Competição
Águas abertas
Triathlon
```

Uma turma poderá possuir:

- vários atletas;
- um ou mais professores;
- calendário;
- treinos coletivos.

---

# 35. Treinos

Professores poderão cadastrar treinos.

O treino poderá ser destinado a:

- um atleta;
- vários atletas;
- turma;
- equipe.

---

# 36. Estrutura de treino

Um treino poderá ser composto por blocos.

Exemplo:

```text
Natação

Aquecimento
400m leve

Série principal
10x100m
ritmo 1:35–1:40
descanso 20s

Final
200m leve
```

O sistema deverá ser preparado para diferentes esportes.

---

# 37. Biblioteca de treinos

Professor poderá criar e reutilizar templates.

Exemplos:

```text
Natação
- Técnica
- Endurance
- Threshold
- Velocidade
- Águas abertas
```

Ao atribuir um template ao atleta, o sistema deverá preservar um snapshot da versão usada.

Alterações futuras no template não deverão modificar retroativamente treinos já prescritos.

---

# 38. Planejamento

Versões futuras poderão permitir:

- planejamento semanal;
- ciclos;
- temporada;
- periodização;
- preparação para prova;
- recuperação;
- taper.

---

# 39. Atividade realizada

A atividade realizada deverá vir da camada normalizada da Ryvano.

Fluxo desejado:

```text
Garmin ─┐
Strava ─┤
COROS ──┤
Polar ──┤
Suunto ─┤
Fitbit ─┘
        ↓
NormalizedActivity
        ↓
Training Engine
        ↓
Escola
```

O módulo Escola não deve depender diretamente de Garmin ou Strava.

---

# 40. Associação treino ↔ atividade

O sistema deverá conseguir relacionar:

```text
WorkoutAssignment
```

com:

```text
NormalizedActivity
```

para representar o treino realmente executado.

---

# 41. Prescrito × realizado

O sistema deverá confrontar o treino prescrito com a execução.

Exemplo:

```text
PRESCRITO
1.600m
45min
10x100
pace 1:35–1:40
FC 150–165

REALIZADO
1.587m
43:52
10x100
pace real
FC real
```

---

# 42. Compliance

O sistema deverá calcular aderência.

Possíveis dimensões:

- distância;
- duração;
- volume;
- intensidade;
- pace;
- potência;
- frequência cardíaca;
- zonas;
- quantidade de intervalos;
- descanso;
- distribuição de esforço.

Exemplo:

```text
Volume              99%
Séries              100%
Ritmo                90%
FC alvo              88%
Compliance geral     93%
```

As regras deverão variar por modalidade.

---

# 43. Matching de atividade

A Ryvano deverá possuir mecanismo para identificar qual atividade realizada corresponde a qual treino prescrito.

Possíveis sinais:

- data;
- horário;
- esporte;
- duração;
- distância;
- estrutura;
- atividade manualmente escolhida.

O sistema deverá permitir correção manual quando o matching automático estiver incorreto.

---

# 44. Treino não realizado

O sistema deverá representar:

- treino agendado;
- realizado;
- parcialmente realizado;
- não realizado;
- cancelado;
- reagendado;
- justificado.

---

# 45. Treino extra

Caso o atleta realize uma atividade que não estava prescrita, ela deverá continuar no histórico.

O sistema poderá marcá-la como:

```text
UNPLANNED
```

ou equivalente.

---

# 46. Avaliação do professor

Após treino ou período, o professor poderá avaliar atleta.

Critérios possíveis:

- técnica;
- execução;
- ritmo;
- disciplina;
- esforço;
- consistência;
- comportamento.

Exemplo:

```text
Técnica        8
Execução       9
Ritmo          8
Disciplina    10

Nota geral: 8.7
```

---

# 47. Nota do professor

A avaliação humana deve permanecer separada do score automático.

Deverão coexistir:

```text
RYVANO SCORE
COACH SCORE
ATHLETE FEEDBACK
```

---

# 48. Feedback do atleta

O atleta poderá registrar após treino:

- RPE;
- fadiga;
- motivação;
- sensação;
- observações;
- comentários.

Exemplo:

```text
RPE: 8/10
Fadiga: 6/10
Motivação: 9/10
```

---

# 49. Comentários

Professor poderá registrar comentários relacionados a:

- treino;
- atividade;
- avaliação;
- período.

Os comentários devem manter autoria e data.

---

# 50. Dashboard do professor

O professor deverá visualizar:

- atletas sob responsabilidade;
- treinos pendentes;
- treinos realizados;
- treinos não realizados;
- compliance;
- feedbacks;
- alertas;
- evolução;
- avaliações pendentes.

Exemplo:

```text
MEUS ATLETAS

24 atletas
21 treinaram
3 não treinaram
Compliance médio: 91%
```

---

# 51. Dashboard administrativo

Deverá mostrar pelo menos:

- número de professores;
- número de atletas;
- atletas sem professor;
- solicitações pendentes;
- convites;
- turmas;
- transferências;
- membros ativos;
- professores ativos;
- vínculos recentes.

---

# 52. Alertas futuros

O sistema deverá ser preparado para alertas como:

- atleta com volume acima do planejado;
- sequência de treinos não realizados;
- queda de compliance;
- feedback de fadiga elevada;
- atividade muito acima da intensidade prevista;
- atleta sem professor;
- solicitação aguardando aprovação.

---

# 53. Metas

Versão futura poderá permitir professor definir metas.

Exemplo:

```text
400m livre
Atual: 5:48
Meta: 5:30
Prazo: 15/12/2026
```

---

# 54. Avaliações físicas

Versão futura poderá permitir:

- avaliações periódicas;
- testes específicos;
- métricas por modalidade;
- comparação entre avaliações.

---

# 55. Presença

Versão futura poderá incluir:

- presença em treino;
- ausência;
- justificativa;
- check-in;
- QR Code.

---

# 56. Responsáveis

Versão futura poderá permitir vínculo de responsáveis legais.

Possíveis acessos:

- presença;
- agenda;
- evolução;
- avaliações;
- avisos.

---

# 57. Comunicação

Versões futuras poderão permitir:

- comentários no treino;
- mensagens relacionadas ao acompanhamento;
- comunicação escola ↔ atleta;
- comunicação professor ↔ atleta;
- avisos coletivos.

---

# 58. Marketplace de treinos e planos

A arquitetura deverá ser preparada para marketplace futuro.

Professores, treinadores e escolas poderão vender:

- treinos avulsos;
- planos semanais;
- planos mensais;
- ciclos de 4 semanas;
- ciclos de 8 semanas;
- ciclos de 12 semanas;
- preparação para provas;
- programas de temporada.

---

# 59. Produto do marketplace

Um produto poderá ter:

- autor;
- escola;
- título;
- descrição;
- esporte;
- nível;
- objetivo;
- duração;
- preço;
- avaliação;
- quantidade de vendas;
- conteúdo;
- versão;
- status.

---

# 60. Compra de plano

Fluxo esperado:

```text
Marketplace
   ↓
Compra
   ↓
Plano associado ao atleta
   ↓
Calendário
   ↓
Treinos prescritos
   ↓
Atividades realizadas
   ↓
Prescrito × realizado
```

O plano vendido deverá ser utilizável pela Ryvano, não apenas um PDF.

---

# 61. Passaporte Esportivo Ryvano

O módulo deverá ser compatível com um conceito futuro de:

> **Passaporte Esportivo Ryvano**

Esse passaporte representará a trajetória esportiva do atleta independentemente de escola ou treinador.

Exemplo:

```text
2025
Escola Aqua

2026
Professor Carlos

2027
Assessoria Endurance

2028
Equipe Triathlon
```

---

# 62. Multi-escola

A arquitetura deverá permitir um atleta possuir vínculos simultâneos com mais de uma escola.

Exemplo:

```text
Samuel

Escola de Natação
+
Assessoria de Corrida
```

O produto poderá limitar isso em alguns cenários, mas o modelo de domínio não deve impedir.

---

# 63. Multi-modalidade

A escola poderá trabalhar com várias modalidades.

Exemplos:

- natação;
- corrida;
- ciclismo;
- triathlon;
- musculação;
- caminhada;
- esportes coletivos.

---

# 64. Independência de provedor

Nenhuma regra principal do módulo Escola deverá depender de:

- Garmin;
- Strava;
- COROS;
- Polar;
- Suunto;
- Fitbit.

O módulo deverá utilizar dados normalizados da Ryvano.

---

# 65. Privacidade e acesso

Nenhum professor deverá visualizar um atleta apenas por conhecer seu `athleteId`.

Toda autorização deverá considerar:

- usuário autenticado;
- papel;
- escola;
- vínculo;
- assignment;
- status;
- período;
- grants de histórico;
- permissões específicas.

---

# 66. Acesso após desligamento

Após o encerramento do vínculo:

- acesso operacional futuro deverá ser removido;
- histórico não deverá ser apagado;
- autorias deverão permanecer;
- acesso histórico específico poderá depender da política e autorização aplicável.

---

# 67. Soft delete

Entidades históricas não deverão ser fisicamente apagadas como fluxo normal.

Preferir:

- status;
- `startedAt`;
- `endedAt`;
- `revokedAt`;
- `archivedAt`;
- `deletedAt` apenas quando aplicável e com política explícita.

---

# 68. Imutabilidade histórica

Registros históricos importantes deverão evitar alterações retroativas não auditadas.

Exemplos:

- treino atribuído;
- avaliação;
- nota;
- autoria;
- atividade realizada;
- associação histórica.

Alterações deverão gerar:

- nova versão;
- auditoria;
- atualização controlada.

---

# 69. Regras de autorização

O sistema deverá diferenciar:

- permissão de administrar escola;
- permissão de acompanhar atleta;
- permissão de prescrever treino;
- permissão de avaliar;
- permissão de visualizar histórico;
- permissão de gerenciar professores;
- permissão de gerenciar atletas;
- permissão de aprovar vínculo.

---

# 70. Identidade do atleta

O atleta é uma conta Ryvano.

O vínculo com escola/professor não cria uma nova identidade esportiva.

Portanto, trocar de escola não deve criar novo atleta.

---

# 71. Convite para usuário existente

Se um atleta já possuir conta Ryvano e abrir um convite:

- não criar conta duplicada;
- vincular convite à conta existente;
- aplicar regras de aprovação;
- aplicar escopo correto.

---

# 72. Convite para novo usuário

Se o usuário ainda não possuir conta:

```text
Link
  ↓
Cadastro Ryvano
  ↓
Validação
  ↓
Vínculo pendente ou ativo
```

---

# 73. Expiração e revogação de convite

Convites devem poder:

- expirar;
- ser revogados;
- possuir limite de uso;
- ser desativados.

Convite revogado não pode criar novos vínculos.

---

# 74. Duplicidade de vínculos

O sistema deverá impedir vínculos ativos duplicados equivalentes.

Exemplo:

- mesmo atleta;
- mesma escola;
- mesmo contexto;
- dois memberships ativos idênticos.

Histórico anterior encerrado não deve ser considerado duplicidade.

---

# 75. Transferência de professor

A transferência deve:

1. encerrar assignment anterior;
2. preservar histórico;
3. criar novo assignment;
4. registrar auditoria;
5. manter treinos históricos;
6. preservar autoria.

---

# 76. Transferência em lote

Admin deverá futuramente poder selecionar múltiplos atletas e transferir para novo professor.

A operação deve ser transacional.

---

# 77. Professor removido com treinos futuros

Caso um professor seja removido e existam treinos futuros prescritos por ele, a escola deverá possuir política explícita.

Requisito inicial:

- os treinos não devem ser automaticamente apagados;
- devem ser identificados como prescritos pelo professor anterior;
- o novo professor/admin poderá manter, editar, substituir ou cancelar;
- qualquer alteração deve preservar a autoria/origem da versão anterior.

---

# 78. Escola desativada com treinos futuros

Quando escola for desativada:

- treinos históricos permanecem;
- treinos futuros não devem desaparecer;
- o atleta deve conseguir visualizar seu histórico;
- o produto poderá definir se treinos futuros continuam ativos ou são arquivados, mas nunca devem ser apagados silenciosamente.

Essa decisão operacional final será detalhada no `design.md`.

---

# 79. Continuidade de acompanhamento

Ao entrar em uma nova escola ou professor, o atleta poderá compartilhar histórico para permitir continuidade.

A nova escola poderá analisar:

- volume anterior;
- carga;
- consistência;
- evolução;
- treinos anteriores;
- avaliações permitidas;
- resultados.

---

# 80. Dados sensíveis do histórico

Nem todo histórico precisa ser compartilhado automaticamente.

O sistema deve permitir controle granular.

Exemplo:

```text
Atividades: permitido
Treinos: permitido
Notas anteriores: não permitido
Comentários anteriores: não permitido
```

---

# 81. Marketplace e autoria

Treinos vendidos deverão preservar:

- autor;
- versão;
- data de compra;
- licença de uso;
- conteúdo original.

A compra não transfere autoria intelectual do treino.

---

# 82. Marketplace e acompanhamento

Um atleta poderá comprar plano sem possuir vínculo com o autor.

Também poderá existir produto futuro com acompanhamento premium do treinador.

---

# 83. Gamificação

Gamificação não é requisito inicial.

A arquitetura poderá futuramente suportar:

- medalhas;
- consistência;
- frequência;
- evolução;
- metas;
- conquistas.

---

# 84. Ranking

Ranking é futuro.

Se implementado, deverá priorizar:

- evolução;
- consistência;
- presença;
- compliance;

e não apenas performance absoluta.

---

# 85. Notificações

O módulo deverá ser preparado para notificações de:

- convite;
- aprovação;
- rejeição;
- novo treino;
- alteração de treino;
- mudança de professor;
- entrada no lobby;
- novo professor atribuído;
- avaliação;
- solicitação de compartilhamento;
- revogação de acesso.

---

# 86. Histórico de notificações

Notificações críticas deverão possuir registro de entrega/status quando necessário.

---

# 87. Requisitos de performance

Listagens principais deverão suportar paginação.

Exemplos:

- atletas;
- professores;
- escolas;
- treinos;
- histórico;
- avaliações;
- auditoria.

---

# 88. Requisitos de consistência

Operações que alterem múltiplos vínculos devem ser consistentes.

Exemplo:

Remover professor:

1. encerrar vínculo professor ↔ escola;
2. encerrar assignments válidos naquele contexto;
3. colocar atletas no lobby;
4. registrar auditoria.

Não poderá ficar estado parcial inconsistente.

---

# 89. Idempotência

Operações críticas deverão ser idempotentes quando aplicável.

Exemplos:

- aceitar convite;
- aprovar vínculo;
- processar webhook/atividade;
- associar execução ao treino.

---

# 90. Observabilidade

O sistema deverá registrar logs suficientes para investigar:

- falha de vínculo;
- permissão negada;
- matching de atividade;
- cálculo de compliance;
- transferências;
- aprovações.

---

# 91. Segurança

Toda ação deverá validar contexto no backend.

Não confiar apenas em controles da interface.

---

# 92. Auditoria de dados esportivos

Alterações manuais em associação treino ↔ atividade deverão ser auditadas.

---

# 93. Integração com Ryvano existente

O módulo deve reutilizar:

- identidade do usuário;
- atleta existente;
- modelo normalizado de atividade;
- integrações esportivas existentes;
- mecanismos de autenticação;
- padrões de módulos já adotados no projeto.

---

# 94. Não duplicar dados do provedor

O módulo Escola não deverá criar cópias específicas como:

```text
SchoolGarminActivity
SchoolStravaActivity
```

Deverá utilizar a atividade normalizada existente.

---

# 95. Regras de negócio consolidadas

## BR-001
O histórico esportivo acompanha o atleta.

## BR-002
Encerrar vínculo não apaga histórico.

## BR-003
Desativar escola não apaga histórico.

## BR-004
Remover professor não remove atletas da escola.

## BR-005
Atletas do professor removido vão para o lobby.

## BR-006
Admin pode reatribuir atletas.

## BR-007
Atletas podem trocar de professor a qualquer momento.

## BR-008
Trocas preservam períodos históricos.

## BR-009
Admin pode também ser coach.

## BR-010
Usuário pode possuir múltiplos papéis.

## BR-011
Professor pode existir sem escola.

## BR-012
Atleta pode estar apenas em escola.

## BR-013
Atleta pode estar em escola + professor.

## BR-014
Atleta pode estar apenas com professor.

## BR-015
Vínculos podem exigir aprovação.

## BR-016
Dados privados não são liberados antes da aprovação.

## BR-017
Convite pode pré-definir escola.

## BR-018
Convite pode pré-definir professor.

## BR-019
Atleta pode buscar escola manualmente.

## BR-020
Atleta pode escolher professor quando permitido.

## BR-021
Histórico compartilhado não deve ser movido fisicamente.

## BR-022
Compartilhamento deve ser autorizado.

## BR-023
Compartilhamento pode ser parcial.

## BR-024
Compartilhamento pode ser revogado.

## BR-025
Revogação não apaga histórico.

## BR-026
Treino mantém autoria original.

## BR-027
Avaliação mantém autoria original.

## BR-028
Nota mantém autoria original.

## BR-029
Atividade importada pertence ao histórico do atleta.

## BR-030
Módulo Escola consome atividades normalizadas.

## BR-031
Treino realizado pode ser confrontado com treino prescrito.

## BR-032
Compliance deve considerar regras da modalidade.

## BR-033
Score automático não substitui avaliação humana.

## BR-034
Feedback do atleta é independente da nota do professor.

## BR-035
Treino extra deve continuar no histórico.

## BR-036
Treino não realizado deve possuir estado explícito.

## BR-037
Treino futuro de professor removido não deve ser apagado silenciosamente.

## BR-038
Escola desativada permanece como origem histórica.

## BR-039
Atleta não deve ser duplicado ao trocar de escola.

## BR-040
Vínculos ativos equivalentes não podem ser duplicados.

## BR-041
Transferências devem ser auditadas.

## BR-042
Alterações de acesso devem ser auditadas.

## BR-043
Alterações de papéis devem ser auditadas.

## BR-044
Professor só acessa atletas autorizados.

## BR-045
Conhecer athleteId não concede acesso.

## BR-046
Permissões devem ser verificadas no backend.

## BR-047
Templates de treino atribuídos devem preservar snapshot.

## BR-048
Marketplace futuro não deve exigir vínculo entre comprador e autor.

## BR-049
Plano comprado deve poder alimentar calendário e acompanhamento.

## BR-050
O modelo deve permitir evolução futura para múltiplos professores por atleta.

---

# 96. MVP funcional mínimo

O primeiro MVP deve permitir:

## Escola
- criar;
- editar;
- ativar;
- desativar.

## Membros
- owner;
- admin;
- coach.

## Professor
- vincular;
- aprovar;
- remover;
- reativar.

## Atleta
- vincular;
- aprovar;
- remover;
- retornar.

## Professor ↔ Atleta
- atribuir;
- trocar;
- remover;
- lobby.

## Convites
- escola;
- escola + professor;
- professor.

## Busca
- localizar escola pelo nome;
- solicitar vínculo.

## Histórico
- preservar períodos.

## Auditoria
- registrar eventos principais.

---

# 97. Segundo incremento funcional

Após fundação de vínculos:

- criar treino;
- criar blocos;
- atribuir treino;
- visualizar treino;
- identificar treino realizado;
- associar atividade;
- mostrar prescrito × realizado.

---

# 98. Terceiro incremento

- compliance;
- score;
- avaliação do professor;
- nota;
- comentários;
- feedback do atleta.

---

# 99. Quarto incremento

- compartilhamento de histórico;
- escopo;
- períodos;
- grants;
- revogação;
- auditoria.

---

# 100. Fora do MVP inicial

Não implementar no primeiro ciclo:

- pagamentos;
- marketplace completo;
- responsáveis;
- financeiro;
- ranking;
- gamificação;
- chat completo;
- IA gerando treinos;
- periodização avançada;
- calendário de provas;
- presença com QR Code.

Esses itens devem ficar preparados arquiteturalmente quando necessário, sem bloquear a fundação.

---

# 101. Critérios de aceite — Fundação

O módulo estará apto para avançar quando for possível:

1. criar escola;
2. vincular owner;
3. adicionar admin;
4. adicionar coach;
5. permitir admin também ser coach;
6. convidar atleta;
7. aprovar atleta;
8. rejeitar atleta;
9. vincular atleta a professor;
10. trocar professor;
11. remover professor;
12. mover automaticamente os atletas afetados para lobby;
13. reatribuir atleta;
14. remover atleta;
15. permitir retorno;
16. preservar períodos anteriores;
17. desativar escola;
18. preservar histórico;
19. aplicar autorização corretamente;
20. registrar auditoria.

---

# 102. Critérios de aceite — Treinos

Deverá ser possível:

1. professor criar treino;
2. professor criar blocos;
3. atribuir treino;
4. atleta visualizar;
5. atividade normalizada ser identificada;
6. relacionar atividade ao treino;
7. mostrar planejado × realizado;
8. representar treino não realizado;
9. representar treino extra;
10. preservar histórico após troca de professor.

---

# 103. Critérios de aceite — Avaliação

Deverá ser possível:

1. professor avaliar;
2. professor atribuir nota;
3. professor comentar;
4. atleta informar RPE;
5. atleta informar feedback;
6. manter score automático separado;
7. preservar autorias.

---

# 104. Critérios de aceite — Histórico compartilhado

Deverá ser possível:

1. atleta entrar em nova escola;
2. escolher compartilhar ou não;
3. escolher período;
4. escolher categorias;
5. conceder acesso;
6. nova escola consultar apenas o permitido;
7. revogar acesso;
8. preservar dados;
9. registrar auditoria.

---

# 105. Critérios de aceite — Segurança

O sistema deve garantir:

1. professor não acessa atleta não autorizado;
2. escola não acessa histórico fora de grants/vínculos;
3. atleta controla compartilhamento quando aplicável;
4. permissões são verificadas no backend;
5. convites inválidos não geram acesso;
6. vínculos pendentes não concedem acesso privado;
7. usuário removido perde permissões operacionais.

---

# 106. Requisitos não funcionais

## Segurança
- autorização no backend;
- auditoria;
- princípio do menor privilégio.

## Escalabilidade
- paginação;
- consultas indexáveis;
- evitar dependência direta de provedor externo.

## Manutenibilidade
- módulo separado;
- domínio explícito;
- regras testáveis;
- evitar lógica espalhada.

## Extensibilidade
- múltiplas escolas;
- múltiplos coaches;
- novos provedores;
- novos esportes;
- marketplace futuro.

## Integridade
- histórico temporal;
- soft delete;
- auditoria;
- snapshots.

---

# 107. Restrições arquiteturais funcionais

O desenvolvimento não deverá:

- acoplar escola diretamente ao Garmin;
- acoplar escola diretamente ao Strava;
- armazenar `coachId` fixo como única relação do atleta;
- armazenar `schoolId` fixo como única relação do atleta;
- apagar histórico ao remover vínculo;
- sobrescrever períodos anteriores;
- transferir fisicamente histórico entre escolas;
- perder autoria;
- confiar em validação apenas do frontend.

---

# 108. Regras para evolução futura

Toda implementação deverá considerar que no futuro poderão existir:

- várias escolas por atleta;
- vários professores por atleta;
- professores especialistas por modalidade;
- responsáveis;
- marketplace;
- assinatura;
- planos pagos;
- equipes;
- turmas;
- provas;
- periodização;
- IA;
- novos dispositivos;
- novos provedores.

---

# 109. Conceito de continuidade

A Ryvano deverá permitir que um atleta:

```text
comece com Professor A
→ entre na Escola X
→ troque para Professor B
→ saia da Escola X
→ fique independente
→ entre na Escola Y
→ compartilhe histórico
→ continue evolução
```

sem perder sua trajetória.

---

# 110. Regra final do módulo

> **A Ryvano deve separar identidade, histórico, vínculo, permissão e autoria.**

Identidade pertence ao usuário/atleta.

Histórico acompanha o atleta.

Vínculos têm início e fim.

Permissões podem ser concedidas e revogadas.

Autoria nunca deve ser perdida.

---

# 111. Próximos documentos

Após aprovação deste `required.md`, deverão ser produzidos:

## `design.md`

Deverá conter:

- arquitetura do módulo;
- modelo de banco;
- tabelas;
- colunas;
- relacionamentos;
- índices;
- constraints;
- enums;
- eventos de domínio;
- serviços;
- comandos;
- queries;
- endpoints;
- DTOs;
- autorização;
- estratégia de auditoria;
- matching de treinos;
- cálculo de compliance;
- integrações;
- decisões arquiteturais.

## `task-list.md`

Deverá conter:

- todas as tasks;
- identificador de cada task;
- descrição;
- dependências;
- ordem;
- fases;
- paralelismo possível;
- critérios de conclusão;
- testes necessários;
- migrations;
- backend;
- frontend;
- integrações;
- documentação;
- rollout.

---

# 112. Definição de pronto deste documento

O `required.md` será considerado aprovado quando:

- representar todas as regras funcionais conhecidas;
- não possuir contradições de vínculo;
- deixar claro que histórico pertence ao atleta;
- deixar claro que escola/professor recebem acesso;
- definir desligamento sem perda de histórico;
- definir lobby;
- definir aprovação;
- definir convites;
- definir troca de professor;
- definir desativação da escola;
- definir continuidade entre escolas;
- definir prescrição e execução;
- definir avaliação;
- definir escopo futuro do marketplace.

---

**Fim do `required.md`.**
