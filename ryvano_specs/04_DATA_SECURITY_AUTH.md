# ryvano — Data Model, Authentication & Security Spec

## 1. Classificação dos dados

A aplicação manipula:
- identidade;
- CPF;
- endereço;
- telefone;
- email;
- altura;
- peso;
- atividades esportivas;
- métricas fisiológicas, dependendo da fonte;
- credenciais de terceiros;
- tokens de autenticação.

Tratar como dados sensíveis do produto, com minimização e acesso restrito.

---

# 2. Prisma — modelo conceitual

Os nomes finais podem ser ajustados ao padrão do projeto.

## User

```text
id
name
email
emailVerified
role
status
createdAt
updatedAt
```

## UserProfile

```text
id
userId
cpfEncrypted
cpfHash
phoneE164
heightCm
weightKg
onboardingCompletedAt
createdAt
updatedAt
```

Se o CPF precisar de busca/uniqueness:
- usar hash determinístico/HMAC apropriado para lookup;
- manter valor recuperável apenas se necessário, criptografado.

## Address

```text
id
userId
postalCode
street
number
complement
district
city
state
country
```

Avaliar criptografia de campos conforme requisitos de privacidade e operação.

## WearableConnection

```text
id
userId
provider
externalAccountId
status
capabilities
lastSyncAt
lastSyncStatus
lastErrorCode
createdAt
updatedAt
```

## WearableSecret

```text
id
wearableConnectionId
secretType
ciphertext
iv/nonce
authTag
keyVersion
createdAt
updatedAt
```

Nunca plaintext.

## Activity

Conforme `02_TECHNICAL_ARCHITECTURE.md`.

## WhatsAppIdentity

```text
id
userId
phoneE164
externalJid
verifiedAt
status
createdAt
updatedAt
```

## WhatsAppActivationToken

```text
id
userId
tokenHash
phoneE164
expiresAt
consumedAt
attemptCount
createdAt
```

## NotificationPreference

```text
id
userId
postActivityReport
dailySummary
weeklySummary
reportTime
timezone
enabled
```

## MessageDelivery

```text
id
userId
channel
type
provider
externalMessageId
status
sentAt
deliveredAt
failedAt
errorCode
createdAt
```

## IntegrationEvent

Para dedupe/auditoria de webhooks.

## AdminAuditLog

Registrar ações administrativas relevantes sem secrets.

---

# 3. Authentication

Preferir Auth.js/solução já adotada pelo projeto.

Suportar:
- Credentials;
- Google OAuth.

### Email/senha
- hash forte;
- jamais encryption reversível para password;
- rate limit;
- política mínima de senha;
- reset token de uso único e expirável.

### Google
- provider official;
- state/nonce/PKCE conforme framework;
- account linking somente de forma segura;
- não confiar em campos não verificados.

---

# 4. Authorization

Roles mínimas:

```text
USER
ADMIN
```

Todas as checagens críticas no servidor.

Ocultar item de menu não substitui authorization.

Admin API deve verificar role em cada entrada apropriada.

---

# 5. Criptografia de secrets

Credenciais Garmin e API keys de conta que precisem ser persistidas:
- criptografar no application layer;
- algoritmo autenticado, por exemplo AES-256-GCM;
- chave em `DATA_ENCRYPTION_KEY`;
- key version para futura rotação;
- IV/nonce único por valor;
- nunca reutilizar nonce;
- nunca logar plaintext.

Criar um serviço central, não criptografia espalhada pelo código.

Exemplo conceitual:

```text
SecretVault.encrypt()
SecretVault.decrypt()
SecretVault.rotate()
```

---

# 6. Password hashing

Usar algoritmo de password hashing consolidado:
- Argon2id preferencialmente, se compatível;
- ou solução segura fornecida pela stack existente.

Não usar:
- SHA256 simples;
- MD5;
- encryption reversível.

---

# 7. Activation token

Gerar com CSPRNG.

Comparação:
- hash/token lookup;
- constant-time quando aplicável;
- expiry;
- single-use;
- rate limit.

---

# 8. API security

Aplicar:
- schema validation;
- auth;
- authorization;
- rate limit;
- sane body limits;
- timeout de integrações externas;
- allowlisted methods;
- secrets server-only;
- generic external error to client.

---

# 9. Logs

Criar redaction para chaves conhecidas:

```text
password
token
secret
authorization
cookie
x-api-key
x-admin-key
cpf
```

Logs de produção não devem conter payload bruto de Garmin/Evolution sem sanitização.

---

# 10. Webhook security

Evolution:
- validar secret/signature se suportado/configurado;
- conferir instance;
- deduplicar event;
- rejeitar payload inesperado;
- rate limit apropriado;
- manter idempotência.

---

# 11. Data retention

Definir política para:
- raw Garmin payload;
- activity data;
- webhook payload;
- audit log;
- activation tokens;
- failed messages.

Tokens expirados devem ser removidos periodicamente.

Credencial Garmin que não for mais necessária deve ser apagada.

---

# 12. User deletion

Preparar fluxo para:
- revogar/desconectar integrações;
- apagar secrets;
- invalidar sessões;
- remover identidade WhatsApp;
- tratar histórico conforme política de retenção.

---

# 13. `.env.example`

Gerar no projeto:

```env
# Database
DATABASE_URL=

# Auth
AUTH_SECRET=
AUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# App
APP_URL=
DATA_ENCRYPTION_KEY=

# Garmin service
GARMIN_SERVICE_BASE_URL=http://167.86.116.131:8001
GARMIN_ADMIN_KEY=

# Evolution API
EVOLUTION_API_BASE_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE_NAME=ryvano-main
EVOLUTION_WEBHOOK_SECRET=

# WhatsApp
ryvano_WHATSAPP_NUMBER=
```

### Regras

- `.env` real fora do Git.
- `.env.example` sem secrets.
- Não usar prefixo `NEXT_PUBLIC_` em qualquer secret.
- Validar env no startup.
- Falhar de forma clara se variável obrigatória estiver ausente.

---

# 14. Security copy

Landing/conexão pode informar proteção somente conforme a realidade.

Copy aceitável após implementação:

> A ryvano protege seus dados durante a transmissão e armazena credenciais sensíveis de forma criptografada.

Não usar:
- "impossível de hackear";
- "100% seguro";
- "criptografia ponta a ponta" se isso não for tecnicamente verdadeiro.

---

# 15. LGPD-oriented product requirements

Sem substituir análise jurídica:
- coletar apenas o necessário;
- deixar finalidade clara;
- permitir acesso/atualização dos dados;
- preparar exclusão;
- registrar consentimentos quando necessários;
- política de privacidade acessível;
- não reutilizar dados de saúde/performance para finalidade incompatível sem base apropriada.
