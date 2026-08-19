# RYANO — Acceptance Criteria & Roadmap

# 1. Definition of Done geral

Uma feature só está concluída quando:
- funciona em fluxo real;
- possui estados loading/empty/error/success;
- possui autorização correta;
- não expõe secrets;
- passa lint/typecheck/build;
- possui teste mínimo proporcional ao risco;
- segue os dois arquivos obrigatórios de design;
- funciona em desktop e mobile quando voltada ao usuário.

---

# 2. Landing

- [ ] segue design system existente;
- [ ] explica proposta de valor;
- [ ] informa Garmin como integração inicial;
- [ ] não promete providers ainda inexistentes;
- [ ] CTA cadastro;
- [ ] CTA login;
- [ ] seção WhatsApp;
- [ ] comunicação de segurança tecnicamente correta;
- [ ] responsiva.

---

# 3. Auth

- [ ] cadastro email/senha;
- [ ] login;
- [ ] logout;
- [ ] senha com hash;
- [ ] recuperação/reset;
- [ ] Google OAuth;
- [ ] conta Google persiste via Prisma;
- [ ] campos retornados pelo Google são reaproveitados;
- [ ] onboarding coleta campos restantes;
- [ ] rate limit em endpoints críticos.

---

# 4. Profile

- [ ] nome completo;
- [ ] CPF;
- [ ] telefone E.164;
- [ ] endereço;
- [ ] email;
- [ ] altura;
- [ ] peso;
- [ ] validação;
- [ ] alteração de telefone invalida verificação WhatsApp.

---

# 5. Garmin

- [ ] provider abstraction criada;
- [ ] Garmin não está acoplado aos componentes;
- [ ] connect chama API externa server-side;
- [ ] admin key somente server-side;
- [ ] senha não aparece em logs;
- [ ] tokens retornados protegidos;
- [ ] status de conexão;
- [ ] sync;
- [ ] paginação;
- [ ] idempotência;
- [ ] disconnect;
- [ ] erro de credencial tratado;
- [ ] indisponibilidade tratada.

---

# 6. Activities

- [ ] modelo interno normalizado;
- [ ] lista;
- [ ] filtros;
- [ ] paginação;
- [ ] detalhe;
- [ ] provider visível;
- [ ] nenhuma atividade duplicada após retry/sync.

---

# 7. Evolution Admin

- [ ] somente admin;
- [ ] status da instância;
- [ ] QR Code;
- [ ] connected/disconnected;
- [ ] reconnect;
- [ ] webhook status;
- [ ] teste de mensagem;
- [ ] API key não vai ao browser.

---

# 8. WhatsApp activation

- [ ] token CSPRNG;
- [ ] token salvo somente como hash;
- [ ] expiração;
- [ ] single-use;
- [ ] wa.me gerado;
- [ ] mensagem pré-preenchida contém nome + token;
- [ ] nenhuma PII desnecessária;
- [ ] inbound webhook processado;
- [ ] sender normalizado;
- [ ] telefone confere;
- [ ] token confere;
- [ ] identity verificada;
- [ ] token consumido;
- [ ] usuário recebe confirmação;
- [ ] código expirado pode ser regenerado.

---

# 9. Reports

- [ ] preferência pós-atividade;
- [ ] serviço de report separado do transporte;
- [ ] envia somente para WhatsApp verificado;
- [ ] persiste delivery status;
- [ ] falha não duplica indiscriminadamente;
- [ ] conteúdo usa apenas dados reais.

---

# 10. Dashboard

- [ ] status Garmin;
- [ ] status WhatsApp;
- [ ] última sync;
- [ ] última atividade;
- [ ] resumo do período;
- [ ] últimas atividades;
- [ ] métricas sem dados não aparecem;
- [ ] CTA de integração incompleta.

---

# 11. Admin users

- [ ] lista;
- [ ] busca;
- [ ] detalhe;
- [ ] onboarding status;
- [ ] Garmin status;
- [ ] WhatsApp status;
- [ ] last sync;
- [ ] proteção de dados sensíveis;
- [ ] ação admin auditada quando relevante.

---

# 12. Segurança

- [ ] `.env.example`;
- [ ] `.env` no gitignore;
- [ ] nenhum secret versionado;
- [ ] credencial Garmin criptografada;
- [ ] logs redacted;
- [ ] auth server-side;
- [ ] role server-side;
- [ ] webhook validado;
- [ ] token activation hashed;
- [ ] input validation;
- [ ] rate limits críticos.

---

# 13. Fases do produto

## V1 — Foundation
- landing;
- auth;
- Google;
- profile/onboarding;
- Garmin;
- activities;
- WhatsApp;
- report pós-atividade;
- dashboard;
- admin.

## V1.1 — Engagement
- resumo diário;
- resumo semanal;
- metas simples;
- comparação semanal/mensal;
- melhorias de reports;
- sincronização mais robusta.

## V1.2 — Performance
- tendências;
- recordes;
- zonas;
- volume;
- calendário;
- metas;
- comparação de períodos.

## V2 — Wearables & Official Connections
- integração Garmin oficial/OAuth se aprovada;
- Apple;
- Polar;
- Coros;
- Suunto;
- Fitbit/outros conforme prioridade;
- capability matrix.

## V3 — Training
- calendário planejado;
- sessões;
- planos;
- modalidades;
- coach;
- progresso.

## V4 — Nutrition
- alimentação;
- diário;
- metas nutricionais;
- relação treino/recuperação/alimentação;
- futuras integrações.

---

# 14. Benchmark funcional

Manter como referência de produto, não como cópia visual:

- TrainingPeaks: dashboard, calendário, goals, análise e histórico.
- Strava: training log, atividade, metas, comparação e tendências.
- Garmin Connect: saúde, performance, relatórios e dispositivos.
- WHOOP: recuperação, sono, carga/strain e insights simplificados.

Toda implementação visual continua subordinada aos arquivos locais:

```text
.kiro/agents/skills/design-system.skill.md
.cave/agents/designer.md
```

---

# 15. Fontes técnicas atuais consultadas

Para validação durante implementação, consultar documentação oficial atual e não assumir endpoints/versionamentos.

- Garmin Connect Developer Program:
  https://developer.garmin.com/gc-developer-program/

- Garmin Activity API:
  https://developer.garmin.com/gc-developer-program/activity-api/

- Garmin Health API:
  https://developer.garmin.com/gc-developer-program/health-api/

- Evolution API:
  https://docs.evolutionfoundation.com.br/en/evolution-api

- Prisma + Next.js:
  https://www.prisma.io/docs/guides/frameworks/nextjs

- Auth.js + Prisma:
  https://www.prisma.io/docs/guides/authentication/authjs/nextjs
