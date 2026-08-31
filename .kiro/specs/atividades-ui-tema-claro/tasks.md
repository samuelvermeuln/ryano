# Plano de Implementação — UI de Atividades, Contraste no Tema Claro e Tema Padrão

> Execução incremental. Cada tarefa é uma etapa de código isolada e testável,
> construída sobre as anteriores. Ao final de cada fase, rodar `npm run build`
> (typecheck) e `npm test` (`vitest run`). Este spec é predominantemente
> CSS/apresentação — o `design.md` justifica a omissão da seção de Correctness
> Properties (domínios de entrada pequenos e fechados), então não há tarefas
> de teste baseado em propriedades (PBT) neste plano. A ordem das fases
> respeita o risco documentado no design ("Riscos e decisões de trade-off"): a
> correção de contraste no Tema Claro (Fase 2) é implementada e verificada
> visualmente antes ou junto da troca do tema padrão (Fase 4), nunca depois.
> Referências entre parênteses apontam para os requisitos em
> `requirements.md`.

---

## Fase 1 — Mapeamento Visual de Provider no catálogo

- [x] 1. Mapeamento Visual de Provider no catálogo compartilhado
  - [x] 1.1 Criar `getProviderVisual` e `PROVIDER_VISUALS`
    - Criar `modules/shared/integrations/catalog/visual.ts` com a interface
      `ProviderVisual` (`icon`, `textClassName`, `backgroundClassName`,
      `borderClassName`), a constante `PROVIDER_VISUALS` (GARMIN, STRAVA,
      POLAR, COROS, SUUNTO, FITBIT) e `DEFAULT_PROVIDER_VISUAL`.
    - Implementar `getProviderVisual(providerId: string): ProviderVisual`,
      retornando o fallback padrão para qualquer `providerId` sem entrada,
      sem nunca lançar exceção nem retornar `undefined`.
    - _Requisitos: 1.1, 1.5, 1.6_

  - [x] 1.2 Escrever teste unitário de `getProviderVisual`
    - Criar `modules/shared/integrations/catalog/visual.test.ts`.
    - Um exemplo por `ProviderId` do catálogo atual (GARMIN, STRAVA, POLAR,
      COROS, SUUNTO, FITBIT) verificando `icon` e classes não-vazias.
    - Um exemplo com um id desconhecido (`"UNKNOWN"`) verificando que o
      resultado é exatamente `DEFAULT_PROVIDER_VISUAL`.
    - Um exemplo verificando que GARMIN e STRAVA retornam `icon` e
      `textClassName` diferentes entre si.
    - _Requisitos: 1.1, 1.4, 1.5, 1.6_

- [x] 2. Checkpoint — Ensure all tests pass
  - Rodar `npm run build` e `npm test`. Perguntar ao usuário se houver
    dúvidas.

---

## Fase 2 — Correção de contraste no Tema Claro (`app/globals.css`)

> Implementar e verificar visualmente esta fase antes ou junto da Fase 4
> (tema padrão), nunca depois — ver "Riscos" em `design.md`.

