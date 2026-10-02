/**
 * E2E — 44 (SAM-40): a nova tela de atividade compartilhada.
 *
 * A fixture E2E (`/api/e2e/activity-fixture` com `rich: true`, só fora de
 * produção) importa uma corrida para o aluno da Escola Alpha E ingere o
 * detalhe rico pelo passo real do core (voltas, zonas nativas, séries com
 * GPS). O atleta abre `/app/atividades/[id]`: 4 KPIs, traçado do percurso,
 * gráficos sincronizados com alternância Tempo/Distância, abas
 * Estatísticas / Voltas / Tempo em zonas, título editável. O professor abre a
 * mesma atividade no hub: mesma tela, sem edição de título, com o badge do
 * prescrito × executado. Requer a migração 0057 aplicada no banco de E2E.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ALUNOS, ESCOLA_1, PROFESSOR_1 } from "./fixtures";

test.describe.configure({ timeout: 240_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function atletaDaEscola(page: Page, schoolId: string): Promise<{ athleteId: string; aluno: (typeof ALUNOS)[number] }> {
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");
  const cards = page.locator(`a[href^="/professor/${schoolId}/atletas/"]`);
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const href = await cards.nth(index).getAttribute("href");
    const athleteId = href?.split("/atletas/")[1]?.split(/[/?#]/)[0];
    if (!athleteId) continue;
    const texto = await cards.nth(index).innerText();
    const aluno = ALUNOS.find((candidate) => texto.includes(candidate.name) || texto.includes(candidate.email));
    if (aluno) return { athleteId, aluno };
  }
  throw new Error("fixture: nenhum atleta conhecido no plantel do professor (specs 06/14)");
}

async function importarCorridaRica(page: Page, email: string, externalId: string) {
  const response = await page.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: email, startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), sportType: "run", externalId, rich: true,
      laps: [
        { durationSeconds: 300, distanceMeters: 1000, averageHeartRate: 142 },
        { durationSeconds: 295, distanceMeters: 1000, averageHeartRate: 151 },
        { durationSeconds: 310, distanceMeters: 1000, averageHeartRate: 158 },
      ],
    },
  });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as { activityId: string };
}

async function validarTela(page: Page) {
  await expect(page.getByTestId("activity-detail")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("activity-kpi")).toHaveCount(4);
  await expect(page.getByTestId("activity-route")).toBeVisible();
  await expect(page.getByTestId("activity-series-heartRate")).toBeVisible();
  await expect(page.getByTestId("activity-series-pace")).toBeVisible();

  // Alternância do eixo e seleção de séries.
  await page.getByRole("button", { name: "Distância" }).click();
  await expect(page.getByRole("button", { name: "Distância" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Séries exibidas" }).getByRole("button", { name: "Frequência cardíaca" }).click();
  await expect(page.getByTestId("activity-series-heartRate")).toHaveCount(0);

  // Abas.
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(page.getByTestId("activity-stats-summary")).toContainText("Resumo do treino");
  await expect(page.getByTestId("activity-stats-training-effect")).toContainText("Base aeróbica");
  await page.getByRole("tab", { name: /Voltas \(3\)/ }).click();
  await expect(page.getByTestId("activity-laps-table").locator('[data-testid="activity-lap-row"]')).toHaveCount(3);
  await expect(page.getByTestId("activity-lap-summary")).toContainText("3,0 km");
  await page.getByRole("tab", { name: "Tempo em zonas" }).click();
  await expect(page.getByTestId("activity-zones-heart-rate")).toContainText("Zonas nativas · Garmin");

  // Mobile: sem scroll horizontal da página.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("44 — Detalhe da atividade: percurso, gráficos e abas (SAM-40)", () => {
  test("atleta e professor veem a mesma tela; só o atleta renomeia", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await loginComo(page, PROFESSOR_1);
    const { athleteId, aluno } = await atletaDaEscola(page, schoolId);
    const { activityId } = await importarCorridaRica(page, aluno.email, `rich-${Date.now().toString(36)}`);

    // Professor (a prescrição não existe: "Não planejada").
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/atividades/${activityId}`);
    await page.waitForURL(`**/atividades/${activityId}`, { timeout: 90_000 });
    await validarTela(page);
    await expect(page.getByTestId("activity-outcome")).toContainText("Não planejada");
    await expect(page.getByRole("button", { name: "Editar título da atividade" })).toHaveCount(0);

    // Atleta: mesma tela, título editável.
    await loginComo(page, aluno);
    await page.goto(`/app/atividades/${activityId}`);
    await page.waitForURL(`**/app/atividades/${activityId}`, { timeout: 90_000 });
    await validarTela(page);
    await page.getByRole("button", { name: "Editar título da atividade" }).click();
    const titulo = `Rodagem leve ${Date.now().toString(36).slice(-4)}`;
    await page.getByLabel("Título da atividade").fill(titulo);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByTestId("activity-title")).toHaveText(titulo, { timeout: 30_000 });
  });

  test("mobile 390 px: a tela do atleta cabe sem overflow horizontal", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
      await loginComo(page, PROFESSOR_1);
      const { aluno } = await atletaDaEscola(page, schoolId);
      const { activityId } = await importarCorridaRica(page, aluno.email, `rich-m-${Date.now().toString(36)}`);
      await loginComo(page, aluno);
      await page.goto(`/app/atividades/${activityId}`);
      await page.waitForURL(`**/app/atividades/${activityId}`, { timeout: 90_000 });
      await validarTela(page);
    } finally {
      await context.close();
    }
  });
});
