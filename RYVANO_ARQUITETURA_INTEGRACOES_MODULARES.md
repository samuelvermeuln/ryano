# RYVANO — Arquitetura Modular de Integrações Esportivas

> Documento de orientação para evoluir a Ryvano para uma plataforma com múltiplos provedores esportivos.
>
> **Cenário atual:** Garmin + Strava.
>
> **Cenário futuro:** Polar, COROS, Suunto, Fitbit e outros provedores.
>
> A arquitetura deve funcionar para usuários com **nenhuma integração**, **somente Garmin**, **somente Strava**, **Garmin + Strava** ou **qualquer combinação futura de um ou mais provedores**.
>
> **Regra principal:** este documento orienta a implementação, mas **não substitui a documentação oficial**. Antes de implementar ou alterar endpoint, DTO, scope, webhook, autenticação, payload, retenção, política de uso ou campo retornado por qualquer provedor, o desenvolvedor/agente deve consultar novamente a documentação oficial vigente.

---

# 1. Visão de produto

A Ryvano não deve ser arquitetada como:

```text
Garmin
  +
Strava
  +
alguns ifs
```

A arquitetura precisa considerar desde agora:

```text
                    RYVANO

                      User
                       │
                       │ 0..N integrações
                       ▼
             Integration Connections
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
       Garmin        Strava      futuro...
          │            │            │
          └────────────┼────────────┘
                       ▼
                 Ryvano Core
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      Dashboard    Atividades   Relatórios
```

Um usuário não precisa possuir Garmin para utilizar a Ryvano.

Um usuário não precisa possuir Strava para utilizar a Ryvano.

Um usuário pode possuir os dois.

No futuro poderá possuir:

```text
Garmin + Strava + Polar
Strava + COROS
Suunto + Strava
Fitbit
Polar
COROS + Strava
...
```

Nenhuma funcionalidade do core deve assumir:

```ts
user.garminConnection!
```

ou:

```ts
if (!garmin) return error;
```

quando a funcionalidade puder operar com outro provider.

---

# 2. Princípio fundamental: 0..N provedores por usuário

A cardinalidade conceitual é:

```text
User
  │
  └── 0..N IntegrationConnection
             │
             ├── GARMIN
             ├── STRAVA
             ├── POLAR
             ├── COROS
             ├── SUUNTO
             ├── FITBIT
             └── ...
```

## 2.1 Estados válidos

Todos estes cenários são válidos:

### Usuário sem integração

```text
User
└── nenhuma conexão
```

A Ryvano deve permitir onboarding e exibir chamadas para conectar um provider.

---

### Usuário somente Garmin

```text
User
└── GARMIN
```

Dashboard e atividades são alimentados somente pelo Garmin.

Não exibir erro porque Strava não está conectado.

---

### Usuário somente Strava

```text
User
└── STRAVA
```

Dashboard e atividades usam somente as informações disponíveis pelo Strava.

Não tentar buscar:

```text
Body Battery
Sleep
Garmin Training Readiness
Garmin HRV
```

como se fossem obrigatórias.

---

### Usuário Garmin + Strava

```text
User
├── GARMIN
└── STRAVA
```

As duas integrações coexistem.

Cada módulo continua independente.

Quando existir permissão contratual para reconciliação entre providers, uma camada separada poderá comparar atividades equivalentes.

---

### Usuário com múltiplos providers futuros

```text
User
├── GARMIN
├── STRAVA
├── POLAR
└── COROS
```

Nenhum módulo deve precisar conhecer a implementação dos outros.

---

# 3. Integrações atuais e futuras

A tela de integrações deve ser projetada desde agora para representar um catálogo extensível.

## Disponíveis inicialmente

### Garmin

Saúde, treino e recuperação

**Disponível**

---

### Strava

Atividades e desempenho

**Disponível**

---

## Integrações futuras

### Polar

Treino e recuperação

**Em breve**

---

### COROS

Desempenho esportivo

**Em breve**

---

### Suunto

Aventura e endurance

**Em breve**

---

### Fitbit

Bem-estar e movimento

**Em breve**

---

A lista futura não deve exigir mudança de arquitetura.

Adicionar um novo provider deve significar principalmente:

```text
modules/<provider>/
```

e registrar suas capabilities.

---

# 4. Catálogo de providers

Criar um catálogo central, estático ou configurável, que descreva os providers suportados pela Ryvano.

Exemplo conceitual:

```ts
export type ProviderId =
  | "GARMIN"
  | "STRAVA"
  | "POLAR"
  | "COROS"
  | "SUUNTO"
  | "FITBIT";

export type ProviderAvailability =
  | "AVAILABLE"
  | "COMING_SOON"
  | "DISABLED";

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  description: string;
  availability: ProviderAvailability;
  capabilities: ProviderCapabilities;
}
```

Exemplo:

```ts
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "GARMIN",
    name: "Garmin",
    description: "Saúde, treino e recuperação",
    availability: "AVAILABLE",
    capabilities: {
      activities: true,
      activityDetails: true,
      recovery: true,
      sleep: true,
      hrv: true,
      readiness: true,
      dailyWellness: true,
      streams: false,
      webhooks: false,
    },
  },
  {
    id: "STRAVA",
    name: "Strava",
    description: "Atividades e desempenho",
    availability: "AVAILABLE",
    capabilities: {
      activities: true,
      activityDetails: true,
      recovery: false,
      sleep: false,
      hrv: false,
      readiness: false,
      dailyWellness: false,
      streams: true,
      webhooks: true,
    },
  },
  {
    id: "POLAR",
    name: "Polar",
    description: "Treino e recuperação",
    availability: "COMING_SOON",
    capabilities: {},
  },
  {
    id: "COROS",
    name: "COROS",
    description: "Desempenho esportivo",
    availability: "COMING_SOON",
    capabilities: {},
  },
  {
    id: "SUUNTO",
    name: "Suunto",
    description: "Aventura e endurance",
    availability: "COMING_SOON",
    capabilities: {},
  },
  {
    id: "FITBIT",
    name: "Fitbit",
    description: "Bem-estar e movimento",
    availability: "COMING_SOON",
    capabilities: {},
  },
];
```

Os valores exatos das capabilities futuras só devem ser definidos depois da consulta às respectivas documentações oficiais.

---

# 5. Capabilities em vez de suposições por provider

O core deve perguntar:

```text
este provider fornece HRV?
este provider fornece sono?
este provider fornece atividades?
este provider possui webhook?
```

e não:

```ts
if (provider === "GARMIN")
```

sempre que a decisão for sobre capacidade e não sobre protocolo.

Contrato conceitual:

```ts
export interface ProviderCapabilities {
  activities?: boolean;
  activityDetails?: boolean;

  dailyWellness?: boolean;
  recovery?: boolean;

  sleep?: boolean;
  hrv?: boolean;
  readiness?: boolean;

  streams?: boolean;
  laps?: boolean;

  heartRateZones?: boolean;
  powerZones?: boolean;

  webhooks?: boolean;
  oauth?: boolean;
}
```

Isso permite que novos providers sejam adicionados sem alterar todos os componentes.

---

# 6. Dashboard adaptativo

O Dashboard da Ryvano deve se adaptar aos dados disponíveis.

Não deve existir uma composição fixa baseada em Garmin.

Exemplo:

## Somente Garmin

```text
Hoje
├── Training Readiness
├── HRV
├── Sono
├── Body Battery
└── Última atividade
```

---

## Somente Strava

