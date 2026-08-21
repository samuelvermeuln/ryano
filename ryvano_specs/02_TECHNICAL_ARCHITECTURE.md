# ryvano — Technical Architecture Spec

## 1. Arquitetura alvo

V1 como monólito modular full-stack em Next.js:

```text
Browser
   │
   ▼
Next.js
├── UI / App Router
├── Auth
├── Route Handlers / API
├── Application Services
├── Domain
├── Provider Adapters
│   ├── Garmin
│   └── Evolution WhatsApp
└── Prisma
     │
     ▼
PostgreSQL
```

Serviços externos:

```text
Next.js
├── Garmin Adapter ─────► Garmin Service existente
└── WhatsApp Adapter ───► Evolution API
```

---

## 2. Separação recomendada

Ajustar à estrutura já existente do projeto. Exemplo conceitual:

```text
src/
├── app/
│   ├── (public)/
│   ├── (auth)/
│   ├── (app)/
│   ├── admin/
│   └── api/
├── components/
├── features/
│   ├── auth/
│   ├── profile/
│   ├── activities/
│   ├── wearables/
│   ├── messaging/
│   ├── reports/
│   └── admin/
├── server/
│   ├── services/
│   ├── providers/
│   │   ├── wearables/
│   │   └── messaging/
│   ├── repositories/
│   ├── auth/
│   └── security/
├── lib/
└── generated/
```

Não forçar essa estrutura se o projeto já possuir uma organização consistente. Integrar ao padrão existente.

---

## 3. API interna

Usar Route Handlers / API Routes do Next.js.

Exemplos conceituais:

```text
/api/auth/*
/api/me
/api/profile
/api/integrations
/api/integrations/garmin/connect
/api/integrations/garmin/disconnect
/api/integrations/garmin/sync
/api/activities
/api/activities/:id
/api/whatsapp/activation
/api/whatsapp/activation/status
/api/webhooks/evolution
/api/admin/whatsapp/*
/api/admin/users/*
```

Não expor endpoints administrativos sem authorization server-side.

---

## 4. Wearable provider

Contrato conceitual:

```ts
type WearableCapability =
  | "activities"
  | "health"
  | "sleep"
  | "recovery"
  | "body"
  | "workouts";

interface WearableProvider {
  provider: string;
  capabilities: WearableCapability[];

  connect(input: unknown): Promise<ConnectionResult>;
  disconnect(connectionId: string): Promise<void>;
  validateConnection(connectionId: string): Promise<ConnectionStatus>;
  syncActivities(connectionId: string, cursor?: string): Promise<SyncResult>;
}
```

O restante da aplicação deve operar sobre entidades internas normalizadas.

Garmin-specific DTOs ficam dentro do adapter Garmin.

---

## 5. Activity normalization

Modelo interno deve comportar várias modalidades.

Campos conceituais:

```text
id
userId
wearableConnectionId
externalId
provider
sportType
name
startedAt
endedAt
durationSeconds
movingSeconds
distanceMeters
calories
averageHeartRate
maxHeartRate
averagePace
averageSpeed
maxSpeed
elevationGain
averageCadence
averagePower
maxPower
timezone
rawPayload?
createdAt
updatedAt
```

Campos específicos podem ficar em `metrics JSONB` com schema/versionamento, sem transformar toda a tabela em colunas nullable.

Criar uniqueness adequada por `(provider, externalId, userId)` ou equivalente.

Sincronização deve ser idempotente.

---

## 6. Sync

Princípios:
- uma atividade externa não pode ser duplicada;
- retries não podem criar duplicatas;
- registrar última sync;
- registrar erro útil;
- permitir sync manual;
- preparar cursor/pagination.

Quando houver volume suficiente, jobs podem ser movidos para worker, mas V1 não precisa começar com microserviço separado.

---

## 7. Report service

Separar geração de conteúdo de transporte:

```text
Activity
   │
   ▼
ReportBuilder
   │
   ▼
Report
   │
   ▼
MessagingProvider
   │
   ▼
Evolution
```

Isso permitirá trocar Evolution ou adicionar email/push no futuro.

---

## 8. WhatsApp identity

Não usar apenas o telefone digitado no formulário como identidade confirmada.

A identidade só deve ser `verified` depois que:
- mensagem chega pela Evolution;
- sender é obtido do webhook confiável;
- token é válido;
- telefone bate com o cadastrado.

---

## 9. Admin WhatsApp

O frontend não deve chamar Evolution diretamente.

Fluxo:

```text
Admin Browser
   │
   ▼
Next.js Admin API
   │
   ▼
EvolutionWhatsAppProvider
   │
   ▼
Evolution API
```

Chave da Evolution fica somente no servidor.

---

## 10. Observabilidade

Implementar logs estruturados.

Nunca logar:
- password;
- Authorization;
- API keys;
- Google secrets;
- session cookies;
- Garmin credential;
- activation token raw;
- CPF completo, salvo necessidade operacional explícita.

Registrar:
- request correlation id;
- provider;
- operation;
- user/internal id;
- duration;
- success/failure;
- sanitized error code.

---

## 11. Erros

Criar erros de domínio/integration bem definidos:

```text
AUTH_INVALID_CREDENTIALS
PROFILE_INCOMPLETE
GARMIN_AUTH_FAILED
GARMIN_UNAVAILABLE
GARMIN_RATE_LIMITED
GARMIN_SYNC_FAILED
WHATSAPP_NOT_CONNECTED
WHATSAPP_TOKEN_EXPIRED
WHATSAPP_TOKEN_INVALID
WHATSAPP_PHONE_MISMATCH
EVOLUTION_UNAVAILABLE
```

UI deve converter isso para mensagens amigáveis.

---

## 12. Testes mínimos

### Unit
- token activation;
- phone normalization;
- encryption/decryption;
- Garmin mapper;
- activity normalization;
- report builder.

### Integration
- Prisma repositories;
- connect Garmin mocked;
- sync idempotency;
- Evolution webhook;
- WhatsApp activation.

### E2E críticos
- signup/login;
- Google flow pode ser mockado em CI;
- onboarding;
- connect Garmin;
- activity list;
- WhatsApp activation;
- admin auth.

---

## 13. Deployment

Respeitar deploy atual do projeto.

Garantir:
- migrations executadas com processo controlado;
- `DATABASE_URL` disponível server-side;
- secrets não expostos em `NEXT_PUBLIC_*`;
- health/readiness endpoint se o ambiente já usa monitoramento;
- build reproduzível.

---

## 14. Dependências

Não adicionar dependências apenas por conveniência.

Antes de instalar:
- verificar se já existe equivalente;
- avaliar manutenção;
- compatibilidade com versão Next.js;
- impacto de bundle;
- necessidade real.

Preferir APIs nativas e bibliotecas consolidadas.
