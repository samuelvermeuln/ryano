# ryvano — Product & UX Spec

## 1. Princípio do produto

A ryvano não deve parecer apenas um "visualizador de dados Garmin".

A promessa inicial é:

> conectar seus dados esportivos, acompanhar sua evolução e receber informações úteis de forma simples, inclusive pelo WhatsApp.

A arquitetura visual deve comportar a evolução para treino, nutrição, saúde, recuperação e múltiplas modalidades.

---

## 2. Landing Page

Objetivo: explicar o produto e converter para cadastro.

Seções sugeridas, respeitando integralmente o design system existente:

1. Hero
   - proposta de valor;
   - CTA principal: `Começar`;
   - CTA secundário: `Entrar`.

2. Como funciona
   - Conecte seu wearable;
   - ryvano organiza seus dados;
   - Receba relatórios no WhatsApp.

3. Benefícios
   - acompanhamento;
   - histórico;
   - insights;
   - centralização;
   - praticidade no WhatsApp.

4. Wearables
   - Garmin disponível na V1;
   - outros providers marcados como "em breve", sem alegar integração pronta.

5. Segurança e privacidade
   - comunicação fiel à implementação;
   - sem promessas absolutas.

6. Evolução do produto
   - treino;
   - alimentação;
   - performance;
   - múltiplas modalidades.

7. CTA final.

8. Footer
   - termos;
   - privacidade;
   - contato;
   - login.

---

## 3. Login

Itens:
- email;
- senha;
- entrar;
- "Esqueci minha senha";
- botão "Continuar com Google";
- link para cadastro.

Estados:
- loading;
- credenciais inválidas;
- conta bloqueada;
- erro temporário;
- OAuth cancelado.

---

## 4. Cadastro

Campos mínimos iniciais:
- nome;
- email;
- senha;
- confirmação de senha.

Depois encaminhar ao onboarding.

Não obrigar todos os dados pessoais na primeira tela se isso tornar a entrada excessivamente longa.

---

## 5. Onboarding

Stepper simples.

### Etapa 1 — Conta
- nome;
- email.

### Etapa 2 — Dados pessoais
- CPF;
- telefone;
- altura;
- peso.

### Etapa 3 — Endereço
- CEP;
- endereço;
- número;
- complemento;
- bairro;
- cidade;
- UF;
- país.

### Etapa 4 — Garmin
- conectar agora;
- ou opção de concluir depois apenas se o produto aceitar usuário sem dados.

### Etapa 5 — WhatsApp
- explicar o processo;
- gerar link;
- validar retorno.

Exibir claramente o progresso e o que falta para ativar completamente a conta.

---

## 6. Dashboard

### Topo
- saudação;
- período selecionado;
- status compacto das integrações.

### Cards prioritários
- Garmin: conectado/não conectado;
- WhatsApp: verificado/não verificado;
- última sincronização;
- última atividade.

### Resumo do período
Somente métricas realmente disponíveis:
- atividades;
- duração;
- distância;
- modalidades;
- frequência de treino.

### Últimas atividades
Lista resumida com CTA `Ver todas`.

### Evolução
Gráfico simples de volume/frequência/duração, baseado nos dados disponíveis.

### Alertas úteis
Exemplos:
- "Garmin precisa ser reconectado";
- "WhatsApp ainda não foi ativado";
- "Não recebemos novas atividades desde X";
- "Complete seu perfil".

---

## 7. Atividades

### Lista
Filtros:
- período;
- modalidade;
- provider.

Card/row:
- ícone/modalidade;
- nome/tipo;
- data;
- duração;
- distância quando aplicável;
- métricas principais;
- fonte.

### Detalhe
Mostrar:
- resumo;
- métricas disponíveis;
- splits/laps quando existirem;
- gráficos quando existirem dados adequados;
- dados de FC, pace, potência, cadência etc. apenas quando fornecidos.

Não renderizar cards vazios só para preencher layout.

---

## 8. Integrações / Dispositivos

Cards por provider.

### Garmin
Estados:
- disponível;
- conectado;
- sincronizando;
- erro;
- reconexão necessária.