```text
Hoje
├── Última atividade
├── volume recente
├── frequência de treinos
├── distância
└── tendências que possam ser calculadas com dados permitidos
```

Sem:

```text
"HRV indisponível"
"Body Battery indisponível"
"Conecte Garmin para continuar"
```

a menos que seja uma chamada opcional e contextual.

---

## Garmin + Strava

```text
Hoje
├── recuperação via Garmin
├── atividades das fontes permitidas
├── informações específicas Garmin
└── informações específicas Strava
```

Dados não devem ser combinados automaticamente sem regra de domínio e autorização contratual.

---

# 7. Relatórios adaptativos

O report builder não pode exigir campos Garmin.

Errado:

```ts
buildReport({
  bodyBattery: required,
  trainingReadiness: required,
  garminActivity: required,
});
```

Correto:

```ts
buildActivityReport({
  activity,
  availableMetrics,
  source,
});
```

Ou:

```ts
buildDailyReport({
  userId,
  availableProviders,
  sections,
});
```

Cada seção deve declarar seus requisitos.

Exemplo:

```ts
type ReportSectionRequirement = {
  capability: keyof ProviderCapabilities;
  optional: boolean;
};
```

Assim:

```text
Sleep section
requires: sleep

HRV section
requires: hrv

Activity volume section
requires: activities
```

Se nenhum provider conectado fornecer a capability:

```text
não renderizar a seção
```

em vez de falhar o relatório.

---

# 8. Atividades também devem ser provider-agnostic

Uma atividade pode vir de:

```text
GARMIN
STRAVA
POLAR
COROS
SUUNTO
FITBIT
...
```

O core deve receber:

```ts
type ActivitySource = ProviderId;

type NormalizedActivity = {
  source: ActivitySource;
  externalId: string;

  sportType: RyvanoSportType;
  providerSportType: string;

  startedAt: Date;

  durationSeconds?: number;
  movingSeconds?: number;

  distanceMeters?: number;

  averageHeartRate?: number;
  maxHeartRate?: number;

  averageSpeed?: number;
  maxSpeed?: number;

  elevationGain?: number;

  averageCadence?: number;

  averagePower?: number;
  maxPower?: number;
};
```

Nenhuma propriedade Garmin deve ser obrigatória no contrato compartilhado.

---

# 9. Origem dos dados deve ser preservada

Toda informação importada deve possuir proveniência.

Exemplo:

```ts
type ProviderMetric<T> = {
  value: T;
  provider: ProviderId;
  providerActivityId?: string;
  collectedAt: Date;
};
```

Exemplo real:

```ts
{
  value: 5000,
  provider: "GARMIN",
  providerActivityId: "123456",
  collectedAt: new Date(),
}
```

ou:

```ts
{
  value: 5018,
  provider: "STRAVA",
  providerActivityId: "998877",
  collectedAt: new Date(),
}
```

Isso é necessário porque dois providers podem mostrar dados diferentes para o mesmo treino.

---

# 10. Garmin e Strava podem divergir

Exemplo hipotético:

```text
Corrida

Métrica            Garmin          Strava

Distância          10,00 km        10,08 km
Moving time        49:35           49:52
Elapsed time       52:11           52:10
FC média           154 bpm         152 bpm
Calorias           721 kcal        685 kcal
Elevação           183 m           176 m
```

Isso pode acontecer devido a:

- algoritmos diferentes;
- correção de distância;
- GPS;
- pausas;
- moving time;
- auto-pause;
- smoothing;
- correção de elevação;
- origem do sensor;
- processamento posterior;
- campos calculados pelo próprio provider.

A Ryvano não deve sobrescrever silenciosamente um valor com o outro.

---

# 11. Comparação entre providers é uma camada separada

O módulo Garmin não compara Garmin com Strava.

O módulo Strava não compara Strava com Garmin.

Quando permitido, criar:

```text
modules/
└── shared/
    └── reconciliation/
```

ou:

```text
modules/
└── activity-reconciliation/
```

Fluxo:

```text
Garmin module ───────┐
                     │
                     ▼
               Normalized Data
                     │
                     ▼
             Reconciliation Layer
                     ▲
                     │
Strava module ───────┘
```

Essa camada é opcional.

Usuários com apenas um provider nunca dependem dela.

---

# 12. Regra importante sobre a política atual do Strava

Antes de habilitar qualquer confronto ou combinação de dados Garmin × Strava em produção, revisar novamente:

- Strava API Agreement;
- Strava API Policy;
- documentação oficial vigente.

Na política atual consultada durante a criação deste documento existem restrições relevantes relacionadas a:

- retenção de Strava Data;
- combinação de dados de clientes;
- uso de dados Strava em IA/LLM;
- armazenamento e conteúdo derivado.

Por isso o desenho técnico pode deixar espaço para reconciliação, mas a funcionalidade deve permanecer desativada enquanto a versão vigente da política não permitir claramente o uso pretendido.

Configuração:

```env
STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED=false
```

Não transformar uma possibilidade arquitetural em permissão legal/contratual.

---

# 13. Regra obrigatória: documentação oficial primeiro

Antes de escrever código relacionado a qualquer provider:

1. consultar documentação oficial;
2. confirmar versão da API;
3. confirmar URL base;
4. confirmar endpoint;
5. confirmar método HTTP;
6. confirmar parâmetros;
7. confirmar scopes;
8. confirmar autenticação;
9. confirmar payload de entrada;
10. confirmar payload de retorno;
11. confirmar campos opcionais;
12. confirmar paginação;
13. confirmar rate limits;
14. confirmar webhooks;
15. confirmar regras de armazenamento;
16. confirmar retenção;
17. confirmar regras de exclusão;
18. confirmar termos de uso;
19. confirmar política de dados;
20. somente depois criar DTO/parser/schema.

---

# 14. Fontes oficiais do Strava

Usar prioritariamente:

- Documentação principal  
  https://developers.strava.com/docs/

- API Reference  
  https://developers.strava.com/docs/reference/

- Authentication / OAuth  
  https://developers.strava.com/docs/authentication/

- Webhooks  
  https://developers.strava.com/docs/webhooks/

- Rate Limits  
  https://developers.strava.com/docs/rate-limits/

- Changelog  
  https://developers.strava.com/docs/changelog/

- Playground oficial  
  https://developers.strava.com/playground/

- API Agreement  
  https://www.strava.com/legal/api

- API Policy  
  https://www.strava.com/legal/api_policy

- Brand Guidelines  
  https://developers.strava.com/guidelines/

---

# 15. Fontes oficiais dos providers futuros

Ao implementar futuros módulos, adicionar nesta seção os links oficiais correspondentes.

Estrutura:

```text
Provider
├── Developer Portal
├── API Reference
├── Authentication
├── Webhooks
├── Rate Limits
├── Changelog
├── Terms
└── Data Policy
```

Nunca implementar Polar, COROS, Suunto ou Fitbit com base apenas em documentação de terceiros.

---

# 16. Não usar como fonte principal

Não implementar contratos com base somente em:

- Stack Overflow;
- Reddit;
- blogs;
- snippets antigos;
- SDKs não oficiais;
- exemplos aleatórios do GitHub;
- memória humana;
- memória do agente;
- respostas anteriores de IA.

Podem servir para investigação.

O contrato final precisa ser confirmado na fonte oficial.

---

# 17. Estrutura modular

Criar:

```text
modules/
├── shared/
├── garmin/
├── strava/
└── future-provider/
```

Hoje somente:

