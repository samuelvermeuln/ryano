# Ryvano × Garmin API — plano de consumo eficiente

## Objetivo

Fazer a Ryvano consumir a API Garmin de forma eficiente para 2 fluxos:

1. preencher a aba/dashboard Garmin com dados realmente úteis;
2. enviar um relatório resumido no WhatsApp com base em snapshot diário.

---

## Estado atual na Ryvano

### Integração Garmin atual

Arquivos principais:
- `server/providers/wearables/garmin.ts`
- `server/providers/wearables/types.ts`
- `server/services/garmin-service.ts`
- `app/actions/integrations.ts`
- `app/api/integrations/garmin/connect/route.ts`
- `app/api/integrations/garmin/sync/route.ts`

Hoje a Ryvano usa só:
- `POST /accounts`
- `GET /activities`

E faz:
- conexão da conta Garmin;
- validação simples;
- sincronização paginada de atividades;
- persistência local em `Activity`.

### Dashboard atual

Arquivos principais:
- `server/queries.ts`
- `app/app/dashboard/page.tsx`

Hoje o dashboard mostra principalmente:
- status da conexão Garmin;
- última sincronização;
- últimas atividades;
- agregados locais calculados a partir de `Activity`.

Não consome ainda métricas de recuperação/saúde da API Garmin, como:
- sleep
- HRV
- body battery
- training readiness
- summary diário agregado

### WhatsApp atual

Arquivos principais:
- `server/services/garmin-service.ts`
- `server/services/report-builder.ts`
- `lib/post-activity-report-template.ts`
- `server/providers/messaging/evolution.ts`

Hoje o fluxo WhatsApp faz:
- relatório pós-atividade por texto;
- envio logo após sincronizar nova atividade;
- template baseado só nos dados da atividade individual.

Não existe ainda relatório resumido diário baseado em snapshot Garmin agregado.

---

## Superfície da API Garmin recomendada para Ryvano

Baseado em `python-garminconnect/docs/routes.md`.

### Rota principal

#### `GET /daily-report/{date}`

Melhor rota para Ryvano consumir como fonte principal.

Traz em 1 request:
- `summary`
- `health`
- `training`
- `body`
- `nutrition`
- `warnings`

Uso ideal:
- card principal da aba Garmin;
- resumo diário para WhatsApp;
- snapshot persistido do dia;
- fallback de leitura rápida sem chamar muitas rotas separadas.

### Rotas secundárias úteis

#### `GET /me`
Uso:
- validar rapidamente se a conta segue autenticada;
- detectar reconnect antes de sync pesada.

#### `GET /activities?start=0&limit=5`
Uso:
- últimas atividades remotas;
- conferência rápida sem depender só do banco local.

#### `GET /training-readiness/{date}`
Uso:
- card isolado quando quiser destacar prontidão.

#### `GET /sleep/{date}`
Uso:
- detalhamento de sono se o dashboard precisar drill-down.

#### `GET /hrv/{date}`
Uso:
- detalhamento de recuperação.

#### `GET /body-battery?start={date}&end={date}`
Uso:
- card/body battery isolado.

#### `GET /summary/{date}`
Uso:
- fallback leve se `daily-report` falhar.

### Rotas que não devem ser primeira escolha para dashboard

- `GET /heart-rate/{date}`
- `GET /stress/{date}`
- `GET /respiration/{date}`
- `GET /spo2/{date}`
- `GET /hydration/{date}`
- `GET /nutrition/*`

Motivo:
- boas para drill-down;
- não ideais para page load principal.

---

## Estratégia eficiente para Ryvano

## Princípio

Usar 2 camadas:

1. **histórico local** em banco para atividades e tendências;
2. **snapshot remoto diário** para leitura rápida de saúde/recuperação.

### O que fica local

Continuar persistindo:
- `Activity`
- `WearableConnection`
- `WearableSecret`

Porque isso é ótimo para:
- timeline de atividades;
- agregados por período;
- filtros;
- relatórios pós-atividade;
- menor dependência da API externa em navegação histórica.

### O que vem da API Garmin agregada

Consumir `daily-report/{date}` para:
- sleep do dia;
- HRV;
- training readiness;
- body battery;
- nutrition/settings se quiser exibir depois;
- warnings estruturados.

### Recomendação de cache

No backend Ryvano:
- cache por `userId + date`
- TTL de 5 a 15 min

Uso ideal:
- dashboard não chama Garmin em toda navegação/re-render;
- mesmo snapshot serve para UI e WhatsApp;
- reduz custo e risco de rate limit.

---

## Mudanças recomendadas na Ryvano

## 1. Expandir contrato do provider Garmin

Arquivo:
- `server/providers/wearables/types.ts`

Hoje faltam métodos para leitura de snapshot diário.

Adicionar algo nessa linha:

- `getAccountStatus(accountApiKey)`
- `getDailyReport(accountApiKey, date)`
- `getDailySummary(accountApiKey, date)`
- `getTrainingReadiness(accountApiKey, date)`
- `getSleep(accountApiKey, date)`
- `getHrv(accountApiKey, date)`
- `getBodyBattery(accountApiKey, start, end)`

## 2. Implementar rotas no provider Garmin

Arquivo:
- `server/providers/wearables/garmin.ts`

Hoje o provider fala só com:
- `/accounts`
- `/activities`

Expandir para ler:
- `/me`
- `/daily-report/{date}`
- `/summary/{date}`
- `/training-readiness/{date}`
- `/sleep/{date}`
- `/hrv/{date}`
- `/body-battery`

