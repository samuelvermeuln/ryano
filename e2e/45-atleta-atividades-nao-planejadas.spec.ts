/**
 * E2E — 45 (SAM-41): o atleta vê a atividade importada sem prescrição como
 * "Não planejada" na lista `/app/atividades` (com filtro por status) e no
 * calendário `/app/treinos` (semana e lista), uma vez só.
 *
 * Requer a migração 0057 aplicada no banco de E2E (a fixture grava Activity).
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
    const texto = await cards.nth(index).innerText();
    const aluno = ALUNOS.find((candidate) => texto.includes(candidate.name) || texto.includes(candidate.email));
    if (aluno) return aluno;
  }
  throw new Error("fixture: nenhum atleta conhecido no plantel do professor (specs 06/14)");
}

test("45 — atividade importada sem prescrição aparece como 'Não planejada' na lista e no calendário", async ({ page }) => {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  await loginComo(page, PROFESSOR_1);
  const aluno = await alunoDaEscola(page, schoolId);

  const startedAt = new Date();
  startedAt.setHours(6, 10, 0, 0);
  const response = await page.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: aluno.email, startedAt: startedAt.toISOString(), sportType: "open-water", externalId: `self-${Date.now().toString(36)}`,
      laps: [{ durationSeconds: 1477, distanceMeters: 672, averageHeartRate: 138 }],
    },
  });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
  const { activityId } = (await response.json()) as { activityId: string };

  await loginComo(page, aluno);

  // Lista: badge de status e filtro por status.
  await page.goto(`/app/atividades?days=7&status=UNPLANNED_ACTIVITY`);
  await page.waitForLoadState("load");
  const card = page.locator(`a[href="/app/atividades/${activityId}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId("activity-status")).toHaveText("Não planejada");
  await page.goto(`/app/atividades?days=7&status=EXECUTED_AS_PLANNED`);
  await page.waitForLoadState("load");
  await expect(page.locator(`a[href="/app/atividades/${activityId}"]`)).toHaveCount(0);

  // Calendário: semana (card do dia) e lista (uma vez só).
  await page.goto("/app/treinos?view=week");
  await page.waitForLoadState("load");
  const weekCard = page.getByTestId("unplanned-activity-card").filter({ has: page.locator(`[href="/app/atividades/${activityId}"]`) }).or(page.locator(`a[data-testid="unplanned-activity-card"][href="/app/atividades/${activityId}"]`));
  await expect(weekCard.first()).toBeVisible({ timeout: 30_000 });
  await expect(weekCard.first()).toContainText("Não planejada");
  await expect(page.getByTestId("week-unplanned-count")).toBeVisible();

  await page.goto("/app/treinos?view=list");
  await page.waitForLoadState("load");
  await expect(page.locator(`a[href="/app/atividades/${activityId}"]`)).toHaveCount(1, { timeout: 30_000 });
});