```text
modules/
├── shared/
├── garmin/
└── strava/
```

---

# 18. Estrutura compartilhada

```text
modules/shared/
├── activities/
│   ├── contracts/
│   ├── domain/
│   ├── normalization/
│   ├── presentation/
│   └── reconciliation/
│
├── integrations/
│   ├── catalog/
│   ├── capabilities/
│   ├── contracts/
│   ├── errors/
│   ├── policy/
│   └── types/
│
├── reports/
│   ├── contracts/
│   └── presentation/
│
└── database/
```

A pasta `shared` deve conter apenas conceitos realmente compartilhados.

Não mover código específico do Garmin para `shared` apenas porque ele é usado há mais tempo.

---

# 19. Estrutura do módulo Garmin

Mover toda a lógica Garmin para:

```text
modules/garmin/
├── api/
│   ├── client/
│   ├── dto/
│   ├── routes/
│   └── schemas/
│
├── application/
│   ├── connect/
│   ├── disconnect/
│   ├── sync/
│   ├── activities/
│   ├── daily/
│   ├── recovery/
│   └── notifications/
│
├── config/
├── domain/
│   ├── entities/
│   ├── types/
│   └── errors/
│
├── infrastructure/
│   ├── http/
│   ├── crypto/
│   └── provider/
│
├── parsers/
│
├── database/
│   ├── repositories/
│   ├── mappers/
│   └── garmin.prisma
│
├── presentation/
│   ├── components/
│   ├── formatters/
│   └── view-models/
│
├── tests/
└── index.ts
```

---

# 20. Migração da estrutura Garmin atual

Responsabilidades existentes devem sair gradualmente de locais como:

```text
server/providers/wearables/garmin.ts
server/services/garmin-service.ts
server/services/garmin-activity-details.ts
server/services/garmin-daily-report.ts
server/services/garmin-connection-errors.ts
server/services/garmin-notification-events.ts
server/garmin-reporting-settings.ts
```

e migrar para:

```text
modules/garmin/**
```

A migração deve preservar comportamento.

Primeiro modularizar.

Depois adicionar Strava.

Evitar fazer grandes alterações de comportamento Garmin junto com a movimentação estrutural.

---

# 21. Estrutura do módulo Strava

```text
modules/strava/
├── api/
│   ├── client/
│   ├── dto/
│   ├── routes/
│   └── schemas/
│
├── auth/
│   ├── oauth.ts
│   ├── token-exchange.ts
│   ├── token-refresh.ts
│   └── revoke.ts
│
├── webhooks/
│   ├── validation.ts
│   ├── handler.ts
│   ├── processor.ts
│   └── dto/
│
├── application/
│   ├── connect/
│   ├── disconnect/
│   ├── sync/
│   ├── activities/
│   └── cleanup/
│
├── config/
│
├── domain/
│   ├── entities/
│   ├── types/
│   └── errors/
│
├── infrastructure/
│   ├── http/
│   ├── crypto/
│   └── provider/
│
├── parsers/
│
├── database/
│   ├── repositories/
│   ├── mappers/
│   └── strava.prisma
│
├── presentation/
│   ├── components/
│   ├── formatters/
│   └── view-models/
│
├── tests/
└── index.ts
```

---

# 22. Rotas Next.js continuam como adapters

As rotas HTTP públicas continuam em:

```text
app/api/**
```

porque isso faz parte do App Router.

Exemplo:

```text
app/api/integrations/garmin/connect/route.ts
app/api/integrations/garmin/sync/route.ts

app/api/integrations/strava/connect/route.ts
app/api/integrations/strava/callback/route.ts
app/api/integrations/strava/webhook/route.ts
app/api/integrations/strava/disconnect/route.ts
```

Esses arquivos devem ser finos.

Exemplo:

```ts
import { handleStravaWebhookPost } from "@/modules/strava";

export const POST = handleStravaWebhookPost;
```

`app/api` não deve:

- chamar Prisma diretamente;
- conhecer formato de token;
- fazer refresh token;
- interpretar webhook;
- mapear sport type;
- decidir precedência de dados;
- gerar relatório;
- normalizar atividade.

---

# 23. Banco: conexão genérica 1:N

A entidade genérica precisa suportar múltiplas integrações por usuário.

Exemplo conceitual:

```prisma
model WearableConnection {
  id                String   @id @default(cuid())
  userId            String
  provider          WearableProvider

  externalAccountId String?
  status            WearableConnectionStatus

  capabilities      String[]

  connectedAt       DateTime?
  disconnectedAt    DateTime?
  lastSyncAt        DateTime?
  lastEventAt       DateTime?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([provider])
}
```

Para o cenário inicial, pode existir:

```prisma
@@unique([userId, provider])
```

caso a regra de negócio seja:

> um usuário pode conectar no máximo uma conta de cada provider.

Se futuramente a Ryvano permitir múltiplas contas do mesmo provider, essa constraint precisará evoluir.

Não criar:

```text
user.garminConnected
user.stravaConnected
user.polarConnected
...
```

na tabela `User`.

---

# 24. Enum preparada para expansão

```prisma
enum WearableProvider {
  GARMIN
  STRAVA
  POLAR
  COROS
  SUUNTO
  FITBIT
}
```

O fato de um valor existir na enum não significa que a integração já está habilitada.

Disponibilidade deve ser controlada pelo catálogo/configuração:

```text
GARMIN  AVAILABLE
STRAVA  AVAILABLE
POLAR   COMING_SOON
COROS   COMING_SOON
SUUNTO  COMING_SOON
FITBIT  COMING_SOON
```

---

# 25. Tabelas específicas por provider

`WearableConnection` deve guardar somente informações realmente genéricas.

Não transformar a tabela em:

```text
garminEmail
garminProbeFailure
stravaScopes
stravaTokenExpiresAt
stravaSubscriptionId
polarSomething
corosSomething
...
```

Detalhes ficam dentro dos módulos.

Exemplo:

```text
WearableConnection
      │
      ├── GarminConnectionDetails
      ├── StravaConnectionDetails
      └── futuro...
```

---

# 26. StravaConnectionDetails

Exemplo conceitual:

```prisma
model StravaConnectionDetails {
  id                    String   @id @default(cuid())
  wearableConnectionId  String   @unique

  athleteId             String   @unique
  scopes                String[]
  accessTokenExpiresAt  DateTime?

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}
```

Tokens não entram aqui em texto puro.

---

# 27. Secrets

Pode reaproveitar `WearableSecret` se ele continuar genérico.

Exemplo:

```prisma
enum SecretType {
  GARMIN_EMAIL
  GARMIN_PASSWORD
  GARMIN_API_KEY

  STRAVA_ACCESS_TOKEN
  STRAVA_REFRESH_TOKEN
}
```

Com armazenamento criptografado.

Se a abstração começar a ficar específica demais, mover secrets para tabela do módulo.

---

# 28. Prisma modular

O projeto utiliza Prisma 6.

A implementação deve validar na documentação oficial da versão instalada a configuração correta de multi-file schema.

Opções:

```text
prisma/
├── schema.prisma
├── migrations/
└── modules/
    ├── core.prisma
    ├── garmin.prisma
    └── strava.prisma
```

ou, se a configuração da versão permitir e fizer sentido:

```text
modules/
├── database/
│   ├── schema.prisma
│   └── migrations/
│
├── garmin/
│   └── database/
│       └── garmin.prisma
│
└── strava/
    └── database/
        └── strava.prisma
```

Antes de alterar o Prisma, consultar:

