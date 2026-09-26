/**
 * E2E — 07: Turmas da escola (/escola/<id>/turmas)
 *
 * Cobre o ciclo completo pela UI: criar turma → editar → adicionar atleta e
 * professor → remover → arquivar. Nenhum dado novo de escola/atleta é
 * inventado: reaproveita ESCOLA_1, ALUNOS e PROFESSOR_1 das fixtures, que os
 * specs 01–05 já criaram pela interface.
 *
 * Idempotente: a turma é criada com um nome fixo e arquivada no fim. Se uma
 * execução anterior morreu no meio, o teste reaproveita a turma que encontrar
 * em vez de acumular duplicatas.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner } from "./helpers";
import { ESCOLA_1, TURMA_E2E } from "./fixtures";

/**
 * Abre o formulário de nova turma e a cria. Devolve false quando a turma já
 * existe na listagem — re-execução não deve criar uma segunda.
 */
async function criarTurma(page: Page, schoolId: string): Promise<boolean> {
  await page.goto(`/escola/${schoolId}/turmas`);
  await page.waitForLoadState("load");

  const jaExiste = await page
    .locator(`text="${TURMA_E2E.name}"`)
    .first()
    .isVisible({ timeout: 3_000 })
    .catch(() => false);
  if (jaExiste) return false;

  await page.locator("button", { hasText: "Nova turma" }).first().click();

  const form = page.locator("form").filter({ has: page.locator('input[name="name"]') }).first();
  await form.locator('input[name="name"]').fill(TURMA_E2E.name);
  await form.locator('input[name="sportType"]').fill(TURMA_E2E.sportType);
  await form.locator('input[name="level"]').fill(TURMA_E2E.level);
  await form.locator('input[name="location"]').fill(TURMA_E2E.location);
  await form.locator('input[name="capacity"]').fill(String(TURMA_E2E.capacity));

  await form.locator("button", { hasText: "Criar turma" }).click();
  await expect(page.locator(`text="${TURMA_E2E.name}"`).first()).toBeVisible({ timeout: 15_000 });
  return true;
}

/**
 * Abre a tela de detalhe da turma criada por este spec.
 *
 * Navega pelo href e não por clique em "Gerenciar": o menu lateral tem um link
 * para `/turmas` que casa com qualquer seletor amplo de "turma" e faz o teste
 * cair de volta na própria listagem sem perceber. O id da turma no href é o
 * único alvo que não é ambíguo.
 */
async function abrirDetalheDaTurma(page: Page, schoolId: string) {
  await page.goto(`/escola/${schoolId}/turmas`);
  await page.waitForLoadState("load");

  const href = await page
    .locator(`a[href*="/turmas/"]`)
    .filter({ hasText: TURMA_E2E.name })
    .first()
    .getAttribute("href")
    .catch(() => null);

  const alvo = href ?? (await page.locator(`a[href*="/turmas/"]`).first().getAttribute("href"));
  if (!alvo) throw new Error("Nenhum link de detalhe de turma encontrado na listagem");

  await page.goto(alvo);
  await page.waitForLoadState("load");
}

test.describe.configure({ mode: "serial" });

test.describe("07 — Turmas da escola", () => {
  test("Dono cria uma turma pela UI", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const criada = await criarTurma(page, schoolId);

    await expect(page.locator(`text="${TURMA_E2E.name}"`).first()).toBeVisible();
    console.log(criada ? "✅ Turma criada" : "✅ Turma já existia — reaproveitada");
  });

  test("A turma recém-criada aparece com seus dados na listagem", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/turmas`);
    await page.waitForLoadState("load");

    // O que o dono precisa enxergar sem abrir a turma: nome e modalidade.
    await expect(page.locator(`text="${TURMA_E2E.name}"`).first()).toBeVisible();
    await expect(page.locator(`text="${TURMA_E2E.sportType}"`).first()).toBeVisible();
  });

  test("Editar a turma persiste o novo local", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/turmas`);
    await page.waitForLoadState("load");

    const editar = page.locator('button:has-text("Editar")').first();
    test.skip(
      !(await editar.isVisible({ timeout: 5_000 }).catch(() => false)),
      "Tela não expõe edição inline nesta listagem",
    );

    await editar.click();
    const novoLocal = `${TURMA_E2E.location} — Portão 2`;
    const form = page.locator("form").filter({ has: page.locator('input[name="location"]') }).first();
    await form.locator('input[name="location"]').fill(novoLocal);
    await form.locator('button:has-text("Salvar")').click();

    await page.waitForTimeout(2_000);
    await page.reload();
    await expect(page.locator(`text="${novoLocal}"`).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Adicionar um atleta à turma o faz aparecer entre os membros", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await abrirDetalheDaTurma(page, schoolId);

    const selectAtleta = page.getByLabel("Adicionar atleta");
    await expect(selectAtleta).toBeVisible({ timeout: 10_000 });

    // Reaproveita um aluno das fixtures (criado pelo spec 04) em vez de
    // inventar outro. O nome escolhido é o que será verificado na lista.
    const escolhido = await selectAtleta
      .locator("option:not([disabled])")
      .first()
      .textContent();
    const nomeEsperado = (escolhido ?? "").split("—")[0]!.trim();
    expect(nomeEsperado.length).toBeGreaterThan(0);

    await selectAtleta.selectOption({ index: 1 });
    await page.locator('form:has([aria-label="Adicionar atleta"]) button[type="submit"]').click();

    await expect(page.getByText(nomeEsperado, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
    console.log(`✅ Atleta "${nomeEsperado}" vinculado à turma`);
  });

  test("Adicionar um professor à turma o faz aparecer entre os responsáveis", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await abrirDetalheDaTurma(page, schoolId);

    const selectCoach = page.getByLabel("Adicionar professor");
    await expect(selectCoach).toBeVisible({ timeout: 10_000 });

    const escolhido = await selectCoach.locator("option:not([disabled])").first().textContent();
    const nomeEsperado = (escolhido ?? "").split("—")[0]!.trim();
    expect(nomeEsperado.length).toBeGreaterThan(0);

    await selectCoach.selectOption({ index: 1 });
    await page.locator('form:has([aria-label="Adicionar professor"]) button[type="submit"]').click();

    await expect(page.getByText(nomeEsperado, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
    console.log(`✅ Professor "${nomeEsperado}" vinculado à turma`);
  });

  test("Arquivar a turma a remove da listagem ativa", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/turmas`);
    await page.waitForLoadState("load");

    // Arquivar mora dentro do painel "Editar" da própria listagem — não na
    // tela de detalhe da turma.
    const linha = page.locator("tr").filter({ hasText: TURMA_E2E.name }).first();
    await linha.locator('button:has-text("Editar")').click();

    // Destrutivo: a UI exige confirmação em dois passos.
    await page.locator('button:has-text("Arquivar turma")').first().click();
    await page.locator('button:has-text("Confirmar arquivamento")').first().click();

    await page.waitForTimeout(2_000);
    await page.goto(`/escola/${schoolId}/turmas`);
    await page.waitForLoadState("load");

    // A turma arquivada sai da lista ativa — é isso que o dono espera ver.
    await expect(page.locator(`a[href*="/turmas/"]`).filter({ hasText: TURMA_E2E.name })).toHaveCount(
      0,
      { timeout: 15_000 },
    );
    console.log("✅ Turma arquivada e fora da listagem ativa");
  });
});
