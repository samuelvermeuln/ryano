/**
 * E2E — 42 (SAM-35): "Meus atletas" do coach independente.
 *
 * Ricardo (PROFESSOR_3, sem escola) acompanha Maria (ALUNOS[1]); converge como
 * o spec 38. A sidebar do hub ganha "Meus atletas" → /professor/independente/atletas
 * lista Maria num card com o estado de hoje; depois que a fixture E2E importa uma
 * atividade de hoje (sem prescrição), o card diz "Atividade não planejada hoje";
 * o clique abre a central de Maria. Sem fixture o cenário FALHA.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;

test.describe.configure({ timeout: 240_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
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

async function garantirAcompanhamento(page: Page): Promise<void> {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  await page.waitForLoadState("load");
  const ativo = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name });
  if (await ativo.first().isVisible({ timeout: 3_000 }).catch(() => false)) return;

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
}

async function importarAtividadeDeHoje(page: Page, email: string) {
  const response = await page.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: email, startedAt: new Date(Date.now() - 60 * 60_000).toISOString(), sportType: "open-water",
      externalId: `roster-${Date.now().toString(36)}`, autoMatch: true,
      laps: [{ durationSeconds: 1477, distanceMeters: 672, averageHeartRate: 138 }],
    },
  });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
}

test.describe("42 — Meus atletas do coach independente (SAM-35)", () => {
  test("a sidebar leva à lista; o card de Maria mostra o estado de hoje e abre a central", async ({ page }) => {
    await garantirAcompanhamento(page);
    await loginComo(page, PROFESSOR_3);

    // A sidebar do hub do professor tem "Meus atletas" fora de qualquer escola.
    await page.goto("/professor");
    await page.waitForLoadState("load");
    const sidebar = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: /Meus atletas/ }) }).first();
    const item = sidebar.getByRole("link", { name: /Meus atletas/ }).first();
    expect(await item.getAttribute("href")).toBe("/professor/independente/atletas");

    await page.goto("/professor/independente/atletas");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "Meus atletas" })).toBeVisible({ timeout: 30_000 });
    const card = page.getByTestId("roster-athlete").filter({ hasText: MARIA.name }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId("roster-today")).toBeVisible();

    // Depois de uma atividade de hoje sem prescrição, o card diz exatamente isso.
    await importarAtividadeDeHoje(page, MARIA.email);
    await page.reload();
    await page.waitForLoadState("load");
    const atualizado = page.getByTestId("roster-athlete").filter({ hasText: MARIA.name }).first();
    await expect(atualizado.getByTestId("roster-today")).toContainText("Atividade não planejada hoje", { timeout: 30_000 });
    await expect(atualizado).toContainText("Última atividade");

    // O clique abre a central do atleta (SAM-30), com a trilha de volta para a lista.
    await atualizado.getByRole("link", { name: `Abrir a central de ${MARIA.name}` }).click();
    await page.waitForURL(/\/professor\/independente\/atletas\/[^/]+$/, { timeout: 60_000 });
    const crumb = page.getByRole("navigation", { name: "Trilha de navegação" });
    await expect(crumb.getByRole("link", { name: "Meus atletas" })).toHaveAttribute("href", "/professor/independente/atletas");
  });
});