## 3. Criar serviço de snapshot diário

Novo serviço sugerido:
- `server/services/garmin-daily-report.ts`

Responsabilidade:
- carregar `GARMIN_API_KEY` da conexão do usuário;
- buscar `daily-report/{date}`;
- aplicar cache curto;
- devolver objeto pronto para dashboard + WhatsApp.

## 4. Persistir snapshot resumido

Sugestão de persistência nova no Prisma:
- `GarminDailySnapshot`

Campos sugeridos:
- `id`
- `userId`
- `date`
- `payload Json`
- `fetchedAt`
- `sourceStatus`
- `warnings Json?`

Benefícios:
- UI rápida;
- deduplicação do texto do WhatsApp;
- auditoria do que foi usado no relatório.

## 5. Enriquecer `getDashboardData`

Arquivo:
- `server/queries.ts`

Hoje ele usa só `Activity` + conexão + WhatsApp.

Evoluir para retornar também algo como:
- `garminDailyReport`
- `garminReadiness`
- `garminSleep`
- `garminBodyBattery`
- `garminWarnings`

## 6. Enriquecer `app/app/dashboard/page.tsx`

Adicionar cards Garmin com base no snapshot:
- sono
- body battery
- training readiness
- HRV/status de recuperação
- warnings do dia

Manter agregados locais já existentes para:
- volume do período;
- últimas atividades;
- tendências.

Melhor desenho:
- **cards de estado diário** vêm da Garmin API agregada;
- **gráficos e histórico** continuam vindo do banco local.

## 7. Criar builder de relatório resumido WhatsApp

Arquivos atuais:
- `server/services/report-builder.ts`
- `lib/post-activity-report-template.ts`

Hoje são centrados em pós-atividade.

Criar fluxo paralelo, por exemplo:
- `buildDailyGarminWhatsappSummary()`
- `renderDailyGarminWhatsappText()`

Entradas ideais:
- snapshot de `daily-report/{date}`
- última atividade local
- agregados do período (opcional)

Saída ideal:
- mensagem curta, útil, sem payload bruto.

Exemplo de estrutura:
- estado geral do dia
- sono
- prontidão
- body battery
- ponto de atenção
- recomendação curta

## 8. Agendar envio resumido

Base já existe em preferências:
- `NotificationPreference.reportTime`

Arquivos relevantes:
- `prisma/schema.prisma`
- `app/app/relatorios/page.tsx`
- `components/profile/preferences-form.tsx`

Falta ligar isso a um job real.

Sugestão:
- job diário por usuário com WhatsApp verificado;
- busca snapshot do dia;
- gera texto resumido;
- salva entrega em `MessageDelivery` com tipo novo, por exemplo:
  - `DAILY_GARMIN_SUMMARY:2026-08-24`

---

## Fluxo recomendado para dashboard

## Page load da aba Garmin/dashboard

1. ler conexão Garmin local;
2. ler atividades recentes locais;
3. ler snapshot diário cacheado/persistido;
4. se snapshot expirou, atualizar em background ou on-demand;
5. renderizar:
   - estado da conexão
   - última sync
   - últimas atividades
   - cards de health/recovery do dia

## Não fazer

- chamar 5 a 10 rotas Garmin separadas em todo carregamento;
- recalcular tudo a partir da API remota em toda navegação;
- depender de `/activities` remota para tudo que já existe localmente.

---

## Fluxo recomendado para WhatsApp

## Pós-atividade

Manter fluxo atual para velocidade:
- nova atividade sincronizada
- gera texto rápido
- envia via Evolution

## Resumo diário

Novo fluxo:
1. carrega snapshot `daily-report/{date}`;
2. extrai sinais principais;
3. combina com última atividade ou volume local, se útil;
4. gera texto curto;
5. envia 1 vez por dia por usuário.

## Regra de eficiência

- **1 request principal** para snapshot (`daily-report/{date}`)
- **0 ou 1 request auxiliar** só se precisar fallback
- reutilizar snapshot para UI e WhatsApp

---

## Shortlist final de rotas para Ryvano

### Essenciais
- `POST /accounts`
- `GET /me`
- `GET /activities?start&limit`
- `GET /daily-report/{date}`

### Úteis como fallback ou drill-down
- `GET /summary/{date}`
- `GET /sleep/{date}`
- `GET /hrv/{date}`
- `GET /training-readiness/{date}`
- `GET /body-battery?start&end`

### Não prioritárias agora
- `GET /nutrition/*`
- `GET /spo2/{date}`
- `GET /respiration/{date}`
- `GET /hydration/{date}`
- `GET /heart-rate/{date}`

---

## Ordem de implementação sugerida

### Fase 1
- expandir `garmin.ts` provider
- adicionar `getDailyReport()`
- criar serviço `garmin-daily-report`
- enriquecer dashboard com snapshot diário

### Fase 2
- criar builder de relatório resumido WhatsApp
- persistir snapshot diário
- job de envio diário usando `reportTime`

### Fase 3
- drill-down de cards com rotas específicas (`sleep`, `hrv`, `body-battery`)
- fallback inteligente quando `daily-report` vier incompleto

---

## Decisão recomendada

Para a Ryvano ficar mais eficiente:

- continuar usando **DB local** para histórico e tendências;
- usar **`GET /daily-report/{date}` como rota principal** de leitura rápida;
- usar **1 snapshot por dia por usuário** para abastecer dashboard + WhatsApp;
- evitar fan-out de várias chamadas Garmin no carregamento da interface.
