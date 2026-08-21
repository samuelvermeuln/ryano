# RYANO

## Docker Compose

Stack incluída:
- `migrate` — aplica `prisma migrate deploy`
- `app` — Next.js 16
- `postgres` — banco da aplicação
- `evolution` — opcional, via profile `whatsapp`

Premissas:
- migrations são aplicadas automaticamente pela própria stack Docker/Compose;
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
2. `migrate` roda `prisma migrate deploy`
3. `app` só inicia depois que migration terminar com sucesso

App:
- `http://localhost:19595`

PostgreSQL:
- `localhost:9596`

Observação:
- com `docker compose`, não é necessário preencher `DATABASE_URL` no `.env`;
- `DATABASE_URL` é montada internamente no serviço `app` a partir de `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`;
- para Google OAuth em produção com `next-auth@4`, configure também `NEXTAUTH_URL` com domínio público final;
- em ambientes atrás de proxy, mantenha `AUTH_TRUST_HOST=true` para harmonizar configuração operacional, mesmo que o redirect principal continue vindo de `NEXTAUTH_URL` nesta versão.

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
  - `EVOLUTION_INSTANCE_NAME=ryano`
  - `EVOLUTION_WEBHOOK_EVENTS=QRCODE_UPDATED,CONNECTION_UPDATE,GROUPS_UPSERT,GROUP_UPDATE,GROUP_PARTICIPANTS_UPDATE,MESSAGES_UPSERT`
  - `EVOLUTION_ALLOW_HTTP_FALLBACK=true`
  - eventos podem ser ajustados no painel admin.

### 4. Healthcheck

Endpoint da aplicação:

```text
GET /api/health
```

### 5. Migrations

Compose executa migration automaticamente via serviço dedicado:

```text
migrate -> prisma migrate deploy
```

Isso vale tanto localmente quanto no Dokploy quando a publicação usar este mesmo `docker-compose.yml`.

Importante:
- migration não roda manualmente no servidor;
- migration não depende de entrar no container web;
- app só sobe depois que `migrate` terminar com sucesso;
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
ryano_specs/VALIDATION_RUNBOOK.md
```
