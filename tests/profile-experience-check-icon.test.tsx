// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// `saveProfileDetailsAction` é uma Server Action ("use server") que importa
// Prisma/crypto/env — mockado para isolar o teste de componente das
// dependências de servidor, sem afetar o comportamento de renderização
// exercitado aqui.
vi.mock("@/app/actions/profile", () => ({
  saveProfileDetailsAction: vi.fn(async (state: unknown) => state),
}));

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

import { ProfileExperience } from "@/components/profile/profile-experience";

function buildUser(overrides: Partial<Parameters<typeof ProfileExperience>[0]["user"]> = {}) {
  return {
    name: "Usuária de Teste",
    email: "usuaria@example.com",
    image: null,
    cpf: null,
    phone: null,
    heightCm: null,
    weightKg: null,
    postalCode: null,
    number: null,
    complement: null,
    address: {
      street: null,
      district: null,
      city: null,
      state: null,
      country: null,
    },
    whatsappVerified: false,
    garminStatus: null,
    notificationPreference: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Requisitos 7.2, 7.4: nem o feedback de sucesso de CEP nem o helper do
// card de dado protegido (ex.: Telefone) devem usar o caractere "✓" — ambos
// devem exibir o ícone `IconCheck` (`@tabler/icons-react`).
describe("ProfileExperience — feedback de sucesso sem emoji", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          logradouro: "Rua de Teste",
          bairro: "Centro",
          localidade: "Vitória",
          uf: "ES",
        }),
      }),
    );
  });

  it("exibe IconCheck (sem '✓') no feedback de sucesso de busca de CEP", async () => {
    render(<ProfileExperience user={buildUser()} />);

    const postalInput = screen.getByLabelText("CEP");
    fireEvent.change(postalInput, { target: { value: "12345678" } });
    fireEvent.blur(postalInput);

    // O feedback de sucesso do CEP (`postalFeedback`) fica em um `<p>` com
    // `text-emerald-300`; o mesmo texto também aparece como cabeçalho do
    // painel de endereço encontrado — por isso a busca é restrita a esse
    // elemento específico, e não ao primeiro `getByText` encontrado.
    const feedbackParagraph = await waitFor(() => {
      const candidate = document.querySelector("p.text-emerald-300");
      expect(candidate?.textContent).toContain("Endereço encontrado");
      return candidate as HTMLElement;
    });

    expect(feedbackParagraph.textContent).not.toContain("✓");
    expect(feedbackParagraph.querySelector("svg.tabler-icon-check")).not.toBeNull();
  });

  it("exibe IconCheck (sem '✓') no helper do card protegido (Telefone) quando o WhatsApp está verificado", () => {
    const { container } = render(
      <ProfileExperience user={buildUser({ phone: "+5527999999999", whatsappVerified: true })} />,
    );

    // O helper de `ProtectedInfoCard` com `helperTone="success"` (usado pelo
    // card de Telefone) é o único `<p>` com essa combinação de classes no
    // componente — alvo direto do Requisito 7.4 ("MetricCard"/helper de
    // sucesso citado no design). O chip do cabeçalho ("WhatsApp verificado")
    // usa uma marcação diferente e não é o alvo deste teste.
    const helperParagraph = container.querySelector("p.mt-2.text-xs.text-emerald-300");

    expect(helperParagraph).not.toBeNull();
    expect(helperParagraph?.textContent).toContain("WhatsApp verificado");
    expect(helperParagraph?.textContent).not.toContain("✓");
    expect(helperParagraph?.querySelector("svg.tabler-icon-check")).not.toBeNull();

    // Sanity check: o texto bruto "✓" não aparece em nenhum lugar da tela
    // renderizada neste estado de sucesso (Requisito 7.2).
    expect(document.body.textContent).not.toContain("✓");
  });
});
