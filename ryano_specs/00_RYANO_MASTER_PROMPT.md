# RYANO — Prompt Mestre de Implementação

## Objetivo

Implementar a primeira versão funcional da plataforma **RYANO**, uma aplicação web voltada inicialmente para receber dados de atividades esportivas de wearables e entregar relatórios e insights ao usuário via WhatsApp.

A primeira integração de wearable será **Garmin**, utilizando uma API já existente fornecida pelo projeto. A arquitetura deve ser preparada desde o início para suportar outros relógios, wearables, acessórios e provedores no futuro sem acoplar o domínio da aplicação ao Garmin.

A evolução futura do produto incluirá:
- alimentação;
- treinos;
- planejamento esportivo;
- acompanhamento de performance;
- múltiplas modalidades esportivas;
- insights personalizados;
- novos wearables e acessórios.

A V1 deve ser implementada com qualidade de produção e sem antecipar funcionalidades da V2 que ainda não foram aprovadas.

---

# 1. REGRA OBRIGATÓRIA DE DESIGN

Antes de escrever, alterar ou gerar qualquer interface, leia integralmente e respeite:

```text
C:\Users\samuelv\Documents\Projetos pessoais\zap\zap-deals\.kiro\agents\skills\design-system.skill.md
C:\Users\samuelv\Documents\Projetos pessoais\zap\zap-deals\.cave\agents\designer.md
```

Esses dois arquivos são **fonte de verdade obrigatória para UI/UX**.

Regras:
1. Não inventar um novo design system.
2. Não substituir tokens, componentes, espaçamentos, tipografia, cores, radius, grid ou padrões definidos nesses arquivos.
3. Reutilizar componentes existentes antes de criar novos.
4. Seguir os padrões de responsividade e acessibilidade definidos pelo projeto.
5. Preservar a identidade visual existente.
6. Se um componente necessário não existir, criá-lo dentro das regras do design system.
7. Não usar uma biblioteca visual paralela que quebre a consistência existente.
8. `designer.md` define o processo/comportamento do agente de design; `design-system.skill.md` define as regras visuais e de sistema. Respeitar ambos.
9. Em caso de aparente conflito, preferir a opção que preserve melhor o design system existente e não altere padrões globais sem necessidade.
10. Antes de implementar, identificar os componentes reutilizáveis existentes e registrar brevemente o que será reutilizado.

**Não começar a implementação visual sem ler esses arquivos.**

---

# 2. REGRA OBRIGATÓRIA DE INVESTIGAÇÃO DO PROJETO

Antes de implementar:

1. Inspecionar a estrutura atual do projeto.
2. Identificar versão do Next.js e estrutura do App Router/Pages Router.
3. Identificar dependências já instaladas.
4. Identificar componentes, layouts, providers, middleware e padrões existentes.
5. Verificar se já existe autenticação, Prisma, banco, API interna, validação ou sistema de forms.
6. Reutilizar implementação existente quando apropriado.
7. Não duplicar funções, schemas, utilitários ou componentes.
8. Não reescrever áreas não relacionadas à feature.
9. Preservar compatibilidade com o CI/CD e deployment atual.
10. Só depois dessa análise iniciar as alterações.

O projeto deve permanecer funcional durante a implementação.

---

# 3. STACK OBRIGATÓRIA

Usar:

- **Next.js** como aplicação full-stack.
- **TypeScript**, se o projeto já estiver em TypeScript; se estiver em JavaScript, avaliar migração apenas se for segura e incremental.
- **Next.js Route Handlers / API Routes** para a API interna.
- **Prisma ORM**.
- **PostgreSQL**.
- autenticação por email/senha;
- autenticação com Google;
- integração Garmin;
- integração Evolution API para WhatsApp.

Não criar uma API backend separada nesta fase.

A API da aplicação deve fazer parte do próprio projeto Next.js.

---

# 4. TELAS OBRIGATÓRIAS DA V1

Implementar:

