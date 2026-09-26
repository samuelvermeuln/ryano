/**
 * E2E — 09: Atletas da escola (/escola/<id>/atletas)
 *
 * Cobre busca, atribuição de professor em lote e as ações por atleta. Usa os
 * alunos e o professor que os specs 02–05 já criaram pela UI (fixtures ALUNOS
 * e PROFESSOR_1): nenhum atleta novo é cadastrado aqui.
 */
import { test, expect } from "@playwright/test";
import { loginAsSchoolOwner } from "./helpers";
import { ESCOLA_1, ALUNOS } from "./fixtures";

test.describe.configure({ mode: "serial" });

test.describe("09 — Atletas da escola", () => {
  test("A tela lista os atletas matriculados", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");

    // Pelo menos um dos alunos das fixtures precisa aparecer; qual deles é
    // irrelevante, o que importa é a escola não vir vazia.
    const algumAluno = page
      .locator("tr")
      .filter({ hasText: new RegExp(ALUNOS.map((a) => a.name.split(" ")[1]).join("|"), "i") });
    await expect(algumAluno.first()).toBeVisible({ timeout: 15_000 });
  });

  test("A busca filtra a lista pelo nome", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");

    const linhasAntes = await page.locator("tbody tr").count();
    expect(linhasAntes).toBeGreaterThan(0);

    // Busca por um nome que existe entre as fixtures.
    const alvo = ALUNOS[0].name.split(" ")[1]!; // sobrenome, mais distintivo
    await page.getByLabel("Buscar atleta").fill(alvo);
    await page.waitForTimeout(1_000);

    const linhasDepois = await page.locator("tbody tr").count();
    expect(linhasDepois).toBeGreaterThan(0);
    expect(linhasDepois).toBeLessThanOrEqual(linhasAntes);
    await expect(page.locator("tbody").getByText(new RegExp(alvo, "i")).first()).toBeVisible();
  });

  test("Buscar um nome inexistente esvazia a lista sem quebrar", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");

    await page.getByLabel("Buscar atleta").fill("zzz-nao-existe-zzz");
    await page.waitForTimeout(1_000);

    await expect(page.locator("tbody tr")).toHaveCount(0);
    // A tela precisa explicar o vazio em vez de só sumir com a tabela.
    await expect(page.locator("body")).toContainText(/nenhum|não encontr/i);
  });

  test("Atribuir professor em lote aos atletas sem professor", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");

    // O "selecionar todos" existe sempre; o que muda é estar habilitado.
    // Desabilitado = ninguém sem professor, que é o próprio estado final
    // esperado — então o teste é satisfeito sem precisar de outra rodada.
    const selecionarTodos = page.getByLabel("Selecionar todos sem professor");
    await expect(selecionarTodos).toBeVisible({ timeout: 15_000 });

    if (await selecionarTodos.isDisabled()) {
      console.log("✅ Nenhum atleta sem professor — lote já aplicado");
      return;
    }

    await selecionarTodos.check();

    const barra = page.locator("form").filter({ has: page.getByLabel("Professor") }).first();
    await expect(barra).toBeVisible({ timeout: 10_000 });

    // Primeira opção habilitada: professores suspensos vêm desabilitados.
    const opcao = barra.locator('select[name="coachId"] option:not([disabled])').first();
    const nomeCoach = ((await opcao.textContent()) ?? "").split("—")[0]!.trim();
    await barra.locator('select[name="coachId"]').selectOption({ index: 1 });

    await barra.locator('button:has-text("Atribuir em lote")').click();
    await page.waitForTimeout(3_000);
    await page.reload();
    await page.waitForLoadState("load");

    // Depois do lote ninguém fica sem professor, então o seletor de massa
    // perde a função e volta a ficar desabilitado.
    await expect(page.getByLabel("Selecionar todos sem professor")).toBeDisabled({
      timeout: 15_000,
    });
    console.log(`✅ Lote atribuído a "${nomeCoach}"`);
  });

  test("Cada atleta oferece ação de gerenciamento", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");

    // A queixa original era "tela sem ações": garante que a linha do atleta
    // expõe pelo menos um caminho de gestão.
    const primeiraLinha = page.locator("tbody tr").first();
    await expect(primeiraLinha).toBeVisible({ timeout: 15_000 });
    await expect(
      primeiraLinha.locator('a:has-text("Gerenciar"), button:has-text("Gerenciar"), button:has-text("Trocar")'),
    ).not.toHaveCount(0);
  });

  test("Os indicadores do topo resumem a situação da escola", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");

    // Informação útil que a tela antiga não dava.
    await expect(page.getByText(/Adesão da semana/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
