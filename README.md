# ryvano

## Docker Compose

Stack incluída:
- `app` — Next.js 16
- `postgres` — banco da aplicação
- `evolution` — opcional, via profile `whatsapp`

Premissas:
- migrations são aplicadas automaticamente pelo próprio container `app` no startup;
- container web não depende de execução manual no servidor para promover schema;
- Garmin continua serviço externo na arquitetura.

### 1. Preparar variáveis

```bash
cp .env.example .env
```

Ajustar ao menos:
- `POSTGRES_PASSWORD`
- `APP_PORT`, se `19595` conflitar no host
- `POSTGRES_PORT`, se `9596` conflitar no host
- `AUTH_SECRET`
- `AUTH_URL`
- `NEXTAUTH_URL`
- `AUTH_TRUST_HOST`
- `APP_URL`
- `DATA_ENCRYPTION_KEY`
- `EVOLUTION_API_KEY`
- `SEND_API_URL`
- `SEND_API_KEY`
- `SEND_FROM`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, se OAuth Google for usado
- `GARMIN_SERVICE_BASE_URL` / `GARMIN_ADMIN_KEY`, se Garmin estiver disponível

### 2. Subir stack

```bash
docker compose up --build
```

Ordem:
1. `postgres` sobe
2. `app` aguarda banco saudável
3. no próprio startup do container, `app` roda `prisma migrate deploy`
4. só depois sobe `server.js`

App:
- `http://localhost:19595`

PostgreSQL:
- `localhost:9596`

Observação:
- com `docker compose`, sem `DATABASE_URL` definida, app usa PostgreSQL local da própria stack;
- se `DATABASE_URL` estiver definida no `.env`, app passa a usar esse banco externo/publicado;
- para Google OAuth em produção com `next-auth@4`, configure também `NEXTAUTH_URL` com domínio público final;
- em ambientes atrás de proxy, mantenha `AUTH_TRUST_HOST=true` para harmonizar configuração operacional, mesmo que o redirect principal continue vindo de `NEXTAUTH_URL` nesta versão.

### 2.1. Usar banco publicado/localmente

Para rodar projeto local apontando para banco já publicado, definir no `.env`:

```text
DATABASE_URL="postgresql://usuario:senha@host-ou-ip:9596/ryvano?schema=public"
```

Efeito:
- `docker compose up --build` passa a subir app local lendo banco remoto;
- sem `DATABASE_URL`, stack continua usando PostgreSQL local do próprio compose;
- serviço `postgres` ainda sobe localmente no compose atual, mas app passa a ler banco definido em `DATABASE_URL`.

Atenção:
- não exponha PostgreSQL publicamente sem restrição de IP, senha forte e TLS/túnel quando possível;
- para produção, preferir VPN, SSH tunnel ou allowlist em vez de banco aberto para internet inteira.

### 2.2. Cache de build compatível com Dokploy

`docker-compose.yml` usa cache inline da própria imagem `ryvano-web:latest`.

Efeito:
- compatível com builder `docker` usado em muitos ambientes Dokploy;
- evita `cache_to`, que falha com `Cache export is not supported for the docker driver`;
- reaproveitamento depende da imagem anterior ainda existir localmente no host de deploy.

Observação:
- ganho costuma aparecer entre deploys no mesmo servidor;
- se Dokploy limpar imagens antigas ou buildar em outro host, cache pode não ser reaproveitado.

### 3. Subir com Evolution local opcional

```bash
docker compose --profile whatsapp up --build
```

Observação:
- bloco `evolution` foi deixado como homologação local;
- imagem/envs podem exigir ajuste conforme versão oficial da Evolution instalada no ambiente;
- número operacional do WhatsApp não vem mais de env: app detecta automaticamente o número da instância conectada na Evolution;
- se instância ainda não existir, backend tenta criar automaticamente antes de QR/webhook/envio;
- defaults atuais da Evolution no projeto:
  - `EVOLUTION_INSTANCE_NAME=ryvano`
  - `EVOLUTION_WEBHOOK_EVENTS=QRCODE_UPDATED,CONNECTION_UPDATE,GROUPS_UPSERT,GROUP_UPDATE,GROUP_PARTICIPANTS_UPDATE,MESSAGES_UPSERT`
  - `EVOLUTION_ALLOW_HTTP_FALLBACK=true`
  - eventos podem ser ajustados no painel admin.

### 4. Healthcheck

Endpoint da aplicação:

```text
GET /api/health
```

### 4.1. Job Garmin agendado

Endpoint interno para automação:

```text
GET ou POST /api/integrations/garmin/jobs
Authorization: Bearer <GARMIN_ADMIN_KEY>
```

O job faz duas coisas no mesmo disparo:
- sincroniza usuários Garmin conectados;
- enfileira e envia `daily report` vencido conforme `NotificationPreference.reportTime`.

Regras atuais:
- se usuário não escolher horário, padrão é `18:00`;
- timezone padrão é `UTC`;
- atividade nova detectada na sync entra na fila de pós-atividade;
- Garmin roda probes leves em lotes controlados no admin e só faz sync completo quando o último ID muda;
- volume e pausa entre mensagens são controlados no admin;
- intervalo padrão do job no admin é `1 min`.

