# Fichas de pesquisa — provedores candidatos (SAM-79, §21.6, §26.3, §27.3)

Consulta em **03/10/2026**. Os cinco provedores continuam `COMING_SOON` no catálogo (`modules/shared/integrations/catalog`): **nenhum é registrado como disponível por esta issue**. "Não prometer Garmin, Polar, Fitbit, Amazfit ou outra integração porque concorrentes as possuem" (§21.6). Paráfrases.

Capabilities do catálogo avaliadas em cada ficha: atividades (resumo), `laps`, `streams`, `routeGps`, saúde diária (`dailyHealth`, `restingHeartRate`, `steps`, `bodyBattery`), `webhooks`, `plannedWorkoutPush`.

---

## Polar (AccessLink API)

```text
Dúvida: a Polar cobre as capabilities do catálogo com documentação pública e termos viáveis?
Por que afeta a funcionalidade: alunos com relógio Polar hoje importam por arquivo (SAM-74) ou ficam sem sincronização.
Modalidade/ambiente/população: qualquer; usuários com conta Polar Flow.
Fonte primária e URL: https://www.polar.com/accesslink-api/ (documentação pública com OpenAPI); registro em https://admin.polaraccesslink.com
Data da consulta e edição/versão: 03/10/2026 (v3).
O que foi efetivamente lido: OAuth2 (token de usuário não expira até revogação); exercícios com zonas de FC, amostras e rota, export FIT/TCX/GPX; só exercícios enviados ao Flow nos últimos 30 dias; atividade diária e FC contínua até 365 dias; Nightly Recharge e sono; webhooks (EXERCISE, SLEEP, ACTIVITY_SUMMARY…) assinados com HMAC-SHA256, desativados após 7 dias de falha, um por aplicação; limite dinâmico: 500 + 20 × usuários por 15 min e 5.000 + 100 × usuários por dia; consentimentos obrigatórios do usuário; contrato "AccessLink Limited License Agreement".
Achado confirmado: cobre atividades, laps (via FIT), streams, rota, saúde diária (sono, repouso via Nightly Recharge/FC contínua) e webhooks. NÃO cobre envio de treino planejado.
Limitações e divergências: janela de 30 dias para exercícios (backfill limitado); termos comerciais exigem aceite de contrato de licença; carga "Training Load Pro" é proprietária e não equivale a hrTSS/TSS (§17.6).
Decisão de produto: CANDIDATO APROVADO PARA ISSUE FILHA de implementação (módulo `modules/polar`), capabilities declaráveis após teste: activities, laps, streams, routeGps, dailyHealth, restingHeartRate, steps, webhooks. `plannedWorkoutPush` NÃO. Permanece COMING_SOON até a issue filha validar com conta real e contrato aceito.
O que continuará sob decisão do professor: nada automático muda; a carga proprietária da Polar aparece só rotulada como da Polar.
Critério de aceitação: sync de uma conta real traz atividade + laps + streams; webhook de EXERCISE processa idempotente; rate limit respeitado em teste de carga.
Responsável pela validação: responsável técnico + jurídico (contrato de licença).
```

## Fitbit (Web API) — descontinuação anunciada

```text
Dúvida: vale integrar a Fitbit Web API?
Por que afeta a funcionalidade: alunos com Fitbit.
Modalidade/ambiente/população: fitness geral; menor cobertura de laps/potência.
Fonte primária e URL: https://dev.fitbit.com/build/reference/web-api/
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: aviso oficial: suporte à Web API legada termina em 30/09/2026 e desligamento em 30/10/2026, com migração para a Google Health API; API de assinaturas (webhooks); dados intradiários com acesso restrito; Termos de plataforma e política de dados do desenvolvedor.
Achado confirmado: a API consultada está em fim de vida na data da consulta.
Limitações e divergências: migração para outra plataforma (Google) com termos e escopos distintos ainda não avaliados.
Decisão de produto: NÃO ENTRA agora. Permanece COMING_SOON; nova ficha só para a Google Health API quando a documentação e os termos forem lidos.
O que continuará sob decisão do professor: nada.
Critério de aceitação: nenhum código Fitbit; catálogo inalterado.
Responsável pela validação: produto.
```

## Amazfit / Zepp