- [x] 3. Correção de contraste no Tema Claro
  - [x] 3.1 Adicionar overrides `[data-theme="light"]` para as classes sem cobertura
    - Em `app/globals.css`, junto à seção existente de overrides de Tema
      Claro (próximo ao bloco de `.text-rose-200`), adicionar as regras
      `[data-theme="light"] .text-cyan-200`, `.text-emerald-200`,
      `.text-orange-200`, `.text-teal-200`, `.text-amber-200` (e
      `.text-amber-200\/90`), `.text-violet-200` e `.text-fuchsia-200`,
      seguindo o mesmo padrão de valor `oklch()` (luminosidade ~0.4–0.46,
      matiz preservado) já usado nos overrides existentes do arquivo.
    - Adicionar também `[data-theme="light"] .bg-violet-300\/8` e
      `.bg-violet-300\/10`, necessários para o Cartão de Resumo "Dias com
      treino" da Fase 4.
    - Não alterar nenhuma regra fora do seletor `[data-theme="light"]` (Tema
      Escuro permanece inalterado).
    - _Requisitos: 3.1, 3.2, 3.4, 3.5, 6.1, 6.2, 6.3_

  - [x] 3.2 Verificação visual manual de contraste no Tema Claro
    - Com o Tema Claro ativo, verificar visualmente (idealmente com a
      calculadora de contraste do DevTools do navegador) cada `sportTone`
      (natação, ciclismo, corrida, caminhada, força, triathlon, padrão) no
      Ícone de Modalidade da Tela de Atividades e cada `heroStat` na Tela de
      Detalhe de Atividade, confirmando contraste mínimo de 3:1 e distinção
      visual entre modalidades.
    - Verificar também `history-cleanup-panel.tsx` e
      `whatsapp-report-preview-panel.tsx` (usos de `text-amber-200\/90`).
    - Documentar o resultado da verificação (aprovado ou ajustes
      necessários) antes de prosseguir para a Fase 4.
    - _Requisitos: 3.1, 3.2, 3.3, 3.5, 6.1_

- [x] 4. Checkpoint — Ensure all tests pass
  - Rodar `npm run build` e `npm test`. Confirmar com o usuário que a
    verificação visual da tarefa 3.2 foi satisfatória antes de seguir para a
    Fase 3 (Selo de Origem, que depende dos overrides desta fase) ou a
    Fase 4 (tema padrão).

---

## Fase 3 — Selo de Origem por Provider (Tela de Atividades e Detalhe)

- [x] 5. Selo de Origem na Tela de Atividades
  - [x] 5.1 Adicionar `providerId` ao tipo de origem e ao call site
    - Em `components/activities/activities-browser.tsx`, adicionar o campo
      `providerId: string` ao tipo de `origin` dentro de
      `ActivitiesBrowserProps` (mantendo `label: string` existente).
    - Em `app/app/atividades/page.tsx` (`buildActivityCard`), preencher
      `origin: { label: getProviderLabel(activity.provider), providerId:
      activity.provider }`.
    - _Requisitos: 1.2, 1.3, 2.1, 2.2_

  - [x] 5.2 Renderizar o Selo de Origem com o Mapeamento Visual de Provider
    - Em `components/activities/activities-browser.tsx`, substituir o
      `<span className="theme-pill-neutral ...">` com `<IconDeviceWatch
      size={13} />` do Selo de Origem por uma renderização baseada em
      `getProviderVisual(origin.providerId)`: ícone via `@iconify/react` no
      lugar de `IconDeviceWatch`, e `textClassName`/`backgroundClassName`/
      `borderClassName` no lugar de `theme-pill-neutral`, preservando o
      layout (`rounded-full border px-2.5 py-1 text-[11px] ...`) e o texto
      `origin.label`.
    - _Requisitos: 1.2, 1.3, 1.4, 1.5, 1.6, 3.3_

  - [x] 5.3 Escrever teste unitário do Selo de Origem por Provider
    - Testar (via função pura extraída, ex. `renderOriginBadge`/helper de
      classe, sem exigir montagem completa do componente caso RTL não
      esteja configurado) que dois `origin.providerId` diferentes (ex.
      `GARMIN` vs `STRAVA`) produzem ícone e classes de cor diferentes entre
      si.
    - _Requisitos: 1.4_

- [x] 6. Selo de Origem na Tela de Detalhe de Atividade
  - [x] 6.1 Adicionar `providerId` e `visual` prop ao `StatusPill`
    - Em `components/activities/activity-visual-dashboard.tsx`, adicionar
      `providerId: string` a `ActivityVisualDashboardProps` (mantendo
      `provider: string` como rótulo textual).
    - Adicionar à função `StatusPill` um prop opcional
      `visual?: ProviderVisual` que, quando presente, usa `visual.icon` e as
      classes de `ProviderVisual` em vez de `theme-pill-neutral`/`tone`.
    - Atualizar a chamada do Selo de Origem (`<StatusPill label={provider}
      tone="neutral" />`) para passar
      `visual={getProviderVisual(providerId)}`.
    - Em `app/app/atividades/[id]/page.tsx`, passar
      `providerId={visualData.provider}` ao componente, além do
      `provider={providerLabel}` já existente.
    - _Requisitos: 2.1, 2.2, 2.3_

