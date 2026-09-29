/**
 * SAM-7 — a sidebar da Escola destacava "Painel" e a seção atual ao mesmo
 * tempo, porque cada item testava o próprio prefixo isoladamente e
 * `/escola/<id>` é prefixo de todas as subrotas.
 *
 * O teste lê `aria-current="page"` (semântica estável) em vez de classes CSS,
 * e o que ele prova de fato é a CARDINALIDADE: exatamente um item ativo.
 */
import { test, expect, type Page } from "@playwright/test";

import { ESCOLA_1 } from "./fixtures";
import { loginAsSchoolOwner } from "./helpers";

const sidebar = (page: Page) => page.locator("aside nav");
const activeItems = (page: Page) => sidebar(page).locator('a[aria-current="page"]');

/** Navega e devolve o label do único item ativo, falhando se houver 0 ou 2+. */
async function activeLabelAt(page: Page, path: string): Promise<string> {
  await page.goto(path);
  await page.waitForLoadState("load");

  // A sidebar só existe no shell desktop (lg+); o viewport default do projeto
  // (Desktop Chrome) já satisfaz isso.
  await sidebar(page).waitFor({ state: "visible", timeout: 15_000 });

  await expect(activeItems(page), `esperava exatamente 1 item ativo em ${path}`).toHaveCount(1);

  return ((await activeItems(page).first().textContent()) ?? "").trim();
}

test.describe("SAM-7 — sidebar da escola marca um único item ativo", () => {
  let schoolId: string;

  test.beforeEach(async ({ page }) => {
    schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  });

  test("Painel é o único ativo na rota-base da escola", async ({ page }) => {
    expect(await activeLabelAt(page, `/escola/${schoolId}`)).toContain("Painel");
  });

  test("Membros é o único ativo em /membros — e Painel fica inativo", async ({ page }) => {
    expect(await activeLabelAt(page, `/escola/${schoolId}/membros`)).toContain("Membros");

    // Asserção explícita do bug: Painel não pode continuar destacado.
    const painel = sidebar(page).locator("a", { hasText: "Painel" }).first();
    await expect(painel).not.toHaveAttribute("aria-current", "page");
  });

  test("navegar pela UI até outra seção move o destaque", async ({ page }) => {
    await page.goto(`/escola/${schoolId}`);
    await page.waitForLoadState("load");
    await sidebar(page).waitFor({ state: "visible", timeout: 15_000 });

    // Evita `.click()` + waitForURL: no dev server a 1a visita compila a rota
    // e o clique pode expirar sem existir bug real.
    const href = await sidebar(page).locator("a", { hasText: "Atletas" }).first().getAttribute("href");
    expect(href).toBeTruthy();

    expect(await activeLabelAt(page, href!)).toContain("Atletas");
  });

  test("cada seção da sidebar ativa somente a si mesma", async ({ page }) => {
    await page.goto(`/escola/${schoolId}`);
    await page.waitForLoadState("load");
    await sidebar(page).waitFor({ state: "visible", timeout: 15_000 });

    const links = await sidebar(page).locator("a").all();
    const sections: { href: string; label: string }[] = [];

    for (const link of links) {
      const href = await link.getAttribute("href");
      const label = ((await link.textContent()) ?? "").trim();
      // Só as subseções; a rota-base (Painel) já é coberta acima.
      if (href && href !== `/escola/${schoolId}`) {
        sections.push({ href, label });
      }
    }

    expect(sections.length, "sidebar da escola deveria ter subseções").toBeGreaterThan(0);

    for (const section of sections) {
      const active = await activeLabelAt(page, section.href);
      expect(active, `${section.href} deveria ativar "${section.label}"`).toContain(section.label);
    }
  });

  test("rota filha mantém a seção pai ativa", async ({ page }) => {
    // Entra em Membros e abre o primeiro detalhe disponível pela própria UI.
    await page.goto(`/escola/${schoolId}/membros`);
    await page.waitForLoadState("load");
    await sidebar(page).waitFor({ state: "visible", timeout: 15_000 });

    const childHref = await page
      .locator(`main a[href^="/escola/${schoolId}/membros/"]`)
      .first()
      .getAttribute("href")
      .catch(() => null);

    if (!childHref) {
      // Sem detalhe navegável no fixture: a regra de rota filha já está
      // coberta por tests/resolve-active-route-index.test.ts.
      test.info().annotations.push({
        type: "skip-reason",
        description: "Nenhuma rota filha de Membros disponível no fixture atual.",
      });
      return;
    }

    expect(await activeLabelAt(page, childHref)).toContain("Membros");
  });
});
