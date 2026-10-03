# Security rules

- Never log secrets, tokens, passwords, authorization headers, or webhook secrets.
- Avoid logging PII unless the flow explicitly requires it.
- Validate webhook requests before processing them.
- Protect admin surfaces with explicit authorization checks.
- Keep secrets in env or vaults, not in docs or examples.
- Validate environment variables before relying on them.
- Treat external docs as the source of truth for external contracts.

## Impact reminders

- Security changes can affect auth, integrations, WhatsApp, and jobs.
- Rate limits and secret handling often span server, routes, and provider modules.

## Test reminder

- Prefer focused tests around guards, webhook validation, and token handling.

## Arquivos privados (SAM-74, §20, §21.4, AC21)

- Arquivos de atividade importados (FIT/GPX/TCX) e anexos de relato ficam em `StoredFile` (bytes no banco, como o avatar). Não existe URL pública nem CDN: o download é só por `GET /api/files/[id]`, que reaplica a autorização das telas a cada pedido (dono; professor/escola por `CanReadAthleteCurrentData`, ou `CanReadAthleteHistory` quando a atividade é anterior ao acompanhamento; anexo de relato só o atleta e o professor da sessão) e responde `Cache-Control: private, no-store`. Quem não tem vínculo recebe 404, nunca 403.
- Retenção: o arquivo vive enquanto a atividade (ou o treino do anexo) existir — `ON DELETE CASCADE` — ou até o dono apagá-lo (`DELETE /api/files/[id]`). Apagar o arquivo não apaga a `Activity`, as voltas/séries ingeridas nem as revisões da Ryvano (§21.4).
- Formatos aceitos só com especificação oficial consultada e amostra testada (`modules/file-import/parsers`, `tests/parse-activity-file.test.ts`): GPX 1.1, TCX v2, FIT (SDK oficial `@garmin/fitsdk`, FIT Protocol License). Limites: 15 MB por arquivo de atividade; anexos de relato até 10 MB, só JPEG/PNG/WebP/PDF.
- Deduplicação: `Activity.externalId = file:<sha256>` por usuário — o mesmo arquivo reimportado devolve a atividade existente; parecidos vindos de outro provedor passam por `markDuplicateSession` (espelho marcado, nada apagado).