- [x] 7. Checkpoint — Ensure all tests pass
  - Rodar `npm run build` (confirma que os dois call sites atualizaram o
    novo campo obrigatório `providerId`) e `npm test`. Perguntar ao usuário
    se houver dúvidas.

---

## Fase 4 — Cor nos Cartões de Resumo e tema padrão claro

> A Fase 2 (contraste) precisa estar concluída e verificada antes desta fase,
> conforme o risco documentado no design — nunca implementar a troca do tema
> padrão antes da correção de contraste.

- [x] 8. Cor nos Cartões de Resumo da Tela de Atividades
  - [x] 8.1 Implementar `getSummaryCardAccentClass`
    - Em `components/activities/activities-browser.tsx`, criar o helper
      `getSummaryCardAccentClass(card.key)` retornando, por `key`
      (`activities`, `distance`, `duration`, `active-days`), as classes de
      fundo/texto do ícone: `bg-sky-300/10`/`text-sky-300`,
      `bg-emerald-300/10`/`text-emerald-300`, `bg-amber-300/10`/
      `text-amber-300`, `bg-violet-300/10`/(classe de texto violeta
      equivalente).
    - Aplicar o resultado no `<div className="mb-4 flex h-11 w-11 ...
      bg-black/10 text-foreground/84">` de cada Cartão de Resumo,
      substituindo o estilo neutro atual, sem alterar as classes de
      `value`/`label`/`subtitle`/`comparison` (que continuam em
      `text-foreground`/`text-foreground/*`).
    - _Requisitos: 4.1, 4.2, 4.3_

  - [x] 8.2 Escrever teste unitário de `getSummaryCardAccentClass`
    - Testar que cada uma das 4 chaves conhecidas retorna uma combinação de
      classes de fundo/texto não-neutra e distinta das outras 3 chaves.
    - _Requisitos: 4.1, 4.2_

- [x] 9. Tema padrão do sistema
  - [x] 9.1 Trocar `DEFAULT_THEME` para `"light"`
    - Em `lib/theme.ts`, alterar `DEFAULT_THEME` de `"dark"` para `"light"`.
    - Não alterar a lógica de leitura de `localStorage` em
      `getThemeInitScript` (`app/layout.tsx`) nem em `ThemeToggle` — ambos
      já leem a constante interpolada e o bloco `catch` existente já aplica
      `DEFAULT_THEME` no caso de falha do script.
    - _Requisitos: 5.1, 5.2, 5.4_

  - [x] 9.2 Escrever teste unitário de `DEFAULT_THEME`
    - Verificar que `DEFAULT_THEME === "light"`.
    - Verificar que a Preferência de Tema Salva (`localStorage` com
      `"dark"` ou `"light"`) continua tendo prioridade sobre
      `DEFAULT_THEME` na lógica existente (teste de exemplo: sem storage,
      com storage `"dark"`, com storage inválido).
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 10. Checkpoint — Ensure all tests pass
  - Rodar `npm run build` e `npm test`. Fazer verificação visual manual do
    Sistema com o Tema Claro como padrão (sem Preferência de Tema Salva no
    navegador) em `/app/atividades` e `/app/atividades/[id]`, confirmando
    que nenhum ícone/destaque "desaparece". Perguntar ao usuário se houver
    dúvidas antes de seguir para a Fase 5.

---

## Fase 5 — Remoção de emoji funcional e aumento do ícone de navegação

