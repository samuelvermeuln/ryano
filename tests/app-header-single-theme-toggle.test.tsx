// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/marketplace",
}));

import { AppHeader } from "@/components/app-header";
import { ThemeToggle } from "@/components/theme-toggle";

afterEach(cleanup);

/**
 * AppHeader always renders its own theme toggle, so a page that also passes one
 * through `action` ends up with two side by side. That happened on both
 * marketplace pages.
 */
function themeButtons() {
  return screen.getAllByRole("button", { name: /Ativar tema (escuro|claro)/i });
}

describe("AppHeader theme toggle", () => {
  it("renders exactly one theme toggle on its own", () => {
    render(<AppHeader tagline="t" />);
    expect(themeButtons()).toHaveLength(1);
  });

  it("still renders one when the page supplies an unrelated action", () => {
    render(<AppHeader tagline="t" action={<a href="/entrar">Entrar</a>} />);
    expect(themeButtons()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Entrar" })).toBeDefined();
  });

  it("would show two if a page passed its own toggle as the action", () => {
    // Pins the cause of the bug: the duplicate came from the call site, not
    // from AppHeader rendering twice. If AppHeader ever stops providing a
    // toggle, this expectation drops to 1 and flags the behaviour change.
    render(<AppHeader tagline="t" action={<ThemeToggle />} />);
    expect(themeButtons()).toHaveLength(2);
  });
});

describe("pages using AppHeader", () => {
  it("never import ThemeToggle themselves", () => {
    // The rendering tests above cannot catch the actual regression, which lived
    // in the page files. A page that renders AppHeader already gets a toggle,
    // so importing one is the duplicate waiting to happen.
    const offenders = sourceFiles(join(process.cwd(), "app"))
      .map((file) => ({ file, text: readFileSync(file, "utf8") }))
      .filter(({ text }) => text.includes("<AppHeader") && text.includes("ThemeToggle"))
      .map(({ file }) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}