Operação recomendada:
- chamar endpoint em frequência curta (`1 min`);
- sem esse cron ativo, a Ryvano só sincroniza na conexão inicial ou quando alguém aciona manualmente;
- backend respeita intervalo mínimo salvo no admin;
- probe Garmin pega só parte dos usuários por rodada (`maxProbesPerRun`);
- usuários com WhatsApp verificado e relatório pós-atividade ativo entram na cadência de `60s`;
- demais conexões Garmin ficam na cadência de `15 min`;
- erro/rate limit aplica backoff progressivo de `5`, `15`, `30` e `60 min`;
- envio WhatsApp pega só parte da fila por rodada (`maxMessagesPerRun`);
- admin ainda pode travar teto absoluto por hora e por dia (`maxMessagesPerHour` / `maxMessagesPerDay`);
- admin pode pausar globalmente os envios WhatsApp sem desligar sync Garmin.

Exemplo cron em servidor Linux rodando a cada 1 min:

```bash
* * * * * curl -fsS http://localhost:3000/api/integrations/garmin/jobs -H "Authorization: Bearer SEU_GARMIN_ADMIN_KEY" >/tmp/ryvano-garmin-jobs.log 2>&1
```

Exemplo manual:

```bash
curl http://localhost:3000/api/integrations/garmin/jobs \
  -H "Authorization: Bearer SEU_GA..._KEY"
```

### 4.2. Jobs Strava agendados

O processamento de webhooks e o sync de contingência são separados para evitar
polling desnecessário na API Strava.

- A cada 1 min: processar somente eventos Strava que já foram recebidos e estão
  na fila local (`PENDING`). Sem evento pendente, esta chamada não consulta a
  API Strava.
- Uma vez por dia: sync incremental de todas as conexões Strava e limpeza de
  retenção local.

```bash
# A cada minuto: fila de webhooks
* * * * * curl -fsS http://localhost:3000/api/integrations/strava/jobs -H "Authorization: Bearer SEU_STRAVA_ADMIN_KEY" >/tmp/ryvano-strava-webhooks.log 2>&1

# Uma vez por dia, às 03:15 UTC: sync de contingência + retenção
15 3 * * * curl -fsS http://localhost:3000/api/integrations/strava/jobs/daily -H "Authorization: Bearer SEU_STRAVA_ADMIN_KEY" >/tmp/ryvano-strava-daily.log 2>&1
```

Os eventos pendentes vivem no PostgreSQL (`StravaWebhookEvent`), não na memória
do container. Um deploy/restart preserva a fila desde que o mesmo banco/volume
seja mantido. A limpeza diária remove apenas payloads cujo TTL já expirou.

### 5. Migrations

Compose executa migration automaticamente no startup do próprio container `app`:

```text
app -> prisma migrate deploy -> server.js
```

Abordagem espelha fluxo já usado em `zap-deals`: sem serviço one-shot `migrate`, sem loop de `service_completed_successfully` no Compose do Dokploy.

Observação técnica:
- imagem final também carrega `node_modules` completas para garantir que Prisma CLI tenha suas dependências transitivas no runtime do Dokploy;
- build usa `BUILDKIT_INLINE_CACHE=1` + `cache_from: ryvano-web:latest` para reaproveitar cache sem depender de export local/registry.

Importante:
- migration não roda manualmente no servidor;
- migration não depende de entrar em container separado;
- app só fica de pé depois que `prisma migrate deploy` terminar com sucesso;
- Dokploy ainda precisa injetar envs corretas de runtime (`AUTH_URL`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST`, `APP_URL`, etc.).

#### Feature flags em produção (armadilha conhecida)

`SCHOOL_MODULE_ENABLED` e `MARKETPLACE_ENABLED` **precisam estar presentes no
ambiente de produção**. Quando não definidas, `isSchoolModuleEnabled()` só
auto-habilita se `NODE_ENV !== "production"` ou `VERCEL_ENV === "preview"`; o
container define `NODE_ENV=production` e não roda na Vercel, então a flag
ausente resolve para `false`.

O efeito não é um erro visível: cada página protegida chama `notFound()`, e
`/marketplace`, `/escola`, `/professor` e ~80 outras rotas passam a renderizar
404 com o código perfeitamente correto. O `docker-compose.yml` já passa as duas
com default `true`; se o Dokploy sobrescrever o ambiente pela UI, as duas
precisam ser declaradas lá também. Para desligar de propósito, use o valor
explícito `"false"` (kill-switch), nunca removendo a variável.

### 6. Password reset por email

Fluxo real usa provider HTTP de email (`Send` / endpoint compatível com Resend) quando estas variáveis estiverem configuradas:
- `SEND_API_URL`
- `SEND_API_KEY`
- `SEND_FROM`

Sem provider configurado:
- em desenvolvimento, tela expõe link local com transparência;
- em produção, recuperação por email fica indisponível de forma explícita.

### 7. Readiness / smoke operacional

Health endpoint agora valida:
- config core mínima
- conectividade com PostgreSQL
- flags honestas de integrações configuradas

Executar smoke local:

```bash
npm run ops:health
```

Ou apontando URL explícita:

```bash
node scripts/ops-health.mjs http://localhost:19595
```

### 8. Runbook de validação real

Checklist operacional completo em:

```text
ryvano_specs/VALIDATION_RUNBOOK.md
```
