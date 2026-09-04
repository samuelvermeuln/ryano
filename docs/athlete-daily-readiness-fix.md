# DAILY_GARMIN_SUMMARY: renderização determinística de texto

> **Estado:** implementação validada no PNG gerado em 2026-09-04.
> **Escopo:** `DAILY_GARMIN_SUMMARY`, template `athlete-daily-readiness`, preview administrativo e entrega de imagem pelo Evolution/WhatsApp.

## Sintoma e causa raiz

O relatório diário Garmin chegava ao WhatsApp com todo o texto exibido como quadrados (`□□□□`). O problema estava no limite entre a geração do SVG e a rasterização para PNG, **antes** da Evolution receber os bytes da imagem.

O caminho antigo usava Sharp/libvips para converter diretamente o SVG. O SVG solicitava uma pilha de fontes do sistema (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`), mas a imagem de produção não garante nenhuma dessas fontes. Quando não há uma fonte com glyphs disponíveis, o rasterizador produz tofu (quadrados) para os caracteres.

O transporte Evolution não deve ser tratado como a causa primária desse sintoma: ele recebe um PNG já rasterizado por `sendImage`. Se os quadrados já estão no PNG local, alterar base64, mimetype ou variantes de payload não restaura glyphs.

## Fluxo de produção

```text
DAILY_GARMIN_SUMMARY:<date>
  → modules/garmin/application/reporting/garmin-reporting.ts
    materializeGarminDailyDelivery()
  → server/services/report-builder.ts
    buildDailyGarminSummaryWhatsAppReport()
  → lib/reports/generate-report.ts
    generateReport({ template: "athlete-daily-readiness" })
  → lib/reports/templates/athlete-daily-readiness.ts
    renderAthleteDailyReadinessTemplate()  // SVG
  → Resvg + public/fonts/Geist-Regular.ttf // PNG determinístico
  → server/providers/messaging/evolution.ts
    evolutionProvider.sendImage()           // image/png
  → Evolution API / WhatsApp
```

O preview em `app/api/admin/whatsapp-reports/preview/route.ts` deve invocar o mesmo `generateReport(report.request)` e devolver `image/png`. Preview em SVG não é evidência de que a mídia entregue ao WhatsApp está correta.

## Contrato obrigatório de renderização

`lib/reports/generate-report.ts` é o único ponto de rasterização para `athlete-daily-readiness`.

A configuração obrigatória do Resvg é:

```ts
font: {
  loadSystemFonts: false,
  fontFiles: [REPORT_FONT_PATH], // public/fonts/Geist-Regular.ttf
  defaultFontFamily: "Geist",
}
```

Regras:

1. O template deve declarar `font-family="Geist"`.
2. Não usar Sharp/libvips para rasterizar esse SVG com fallback de fonte do sistema.
3. Não depender de Fontconfig, Pango, fontes instaladas no host ou no container.
4. Não usar emoji ou símbolos Unicode como ícones funcionais (`📅`, `🌙`, `⚡`, `💓`, `❤️`, `⭐`, `✓`, `≋`). A fonte Geist não garante esses glyphs.
5. Ícones devem ser paths/shapes SVG para tornar o PNG independente de fontes de emoji.
6. O nome de arquivo entregue e o `Content-Disposition` do preview devem terminar em `.png`.

## Por que mudanças anteriores podem não resolver

| Alteração isolada | Por que não resolve o defeito |
| --- | --- |
| Alterar payload/base64/mimetype da Evolution | A imagem já contém tofu antes de ser enviada. |
| Instalar fontes apenas no host | Produção pode usar outro container; o resultado continua não determinístico. |
| Corrigir somente `ImageResponse` de outros relatórios | O Garmin diário não usava esse renderer; ele fazia SVG → Sharp diretamente. |
| Validar somente o preview SVG | SVG no navegador usa fontes do cliente e não exercita o PNG entregue. |
| Embutir/usar emojis | A fonte principal pode não conter glyphs de emoji, preservando quadrados apenas nos ícones. |

## Validação obrigatória

### Testes automatizados

```bash
npm test -- \
  lib/reports/generate-report.font.test.ts \
  lib/reports/generate-report.test.ts \
  lib/reports/templates/athlete-daily-readiness.font.test.ts
```

Esses testes verificam:

- Resvg recebe `Geist-Regular.ttf`, `loadSystemFonts: false` e `defaultFontFamily: "Geist"`.
- O template diário é rasterizado como PNG com dimensões `800 × 1124`.
- O SVG não contém os glyphs emoji/símbolos removidos e usa paths vetoriais.

### Auditoria visual antes de deploy

1. Materializar uma entrega `DAILY_GARMIN_SUMMARY` com dados que incluam letras acentuadas, números e todas as métricas.
2. Inspecionar o **PNG** produzido antes de enviar, não apenas o SVG.
3. Abrir o preview administrativo e confirmar `Content-Type: image/png`.
4. Enviar uma mensagem de teste pela Evolution e conferir o arquivo recebido no WhatsApp.

O diagnóstico é concluído somente se os quatro pontos usam PNG e não existe `□` no artefato local ou na mídia recebida.

## Consulta GitNexus

Para recuperar esta decisão arquitetural, use termos que combinam o tipo de entrega, o template e o renderer:

```text
DAILY_GARMIN_SUMMARY athlete-daily-readiness generateReport Resvg Geist Evolution PNG
```

Símbolos e arquivos de ancoragem:

- `materializeGarminDailyDelivery` — `modules/garmin/application/reporting/garmin-reporting.ts`
- `buildDailyGarminSummaryWhatsAppReport` — `server/services/report-builder.ts`
- `generateReport` / `rasterizeReportSvg` — `lib/reports/generate-report.ts`
- `renderAthleteDailyReadinessTemplate` — `lib/reports/templates/athlete-daily-readiness.ts`
- Preview — `app/api/admin/whatsapp-reports/preview/route.ts`
- Transporte — `server/providers/messaging/evolution.ts`

Depois de alterar esta documentação ou qualquer arquivo do fluxo, atualize o índice a partir da raiz do repositório:

```bash
node .gitnexus/run.cjs analyze
node .gitnexus/run.cjs status
```

A integração MCP `gitnexus_ryvano` só responde com o estado atualizado quando aponta para esta raiz persistente, incluindo `.git` e `.gitnexus`.
