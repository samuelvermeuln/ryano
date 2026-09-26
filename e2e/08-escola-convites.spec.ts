/**
 * E2E — 08: Convites da escola (/escola/<id>/convites)
 *
 * O ponto central deste spec é o token: ele é guardado apenas como hash, então
 * só existe em claro no instante da criação. O teste captura o link nesse
 * instante e o usa de verdade numa sessão anônima — que é a única prova de que
 * o convite funciona. Um teste que só confere "o convite apareceu na lista"
 * passaria mesmo com o bug do link quebrado que existia antes.
 *
 * Reaproveita ESCOLA_1 das fixtures; não cria escola nem atleta novo.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner } from "./helpers";
import { ESCOLA_1, CONVITE_E2E } from "./fixtures";

/** Cria um convite e devolve o link exibido uma única vez. */
async function criarConviteECapturarLink(page: Page, schoolId: string): Promise<string> {
  await page.goto(`/escola/${schoolId}/convites`);
  await page.waitForLoadState("load");

  await page.locator('button:has-text("Novo convite")').first().click();

  const form = page.locator("form").filter({ has: page.locator('select[name="type"]') }).first();
  await form.locator('select[name="type"]').selectOption("SCHOOL");
  await form.locator('input[name="expiresInDays"]').fill(CONVITE_E2E.expiresInDays);
  await form.locator('input[name="maxUses"]').fill(CONVITE_E2E.maxUses);

  await form.locator('button:has-text("Criar convite")').click();

  // O link só é renderizado depois que a action volta; é agora ou nunca.
  const campoLink = page.getByLabel("Link do convite");
  await expect(campoLink).toBeVisible({ timeout: 20_000 });

  const link = await campoLink.inputValue();
  expect(link).toContain("/entrar/convite/");
  return link;
}

test.describe.configure({ mode: "serial" });

test.describe("08 — Convites da escola", () => {
  test("Criar convite exibe o link uma única vez", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const link = await criarConviteECapturarLink(page, schoolId);

    // O token tem que ser substancial — se virasse o id do convite, este
    // trecho continuaria passando, então o tamanho importa.
    const token = link.split("/entrar/convite/")[1]!;
    expect(token.length).toBeGreaterThan(20);
    console.log(`✅ Convite criado — token de ${token.length} chars`);
  });

  test("O aviso deixa claro que o link não é recuperável", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await criarConviteECapturarLink(page, schoolId);

    // Esta cópia é a correção do bug: antes a tela prometia um link que
    // resolveria depois, e que na prática dava 404 para sempre.
    await expect(page.getByText(/só aparece uma vez/i).first()).toBeVisible();
  });

  test("Recarregar a tela não traz o link de volta", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await criarConviteECapturarLink(page, schoolId);

    await page.reload();
    await page.waitForLoadState("load");

    // Recuperar o token depois seria impossível (só o hash é persistido); a
    // tela não pode fingir o contrário.
    await expect(page.getByLabel("Link do convite")).toHaveCount(0);
  });

  test("O link capturado abre a página de convite para um visitante", async ({ page, browser }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const link = await criarConviteECapturarLink(page, schoolId);

    // Sessão limpa: sem cookies do dono, como um convidado de verdade.
    const contextoAnonimo = await browser.newContext();
    const visitante = await contextoAnonimo.newPage();
    try {
      const resposta = await visitante.goto(link);

      // A prova do bug corrigido: o link resolve em vez de 404.
      expect(resposta?.status()).toBeLessThan(400);
      await expect(visitante.locator("body")).toContainText(
        new RegExp(ESCOLA_1.schoolName.split(" ")[0]!, "i"),
        { timeout: 15_000 },
      );
      console.log("✅ Link do convite resolve para um visitante anônimo");
    } finally {
      await contextoAnonimo.close();
    }
  });

  test("Revogar o convite o tira da lista de ativos", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/convites`);
    await page.waitForLoadState("load");

    const revogar = page.locator('button:has-text("Revogar")').first();
    if (!(await revogar.isVisible({ timeout: 5_000 }).catch(() => false))) {
      throw new Error("Nenhum convite ativo para revogar — os testes anteriores deveriam ter criado um");
    }

    const antes = await page.locator('button:has-text("Revogar")').count();
    await revogar.click();

    // Revogar é destrutivo e pede confirmação.
    const confirmar = page.locator('button:has-text("Confirmar")').first();
    if (await confirmar.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmar.click();
    }

    await page.waitForTimeout(2_000);
    await page.reload();
    await page.waitForLoadState("load");

    await expect(page.locator('button:has-text("Revogar")')).toHaveCount(antes - 1, {
      timeout: 15_000,
    });
    console.log("✅ Convite revogado");
  });
});
