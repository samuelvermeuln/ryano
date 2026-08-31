// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Mesma convenção de mock usada em tests/mobile-dock-active-index.test.tsx —
// `MobileDockClient` usa `usePathname`/`useRouter` do App Router e faz
// `createPortal` para `document.body`.
const mockPathname = "/app/dashboard";

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

// Confirma a garantia central desta tarefa: o dock mobile usa exatamente os
// mesmos paths SVG que `NavIcon` (components/nav-icon.tsx) define para cada
// nome de ícone — o mesmo componente também usado pela sidebar desktop em
// `AppShell`. Os valores `d` abaixo foram copiados literalmente de
// `components/nav-icon.tsx`.
const SHARED_ICON_PATHS = {
  dashboard: "M4 13h7V4H4v9Zm9 7h7V11h-7v9Zm0-16v5h7V4h-7ZM4 20h7v-5H4v5Z",
  activities: "M4 14h3l2-4 4 8 2-4h5",
  security: "M12 3 5 6v5c0 5 3.4 8.1 7 10 3.6-1.9 7-5 7-10V6l-7-3Z",
} as const;

describe("MobileDockClient — usa o mesmo SVG do NavIcon da sidebar", () => {
  it.each(Object.entries(SHARED_ICON_PATHS))(
    "renderiza o item '%s' com o path exato definido por NavIcon",
    (icon, path) => {
      const items: readonly MobileDockItem[] = [
        { href: "/app/target", label: "Item", icon: icon as MobileDockItem["icon"], matchPrefixes: ["/app/target"] },
      ];

      render(<MobileDockClient items={items} />);

      const svgPath = document.querySelector(`path[d="${path}"]`);
      expect(svgPath).not.toBeNull();
    },
  );

  it("não usa ícones do @tabler/icons-react para itens compartilhados com a sidebar (ex.: 'dashboard')", () => {
    const items: readonly MobileDockItem[] = [
      { href: "/app/dashboard", label: "Dashboard", icon: "dashboard", matchPrefixes: ["/app/dashboard"] },
    ];

    render(<MobileDockClient items={items} />);

    const button = screen.getByRole("button", { name: "Dashboard" });
    // Ícones Tabler são renderizados como <svg class="tabler-icon ...">;
    // o NavIcon compartilhado não tem essa classe.
    const tablerSvg = button.querySelector("svg.tabler-icon");
    expect(tablerSvg).toBeNull();
  });
});
