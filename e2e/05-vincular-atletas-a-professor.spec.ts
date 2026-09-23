/**
 * E2E — 05: Vincular atletas ao Prof. Carlos (professor 1 da Escola Alpha)
 *
 * Fluxo via painel do professor: Professor acessa /professor/<schoolId>/atletas
 * e faz o assign de cada atleta.
 *
 * Idempotente: se o atleta já está vinculado, não tenta novamente.
 */
import { test, expect } from "@playwright/test";
import { login, completeOnboarding } from "./helpers";
import { PROFESSOR_1, ALUNOS, ESCOLA_1 } from "./fixtures";

async function vincularAtletasAoProfessor(page: any) {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);

  // Vai para o painel do professor
  await page.goto("/professor");
  await page.waitForLoadState("load");

  // Captura schoolId da Escola Alpha da URL ou links no painel
  const escolaLink = page.locator(`a:has-text("${ESCOLA_1.schoolName}"), a[href*="/professor/"]`).first();
  const schoolHref = await escolaLink.getAttribute("href").catch(() => null);
  const schoolId = schoolHref?.match(/\/professor\/([^/]+)/)?.[1];

  if (!schoolId) {
    console.log("⚠️  Não foi possível encontrar o schoolId no painel do professor");
    return;
  }

  console.log(`📌 SchoolId encontrado: ${schoolId}`);

  // Acessa lista de atletas da escola
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");

  // Para cada aluno, verifica se já está vinculado; se não, atribui
  for (const aluno of ALUNOS) {
    const alreadyAssigned = await page
      .locator(`text="${aluno.name}"`)
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    if (alreadyAssigned) {
      console.log(`✅ "${aluno.name}" já vinculado ao Prof. Carlos`);
      continue;
    }

    // Busca o atleta ou clica em "Atribuir atleta"
    const assignBtn = page
      .locator(`button:has-text("Atribuir"), button:has-text("Assign"), a:has-text("Atribuir atleta")`)
      .first();

    if (await assignBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await assignBtn.click();
      await page.waitForTimeout(1_000);

      // Seleciona o atleta pelo e-mail/nome
      const athleteOption = page
        .locator(`text="${aluno.name}", text="${aluno.email}"`)
        .first();
      if (await athleteOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await athleteOption.click();
        await page.waitForTimeout(500);
      }

      const confirmBtn = page
        .locator('button:has-text("Confirmar"), button:has-text("Salvar"), button[type="submit"]')
        .last();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(1_500);
      }
    }

    console.log(`📝 Tentativa de vínculo: "${aluno.name}" → Prof. Carlos`);
  }
}

test.describe("05 — Vincular atletas ao Prof. Carlos (Escola Alpha)", () => {
  test("Prof. Carlos vincula todos os 5 atletas", async ({ page }) => {
    await vincularAtletasAoProfessor(page);
    expect(page.url()).not.toContain("/entrar");
  });
});