```text
https://docs.prisma.io/
```

e confirmar a configuração correspondente à versão instalada.

---

# 29. Separar atividade canônica de representação do provider

Conceitualmente existe:

```text
atividade esportiva real
       │
       ├── representação Garmin
       ├── representação Strava
       ├── representação Polar
       └── ...
```

Não assumir que todas são idênticas.

O modelo precisa preservar:

```text
source
externalId
providerSportType
raw/provider fields
normalized fields
```

---

# 30. Usuário com apenas um provider

Se somente Garmin estiver conectado:

```text
activity source = GARMIN
```

Se somente Strava estiver conectado:

```text
activity source = STRAVA
```

Nenhuma reconciliação é necessária.

Esse deve ser o caminho mais simples do sistema.

---

# 31. Usuário com múltiplos providers

Se múltiplos providers estiverem conectados, pode existir a possibilidade de a mesma atividade aparecer em mais de uma fonte.

Exemplo:

```text
10 km de corrida
│
├── Garmin ID 123
└── Strava ID 987
```

Não mesclar automaticamente.

Primeiro preservar as duas representações.

Depois, se permitido:

```text
detectar correspondência
↓
atribuir confidence
↓
comparar métricas
↓
definir apresentação
```

---

# 32. Activity Match futuro

Contrato conceitual:

```ts
type ActivityMatchCandidate = {
  userId: string;

  sourceA: ProviderId;
  externalIdA: string;

  sourceB: ProviderId;
  externalIdB: string;

  confidence: number;
  reasons: string[];
};
```

Critérios possíveis:

```text
mesmo usuário
mesmo esporte
horário de início próximo
duração próxima
distância próxima
```

Não usar somente distância.

---

# 33. Métricas conflitantes

Nunca:

```ts
activity.distance = strava.distance;
```

sobrescrevendo Garmin sem preservar a origem.

Modelo conceitual:

```ts
type MetricComparison<T> = {
  metric: string;

  values: Array<{
    provider: ProviderId;
    value: T;
  }>;
};
```

Exemplo:

```ts
{
  metric: "distanceMeters",
  values: [
    { provider: "GARMIN", value: 10000 },
    { provider: "STRAVA", value: 10084 },
  ],
}
```

---

# 34. Provider priority não deve ser global

Não definir:

```text
Garmin sempre vence
```

ou:

```text
Strava sempre vence
```

A prioridade pode depender de:

- métrica;
- modalidade;
- origem do dispositivo;
- qualidade do dado;
- configuração do usuário;
- política contratual;
- regra de produto.

E deve ser explícita.

---

# 35. Preferência do usuário

No futuro pode existir:

```text
Fonte preferencial para atividades
[ Automático ]
[ Garmin ]
[ Strava ]
```

ou preferências por métrica.

Mas isso deve ser implementado somente quando houver necessidade real.

A arquitetura precisa permitir, não necessariamente entregar agora.

---

# 36. Módulo Strava — OAuth

Criar:

```text
modules/strava/auth/
```

Fluxo:

```text
User
 │
 ▼
Connect Strava
 │
 ▼
gera state
 │
 ▼
Strava authorization
 │
 ▼
callback
 │
 ├── valida state
 ├── recebe code
 ├── troca token
 ├── valida response
 ├── salva athleteId
 ├── salva scopes concedidos
 ├── criptografa access token
 └── criptografa refresh token
```

---

# 37. ENV Strava

```env
# ========================================
# STRAVA
# ========================================

STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=

STRAVA_API_BASE_URL=https://www.strava.com/api/v3

STRAVA_OAUTH_AUTHORIZE_URL=https://www.strava.com/oauth/authorize
STRAVA_OAUTH_TOKEN_URL=https://www.strava.com/oauth/token
STRAVA_OAUTH_REVOKE_URL=https://www.strava.com/oauth/revoke

STRAVA_OAUTH_CALLBACK_URL=https://SEU_DOMINIO/api/integrations/strava/callback

STRAVA_WEBHOOK_CALLBACK_URL=https://SEU_DOMINIO/api/integrations/strava/webhook
STRAVA_WEBHOOK_VERIFY_TOKEN=

STRAVA_INITIAL_BACKFILL_DAYS=30

STRAVA_CROSS_PROVIDER_RECONCILIATION_ENABLED=false
```

URLs devem ficar centralizadas em configuração/ENV porque APIs podem mudar.

Antes de deploy ou implementação, consultar changelog oficial.

---

# 38. ENV dos módulos futuros

Cada provider deve possuir seu próprio namespace.

Exemplo:

```env
POLAR_CLIENT_ID=
POLAR_CLIENT_SECRET=
POLAR_CALLBACK_URL=
```

```env
COROS_CLIENT_ID=
COROS_CLIENT_SECRET=
COROS_CALLBACK_URL=
```

```env
SUUNTO_CLIENT_ID=
SUUNTO_CLIENT_SECRET=
SUUNTO_CALLBACK_URL=
```

```env
FITBIT_CLIENT_ID=
FITBIT_CLIENT_SECRET=
FITBIT_CALLBACK_URL=
```

Essas variáveis são somente exemplos de convenção.

Não criar variáveis reais até confirmar na documentação oficial o modelo de autenticação de cada provider.

---

# 39. Não espalhar process.env

Cada módulo deve validar seu ENV.

Exemplo:

```text
modules/strava/config/env.ts
modules/garmin/config/env.ts
```

Não acessar:

```ts
process.env.STRAVA_CLIENT_SECRET
```

em dezenas de arquivos.

---

# 40. Token refresh Strava

Centralizar em:

```text
modules/strava/auth/token-refresh.ts
```

Fluxo:

```text
request
  │
  ▼
token válido?
 ├── sim ──→ API
 └── não
       │
       ▼
     refresh
       │
       ├── access token novo
       └── refresh token possivelmente novo
                │
                ▼
             persistir
```

Evitar refresh concorrente do mesmo usuário.

---

# 41. Webhook Strava

O webhook será a principal forma de perceber:

```text
activity create
activity update
activity delete
athlete deauthorization
```

Estrutura:

```text
modules/strava/webhooks/
├── validation.ts
├── handler.ts
├── processor.ts
└── dto/
```

---

# 42. Callback HTTP Strava

```text
app/api/integrations/strava/webhook/route.ts
```

GET:

```text
validação/challenge
```

POST:

```text
evento
```

A rota deve:

```text
validar
registrar evento
responder rapidamente
```

O processamento pesado fica fora do request.

---

# 43. Webhook não contém atividade completa

O webhook sinaliza o evento.

Exemplo conceitual:

```json
{
  "object_type": "activity",
  "object_id": 123456,
  "aspect_type": "create",
  "owner_id": 999,
  "subscription_id": 321,
  "event_time": 123456789
}
```

Depois:

```http
GET /activities/{id}
```

se necessário e permitido.

Sempre confirmar DTO oficial vigente.

---

# 44. DTOs

```text
modules/strava/api/dto/
├── strava-token-response.dto.ts
├── strava-athlete.dto.ts
├── strava-summary-activity.dto.ts
├── strava-detailed-activity.dto.ts
├── strava-lap.dto.ts
├── strava-stream-set.dto.ts
├── strava-webhook-event.dto.ts
└── strava-fault.dto.ts
```

DTO remoto nunca vai direto para a UI.

---

# 45. Schemas Zod

```text
modules/strava/api/schemas/
```

Validar runtime.

Exemplo conceitual:

