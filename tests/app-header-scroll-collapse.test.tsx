// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

// `AppHeader` usa `usePathname()` (App Router) para resetar o estado de
// scroll-collapse ao trocar de rota. `mockPathname` é mutável para permitir
// simular uma navegação (ver teste de reset abaixo) — mesma convenção usada
// em tests/mobile-dock-active-index.test.tsx / tests/mobile-dock-scroll-collapse.test.tsx.
let mockPathname = "/app/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { AppHeader } from "@/components/app-header";

afterEach(() => {
  cleanup();
  window.scrollY = 0;
  mockPathname = "/app/dashboard";
});

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { value, writable: true, configurable: true });
}

// O hook usa `window.requestAnimationFrame` para agrupar a leitura de
// `window.scrollY` — em jsdom o rAF ainda é assíncrono (implementado via
// timer interno), então esperamos o próximo frame explicitamente para que
// o estado do hook já reflita a nova posição de scroll antes de checarmos.
function dispatchScroll() {
  return act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

// Os testes unitários do hook (`useScrollCollapse`, reexportado aqui como
// `useScrollDirection`) foram movidos para
// tests/use-scroll-collapse.test.ts, já que a implementação agora vive em
// `@/components/use-scroll-collapse` (compartilhada com o mobile dock).
// Este arquivo mantém apenas os testes de integração do `AppHeader`.

// `isAppVariant` (compact && !showBrand) é a única variante afetada pelo
// comportamento de scroll — a faixa do WhatsApp (`app-header-whatsapp-band`)
// só deve ficar visível quando isAppVariant é true, independente do estado de
// scroll, e nunca na variante padrão (landing/showBrand).
//
// A faixa agora permanece sempre montada no DOM (mesmo colapsada) — a
// animação de altura mudou de `height: auto <-> 0` (via AnimatePresence,
// que desmontava o elemento) para `max-height` sempre presente, para evitar
// scroll anchoring do navegador. Por isso as asserções abaixo checam
// visibilidade (via `aria-hidden` do wrapper) em vez de presença/ausência
// no DOM.
describe("AppHeader — faixa do WhatsApp é exclusiva da variante do app (compact && !showBrand)", () => {
  it("renderiza a faixa do WhatsApp visível na variante do app quando scrollY = 0", () => {
    render(<AppHeader tagline="Treinos direto no WhatsApp" compact showBrand={false} animate={false} />);

    const band = document.querySelector(".app-header-whatsapp-band");
    expect(band).not.toBeNull();
    expect(band?.parentElement?.getAttribute("aria-hidden")).toBe("false");
  });

  it("nunca torna a faixa do WhatsApp visível na variante padrão (landing/showBrand), mesmo simulando scroll", async () => {
    render(
      <AppHeader
        tagline="Treinos direto no WhatsApp"
        showBrand
        compact={false}
        animate={false}
        navLinks={[]}
      />,
    );

    setScrollY(80);
    await dispatchScroll();

    const band = document.querySelector(".app-header-whatsapp-band");
    expect(band?.parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  // Regressão do bug "quebra o scroll e a mobile dock" no carregamento de
  // /app/perfil: como `AppHeader` nunca desmonta entre navegações, um
  // colapso induzido por scroll-anchoring durante o carregamento de uma
  // página ficava "preso" na página seguinte. Mudar o pathname (navegação
  // de rota) deve resetar o estado colapsado imediatamente, sem precisar de
  // mais eventos de scroll.
  it("volta a mostrar a faixa do WhatsApp (aria-hidden=false) quando a rota muda, sem novo evento de scroll", async () => {
    const { rerender } = render(<AppHeader tagline="Treinos direto no WhatsApp" compact showBrand={false} animate={false} />);

    setScrollY(80);
    await dispatchScroll();

    const band = document.querySelector(".app-header-whatsapp-band");
    expect(band?.parentElement?.getAttribute("aria-hidden")).toBe("true");

    mockPathname = "/app/perfil";
    rerender(<AppHeader tagline="Treinos direto no WhatsApp" compact showBrand={false} animate={false} />);

    const bandAfterRouteChange = document.querySelector(".app-header-whatsapp-band");
    expect(bandAfterRouteChange?.parentElement?.getAttribute("aria-hidden")).toBe("false");
  });
});