```text
Dúvida: existe API oficial de dados históricos da Zepp para terceiros?
Por que afeta a funcionalidade: alunos com Amazfit.
Modalidade/ambiente/população: fitness geral.
Fonte primária e URL: https://docs.zepp.com/ (Zepp OS, apps no relógio; OAuth de app-settings) ; https://github.com/zepp-health
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: a documentação oficial cobre desenvolvimento de apps Zepp OS e OAuth para configurações de app; não há API pública documentada para ler atividades/saúde históricas de um usuário por terceiros; soluções existentes são não oficiais.
Achado confirmado: sem API oficial de dados do usuário para parceiros, na data da consulta.
Limitações e divergências: integrações comunitárias podem violar termos.
Decisão de produto: NÃO ENTRA. Permanece COMING_SOON; alunos Amazfit usam a importação de arquivo (SAM-74) quando o app exportar FIT/GPX/TCX.
O que continuará sob decisão do professor: nada.
Critério de aceitação: nenhum código Zepp.
Responsável pela validação: produto.
```

## COROS (Partner API)

```text
Dúvida: a COROS oferece API a parceiros com as capabilities do catálogo?
Por que afeta a funcionalidade: alunos com COROS (natação, trilha); envio de treino estruturado.
Modalidade/ambiente/população: qualquer.
Fonte primária e URL: https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access (a página devolveu 403 ao robô; lida pelo resumo indexado) ; https://support.coros.com/hc/en-us/articles/360040256531-Supported-3rd-Party-Apps
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: acesso de parceiro exige plataforma estabelecida com base de usuários, empresa registrada, conformidade de segurança/privacidade e aceite dos Termos da API; entrega OAuth 2.0 multiusuário, webhooks (~5 min), sincronização bidirecional de atividades, importação/exportação de rotas GPX e sincronização de treinos estruturados/planos.
Achado confirmado: tecnicamente cobriria atividades, laps/streams (via arquivo), rota, webhooks e `plannedWorkoutPush`; a documentação técnica (endpoints, limites, retenção) não é pública.
Limitações e divergências: elegibilidade comercial (base de usuários) não comprovada pela Ryvano hoje; sem spec pública para validar capabilities finas de exportação (SAM-77).
Decisão de produto: NÃO ENTRA AGORA. Permanece COMING_SOON; reabrir quando a Ryvano puder se candidatar ao programa e ler a documentação técnica completa.
O que continuará sob decisão do professor: nada.
Critério de aceitação: nenhum código COROS.
Responsável pela validação: produto + responsável técnico.
```

## Suunto (Suunto Cloud API)

```text
Dúvida: a Suunto cobre as capabilities com termos viáveis?
Por que afeta a funcionalidade: alunos com Suunto (trilha, águas abertas).
Modalidade/ambiente/população: qualquer.
Fonte primária e URL: https://apizone.suunto.com/ e https://apizone.suunto.com/faq ; https://apizone.suunto.com/fit-description ; https://apizone.suunto.com/how-to-workout-upload
Data da consulta e edição/versão: 03/10/2026.
O que foi efetivamente lido: acesso pelo programa de parceiros (empresas/organizações; resposta em até duas semanas); OAuth 2.0 (código de autorização); treinos com GPS, FC e voltas em FIT; atividade diária só passos/calorias; sono e dados pessoais (peso, zonas) "ainda não"; webhook para treinos (não para atividade diária); API de desenvolvimento com limite de chamadas não especificado; upload de rotas (GPX) e de treinos (FIT) para a conta do usuário.
Achado confirmado: cobre atividades, laps, streams, rota e webhooks de treino; saúde diária limitada (sem sono, sem FC de repouso); envio de treino planejado existe como upload de FIT (capability fina a verificar na spec de FIT workout).
Limitações e divergências: dependência de aprovação de parceria; retenção não documentada; limites de taxa não publicados.
Decisão de produto: CANDIDATO CONDICIONAL. Permanece COMING_SOON; issue filha de implementação só após aprovação no programa de parceiros e leitura dos limites. Capabilities previstas: activities, laps, streams, routeGps, webhooks; `steps` sim; `dailyHealth`/`restingHeartRate` NÃO; `plannedWorkoutPush` a verificar.
O que continuará sob decisão do professor: nada.
Critério de aceitação: aprovação de parceria registrada; sync real com FIT + webhook.
Responsável pela validação: produto + responsável técnico.
```

## Resumo das decisões

| Provedor | Decisão | Capabilities previstas | Bloqueio |
|---|---|---|---|
| Polar | aprovar issue filha | activities, laps, streams, routeGps, dailyHealth, restingHeartRate, steps, webhooks | contrato de licença; teste com conta real |
| Suunto | condicional | activities, laps, streams, routeGps, steps, webhooks (push a verificar) | aprovação de parceria; limites não publicados |
| COROS | não agora | — | elegibilidade comercial; spec não pública |
| Fitbit | não | — | API em fim de vida (30/10/2026); avaliar Google Health API |
| Amazfit/Zepp | não | — | sem API oficial de dados do usuário |