```ts
const StravaWebhookEventSchema = z.object({
  object_type: z.enum(["activity", "athlete"]),
  object_id: z.number(),
  aspect_type: z.enum(["create", "update", "delete"]),
  owner_id: z.number(),
  subscription_id: z.number(),
  event_time: z.number(),
  updates: z.record(z.string(), z.unknown()).optional(),
});
```

Confirmar campos na documentação oficial antes de implementar.

---

# 46. Parsers

```text
modules/strava/parsers/
├── parse-strava-activity.ts
├── parse-strava-sport-type.ts
├── parse-strava-streams.ts
├── parse-strava-token-response.ts
└── parse-strava-webhook.ts
```

Conversões não devem ficar espalhadas.

---

# 47. Endpoints Strava iniciais

Implementar somente o necessário.

## OAuth authorization

```http
GET https://www.strava.com/oauth/authorize
```

## Token / refresh

```http
POST https://www.strava.com/oauth/token
```

## Athlete

```http
GET /athlete
```

## Activities

```http
GET /athlete/activities
```

## Activity detail

```http
GET /activities/{id}
```

## Streams

```http
GET /activities/{id}/streams
```

somente quando necessários.

## Laps

Consultar endpoint oficial vigente antes de implementar.

## Zones

Consultar e usar somente se a Ryvano realmente precisar e se o scope autorizado permitir.

---

# 48. Strava API client

```text
modules/strava/api/client/strava-client.ts
```

Responsabilidades:

- base URL;
- Bearer token;
- timeout;
- refresh;
- parsing de erro;
- rate limit;
- observabilidade;
- retry seguro;
- nenhuma exposição de secrets.

Contrato:

```ts
interface StravaClient {
  getAuthenticatedAthlete(): Promise<StravaAthleteDto>;

  listActivities(
    input: ListActivitiesInput
  ): Promise<StravaSummaryActivityDto[]>;

  getActivity(
    id: string
  ): Promise<StravaDetailedActivityDto>;

  getActivityStreams(
    id: string,
    keys: string[]
  ): Promise<StravaStreamSetDto>;

  getActivityLaps(
    id: string
  ): Promise<StravaLapDto[]>;
}
```

---

# 49. Novas tabelas Strava

## StravaConnectionDetails

Metadados específicos OAuth/athlete.

## StravaWebhookSubscription

Estado da subscription da aplicação.

## StravaWebhookEvent

Fila/event log operacional.

## StravaActivityCache

Cache transitório.

## StravaStreamCache

Cache transitório de streams, somente se necessário.

---

# 50. StravaWebhookSubscription

Exemplo conceitual:

```prisma
model StravaWebhookSubscription {
  id                     String   @id @default(cuid())
  externalSubscriptionId String   @unique
  callbackUrl            String
  status                 String

  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}
```

A subscription é da aplicação.

Não criar uma subscription por atleta sem a documentação oficial indicar isso.

---

# 51. StravaWebhookEvent

```prisma
model StravaWebhookEvent {
  id               String   @id @default(cuid())

  ownerAthleteId   String?
  objectType       String
  objectId         String
  aspectType       String

  eventTime        DateTime
  payload          Json?

  processingStatus String
  attemptCount     Int      @default(0)

  receivedAt       DateTime @default(now())
  processedAt      DateTime?
  expiresAt        DateTime

  @@index([processingStatus, receivedAt])
  @@index([ownerAthleteId, receivedAt])
}
```

TTL obrigatório conforme política vigente.

---

# 52. StravaActivityCache

```prisma
model StravaActivityCache {
  id                   String   @id @default(cuid())

  wearableConnectionId String
  stravaActivityId     String

  sportType            String?
  startedAt            DateTime?

  payload              Json

  fetchedAt            DateTime
  expiresAt            DateTime

  @@unique([wearableConnectionId, stravaActivityId])
  @@index([expiresAt])
}
```

Não transformar cache em histórico permanente.

---

# 53. StravaStreamCache

Somente se realmente necessário:

```prisma
model StravaStreamCache {
  id                   String   @id @default(cuid())

  wearableConnectionId String
  stravaActivityId     String

  streamTypes          String[]
  payload              Json

  fetchedAt            DateTime
  expiresAt            DateTime

  @@index([stravaActivityId])
  @@index([expiresAt])
}
```

Não buscar streams de todas as atividades por padrão.

---

# 54. Cleanup obrigatório

```text
modules/strava/application/cleanup/
```

Responsabilidades:

```text
purgeExpiredActivityCache()
purgeExpiredStreams()
purgeExpiredWebhookPayloads()
purgeDeauthorizedUserData()
purgeDeletedActivityData()
```

A integração não está completa sem limpeza.

---

# 55. Rate limits

Rate limits devem ser tratados por provider.

Não criar um único número global.

Exemplo:

```text
modules/strava/infrastructure/rate-limit/
modules/garmin/infrastructure/rate-limit/
```

Cada módulo conhece as regras oficiais de seu provider.

---

# 56. Backfill

Ao conectar um provider, o backfill deve ser capability/configuração do módulo.

Para Strava:

```env
STRAVA_INITIAL_BACKFILL_DAYS=30
```

Não significa que Garmin ou futuros providers terão exatamente a mesma estratégia.

---

# 57. Tela de Integrações

A UI não deve mostrar somente conexões existentes.

Ela deve mostrar:

```text
INTEGRAÇÕES CONECTADAS
+
INTEGRAÇÕES DISPONÍVEIS
+
EM BREVE
```

Exemplo:

```text
Integrações

Conecte os serviços que você usa.
Você pode utilizar a Ryvano com uma ou várias integrações.

────────────────────────────────

Garmin
Saúde, treino e recuperação

● Conectado
[ Gerenciar ]

────────────────────────────────

Strava
Atividades e desempenho

[ Conectar ]

────────────────────────────────

Polar
Treino e recuperação

Em breve

────────────────────────────────

COROS
Desempenho esportivo

Em breve

────────────────────────────────

Suunto
Aventura e endurance

Em breve

────────────────────────────────

Fitbit
Bem-estar e movimento

Em breve
```

---

# 58. Usuário com Strava conectado e Garmin não conectado

A UI deve ficar natural:

```text
Strava
● Conectado

Garmin
[ Conectar ]
```

Não mostrar:

```text
Garmin obrigatório
```

---

# 59. Usuário com Garmin conectado e Strava não conectado

```text
Garmin
● Conectado

Strava
[ Conectar ]
```

Também é um estado completo e válido.

---

# 60. Usuário com Garmin + Strava

```text
Garmin
● Conectado

Strava
● Conectado
```

A aplicação passa a ter duas fontes.

Cada card/tela deve continuar sabendo de onde o dado veio.

---

# 61. Source badges

Na tela de atividades:

```text
Corrida matinal
10,00 km · 49:35

Garmin
```

ou:

```text
Corrida matinal
10,08 km · 49:52

Strava
```

Se futuramente uma atividade reconciliada puder ser exibida:

```text
Fontes
Garmin · Strava
```

somente se a política vigente permitir essa combinação.

---

# 62. Provider-specific sections

Algumas informações existem somente em certos providers.

Exemplo Garmin:

```text
Body Battery
Training Readiness
HRV
Sleep
```

Não colocar esses campos no contrato obrigatório de `ActivityProvider`.

Em vez disso:

```ts
interface RecoveryProvider {
  getRecovery(...): Promise<...>;
}

interface SleepProvider {
  getSleep(...): Promise<...>;
}
```

