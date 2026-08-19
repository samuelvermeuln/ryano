# RYANO — Garmin + WhatsApp/Evolution Integration Spec

## 1. Garmin provider

### Base URL

Config:

```env
GARMIN_SERVICE_BASE_URL=
GARMIN_ADMIN_KEY=
```

Nunca expor como `NEXT_PUBLIC_*`.

---

## 2. Connect Garmin

Endpoint interno sugerido:

```text
POST /api/integrations/garmin/connect
```

Browser envia somente:

```json
{
  "email": "usuario-garmin",
  "password": "senha-garmin"
}
```

Servidor:

1. autentica usuário RYANO;
2. valida input;
3. monta label interna segura;
4. chama `${GARMIN_SERVICE_BASE_URL}/accounts`;
5. adiciona `X-Admin-Key` server-side;
6. interpreta resposta real;
7. protege quaisquer tokens/keys retornados;
8. cria `WearableConnection`;
9. testa acesso;
10. inicia sync inicial;
11. retorna somente status sanitizado.

### Nunca retornar ao browser
- Garmin password;
- Garmin account API key;
- admin key;
- internal provider secrets.

---

## 3. Garmin external request example

```bash
curl --location "${GARMIN_SERVICE_BASE_URL}/accounts" \
  --header "Content-Type: application/json" \
  --header "X-Admin-Key: ${GARMIN_ADMIN_KEY}" \
  --data-raw '{
    "email": "<garmin-email>",
    "password": "<garmin-password>",
    "label": "<label>"
  }'
```

Atividades:

```bash
curl --location "${GARMIN_SERVICE_BASE_URL}/activities?start=0&limit=10" \
  --header "X-API-Key: ${GARMIN_ACCOUNT_API_KEY}"
```

`GARMIN_ACCOUNT_API_KEY` deve ser obtida do processo real de provisionamento da API e armazenada de forma protegida.

---

## 4. Sync

Endpoint interno:

```text
POST /api/integrations/garmin/sync
```

Regras:
- user authenticated;
- only own connection;
- rate limit;
- idempotent upsert;
- pagination;
- timeout;
- retries controlados;
- atualizar `lastSyncAt`;
- salvar `lastSyncStatus`;
- erro sanitizado.

---

## 5. Disconnect

```text
DELETE /api/integrations/garmin
```

Definir comportamento:
- desconecta integração;
- não apagar histórico automaticamente;
- revogar/remover segredo local;
- se API Garmin externa possuir endpoint de remoção/revogação, usar quando disponível;
- solicitar confirmação na UI.

---

# 6. V2 Garmin OAuth

Não implementar agora.

A arquitetura deve permitir:

```text
GarminProvider
├── CredentialStrategy       [V1]
└── OAuthStrategy            [futuro]
```

Preferência futura: Garmin Connect Developer Program e OAuth 2.0.

Não implementar captura de credenciais por iframe/webview/browser automation sem decisão arquitetural e jurídica específica.

---

# 7. Evolution API

Config:

```env
EVOLUTION_API_BASE_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE_NAME=
EVOLUTION_WEBHOOK_SECRET=
RYANO_WHATSAPP_NUMBER=
```

Implementar provider único.

Exemplo conceitual:

```ts
interface MessagingProvider {
  getStatus(): Promise<MessagingStatus>;
  getConnectQrCode(): Promise<QrCodeResult>;
  sendText(input: SendTextInput): Promise<MessageResult>;
  disconnect(): Promise<void>;
}
```

Ajustar os métodos à versão instalada da Evolution e seus endpoints oficiais.

---

# 8. Admin — QR Code

Tela admin deverá:

1. chamar API interna;
2. backend consulta Evolution;
3. mostrar estado atual;
4. se desconectado, permitir criar/conectar instância conforme API instalada;
5. obter QR Code;
6. renderizar QR;
7. atualizar status;
8. após pareamento, esconder QR;
9. mostrar número/identidade conectada;
10. permitir reconnect/disconnect.

Não persistir QR Code indefinidamente.

Não expor API key Evolution.

---

# 9. Webhook Evolution

Endpoint sugerido:

```text
POST /api/webhooks/evolution
```

Obrigatório:
- autenticar/verificar webhook conforme mecanismo disponível;
- validar payload;
- limitar tamanho;
- deduplicar event/message id;
- responder rápido;
- processar somente eventos necessários;
- sanitizar logs.

Eventos relevantes:
- connection status;
- inbound message;
- message delivery/status, se necessário.

---

# 10. WhatsApp Activation Token

Tabela conceitual:

```text
WhatsAppActivationToken
- id
- userId
- tokenHash
- phoneE164
- expiresAt
- consumedAt
- attemptCount
- createdAt
```

Token raw existe apenas durante geração e na URL/mensagem.

Não persistir raw.

---

# 11. Gerar ativação

Endpoint:

```text
POST /api/whatsapp/activation
```

Pré-condições:
- logged in;
- profile complete;
- phone exists;
- phone normalized.

Backend:
- invalida tokens anteriores ainda abertos;
- cria token random;
- salva hash;
- monta prefilled message;
- gera `wa.me`;
- retorna URL e expiry.

Exemplo de resposta:

```json
{
  "activationUrl": "https://wa.me/...",
  "expiresAt": "..."
}
```

Não retornar token separadamente se não for necessário.

---

# 12. Verificação de remetente

Ao receber mensagem:

1. extrair `remoteJid`/sender conforme versão da Evolution;
2. normalizar para E.164;
3. extrair token do corpo;
4. localizar token pelo hash;
5. verificar `expiresAt`;
6. verificar `consumedAt == null`;
7. verificar telefone esperado;
8. marcar identity;
9. consumir token;
10. opcionalmente responder confirmação.

Exemplo de confirmação:

```text
Tudo certo! Seu WhatsApp foi conectado à RYANO. A partir de agora seus relatórios poderão chegar por aqui.
```

---

# 13. Alteração de telefone

Se o usuário alterar telefone:
- marcar WhatsApp identity anterior como não verificada/desvinculada;
- exigir nova ativação;
- não migrar vínculo automaticamente.

---

# 14. Envio de relatório

Antes de enviar:
- user enabled;
- WhatsApp verified;
- Evolution connected;
- phone normalized;
- dedupe report event.

Persistir `MessageDelivery` com:
- user;
- type;
- external message id;
- status;
- created/sent/delivered/failed timestamps;
- sanitized error.

---

# 15. Relatório pós-atividade — modelo V1

Somente dados disponíveis:

```text
🏃 Nova atividade registrada

Corrida
📅 18/08
⏱ 52 min
📏 9,8 km
❤️ FC média: 151 bpm

Veja os detalhes na RYANO: <link>
```

Adaptar conteúdo à modalidade e dados reais.

Não inventar insights de saúde ou recomendações médicas.

---

# 16. Polling / ingestão

A API Garmin atual demonstrada fornece endpoint de listagem.

Se ela não disponibilizar webhook:
- implementar mecanismo simples e controlado de polling;
- não fazer polling por browser;
- respeitar limites;
- controlar cursor/last sync;
- evitar executar uma requisição por usuário de forma descontrolada.

A estratégia concreta deve ser definida após medir o comportamento e limites reais da API existente.

---

# 17. Health checks

Admin/monitoramento deve conseguir diferenciar:

```text
Garmin service reachable
Garmin auth valid
Evolution reachable
Evolution instance connected
Evolution webhook receiving
Database reachable
```

Não confundir "API responde" com "integração do usuário está válida".