1. Landing Page
2. Login
3. Cadastro
4. Recuperação de senha
5. Login com Google
6. Onboarding / completar cadastro
7. Dashboard
8. Atividades
9. Detalhe da atividade
10. Conectar dispositivo / Garmin
11. Ativação do WhatsApp
12. Perfil / dados do usuário
13. Preferências de relatórios/notificações
14. Integrações / dispositivos
15. Segurança da conta
16. Área administrativa
17. Administração do WhatsApp / Evolution
18. Administração de usuários
19. Estado/saúde das integrações

Detalhes de UX estão em `01_PRODUCT_UX_SPEC.md`.

---

# 5. CADASTRO DO USUÁRIO

O usuário deverá ter, no mínimo:

- nome completo;
- CPF;
- email;
- telefone;
- endereço;
- altura;
- peso.

Estruturar endereço adequadamente, preferencialmente:
- CEP;
- logradouro;
- número;
- complemento;
- bairro;
- cidade;
- estado;
- país.

### Login com Google

Quando o usuário entrar com Google:
- preencher automaticamente os campos que o Google retornar de forma confiável, como nome e email;
- não inventar CPF, telefone, altura, peso ou endereço;
- direcionar o usuário para completar os campos obrigatórios restantes.

O cadastro não deve ser considerado totalmente concluído enquanto os campos obrigatórios de onboarding não estiverem preenchidos.

---

# 6. AUTENTICAÇÃO

Suportar:

### Email + senha
- cadastro;
- login;
- logout;
- recuperação de senha;
- redefinição segura;
- validação de email, se a infraestrutura atual suportar email transacional.

### Google OAuth
- login;
- criação/associação segura da conta;
- preencher nome e email retornados pelo Google.

Preferir solução madura compatível com Next.js e Prisma, como **Auth.js**, respeitando a versão atual do projeto.

Senhas nunca podem ser armazenadas em texto puro.

---

# 7. INTEGRAÇÃO GARMIN — V1

O Garmin será o primeiro provider de wearable.

A implementação não pode espalhar lógica Garmin pelo sistema inteiro.

Criar uma abstração de provider, por exemplo:

```text
WearableProvider
├── GarminProvider
├── AppleProvider        [futuro]
├── PolarProvider        [futuro]
├── CorosProvider        [futuro]
├── SuuntoProvider       [futuro]
└── FitbitProvider       [futuro]
```

A interface/conjunto de contratos deve permitir funções equivalentes a:

```ts
connect()
disconnect()
validateConnection()
syncActivities()
getActivities()
getActivity()
getHealthMetrics()
getConnectionStatus()
```

Nem todos os providers futuros precisarão implementar todos os recursos imediatamente; prever capabilities.

---

# 8. API GARMIN ATUAL

Existe um serviço Garmin externo já criado.

Base URL atual:

```text
http://167.86.116.131:8001
```

Endpoints conhecidos:

### Criar/vincular conta Garmin

```bash
curl --location "${GARMIN_SERVICE_BASE_URL}/accounts" \
  --header "Content-Type: application/json" \
  --header "X-Admin-Key: ${GARMIN_ADMIN_KEY}" \
  --data-raw '{
    "email": "<garmin-email>",
    "password": "<garmin-password>",
    "label": "<user-label>"
  }'
```

### Consultar atividades

```bash
curl --location "${GARMIN_SERVICE_BASE_URL}/activities?start=0&limit=10" \
  --header "X-API-Key: ${GARMIN_ACCOUNT_API_KEY}"
```

## IMPORTANTE

As credenciais e chaves fornecidas durante o desenvolvimento **não podem ser hardcodadas**.

Usar variáveis de ambiente.

Não registrar:
- senha Garmin;
- X-Admin-Key;
- X-API-Key;
- tokens;
- session secrets.

Também não devolver esses valores ao browser.

### Conexão

Na tela **Conectar Garmin**, explicar claramente:

- o usuário precisará informar o login e a senha utilizados no Garmin Connect;
- as credenciais serão enviadas ao backend da RYANO;
- o backend se comunicará com o serviço Garmin;
- as credenciais sensíveis devem ser criptografadas/protegidas conforme `04_DATA_SECURITY_AUTH.md`.

Após conectar:
1. criar/vincular conta no serviço externo;
2. armazenar apenas os identificadores/tokens necessários de forma protegida;
3. validar a conexão;
4. buscar atividades iniciais;
5. apresentar status ao usuário;
6. permitir desconectar/reconectar.