ou capabilities equivalentes.

---

# 63. Contratos pequenos

Evitar interface gigante:

```ts
interface Provider {
  getActivities();
  getSleep();
  getHRV();
  getBodyBattery();
  getStreams();
  getReadiness();
  ...
}
```

porque nenhum provider implementará tudo.

Preferir interfaces pequenas:

```ts
interface ActivityProvider {}
interface RecoveryProvider {}
interface SleepProvider {}
interface StreamProvider {}
interface WebhookProvider {}
```

---

# 64. Provider Registry

Criar registry no core:

```ts
const providerRegistry = {
  GARMIN: garminModule,
  STRAVA: stravaModule,
};
```

No futuro:

```ts
const providerRegistry = {
  GARMIN: garminModule,
  STRAVA: stravaModule,
  POLAR: polarModule,
  COROS: corosModule,
  SUUNTO: suuntoModule,
  FITBIT: fitbitModule,
};
```

Sem alterar código de Garmin ou Strava.

---

# 65. Busca de atividades considerando N providers

A aplicação pode pedir:

```ts
getUserActivitySources(userId)
```

Resultado:

```ts
[
  {
    provider: "GARMIN",
    connectionId: "...",
  },
  {
    provider: "STRAVA",
    connectionId: "...",
  },
]
```

Depois cada provider é tratado pelo registry.

Não codificar:

```ts
const garmin = await ...
const strava = await ...
```

como padrão do core.

---

# 66. Falha parcial

Com múltiplos providers, falhar em um não deve derrubar todos.

Exemplo:

```text
Garmin   OK
Strava   rate limited
```

Dashboard ainda pode usar Garmin.

Ou:

```text
Garmin   credencial expirada
Strava   OK
```

Atividades Strava continuam disponíveis.

O estado deve ser por conexão.

---

# 67. Status por conexão

Exemplo:

```ts
type IntegrationConnectionStatus =
  | "CONNECTED"
  | "DEGRADED"
  | "REAUTH_REQUIRED"
  | "DISCONNECTED"
  | "ERROR";
```

Nunca manter um único:

```text
user.integrationsStatus
```

---

# 68. Sincronização independente

Cada conexão deve possuir:

```text
lastSyncAt
lastEventAt
lastSuccessAt
lastErrorAt
```

ou equivalentes.

Garmin pode sincronizar por uma estratégia.

Strava pode operar principalmente por webhook.

Providers futuros terão outras estratégias.

---

# 69. Jobs também devem ser por módulo

Evitar:

```text
sync-all-wearables.ts
```

com milhares de condicionais.

Preferir:

```text
modules/garmin/application/sync/
modules/strava/application/sync/
```

e um orquestrador genérico somente quando necessário.

---

# 70. Normalização de esportes

A Ryvano possui taxonomia própria.

Exemplo:

```ts
export type RyvanoSportType =
  | "default"
  | "swim"
  | "open-water"
  | "bike"
  | "mtb"
  | "run"
  | "trail-run"
  | "triathlon"
  | "duathlon"
  | "aquathlon"
  | "walking"
  | "hiking"
  | "gym"
  | "crossfit"
  | "football"
  | "futsal"
  | "basketball"
  | "volleyball"
  | "tennis"
  | "padel"
  | "surf"
  | "rowing"
  | "kayak"
  | "stand-up-paddle";
```

Cada provider cria seu próprio mapper:

```text
modules/garmin/parsers/parse-garmin-sport-type.ts
modules/strava/parsers/parse-strava-sport-type.ts
```

Futuramente:

```text
modules/polar/parsers/parse-polar-sport-type.ts
modules/coros/parsers/parse-coros-sport-type.ts
```

---

# 71. Preservar providerSportType

Sempre guardar:

```text
providerSportType
```

além de:

```text
normalizedSportType
```

Isso permite corrigir mappings no futuro sem perder o valor original.

---

# 72. Dados diários não são universais

Não criar:

```ts
getDailyGarminData()
```

como dependência do dashboard.

Criar conceito:

```ts
getAvailableDailyInsights(userId)
```

O resultado depende das integrações conectadas.

Exemplo:

```text
Garmin conectado
→ recovery
→ HRV
→ sleep

Strava conectado
→ activities
→ volume
→ frequência
```

---

# 73. Relatórios pós-atividade

Pipeline:

```text
Provider
   │
   ▼
Provider DTO
   │
   ▼
Validation
   │
   ▼
Parser
   │
   ▼
Normalized Activity
   │
   ▼
Policy Gate
   │
   ▼
Report View Model
   │
   ▼
SVG / UI / WhatsApp
```

O pipeline funciona com Garmin, Strava ou futuro provider.

---

# 74. Policy Gate por provider

Criar:

```text
modules/shared/integrations/policy/
```

Contrato:

```ts
type ProviderDataPolicy = {
  allowPersistentStorage: boolean;
  maxCacheAgeSeconds?: number;

  allowCrossProviderCombination: boolean;
  allowAiProcessing: boolean;
  allowThirdPartyDisclosure: boolean;
};
```

Cada implementação deve ser baseada na política oficial vigente.

---

# 75. Strava e IA

Enquanto a política vigente do Strava proibir esse cenário:

```text
Strava Data
    X
    │
    ▼
LLM / Agent
```

Não enviar Strava Data para:

- OpenAI;
- Anthropic;
- Gemini;
- modelos locais;
- embeddings;
- RAG;
- memória de agente;
- treinamento;
- fine-tuning;
- classificação por LLM.

O módulo precisa impedir isso arquiteturalmente.

---

# 76. Garmin e IA

Não assumir automaticamente que Garmin permite qualquer uso.

Antes de usar dados Garmin com agentes futuros, validar contrato/documentação aplicável ao acesso utilizado pela Ryvano.

A regra é geral:

```text
Provider Data
     │
     ▼
Provider Policy Gate
     │
     ├── persist?
     ├── compare?
     ├── share?
     └── AI?
```

---

# 77. Deauthorization independente

Desconectar Strava não deve desconectar Garmin.

Exemplo:

```text
User
├── Garmin   CONNECTED
└── Strava   DISCONNECTED
```

Dashboard continua funcionando com Garmin.

---

# 78. Delete independente

Se uma atividade é excluída no Strava:

```text
remover/inutilizar dados Strava relacionados
```

sem apagar uma atividade Garmin legítima por acidente.

Essa separação é crucial.

---

# 79. Idempotência por provider

Identidade mínima:

```text
provider + externalId + user/connection
```

Nunca:

```text
externalId
```

sozinho.

IDs de providers diferentes podem colidir numericamente.

---

# 80. Constraints

Exemplo:

```prisma
@@unique([provider, externalId, userId])
```

ou modelo equivalente.

Se a persistência específica do provider exigir outra estrutura, manter a identidade no módulo.

---

# 81. Segurança

Secrets nunca no browser.

Nunca logar:

```text
client secret
access token
refresh token
authorization code
webhook verify token
password Garmin
```

Criptografar secrets em repouso.

---

# 82. Logs devem conter provider

Exemplo:

```text
provider=strava
operation=get_activity
connection_id=...
status=success
```

ou:

```text
provider=garmin
operation=sync
connection_id=...
status=error
```

Isso facilita operação multi-provider.

---

# 83. Observabilidade por conexão

Métricas:

```text
integration_requests_total{provider}
integration_errors_total{provider}
integration_sync_total{provider}
integration_webhooks_total{provider}
integration_token_refresh_total{provider}
```

