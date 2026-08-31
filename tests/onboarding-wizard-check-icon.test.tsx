// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

// `useRouter` exige o contexto do App Router do Next.js, ausente neste teste
// isolado de componente. Componentes-filho do wizard (não renderizados neste
// cenário, pois `initialStepId` não corresponde a nenhum painel) também
// dependem dele — o mock cobre qualquer uso indireto sem depender de rede.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { OnboardingWizard } from "@/components/profile/onboarding-wizard";

afterEach(() => {
  cleanup();
});

// Requisitos 7.2, 7.3: o indicador de etapa concluída do assistente de
// integração não deve usar o caractere "✓" — deve usar o ícone `IconCheck`
// (`@tabler/icons-react`).
describe("OnboardingWizard — indicador de etapa concluída", () => {
  it("renderiza o ícone IconCheck (e não o caractere '✓') para uma etapa concluída", () => {
    const steps = [
      {
        id: "step-1",
        number: "1",
        title: "Conta",
        description: "Nome e e-mail",
        complete: true,
        optional: false,
      },
      {
        id: "step-2",
        number: "2",
        title: "Perfil",
        description: "Dados pessoais e CEP",
        complete: false,
        optional: false,
      },
    ] as const;

    // `initialStepId` não corresponde a nenhum dos painéis internos
    // ("step-1"..."step-4"), então nenhum componente filho pesado
    // (OnboardingForm/OnboardingWearableStep/WhatsAppActivationCard) é
    // montado — o teste fica focado no indicador de etapa concluída da
    // grade de etapas, que é renderizada independentemente do painel ativo.
    const { container } = render(
      <OnboardingWizard
        steps={steps}
        initialStepId="step-nenhum-painel"
        user={{
          name: "Usuária de Teste",
          email: "usuaria@example.com",
          image: null,
          cpf: null,
          profile: { phoneE164: null, heightCm: null, weightKg: null },
          address: null,
        }}
        garminConnection={null}
        wearableProviders={{ connected: [], available: [] }}
        whatsapp={{ phone: null, verified: false }}
      />,
    );

    expect(container.textContent).not.toContain("✓");
    expect(container.querySelector("svg.tabler-icon-check")).not.toBeNull();
  });

  it("não renderiza o ícone IconCheck para uma etapa pendente (sanity check)", () => {
    const steps = [
      {
        id: "step-1",
        number: "1",
        title: "Conta",
        description: "Nome e e-mail",
        complete: false,
        optional: false,
      },
    ] as const;

    const { container } = render(
      <OnboardingWizard
        steps={steps}
        initialStepId="step-nenhum-painel"
        user={{
          name: "Usuária de Teste",
          email: "usuaria@example.com",
          image: null,
          cpf: null,
          profile: { phoneE164: null, heightCm: null, weightKg: null },
          address: null,
        }}
        garminConnection={null}
        wearableProviders={{ connected: [], available: [] }}
        whatsapp={{ phone: null, verified: false }}
      />,
    );

    expect(container.textContent).not.toContain("✓");
    expect(container.querySelector("svg.tabler-icon-check")).toBeNull();
  });
});
