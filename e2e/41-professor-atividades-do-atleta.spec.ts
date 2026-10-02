/**
 * E2E — 41 (SAM-34): o professor abre as atividades do atleta.
 *
 * Fluxo real: a fixture E2E (`/api/e2e/activity-fixture` sem `assignmentId`,
 * só fora de produção) importa uma natação de hoje para o atleta; o professor
 * abre a aba "Atividades" do hub → o card aparece com "Não planejada" → o
 * detalhe mostra o mesmo "Resumo do treino" que o atleta vê, sem controle de
 * layout. Dois escopos: Carlos na Escola Alpha (PROFESSOR_1 → aluno do plantel)
 * e Ricardo independente (PROFESSOR_3 → Maria, convergindo como o spec 38).
 * Sem fixture o cenário FALHA.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ALUNOS, ESCOLA_1, PROFESSOR_1, PROFESSOR_3 } from "./fixtures";

const MARIA = ALUNOS[1]!;

test.describe.configure({ timeout: 240_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function atletaDaEscola(page: Page, schoolId: string): Promise<{ athleteId: string; email: string }> {
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
    if (aluno) return { athleteId, email: aluno.email };
  }
  throw new Error("fixture: nenhum atleta conhecido no plantel do professor (specs 06/14)");
}

async function abrirPerfilDoProfessor(page: Page, email: string, displayName: string): Promise<{ dialog: Locator }> {
  await page.goto("/app/professor");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar professor").fill(email);
  await expect.poll(() => page.getByTestId("coach-card").count(), { timeout: 30_000 }).toBe(1);
  const card = page.getByTestId("coach-card").filter({ hasText: displayName }).first();
  await card.getByRole("button", { name: "Ver perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
  return { dialog };
}

/** Garante Ricardo → Maria ACTIVE (independente) e devolve o id de Maria no hub. */
async function garantirAcompanhamentoIndependente(page: Page): Promise<string> {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  await page.waitForLoadState("load");
  const ativo = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name });
  if (!(await ativo.first().isVisible({ timeout: 3_000 }).catch(() => false))) {
    await loginComo(page, MARIA);
    const { dialog } = await abrirPerfilDoProfessor(page, PROFESSOR_3.email, PROFESSOR_3.displayName);
    if (!(await dialog.getByTestId("coach-request-pending").isVisible({ timeout: 1_000 }).catch(() => false))) {
      await dialog.getByRole("button", { name: "Solicitar acompanhamento" }).click();
      await expect(dialog.getByTestId("coach-request-pending")).toBeVisible({ timeout: 15_000 });
    }
    await loginComo(page, PROFESSOR_3);
    await page.goto("/professor");
    await page.waitForLoadState("load");
    const pedido = page.getByTestId("coach-request").filter({ hasText: MARIA.name }).first();
    await expect(pedido).toBeVisible({ timeout: 15_000 });
    await pedido.getByRole("button", { name: "Aceitar" }).click();
    await expect(page.getByTestId("coach-request").filter({ hasText: MARIA.name })).toHaveCount(0, { timeout: 45_000 });
    await page.goto("/professor/independente");
    await page.waitForLoadState("load");
  }
  const link = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first()
    .locator('a[href^="/professor/independente/atletas/"]').first();
  const href = await link.getAttribute("href");
  const athleteId = href?.split("/atletas/")[1]?.split(/[/?#]/)[0];
  if (!athleteId) throw new Error("fixture: o card de Maria não linka para a central");
  return athleteId;
}

async function importarNatacao(page: Page, email: string, externalId: string) {
  const response = await page.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: email, startedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), sportType: "open-water", externalId,
      laps: [{ durationSeconds: 1477, distanceMeters: 672, averageHeartRate: 138 }],
    },
  });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as { activityId: string };
}

async function validarAtividades(page: Page, base: string, activityId: string) {
  await page.goto(`${base}/atividades?dias=7`);
  await page.waitForLoadState("load");
  await expect(page.getByRole("link", { name: "Atividades" })).toHaveAttribute("aria-current", "page");
  const card = page.locator(`a[href="${base}/atividades/${activityId}"]`);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Não planejada");
  await expect(card).toContainText("Garmin");

  await card.click();
  // Rota nova compila na 1ª chamada do dev server e o enriquecimento lê o provider: até 90 s.
  await page.waitForURL(`**${base}/atividades/${activityId}`, { timeout: 90_000 });
  // O mesmo detalhe do atleta: resumo do treino, sem o controle de layout.
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("activity-outcome")).toContainText("Não planejada");
  await expect(page.getByText("Resumo do treino").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Arraste o ícone dos cards/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salvar layout" })).toHaveCount(0);
}

test.describe("41 — Professor abre as atividades do atleta (SAM-34)", () => {
  test("escola: Carlos vê a atividade importada do aluno com 'Não planejada' e abre o detalhe", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await loginComo(page, PROFESSOR_1);
    const { athleteId, email } = await atletaDaEscola(page, schoolId);
    const { activityId } = await importarNatacao(page, email, `swim-school-${Date.now().toString(36)}`);
    await validarAtividades(page, `/professor/${schoolId}/atletas/${athleteId}`, activityId);
  });

  test("independente: Ricardo vê a atividade importada de Maria e abre o detalhe", async ({ page }) => {
    const athleteId = await garantirAcompanhamentoIndependente(page);
    const { activityId } = await importarNatacao(page, MARIA.email, `swim-indep-${Date.now().toString(36)}`);
    await validarAtividades(page, `/professor/independente/atletas/${athleteId}`, activityId);
  });
});