Sem violar políticas dos providers.

---

# 84. Testes multi-provider

Além dos testes de cada módulo, criar testes do core para:

```text
[ ] usuário sem provider
[ ] usuário somente Garmin
[ ] usuário somente Strava
[ ] usuário Garmin + Strava
[ ] Garmin falha e Strava funciona
[ ] Strava falha e Garmin funciona
[ ] desconectar Garmin mantém Strava
[ ] desconectar Strava mantém Garmin
[ ] provider sem sleep não quebra Dashboard
[ ] provider sem recovery não quebra relatório
[ ] provider sem webhook ainda pode sincronizar por sua estratégia
```

---

# 85. Testes Strava

## OAuth

```text
state válido
state inválido
access denied
scope parcial
token inválido
refresh
refresh concorrente
refresh token rotacionado
```

## Webhook

```text
challenge
create
update
delete
deauthorization
duplicate
unknown athlete
invalid payload
```

## API

```text
200
401
403
404
429
5xx
timeout
payload parcial
campo opcional ausente
```

## Retenção

```text
TTL
cleanup
delete
deauthorization
```

---

# 86. Fixtures

```text
modules/strava/tests/fixtures/
modules/garmin/tests/fixtures/
```

Nunca guardar dados reais.

Sanitizar:

```text
nome
email
telefone
GPS
tokens
IDs pessoais
```

---

# 87. UI de “Em breve”

Providers futuros não precisam possuir módulo vazio agora.

Pode existir somente o catálogo:

```ts
{
  id: "POLAR",
  availability: "COMING_SOON",
}
```

A UI apresenta o card.

Quando a integração começar a ser implementada:

```text
modules/polar/
```

é criado.

---

# 88. Não criar pastas vazias para todos os providers

Hoje:

```text
modules/
├── garmin/
├── strava/
└── shared/
```

É suficiente.

Não criar:

```text
modules/polar/
modules/coros/
modules/suunto/
modules/fitbit/
```

até a implementação realmente começar.

O espaço para expansão existe no contrato, catálogo e banco.

---

# 89. Provider Availability

Exemplo:

```ts
type ProviderAvailability =
  | "AVAILABLE"
  | "COMING_SOON"
  | "PRIVATE_BETA"
  | "DISABLED";
```

Isso permite liberar integração gradualmente.

---

# 90. Feature flags

Exemplos:

```env
INTEGRATION_GARMIN_ENABLED=true
INTEGRATION_STRAVA_ENABLED=true

INTEGRATION_POLAR_ENABLED=false
INTEGRATION_COROS_ENABLED=false
INTEGRATION_SUUNTO_ENABLED=false
INTEGRATION_FITBIT_ENABLED=false
```

Ou usar configuração interna.

Não confundir:

```text
provider existe no catálogo
```

com:

```text
provider está liberado
```

---

# 91. Fluxo de conexão genérico

UI:

```text
ConnectIntegration(providerId)
```

Registry:

```text
GARMIN → módulo Garmin
STRAVA → módulo Strava
```

Cada módulo decide seu protocolo.

Garmin pode ter um fluxo.

Strava usa OAuth.

Providers futuros podem usar OAuth, API key ou outros mecanismos.

---

# 92. Não padronizar protocolo à força

O contrato compartilhado não deve exigir:

```ts
getOAuthUrl()
```

porque nem todo provider necessariamente usa OAuth.

Pode usar capability:

```ts
authType: "OAUTH2" | "CREDENTIALS" | "API_KEY" | "OTHER";
```

confirmada por provider.

---

# 93. Resultado para a tela de integrações

View model genérico:

```ts
type IntegrationCardViewModel = {
  provider: ProviderId;

  name: string;
  description: string;

  availability: ProviderAvailability;

  connected: boolean;
  status?: IntegrationConnectionStatus;

  connectedAt?: Date;
  lastSyncAt?: Date;
  lastEventAt?: Date;

  action:
    | "CONNECT"
    | "MANAGE"
    | "RECONNECT"
    | "COMING_SOON";
};
```

A UI não precisa conhecer detalhes OAuth.

---

# 94. Dashboard provider-aware

View model:

```ts
type DashboardViewModel = {
  connectedProviders: ProviderId[];

  activitySummary?: ActivitySummaryViewModel;
  recovery?: RecoveryViewModel;
  sleep?: SleepViewModel;
  hrv?: HrvViewModel;
  readiness?: ReadinessViewModel;

  latestActivities: ActivityCardViewModel[];
};
```

Tudo que não existir é opcional.

---

# 95. Atividade provider-aware

```ts
type ActivityCardViewModel = {
  id: string;

  source: ProviderId;

  title: string;
  sportType: RyvanoSportType;

  startedAt: Date;

  distance?: string;
  duration?: string;
  pace?: string;

  sourceLabel: string;
};
```

---

# 96. Página de detalhe

```ts
type ActivityDetailViewModel = {
  source: ProviderId;

  general: {
    sportType: RyvanoSportType;
    startedAt: Date;
    distance?: number;
    duration?: number;
  };

  heartRate?: {...};
  power?: {...};
  cadence?: {...};
  elevation?: {...};

  providerSpecificSections?: ProviderSpecificSection[];
};
```

---

# 97. Provider-specific rendering

É válido um provider ter componentes próprios.

Exemplo:

```text
modules/garmin/presentation/components/garmin-recovery-card.tsx
modules/strava/presentation/components/strava-segment-section.tsx
```

Mas as telas principais pertencem à Ryvano.

Evitar páginas inteiras duplicadas:

```text
GarminDashboard
StravaDashboard
```

---

# 98. Ordem de implementação

## Fase 1 — preparar core multi-provider

- definir `ProviderId`;
- catálogo de providers;
- capabilities;
- conexão 0..N;
- status por conexão;
- view models independentes;
- testes de usuário sem integração / uma integração / várias.

---

## Fase 2 — modularizar Garmin

- criar `modules/garmin`;
- mover lógica;
- mover DTOs;
- mover parsers;
- mover client;
- mover configuração;
- mover persistência específica;
- manter rotas Next.js como adapters;
- preservar comportamento.

---

## Fase 3 — banco modular

- revisar Prisma multi-file;
- separar core;
- separar Garmin;
- criar Strava;
- migrations;
- constraints multi-provider.

---

## Fase 4 — Strava OAuth

- ENV;
- connect;
- callback;
- state;
- scopes;
- token exchange;
- token encryption;
- refresh;
- disconnect.

---

## Fase 5 — Strava API

- athlete;
- activities;
- detail;
- DTO;
- schemas;
- parser;
- rate limits.

---

## Fase 6 — Strava webhook

- subscription;
- challenge;
- POST;
- event table;
- processor;
- idempotência;
- update;
- delete;
- deauthorization.

---

## Fase 7 — Strava UI

- card de integração;
- status;
- source badges;
- atividades Strava;
- detalhe.

---

## Fase 8 — relatórios

- tornar report builder provider-agnostic;
- seções condicionais por capabilities;
- source label;
- policy gate.

---

## Fase 9 — reconciliação multi-provider

BLOQUEADA POR PADRÃO.

Implementar/habilitar somente quando permitido pelas políticas vigentes.

---

# 99. Definition of Done — core multi-provider

O core está pronto quando:

