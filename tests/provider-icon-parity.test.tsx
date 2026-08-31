// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/app/integracoes",
  useSearchParams: () => new URLSearchParams(),
}));

// Server Actions ("use server") importadas por `IntegrationsHub` trazem
// dependências de servidor (Prisma, rate limiting, provedor de WhatsApp
// etc.) irrelevantes para este teste de paridade visual — mockadas para
// isolar o componente, sem afetar a resolução do ícone exercitada aqui.
vi.mock("@/app/actions/integrations", () => ({
  disconnectGarminAction: vi.fn(),
  generateWhatsAppActivationAction: vi.fn(),
  sendWhatsAppTestMessageAction: vi.fn(),
  syncGarminAction: vi.fn(),
}));
vi.mock("@/app/actions/integrations-layout", () => ({
  saveIntegrationsLayoutAction: vi.fn(),
}));
vi.mock("@/app/actions/profile", () => ({
  savePreferencesAction: vi.fn(),
}));

// O ícone real (`simple-icons:*`) só é resolvido via rede pelo `@iconify/react`
// em runtime (nenhum icon set é pré-carregado neste teste) — o mock preserva
// o `icon` recebido como atributo `data-icon`, permitindo comparar, sem
// depender de rede, o valor resolvido por `ProviderMark`
// (`integrations-hub.tsx`) e por `ProviderConnectCard`
// (`onboarding-wearable-step.tsx`) para o mesmo `providerId`, seguindo a
// mesma convenção de tests/activities-browser-origin-badge.test.tsx.
vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <svg data-testid="provider-icon" data-icon={icon} />,
}));

import { IntegrationsHub } from "@/components/integrations/integrations-hub";
import { OnboardingWearableStep } from "@/components/profile/onboarding-wearable-step";
import { getProviderVisual } from "@/modules/shared/integrations/catalog/visual";
import type { IntegrationCardViewModel } from "@/modules/shared/integrations/presentation";

afterEach(() => {
  cleanup();
});

// STRAVA e POLAR (não GARMIN): `integrations-hub.tsx` renderiza o ícone da
// Garmin via `GarminMark` (fixo, "simple-icons:garmin") em dois lugares
// sempre presentes (card dedicado + Cartão de Resumo), o que tornaria a
// consulta ambígua para esse provider específico — sem afetar a Fase 6, que
// só trata do `providerIconMap` genérico usado por outros providers.
const TEST_PROVIDERS = ["STRAVA", "POLAR"] as const;

function buildComingSoonCard(provider: (typeof TEST_PROVIDERS)[number]): IntegrationCardViewModel {
  return {
    provider,
    name: provider === "STRAVA" ? "Strava" : "Polar",
    description: "Treinos e métricas",
    availability: "COMING_SOON",
    connected: false,
    action: "COMING_SOON",
  };
}

describe("Paridade de ícone entre integrations-hub e onboarding-wearable-step", () => {
  it.each(TEST_PROVIDERS)(
    "ProviderMark (integrations-hub) e ProviderConnectCard (onboarding-wearable-step) resolvem o mesmo icon para %s",
    (provider) => {
      const expectedIcon = getProviderVisual(provider).icon;

      render(
        <IntegrationsHub
          userName="Usuária de Teste"
          userImage={null}
          integrationCards={{ connected: [], available: [], comingSoon: [buildComingSoonCard(provider)] }}
          garminConnection={null}
          reconnectNotification={null}
          whatsapp={{ phone: null, verified: false, lastSentAt: null }}
          automations={null}
          latestActivity={null}
        />,
      );

      // Além do ícone do card testado, o card dedicado da Garmin e o Cartão
      // de Resumo da Garmin sempre renderizam "simple-icons:garmin" — por
      // isso filtramos pelo ícone esperado em vez de assumir um único match.
      const hubIcons = screen
        .getAllByTestId("provider-icon")
        .filter((el) => el.getAttribute("data-icon") === expectedIcon);
      expect(hubIcons).toHaveLength(1);

      cleanup();

      render(
        <OnboardingWearableStep
          connected={[]}
          available={[buildComingSoonCard(provider)]}
          garminConnection={null}
          onContinue={() => {}}
        />,
      );

      const stepIcon = screen.getByTestId("provider-icon");
      expect(stepIcon.getAttribute("data-icon")).toBe(expectedIcon);
    },
  );
});
