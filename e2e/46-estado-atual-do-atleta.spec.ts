/**
 * E2E — 46 (SAM-43): "Estado atual" do atleta para o professor e para a
 * escola. A fixture E2E grava 7 dias de saúde diária (Garmin) para o aluno
 * da Escola Alpha; o professor vê os cards com a origem ("FC de repouso:
 * Garmin"); a administração da escola vê o mesmo bloco na ficha.
 *
 * Requer as migrações 0057/0058 aplicadas no banco de E2E.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ALUNOS, ESCOLA_1, PROFESSOR_1 } from "./fixtures";

test.describe.configure({ timeout: 240_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function alunoDaEscola(page: Page, schoolId: string) {
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");
  const cards = page.locator(`a[href^="/professor/${schoolId}/atletas/"]`);
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const href = await cards.nth(index).getAttribute("href");
    const athleteId = href?.split("/atletas/")[1]?.split(/[/?#]/)[0];
    const texto = await cards.nth(index).innerText();
    const aluno = ALUNOS.find((candidate) => texto.includes(candidate.name) || texto.includes(candidate.email));
    if (athleteId && aluno) return { athleteId, aluno };
  }
  throw new Error("fixture: nenhum atleta conhecido no plantel do professor (specs 06/14)");
}

async function validarEstadoAtual(page: Page) {
  const section = page.getByTestId("current-state");
  await expect(section).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("current-state-restingHeartRate")).toContainText("bpm");
  await expect(page.getByTestId("current-state-restingHeartRate")).toContainText("média 7 dias");
  await expect(page.getByTestId("current-state-energyHighest")).toContainText("Body Battery");
  await expect(page.getByTestId("current-state-sleepScore")).toBeVisible();
  await expect(page.getByTestId("current-state-hrvLastNight")).toContainText("ms");
  await expect(page.getByTestId("current-state-source").first()).toContainText("Garmin");
}

test("46 — professor e escola veem o estado atual do atleta com a origem de cada valor", async ({ page }) => {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  await loginComo(page, PROFESSOR_1);
  const { athleteId, aluno } = await alunoDaEscola(page, schoolId);

  const response = await page.request.post("/api/e2e/daily-health-fixture", { data: { athleteEmail: aluno.email, days: 7 } });
  expect(response.ok(), `fixture de saúde diária falhou: ${response.status()} ${await response.text()}`).toBe(true);

  // Professor (hub da escola).
  await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
  await page.waitForLoadState("load");
  await validarEstadoAtual(page);

  // Escola (ficha do atleta).
  await loginAsSchoolOwner(page, ESCOLA_1);
  await page.goto(`/escola/${schoolId}/atletas/${athleteId}`);
  await page.waitForLoadState("load");
  await validarEstadoAtual(page);
});