```text
[ ] usuário sem integração funciona
[ ] usuário somente Garmin funciona
[ ] usuário somente Strava funciona
[ ] usuário Garmin + Strava funciona
[ ] uma integração falhar não derruba a outra
[ ] Dashboard não exige Garmin
[ ] Dashboard não exige Strava
[ ] relatório não exige campos exclusivos Garmin
[ ] atividade preserva source
[ ] UI mostra origem quando necessário
[ ] catálogo possui providers futuros
[ ] providers futuros podem ficar "Em breve" sem pasta/módulo implementado
```

---

# 100. Definition of Done — Garmin modular

```text
[ ] lógica Garmin está dentro de modules/garmin
[ ] app/api contém adapters
[ ] erros Garmin estão no módulo
[ ] parsers Garmin estão no módulo
[ ] DTOs Garmin estão no módulo
[ ] repositories/mappers Garmin estão no módulo
[ ] apresentação específica Garmin está isolada
[ ] nenhum código Strava dentro do módulo Garmin
[ ] comportamento atual preservado
```

---

# 101. Definition of Done — Strava

```text
[ ] modules/strava criado
[ ] OAuth funciona
[ ] state validado
[ ] tokens criptografados
[ ] refresh funciona
[ ] refresh token atualizado quando rotacionado
[ ] scopes efetivos armazenados
[ ] athleteId associado à conexão
[ ] webhook subscription configurada
[ ] challenge funciona
[ ] create/update/delete processados
[ ] deauthorization processada
[ ] rate limits tratados
[ ] cache respeita TTL
[ ] cleanup funciona
[ ] origem Strava exibida
[ ] Strava funciona sem Garmin conectado
[ ] Garmin continua funcionando sem Strava
[ ] Strava Data não entra em IA enquanto proibido
[ ] reconciliação Garmin × Strava permanece desabilitada enquanto não permitida
```

---

# 102. Checklist obrigatório antes de endpoint externo

Adicionar ao processo de implementação:

```text
[ ] Consultei a documentação oficial?
[ ] Consultei o changelog?
[ ] Confirmei a URL atual?
[ ] Confirmei método e path?
[ ] Confirmei autenticação?
[ ] Confirmei scopes?
[ ] Confirmei parâmetros?
[ ] Confirmei retorno?
[ ] Campos opcionais foram tratados?
[ ] Confirmei paginação?
[ ] Confirmei rate limit?
[ ] Confirmei webhook?
[ ] Confirmei retenção?
[ ] Confirmei exclusão?
[ ] Confirmei política de armazenamento?
[ ] Confirmei política de combinação com outros providers?
[ ] Confirmei política de compartilhamento?
[ ] Confirmei política de IA?
[ ] DTO foi criado no módulo?
[ ] Schema runtime foi criado?
[ ] Parser foi criado?
[ ] Teste foi criado?
[ ] Fixture foi sanitizada?
```

---

# 103. Orientação para AGENTS.md

Adicionar ao `AGENTS.md`:

```md
## Integrações esportivas

A Ryvano suporta múltiplos providers por usuário.

Um usuário pode possuir nenhuma, uma ou várias integrações.

Garmin e Strava são os providers disponíveis inicialmente. Polar, COROS,
Suunto e Fitbit estão previstos para o futuro.

Regras:

1. nunca assumir que Garmin está conectado;
2. nunca assumir que Strava está conectado;
3. nunca assumir que o usuário possui apenas um provider;
4. usar capabilities para decidir funcionalidades compartilhadas;
5. manter código específico em `modules/<provider>`;
6. rotas Next.js devem ser adapters finos;
7. consultar documentação oficial vigente antes de implementar qualquer
   endpoint, DTO, scope, webhook ou campo;
8. DTO remoto não deve atravessar diretamente para domínio/UI;
9. usar validação runtime + parser + contrato interno;
10. preservar a origem de cada métrica;
11. nunca sobrescrever silenciosamente dados de providers diferentes;
12. reconciliação entre providers deve ser uma camada separada e opcional;
13. validar termos de armazenamento, retenção, compartilhamento, combinação
    e IA para cada provider;
14. dados de um provider não podem ser usados fora do que sua política permitir;
15. adicionar um novo provider não deve exigir alterar módulos existentes,
    exceto catálogo/registry/contratos quando realmente necessário.
```

---

# 104. Arquitetura final esperada

```text
                             RYVANO

                              User
                               │
                               │ 0..N
                               ▼
                  Integration Connections
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
      Garmin                 Strava                futuro
      Module                 Module                Modules
         │                     │                     │
         │                     │             ┌───────┼────────┐
         │                     │             ▼       ▼        ▼
         │                     │           Polar   COROS    Suunto
         │                     │                              ...
         └─────────────────────┼───────────────────────┘
                               │
                               ▼
                        Ryvano Contracts
                               │
                ┌──────────────┼──────────────┐
                ▼              ▼              ▼
            Dashboard      Atividades      Relatórios
```

---

# 105. Resultado de produto esperado

O usuário deve sentir:

> "A Ryvano funciona com os serviços que eu uso."

e não:

> "A Ryvano é um sistema Garmin onde adicionaram Strava."

Exemplos válidos:

```text
Eu uso Garmin.
→ conecto Garmin.

Eu uso Strava.
→ conecto Strava.

Eu uso Garmin e Strava.
→ conecto os dois.

Eu migrei de Garmin para COROS.
→ desconecto Garmin e conecto COROS.

Eu uso COROS e Strava.
→ os dois coexistem.

Eu não quero conectar wearable ainda.
→ continuo com minha conta Ryvano e posso conectar depois.
```

Essa flexibilidade deve existir desde o desenho do banco, serviços, UI e relatórios.

---

# 106. Princípio arquitetural final

A regra é:

```text
Provider é plugin.
Ryvano é produto.
```

Nenhum provider deve se tornar o centro da aplicação.

Garmin é o primeiro módulo existente.

Strava será o segundo.

Polar, COROS, Suunto, Fitbit e outros poderão entrar depois.

O core da Ryvano deve permanecer independente.

---

# 107. Referências oficiais atuais para a implementação Strava

- Strava Documentation  
  https://developers.strava.com/docs/

- Strava Authentication  
  https://developers.strava.com/docs/authentication/

- Strava API Reference  
  https://developers.strava.com/docs/reference/

- Strava Webhooks  
  https://developers.strava.com/docs/webhooks/

- Strava Rate Limits  
  https://developers.strava.com/docs/rate-limits/

- Strava Changelog  
  https://developers.strava.com/docs/changelog/

- Strava API Agreement  
  https://www.strava.com/legal/api

- Strava API Policy  
  https://www.strava.com/legal/api_policy

- Strava Brand Guidelines  
  https://developers.strava.com/guidelines/

- Prisma Documentation  
  https://docs.prisma.io/

---

# 108. Regra de manutenção deste documento

Quando um novo provider entrar:

1. consultar documentação oficial;
2. adicionar links oficiais;
3. definir capabilities;
4. definir autenticação;
5. definir política de dados;
6. definir tabelas específicas somente quando necessário;
7. criar `modules/<provider>`;
8. implementar adapters;
9. adicionar testes;
10. adicionar ao registry;
11. habilitar no catálogo;
12. mudar o status da UI de `COMING_SOON` para `AVAILABLE`.

Nunca copiar o módulo Garmin ou Strava inteiro e apenas trocar nomes.

Cada provider possui particularidades.

---

> **Última revisão:** 30/08/2026.
>
> **IMPORTANTE:** endpoints, scopes, URLs, políticas, rate limits e contratos externos podem mudar. Antes de implementar ou alterar integrações, sempre consultar novamente a documentação oficial vigente.