- [x] 11. Remoção de emoji funcional
  - [x] 11.1 Substituir `"✓"` por `IconCheck` no assistente de integração
    - Em `components/profile/onboarding-wizard.tsx`, trocar
      `{step.complete ? "✓" : step.number}` por `{step.complete ?
      <IconCheck size={14} stroke={2.4} /> : step.number}`, importando
      `IconCheck` de `@tabler/icons-react`.
    - Preservar o `AnimatePresence`/`key`/variants de animação existentes no
      `motion.span` que envolve esse conteúdo.
    - _Requisitos: 7.1, 7.2, 7.3_

  - [x] 11.2 Substituir `"✓ "` por `IconCheck` no perfil do usuário
    - Em `components/profile/profile-experience.tsx`, no bloco de feedback
      de CEP (`postalFeedback`), substituir a concatenação de texto
      `"✓ " + message` por um `<IconCheck size={14} />` condicionado a
      `tone === "success"`, seguido do texto da mensagem, dentro de um
      contêiner `flex items-center gap-1.5`.
    - No helper de `MetricCard` (`helperTone`), aplicar a mesma
      transformação, substituindo o prefixo `"✓ "` por
      `<IconCheck size={12} />` dentro de um
      `<span className="inline-flex items-center gap-1">`.
    - Reutilizar o `IconCheck` já importado no arquivo (sem novo import).
    - _Requisitos: 7.1, 7.2, 7.4_

  - [x] 11.3 Escrever teste unitário de ausência de emoji e presença de `IconCheck`
    - Testar que a saída renderizada de `onboarding-wizard.tsx` (etapa
      concluída) e de `profile-experience.tsx` (feedback de sucesso de CEP e
      `MetricCard` com `helperTone` de sucesso) não contém o caractere `"✓"`
      como texto solto, e que `IconCheck` é renderizado nesses estados.
    - _Requisitos: 7.2, 7.3, 7.4_

- [x] 12. Tamanho do ícone de navegação da barra lateral
  - [x] 12.1 Aumentar `NavIcon` de 18px para 24px
    - Em `components/app-shell.tsx`, na função `NavIcon`, trocar os
      atributos `width="18" height="18"` do `<svg>` por
      `width="24" height="24"`, mantendo o `viewBox="0 0 24 24"` e o
      contêiner `h-12 w-12` (`grid place-items-center`) inalterados.
    - _Requisitos: 8.1, 8.2, 8.3, 8.4_

- [x] 13. Checkpoint — Ensure all tests pass
  - Rodar `npm run build` e `npm test`. Verificar visualmente que o rótulo
    de texto ao lado do ícone de navegação permanece legível e que o ícone
    permanece centralizado no contêiner de 48x48px. Perguntar ao usuário se
    houver dúvidas.

---

## Fase 6 — (Opcional, revisar com usuário) Centralizar `providerIconMap` duplicados