Ações:
- conectar;
- sincronizar;
- reconectar;
- desconectar.

### Futuros
Podem aparecer como `Em breve` somente se isso fizer sentido no design.

Não criar integrações falsas.

---

## 9. Conectar Garmin

Copy obrigatória, em linguagem clara:

- "Para conectar sua conta Garmin nesta versão, informe o email e a senha usados no Garmin Connect."
- "A conexão é processada pelo servidor da ryvano."
- "Credenciais sensíveis não devem aparecer em logs ou respostas da aplicação."

Depois que a proteção real estiver implementada, informar que credenciais sensíveis são armazenadas de forma criptografada.

Campos:
- email Garmin;
- senha Garmin.

Ações:
- conectar;
- cancelar.

Após sucesso:
- badge conectado;
- data da última sincronização;
- botão sincronizar;
- botão desconectar.

---

## 10. Ativação do WhatsApp

Mostrar:
- telefone cadastrado;
- número ryvano que será contatado;
- explicação em 3 passos;
- botão `Ativar pelo WhatsApp`.

Fluxo UX:
1. gerar código;
2. abrir WhatsApp;
3. usuário envia mensagem;
4. ryvano aguarda webhook;
5. tela consulta/recebe atualização;
6. mostrar sucesso.

Estados:
- código gerado;
- aguardando mensagem;
- validando;
- confirmado;
- expirado;
- telefone diferente;
- código inválido;
- falha da Evolution.

Permitir gerar novo código após expiração.

---

## 11. Preferências de relatórios

Configurações sugeridas:
- relatório após atividade;
- resumo diário;
- resumo semanal;
- horário preferido;
- timezone;
- pausar mensagens.

Na V1, esconder/desabilitar opções ainda não operacionais em vez de fingir que funcionam.

---

## 12. Perfil

Seções:
- dados pessoais;
- medidas;
- endereço;
- email;
- telefone;
- status do telefone/WhatsApp.

Alteração do telefone deve invalidar ou exigir nova verificação do WhatsApp.

---

## 13. Segurança

- alterar senha;
- sessões/dispositivos, se disponível;
- Google conectado;
- recuperação;
- encerrar sessões;
- exclusão de conta / solicitação de exclusão, se definida na política do produto.

---

## 14. Admin

### Overview
KPIs operacionais.

### Usuários
Tabela/lista:
- nome;
- email;
- status;
- onboarding;
- Garmin;
- WhatsApp;
- última sincronização.

### WhatsApp
- status Evolution;
- QR;
- reconnect;
- webhook;
- teste.

### Integrações
- Garmin service health;
- Evolution health;
- erros recentes;
- backlog de sync, se existir.

---

## 15. Sugestões inspiradas em produtos concorrentes

Padrões úteis que justificam evolução futura:

### TrainingPeaks
- dashboard de evolução;
- calendário;
- histórico;
- goals;
- análise de treino.

### Strava
- training log;
- comparação de períodos;
- metas;
- análise por atividade.

### Garmin Connect
- health stats;
- performance stats;
- relatórios ao longo do tempo;
- múltiplos tipos de dados.

### WHOOP
- recuperação;
- strain/carga;
- sono;
- insights simplificados.

Para ryvano, não copiar layout, identidade, texto ou componentes desses produtos. Usar apenas padrões funcionais como referência e continuar respeitando o design system do projeto.

---

## 16. Navegação sugerida

Usuário:

```text
Dashboard
Atividades
Integrações
Relatórios
Perfil
```

Dentro de Perfil/Settings:

```text
Dados pessoais
Segurança
WhatsApp
Preferências
```

Admin:

```text
Overview
Usuários
WhatsApp
Integrações
Auditoria
```

---

## 17. Mobile-first

O WhatsApp é parte central do produto. Portanto:
- todas as telas críticas devem funcionar muito bem no mobile;
- o link de ativação deve funcionar diretamente no telefone;
- tabelas do admin podem ser desktop-first, mas responsivas;
- dashboard e atividades devem ser legíveis sem horizontal scroll.
