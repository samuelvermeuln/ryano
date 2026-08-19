# RYANO — Validation Runbook

## Objetivo

Fechar `T05.5 / validação operacional real` com evidência objetiva antes de declarar V1 concluída.

## Pré-requisitos

- `.env` real preenchido
- PostgreSQL acessível
- migrations aplicáveis via CI/CD ou manualmente
- Google OAuth configurado
- SMTP configurado
- Garmin de homologação disponível
- Evolution disponível com webhook apontando para app

## 1. Banco e readiness

### Aplicar migrations

```bash
npx prisma migrate deploy
```

### Verificar health/readiness

```bash
node scripts/ops-health.mjs http://localhost:3000
```

Esperado:
- `ready: true`
- `database.ok: true`
- `config.databaseUrl: true`
- `config.authSecret: true`
- `config.authUrl: true`
- `config.appUrl: true`
- `config.dataEncryptionKey: true`

## 2. Auth

### Credentials
- criar conta em `/cadastro`
- autenticar em `/entrar`
- confirmar redirecionamento correto
- confirmar sessão persistida

### Google OAuth
- iniciar login Google
- confirmar criação/persistência em `User` + `Account`
- confirmar reaproveitamento de `name`, `email`, `image`

## 3. Reset por SMTP

- abrir `/recuperar-senha`
- solicitar reset com email real
- confirmar recebimento do email
- abrir link recebido
- redefinir senha
- confirmar sessões antigas invalidadas
- confirmar login com nova senha

## 4. Onboarding

- concluir etapas 1–3
- conectar Garmin na etapa 4
- ativar WhatsApp na etapa 5
- confirmar stepper completo `5/5`

## 5. Garmin

- conectar com credenciais reais
- confirmar `WearableConnection.status = CONNECTED`
- confirmar secrets gravados em `WearableSecret`
- executar sync
- confirmar atividades em `Activity`
- repetir sync
- confirmar ausência de duplicidade
- desconectar
- confirmar status e remoção de secrets

## 6. WhatsApp / Evolution

- abrir `/admin/whatsapp`
- confirmar status da instância
- gerar QR/reconnect
- parear instância
- confirmar identity conectada
- confirmar webhook recebendo eventos
- enviar mensagem teste
- desconectar instância

## 7. Ativação WhatsApp

- gerar link de ativação em `/app/integracoes`
- confirmar `wa.me`
- enviar mensagem pelo número correto
- confirmar webhook consome token
- confirmar `WhatsAppIdentity.verifiedAt`
- regenerar código e repetir quando necessário

## 8. Reports

- deixar `postActivityReport = true`
- sincronizar nova atividade após WhatsApp verificado
- confirmar `MessageDelivery`
- confirmar envio único por atividade

## 9. Rate limit

Validar ao menos:
- login
- signup
- password reset request
- password reset submit
- Garmin connect/sync
- WhatsApp activation
- admin Evolution actions

Esperado:
- bloqueio após limite
- respostas `429` nas rotas API
- mensagens honestas nas server actions
- persistência em `RateLimitBucket`

## 10. Evidências mínimas para fechar V1

Registrar:
- saída de `npx prisma migrate deploy`
- saída de `node scripts/ops-health.mjs`
- screenshots curtas dos fluxos críticos
- amostras sanitizadas de logs
- confirmação de `npm run lint`
- confirmação de `npm test`
- confirmação de `npm run build`

## 11. Não declarar concluído se faltar

- PostgreSQL real
- Google OAuth real
- SMTP real
- Garmin real
- Evolution real
- webhook real
- evidência de migrate deploy