> O `design.md` marca este item como uma decisão de escopo não exigida pelos
> Requisitos 1–8, pendente de confirmação do usuário ("Duplicação de
> `providerIconMap` fora do escopo formal do spec" em "Riscos e decisões de
> trade-off"). Esta fase está isolada das Fases 1–5 justamente para poder ser
> descartada sem afetar nenhum requisito obrigatório, caso o usuário prefira
> não tocar em `/app/integracoes` e no onboarding nesta spec.

- [x] 14. (Opcional, revisar com usuário) Centralizar `providerIconMap` no catálogo
  - [x] 14.1 Remover o `providerIconMap` duplicado de `integrations-hub.tsx`
    - Em `components/integrations/integrations-hub.tsx`, remover o
      `providerIconMap: Record<ProviderId, string>` local e o fallback
      `"simple-icons:googlefit"` hardcoded, e passar a resolver o ícone de
      `ProviderMark` via `getProviderVisual(provider).icon`.
    - Confirmar que o comportamento visual permanece idêntico (o componente
      hoje só usa o ícone, nunca a cor do `ProviderVisual`).
    - _Não corresponde a requisito obrigatório 1–8 — decisão de design a
      confirmar com o usuário._

  - [x] 14.2 Remover o `providerIconMap` duplicado de `onboarding-wearable-step.tsx`
    - Em `components/profile/onboarding-wearable-step.tsx`, remover o
      `providerIconMap` local equivalente e passar a resolver o ícone via
      `getProviderVisual(provider).icon`.
    - Confirmar que o comportamento visual permanece idêntico.
    - _Não corresponde a requisito obrigatório 1–8 — decisão de design a
      confirmar com o usuário._

  - [x] 14.3 Escrever teste unitário confirmando paridade de ícone
    - Testar que `ProviderMark` (`integrations-hub.tsx`) e o ícone de
      `onboarding-wearable-step.tsx`, para o mesmo `providerId`, resolvem o
      mesmo valor de `icon` retornado por `getProviderVisual`.
    - _Não corresponde a requisito obrigatório 1–8 — decisão de design a
      confirmar com o usuário._

- [x] 15. Checkpoint final — Ensure all tests pass
  - Rodar `npm run build` e `npm test` cobrindo todas as fases implementadas
    (1 a 5, e a Fase 6 se o usuário confirmar sua inclusão). Perguntar ao
    usuário se houver dúvidas.

## Notas

- Tarefas marcadas com `*` são opcionais (testes) e podem ser puladas para um
  MVP mais rápido, exceto onde indicado que cobrem diretamente um critério de
  aceitação central (ex. 1.2, 5.3) — recomenda-se não pular essas.
- A Fase 6 é opcional por decisão de escopo (não por ser teste) e está
  isolada das demais fases justamente para poder ser removida do plano sem
  impacto nos Requisitos 1–8.
- A ordem de fases 2 → 3 → 4 reflete o risco documentado no design: a
  correção de contraste (Fase 2) precisa existir antes da troca do tema
  padrão (Fase 4), para não expor bugs de contraste não corrigidos como
  padrão para todo usuário. A Fase 3 (Selo de Origem) depende dos overrides
  da Fase 2 porque `getProviderVisual` reutiliza classes de cor cobertas por
  esses overrides.
- Não há tarefas de teste baseado em propriedades (PBT): o `design.md`
  justifica essa omissão porque os domínios de entrada (`ProviderId`,
  `sportTone`, `ThemeName`, `card.key`) são enumerações pequenas e fechadas,
  mais bem cobertas por testes de exemplo exaustivos.
- Verificação de contraste (tarefa 3.2 e checkpoint 10) é manual — não é
  automatizável sem uma ferramenta dedicada de cálculo de contraste WCAG,
  conforme registrado em "Riscos" no design.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "5.1", "11.1", "11.2", "12.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "5.2", "6.1", "11.3", "14.1", "14.2"] },
    { "id": 2, "tasks": ["5.3", "8.1", "9.1", "14.3"] },
    { "id": 3, "tasks": ["8.2", "9.2"] }
  ]
}
```

Notas sobre o grafo: `1.1` (`getProviderVisual`), `3.1` (overrides de
contraste), `5.1` (novo campo de tipo `providerId`, sem dependência de
`1.1`), `11.1`, `11.2` e `12.1` são independentes entre si e vão na onda 0.
`activities-browser.tsx` é escrito por `5.1` (onda 0), `5.2` (onda 1) e `8.1`
(onda 2) — três ondas distintas para evitar conflito de edição simultânea,
já que `5.2` depende do campo adicionado por `5.1` e `8.1` é uma mudança
independente no mesmo arquivo. `5.2`, `6.1`, `14.1` e `14.2` dependem de
`1.1` e por isso só entram na onda 1. `3.2` (verificação visual) depende de
`3.1`. `9.1` (troca do tema padrão) só é agendada na onda 2, após `3.1`/`3.2`
(onda 0/1), respeitando a ordem de risco do design (contraste antes do tema
padrão). Todas as tarefas de teste (`*`) ficam na onda seguinte à da
implementação que testam: `1.2` (onda 1, após `1.1`), `5.3` (onda 2, após
`5.2`), `8.2`/`9.2` (onda 3, após `8.1`/`9.1`), `11.3` (onda 1, após
`11.1`/`11.2`), `14.3` (onda 2, após `14.1`/`14.2`).
