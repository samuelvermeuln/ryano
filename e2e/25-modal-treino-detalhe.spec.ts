/**
 * SAM-5 — o modal de treino da ficha do atleta (escola) mostra um resumo útil
 * mesmo sem estrutura detalhada, identifica o professor responsável, explica
 * a ausência de blocos, expõe rastreabilidade e mantém o princípio de que a
 * solicitação de alteração nunca muda a prescrição por si só.
 *
 * Reaproveita as prescrições dos specs 06/14 (ESCOLA_1 + atleta com treino).
 * Leitura apenas: nada é criado aqui.
 */
import { test, expect, type Page } from "@playwright/test";

import { ESCOLA_1 } from "./fixtures";
import { loginAsSchoolOwner } from "./helpers";

async function abrirPrimeiroTreino(page: Page, schoolId: string) {
  await page.goto(`/escola/${schoolId}/atletas`);
  await page.waitForLoadState("load");

  // Primeiro atleta com ficha navegável.
  const fichaHref = await page.locator(`main a[href^="/escola/${schoolId}/atletas/"]`).first().getAttribute("href");
  expect(fichaHref, "escola deveria ter ao menos um atleta com ficha").toBeTruthy();
  await page.goto(fichaHref!);
  await page.waitForLoadState("load");

  const verTreino = page.getByRole("button", { name: /^Ver treino / }).first();
  const temTreino = await verTreino.isVisible({ timeout: 10_000 }).catch(() => false);
  return temTreino ? verTreino : null;
}

test.describe("SAM-5 — modal de detalhe do treino", () => {
  test.setTimeout(90_000);

  test("resumo, professor responsável, estrutura (ou explicação) e rastreabilidade", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const verTreino = await abrirPrimeiroTreino(page, schoolId);
    expect(verTreino, "fixture precisa ter ao menos uma prescrição (specs 06/14)").not.toBeNull();

    await verTreino!.click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();

    // Resumo antes de tudo: quem prescreveu.
    const resumo = dialogo.getByTestId("workout-summary");
    await expect(resumo).toBeVisible();
    await expect(resumo).toContainText("Professor responsável");

    // Estrutura legível OU explicação honesta (nunca "faltou carregar").
    await expect(dialogo.getByText("Estrutura do treino")).toBeVisible();
    const temBlocos = await dialogo.locator("ol li").first().isVisible().catch(() => false);
    if (!temBlocos) {
      await expect(dialogo.getByText(/O treinador não adicionou blocos detalhados/)).toBeVisible();
    }

    // Rastreabilidade recolhível com quem/quando.
    const trilha = dialogo.getByTestId("traceability");
    await expect(trilha).toBeVisible();
    await trilha.locator("summary").click();
    await expect(trilha).toContainText("Prescrito por");
    await expect(trilha).toContainText("Versão");

    // Princípio da solicitação: pede, não altera.
    await expect(dialogo.getByText("Solicitações de alteração")).toBeVisible();
    await expect(dialogo.getByText(/nunca muda o treino por si só/)).toBeVisible();

    // Nenhum campo vazio "para preencher espaço": tiles só com valor.
    const tiles = await resumo.locator("dd").allTextContents();
    expect(tiles.every((t) => t.trim().length > 0)).toBe(true);
  });

  test("mobile: o modal continua legível e centralizado", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
      const verTreino = await abrirPrimeiroTreino(page, schoolId);
      expect(verTreino).not.toBeNull();
      await verTreino!.click();

      const dialogo = page.getByRole("dialog");
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByTestId("workout-summary")).toBeVisible();
      // O modal cabe no viewport de layout e fica centralizado (nunca gaveta lateral).
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      const box = await dialogo.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(viewportWidth);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(Math.abs(box!.x + box!.width / 2 - viewportWidth / 2)).toBeLessThan(8);
    } finally {
      await mobile.close();
    }
  });
});
