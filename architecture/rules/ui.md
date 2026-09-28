# UI rules

## Overlays: modal, não barra lateral

- Detalhe de um registro aberto por cima de uma tela é **modal centralizado**.
  Não usar painel/gaveta (drawer) colado na borda da tela.
- O conteúdo de detalhe é lido como um bloco só; a coluna estreita de uma
  gaveta quebra tabelas, `dl` de duas colunas e listas, e empurra tudo para
  rolagem vertical.
- Se o detalhe for grande o bastante para não caber num modal, ele é uma
  **página própria**, com URL, e não uma gaveta.
- Exceção única: **navegação/filtros em mobile**, onde a gaveta é o padrão
  esperado da plataforma (ex.: `app/marketplace/marketplace-filters.tsx`,
  visível só em `lg:hidden`). Overlay de dados nunca.

Requisitos de um modal:

- `role="dialog"` + `aria-modal="true"` + `aria-label`.
- Fecha por `Escape` e por clique no backdrop.
- Renderizado via `createPortal` em `document.body`, para o backdrop não ser
  recortado por contêiner com `overflow`/`transform` (ex.: o canvas com zoom
  do organograma).
- Trava o scroll do `body` enquanto aberto e restaura o valor anterior.

## Tema: light e dark são obrigatórios

- **Nunca** fixar cor de superfície literal (`bg-[#0d1117]`, `bg-[#07131a]`).
  Em `[data-theme="light"]` ela continua preta — é o bug clássico desta base.
- Superfície flutuante (modal, popover, menu, card arrastado): usar
  `glass-strong`, `theme-panel-*` ou `var(--floating-surface)`. Todos têm
  variante light em `app/globals.css`.
- Divisórias e traços: `bg-border` / `border-border`, ou um utilitário
  `border-white/…` que esteja **explicitamente remapeado** para light em
  `globals.css`. `bg-white/15` e similares não estão — viram invisíveis no
  claro.
- Cor de destaque (emerald, sky) pode ficar em `ring-*` / `border-*`, que
  funcionam sobre os dois fundos; a superfície abaixo é que precisa do token.
- Verificar nos dois temas antes de fechar: alternar `ryvano-theme` no
  `localStorage` e conferir contraste real, não presumir.

## Impact reminders

- Overlays costumam ser locais à tela, mas o token de superfície é global:
  mexer em `globals.css` atinge todas as telas.
- Trocar gaveta por modal muda o seletor dos testes E2E que buscam
  `role="dialog"` ou o texto do título.

## Test reminder

- Cobrir abertura, fechamento por `Escape` e por backdrop.
- Quando a regressão for de cor, medir `getComputedStyle(...).backgroundColor`
  nos dois temas em vez de inspecionar a screenshot a olho.
