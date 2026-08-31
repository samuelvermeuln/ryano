// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// `MobileDockClient` usa `usePathname`/`useRouter` do App Router e faz
// `createPortal` para `document.body` — o mock cobre a navegação sem
// depender de um Router real, seguindo a mesma convenção usada em
// tests/provider-icon-parity.test.tsx.
let mockPathname = "/app/atividades";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
}));

import { MobileDockClient, type MobileDockItem } from "@/components/mobile-dock-client";

afterEach(() => {
  cleanup();
});

// Regressão: um item genérico ("Home"/"Painel") com `matchPrefixes` que
// engloba o prefixo de todas as outras rotas (ex.: "/app") não deve vencer
// sobre um item com prefixo mais específico só por estar primeiro na lista
// de items — o item cujo prefixo correspondente é o mais longo (mais
// específico) deve ser o marcado como ativo (`aria-current="page"`).
describe("MobileDockClient — seleção do item ativo por prefixo mais específico", () => {
  it("marca 'Atividades' como ativo em /app/atividades, mesmo com 'Home' (prefixo genérico '/app') na frente da lista", () => {
    mockPathname = "/app/atividades";

    const items: readonly MobileDockItem[] = [
      { href: "/app/dashboard", label: "Home", icon: "home", matchPrefixes: ["/app", "/app/dashboard"] },
      { href: "/app/atividades", label: "Atividades", icon: "activities", matchPrefixes: ["/app/atividades"] },
    ] as const;

    render(<MobileDockClient items={items} />);

    const homeButton = screen.getByRole("button", { name: "Home" });
    const atividadesButton = screen.getByRole("button", { name: "Atividades" });

    expect(atividadesButton.getAttribute("aria-current")).toBe("page");
    expect(homeButton.getAttribute("aria-current")).toBeNull();
  });

  it("marca 'Home' como ativo quando nenhuma rota mais específica bate (fallback do prefixo genérico)", () => {
    mockPathname = "/app/dashboard";

    const items: readonly MobileDockItem[] = [
      { href: "/app/dashboard", label: "Home", icon: "home", matchPrefixes: ["/app", "/app/dashboard"] },
      { href: "/app/atividades", label: "Atividades", icon: "activities", matchPrefixes: ["/app/atividades"] },
    ] as const;

    render(<MobileDockClient items={items} />);

    const homeButton = screen.getByRole("button", { name: "Home" });
    const atividadesButton = screen.getByRole("button", { name: "Atividades" });

    expect(homeButton.getAttribute("aria-current")).toBe("page");
    expect(atividadesButton.getAttribute("aria-current")).toBeNull();
  });
});
