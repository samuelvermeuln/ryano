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
- com `docker compose`, não é necessário preencher `DATABASE_URL` no `.env`;
- `DATABASE_URL` é montada internamente no serviço `app` a partir de `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`;
- para Google OAuth em produção com `next-auth@4`, configure também `NEXTAUTH_URL` com domínio público final;
- em ambientes atrás de proxy, mantenha `AUTH_TRUST_HOST=true` para harmonizar configuração operacional, mesmo que o redirect principal continue vindo de `NEXTAUTH_URL` nesta versão.

### 2.1. Cache real de build entre deploys

`docker-compose.yml` agora importa/exporta cache BuildKit em:

```text
${DOCKER_BUILD_CACHE_DIR:-.docker-cache/buildkit}
```

Efeito:
- `npm ci` e layer de `node_modules` passam a ser reaproveitados entre builds;
- recálculo pesado só acontece quando `package-lock.json` ou etapas anteriores mudarem;
- default local grava cache em `.docker-cache/buildkit`.

Para Dokploy/servidor:
- definir `DOCKER_BUILD_CACHE_DIR` para caminho persistente no host, por exemplo:

```text
/var/lib/dokploy/cache/ryvano-buildkit
```

Sem caminho persistente no host, cache pode sumir entre deploys e ganho fica parcial.

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

### 5. Migrations

Compose executa migration automaticamente no startup do próprio container `app`:

```text
app -> prisma migrate deploy -> server.js
```

Abordagem espelha fluxo já usado em `zap-deals`: sem serviço one-shot `migrate`, sem loop de `service_completed_successfully` no Compose do Dokploy.

Observação técnica:
- imagem final também carrega `node_modules` completas para garantir que Prisma CLI tenha suas dependências transitivas no runtime do Dokploy;
- cache BuildKit de dependências é reaproveitado entre deploys quando `DOCKER_BUILD_CACHE_DIR` aponta para diretório persistente no host.

Importante:
- migration não roda manualmente no servidor;
- migration não depende de entrar em container separado;
- app só fica de pé depois que `prisma migrate deploy` terminar com sucesso;
- Dokploy ainda precisa injetar envs corretas de runtime (`AUTH_URL`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST`, `APP_URL`, etc.).

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
