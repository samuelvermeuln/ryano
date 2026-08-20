# RYANO

## Docker Compose

Stack incluída:
- `app` — Next.js 16
- `postgres` — banco da aplicação
- `evolution` — opcional, via profile `whatsapp`

Premissas:
- migrations **não** rodam no startup do container;
- pipeline/CI-CD aplica migrations de forma controlada;
- Garmin continua serviço externo na arquitetura.

### 1. Preparar variáveis

```bash
cp .env.example .env
```

Ajustar ao menos:
- `POSTGRES_PASSWORD`
- `APP_PORT`, se `19595` também conflitar no host
- `POSTGRES_PORT`, se `9596` também conflitar no host
- `AUTH_SECRET`
- `DATA_ENCRYPTION_KEY`
- `EVOLUTION_API_KEY`
- `EVOLUTION_WEBHOOK_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, se OAuth Google for usado
- `GARMIN_SERVICE_BASE_URL` / `GARMIN_ADMIN_KEY`, se Garmin estiver disponível

### 2. Subir app + banco

```bash
docker compose up --build
```

App:
- `http://localhost:19595`

PostgreSQL:
- `localhost:9596`

### 3. Subir com Evolution local opcional

```bash
docker compose --profile whatsapp up --build
```

Observação:
- bloco `evolution` foi deixado como homologação local;
- imagem/envs podem exigir ajuste conforme versão oficial da Evolution instalada no ambiente.

### 4. Healthcheck

Endpoint da aplicação:

```text
GET /api/health
```

### 5. Migrations

Compose não executa migration automaticamente.

Aplicar via pipeline ou manualmente antes de usar ambiente novo:

```bash
npx prisma migrate deploy
```

### 6. Password reset por email

Fluxo real usa SMTP quando estas variáveis estiverem configuradas:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SMTP_SECURE`

Sem SMTP:
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