**Não assumir silenciosamente o formato da resposta de `/accounts`.**
Inspecionar a resposta real da API e criar um mapper explícito. Se a resposta não retornar a chave necessária, tratar isso como dependência a ser documentada, não inventar campos.

---

# 9. LOGIN GARMIN DENTRO DA RYANO — NÃO IMPLEMENTAR NA V1

Existe uma ideia futura de permitir que o usuário seja encaminhado para um fluxo oficial Garmin e autorize a RYANO sem digitar diretamente suas credenciais Garmin na aplicação.

Isso é **V2**.

Não implementar browser automation, scraping de login, iframe ou captura de sessão Garmin nesta V1.

Para V2, priorizar integração oficial do Garmin Connect Developer Program via **OAuth 2.0** quando comercialmente/tecnicamente disponível para o projeto.

Deixar a camada de `WearableProvider` pronta para uma futura estratégia de autenticação OAuth sem quebrar o modelo de domínio.

---

# 10. WHATSAPP COM EVOLUTION API

A RYANO utilizará **Evolution API**.

O conceito da V1 é:

- haverá um número de WhatsApp da RYANO;
- a instância será administrada pela área de admin;
- o admin verá QR Code/status para conectar ou reconectar o número;
- todos os clientes receberão mensagens originadas dessa identidade/número da RYANO;
- cada cliente será individualmente vinculado e verificado pelo número de telefone.

Criar um adapter:

```text
MessagingProvider
└── EvolutionWhatsAppProvider
```

Não espalhar chamadas da Evolution API pelos componentes ou rotas.

---

# 11. ATIVAÇÃO DO WHATSAPP DO CLIENTE

Esse fluxo é obrigatório.

Depois que o usuário:

1. criou/logou na conta;
2. completou seus dados;
3. informou seu telefone;
4. conectou a Garmin ou avançou até o passo correspondente;

a tela de conexão deverá apresentar **Ativar WhatsApp**.

## Fluxo

1. Backend gera um token de ativação de uso único e expiração curta.
2. Nunca salvar o token bruto no banco; salvar hash.
3. Gerar um link `wa.me` para o número oficial da RYANO.
4. O link deve abrir o WhatsApp do usuário com uma mensagem pré-preenchida.
5. O usuário ainda precisará pressionar **Enviar** no WhatsApp.
6. A mensagem deve conter o nome e token/código do cliente.
7. A Evolution recebe a mensagem.
8. Um webhook da aplicação processa a mensagem.
9. Validar:
   - token;
   - expiração;
   - uso único;
   - telefone remetente;
   - telefone cadastrado normalizado.
10. Se tudo estiver correto, vincular `WhatsApp identity -> user`.
11. Marcar telefone/WhatsApp como verificado.
12. Invalidar o token.
13. Exibir na RYANO o status "WhatsApp conectado".

Exemplo de mensagem pré-preenchida:

```text
Olá, RYANO! Quero ativar meus relatórios.

Nome: <nome>
Código de ativação: <token>
```

Não incluir CPF, endereço, senha Garmin ou outros dados sensíveis nessa mensagem.

## Segurança

O token:
- deve ser criptograficamente aleatório;
- deve expirar;
- deve ser single-use;
- deve ser armazenado somente como hash;
- não deve funcionar para telefone diferente do telefone cadastrado;
- deve ter proteção contra tentativas repetidas.

---

# 12. DASHBOARD

O dashboard deve priorizar informação útil e não excesso de métricas.

V1 sugerida:

- saudação;
- status Garmin;
- status WhatsApp;
- última sincronização;
- atividade mais recente;
- quantidade de atividades no período;
- duração total;
- distância total, quando aplicável;
- resumo por modalidade;
- evolução básica;
- últimos treinos;
- CTA para resolver integração incompleta.

Preparar componentes para futuramente receber:
- recuperação;
- sono;
- carga;
- frequência cardíaca;
- VO2 max;
- readiness;
- alimentação;
- plano de treino;
- metas.

Não exibir métricas que a API atual ainda não fornece.

---

# 13. ATIVIDADES

Criar uma tela de histórico com:

- paginação;
- filtros por modalidade;
- filtro por período;
- busca quando aplicável;
- data;
- modalidade;
- duração;
- distância;
- principais métricas disponíveis;
- origem/provider;
- status da sincronização.

Criar tela de detalhe da atividade capaz de renderizar dinamicamente os campos existentes.

O domínio interno não deve depender do JSON bruto do Garmin.

Normalizar dados essenciais e manter `rawPayload` somente quando realmente necessário, com política de retenção definida.

---

# 14. RELATÓRIOS PELO WHATSAPP

A V1 deve deixar o domínio preparado para:

- relatório após nova atividade;
- resumo diário;
- resumo semanal;
- alertas/status de sincronização.

Criar preferências por usuário, por exemplo:

```text
postActivityReport
dailySummary
weeklySummary
reportTime
timezone
enabled
```

O disparo deve ser feito pelo backend/serviço apropriado, nunca pelo browser.

Se ainda não existir infraestrutura de jobs, implementar a abstração necessária sem criar uma arquitetura excessivamente complexa. Para tarefas síncronas pequenas, manter simples; para jobs agendados/polling, deixar service layer claramente separada.

---

# 15. ADMIN

A área administrativa deve possuir controle de acesso por role.

Mínimo:

### Dashboard administrativo
- total de usuários;
- usuários ativos;
- Garmin conectado;
- WhatsApp verificado;
- falhas recentes de integração;
- última sincronização;
- status geral dos serviços.

### WhatsApp / Evolution
- status da instância;
- conectar;
- exibir QR Code quando necessário;
- desconectar/reconectar;
- telefone conectado;
- última alteração de status;
- webhook status;
- envio de mensagem de teste;
- erros recentes, sem revelar secrets.

### Usuários
- listar;
- pesquisar;
- abrir detalhe;
- ver status de onboarding;
- Garmin conectado;
- WhatsApp verificado;
- última atividade;
- última sincronização;
- bloquear/desbloquear quando necessário.

Nunca permitir que o admin visualize senha do usuário ou senha Garmin em texto puro.

---

# 16. TELAS ADICIONAIS RECOMENDADAS

Com base nos padrões de produtos como Garmin Connect, TrainingPeaks, Strava e WHOOP, incluir na arquitetura de navegação — algumas podem ficar inicialmente simples:

### V1
- Dashboard;
- Atividades;
- Detalhe da atividade;
- Integrações/Dispositivos;
- Preferências de relatórios;
- Perfil;
- Segurança;
- Onboarding;
- Admin.

### Evolução
- Calendário de treino;
- Metas;
- Tendências/Performance;
- Recordes pessoais;
- Saúde/Recuperação;
- Sono;
- Nutrição;
- Plano de treino;
- Coach/Insights;
- Comparação de períodos.

Não implementar todas as telas futuras agora. Apenas estruturar navegação/domínio para evolução sem retrabalho desnecessário.

---

# 17. `.env` E SECRETS

Criar:

```text
.env.example
```

Sem secrets reais.

Variáveis mínimas esperadas:

```env
DATABASE_URL=

AUTH_SECRET=
AUTH_URL=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

APP_URL=

DATA_ENCRYPTION_KEY=

GARMIN_SERVICE_BASE_URL=
GARMIN_ADMIN_KEY=

EVOLUTION_API_BASE_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE_NAME=
EVOLUTION_WEBHOOK_SECRET=

RYANO_WHATSAPP_NUMBER=
```

Adicionar outras somente se forem necessárias.

Nunca commitar `.env` real.

Garantir `.env` no `.gitignore`.

---

# 18. PRISMA / POSTGRESQL

Criar schema organizado para:

- User
- Account/AuthAccount
- Session, se aplicável
- PasswordResetToken
- UserProfile
- Address
- WearableConnection
- WearableCredential/secret reference
- Activity
- ActivityMetric ou JSON normalizado conforme necessidade
- WhatsAppIdentity
- WhatsAppActivationToken
- NotificationPreference
- MessageDelivery
- SyncJob / SyncState
- IntegrationEvent
- AdminAuditLog

Detalhamento em `04_DATA_SECURITY_AUTH.md`.

