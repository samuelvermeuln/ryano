// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

// Mesma convenção de mock usada em tests/mobile-dock-active-index.test.tsx —
// `MobileDockClient` usa `usePathname`/`useRouter` do App Router e faz
// `createPortal` para `document.body`. `mockPathname` é mutável para permitir
// simular uma navegação de rota (ver teste de reset do scroll-collapse
// abaixo).
let mockPathname = "/app/dashboard";

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
  window.scrollY = 0;
  mockPathname = "/app/dashboard";
});

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { value, writable: true, configurable: true });
}

// O hook usa `window.requestAnimationFrame` internamente — em jsdom o rAF é
// assíncrono, então esperamos o próximo frame antes de checar o estado.
function dispatchScroll() {
  return act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

const items: readonly MobileDockItem[] = [
  { href: "/app/dashboard", label: "Home", icon: "home", matchPrefixes: ["/app", "/app/dashboard"] },
  { href: "/app/atividades", label: "Atividades", icon: "activities", matchPrefixes: ["/app/atividades"] },
];

// Regressão/comportamento novo: o dock deve esconder (translateY + opacity 0)
// ao rolar para baixo além do limiar, e voltar a aparecer ao rolar para
// cima — mesma lógica de `useScrollCollapse` usada no AppHeader, mas via
// transform em vez de max-height (o dock não sofre do bug de scroll
// anchoring por ser `fixed`/portal, fora do fluxo do documento).
describe("MobileDockClient — esconde/mostra ao rolar", () => {
  it("marca data-scroll-collapsed=false quando scrollY = 0 (estado inicial)", () => {
    render(<MobileDockClient items={items} />);

    const wrapper = document.querySelector("[data-scroll-collapsed]");
    expect(wrapper?.getAttribute("data-scroll-collapsed")).toBe("false");
  });

  it("marca data-scroll-collapsed=true ao rolar para baixo além do limiar", async () => {
    render(<MobileDockClient items={items} />);

    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();

    const wrapper = document.querySelector("[data-scroll-collapsed]");
    expect(wrapper?.getAttribute("data-scroll-collapsed")).toBe("true");
  });

  it("volta para data-scroll-collapsed=false ao rolar para cima depois de colapsar", async () => {
    render(<MobileDockClient items={items} />);

    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();
    expect(document.querySelector("[data-scroll-collapsed]")?.getAttribute("data-scroll-collapsed")).toBe("true");

    setScrollY(50);
    await dispatchScroll();

    expect(document.querySelector("[data-scroll-collapsed]")?.getAttribute("data-scroll-collapsed")).toBe("false");
  });

  // Regressão do bug "quebra o scroll e a mobile dock" no carregamento de
  // /app/perfil: o dock nunca desmonta entre navegações, então um colapso
  // induzido por scroll-anchoring durante o carregamento de uma página
  // ficava "preso" na página seguinte. Mudar o pathname (navegação de rota)
  // deve resetar o estado colapsado imediatamente, sem precisar de mais
  // eventos de scroll.
  it("volta para data-scroll-collapsed=false quando a rota muda (pathname), sem novo evento de scroll", async () => {
    const { rerender } = render(<MobileDockClient items={items} />);

    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();
    expect(document.querySelector("[data-scroll-collapsed]")?.getAttribute("data-scroll-collapsed")).toBe("true");

    mockPathname = "/app/atividades";
    rerender(<MobileDockClient items={items} />);

    expect(document.querySelector("[data-scroll-collapsed]")?.getAttribute("data-scroll-collapsed")).toBe("false");
  });

  it("mantém os itens de navegação acessíveis mesmo no estado colapsado", async () => {
    render(<MobileDockClient items={items} />);

    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();

    expect(screen.getByRole("button", { name: "Home" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Atividades" })).not.toBeNull();
  });
});
