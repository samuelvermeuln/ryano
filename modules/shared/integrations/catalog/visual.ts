/**
 * Mapeamento Visual de Provider: associa cada `ProviderId` do Catálogo de
 * Providers a um ícone de marca (`@iconify/react`, coleção `simple-icons`) e
 * a uma cor de destaque, consumidos pelo Selo de Origem na Tela de
 * Atividades e na Tela de Detalhe de Atividade.
 *
 * Este arquivo é puramente de apresentação (ícone/cor) e não deve ser
 * misturado com `catalog/index.ts` (que descreve *o que* um provider
 * é/faz para decisões de produto/policy) — mantém `catalog/index.ts`
 * importável por lógica de negócio sem trazer metadata de UI.
 *
 * _Requisitos: 1.1, 1.5, 1.6_
 */

import type { ProviderId } from "@/modules/shared/integrations/types";

/**
 * Identificador de ícone de marca no formato usado por `@iconify/react`
 * (ex.: "simple-icons:strava"), consistente com o uso existente em
 * `integrations-hub.tsx` e `onboarding-wearable-step.tsx`.
 */
export type ProviderIconId = string;

export interface ProviderVisual {
  /** Ícone de marca (@iconify/react, coleção simple-icons). */
  icon: ProviderIconId;
  /**
   * Cor de destaque do provider, como classe utilitária Tailwind de texto
   * (aplicada ao ícone e ao texto do Selo de Origem). Reaproveita classes já
   * cobertas por overrides `[data-theme="light"]` em app/globals.css.
   */
  textClassName: string;
  /** Classe utilitária de fundo (tom translúcido) do Selo de Origem. */
  backgroundClassName: string;
  /** Classe utilitária de borda do Selo de Origem. */
  borderClassName: string;
}

/**
 * Mapeamento estático `ProviderId -> ProviderVisual` para os providers
 * atualmente conhecidos pelo catálogo (Requisito 1.1).
 */
export const PROVIDER_VISUALS: Readonly<Record<ProviderId, ProviderVisual>> = {
  GARMIN: {
    icon: "simple-icons:garmin",
    textClassName: "text-cyan-200",
    backgroundClassName: "bg-cyan-400/10",
    borderClassName: "border-cyan-300/20",
  },
  STRAVA: {
    icon: "simple-icons:strava",
    textClassName: "text-orange-200",
    backgroundClassName: "bg-orange-400/10",
    borderClassName: "border-orange-300/20",
  },
  POLAR: {
    icon: "simple-icons:polar",
    textClassName: "text-sky-300",
    backgroundClassName: "bg-sky-300/10",
    borderClassName: "border-sky-300/20",
  },
  COROS: {
    icon: "simple-icons:coros",
    textClassName: "text-emerald-300",
    backgroundClassName: "bg-emerald-300/10",
    borderClassName: "border-emerald-300/20",
  },
  SUUNTO: {
    icon: "simple-icons:suunto",
    textClassName: "text-indigo-300",
    backgroundClassName: "bg-sky-300/10",
    borderClassName: "border-sky-300/20",
  },
  FITBIT: {
    icon: "simple-icons:fitbit",
    textClassName: "text-emerald-200",
    backgroundClassName: "bg-emerald-400/10",
    borderClassName: "border-emerald-300/20",
  },
};

/**
 * Fallback usado quando um `providerId` não tem entrada no mapeamento
 * (Requisito 1.5).
 */
export const DEFAULT_PROVIDER_VISUAL: ProviderVisual = {
  icon: "simple-icons:googlefit",
  textClassName: "text-foreground/82",
  backgroundClassName: "bg-white/8",
  borderClassName: "border-white/10",
};

/**
 * Resolve o Mapeamento Visual de Provider para um `ProviderId`.
 *
 * Nunca lança e nunca retorna `undefined`: providers sem entrada (futuros
 * providers adicionados ao catálogo sem visual definido ainda, ou um id
 * desconhecido/vazio) recebem o fallback padrão, preservando o rótulo
 * textual do provider (Requisito 1.5). Novos providers adicionados a
 * `PROVIDER_VISUALS` passam a ser exibidos em todo Cartão de Atividade
 * correspondente sem exigir alterações nos componentes consumidores
 * (Requisito 1.6).
 */
export function getProviderVisual(providerId: string): ProviderVisual {
  return (
    PROVIDER_VISUALS[providerId as ProviderId] ?? DEFAULT_PROVIDER_VISUAL
  );
}