Usar migrations versionadas.

Não usar `db push` como substituto permanente de migrations em produção.

---

# 19. PRIVACIDADE E SEGURANÇA

A aplicação manipulará dados pessoais e dados relacionados à saúde/performance.

Obrigatório:

- HTTPS em produção;
- secrets somente no servidor;
- criptografia de credenciais Garmin em repouso;
- password hashing adequado;
- tokens com expiração;
- evitar PII nos logs;
- rate limit em login, recuperação, ativação e webhooks;
- validar inputs;
- autorização server-side;
- proteção CSRF quando aplicável;
- trilha de auditoria para ações administrativas relevantes;
- princípio de menor privilégio;
- não expor stack traces ao usuário;
- não armazenar credenciais externas se elas não forem necessárias após o provisionamento.

### Comunicação de segurança na UI

Não afirmar genericamente "seus dados são criptografados" se a implementação não sustentar isso.

Depois de implementar as proteções, a comunicação pode dizer algo como:

> Seus dados são protegidos em trânsito e credenciais sensíveis são armazenadas de forma criptografada.

Evitar alegações absolutas como "100% seguro".

---

# 20. NÃO IMPLEMENTAR AGORA

Fora de escopo da V1:

- captura automática do login Garmin dentro de webview;
- browser automation para Garmin;
- scraping do portal Garmin;
- alimentação;
- prescrição de dieta;
- geração de treinos;
- coach de IA completo;
- integrações com todos os wearables;
- marketplace;
- rede social;
- pagamentos, salvo se já fizerem parte do projeto;
- aplicativo mobile nativo.

Apenas deixar a arquitetura extensível.

---

# 21. CRITÉRIO DE CONCLUSÃO

Não considerar a tarefa concluída apenas porque as páginas renderizam.

A V1 precisa permitir o fluxo real:

```text
Landing
  ↓
Cadastro/Login
  ↓
Completar perfil
  ↓
Conectar Garmin
  ↓
Validar conexão / importar atividades
  ↓
Ativar WhatsApp
  ↓
Mensagem do cliente chega na Evolution
  ↓
Token + telefone são validados
  ↓
WhatsApp fica vinculado ao usuário
  ↓
Dashboard exibe atividades
  ↓
Preferências definem relatórios
  ↓
RYANO consegue enviar relatório ao WhatsApp verificado
```

Também deve existir o fluxo administrativo:

```text
Admin
  ↓
Evolution / WhatsApp
  ↓
Visualizar estado
  ↓
Gerar/visualizar QR Code
  ↓
Conectar instância RYANO
  ↓
Verificar webhook
  ↓
Enviar teste
```

---

# 22. QUALIDADE

Antes de entregar:

- lint;
- typecheck;
- build;
- migrations;
- testes do fluxo crítico;
- testes de autorização;
- testes do webhook;
- tratamento de erro;
- estados vazios;
- loading;
- erro de integração;
- responsividade;
- acessibilidade;
- sem secrets no Git;
- sem credenciais em logs;
- sem mock silencioso em fluxo crítico.

Se um serviço externo não estiver disponível, mostrar estado de erro e documentar o bloqueio; não falsificar sucesso.

---

# 23. ORDEM DE IMPLEMENTAÇÃO

Executar aproximadamente nesta ordem:

1. leitura obrigatória do design system + designer;
2. auditoria da base atual;
3. arquitetura e modelo de dados;
4. Prisma/Postgres + migrations;
5. auth email/senha + Google;
6. onboarding/perfil;
7. layout/app navigation;
8. abstraction `WearableProvider`;
9. Garmin;
10. atividades;
11. Evolution provider;
12. admin QR/status;
13. ativação WhatsApp por token;
14. preferências;
15. envio de relatório inicial;
16. dashboard;
17. hardening de segurança;
18. testes;
19. validação visual final segundo o design system.

Consultar também:
- `01_PRODUCT_UX_SPEC.md`
- `02_TECHNICAL_ARCHITECTURE.md`
- `03_INTEGRATIONS_GARMIN_WHATSAPP.md`
- `04_DATA_SECURITY_AUTH.md`
- `05_ACCEPTANCE_CRITERIA_ROADMAP.md`
