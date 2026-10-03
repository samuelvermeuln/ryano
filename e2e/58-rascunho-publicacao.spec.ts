/**
 * E2E — 58 (SAM-59): rascunho e publicação da prescrição.
 *
 * Requer a migração 0067_prescription_drafts_revisions aplicada.
 *
 * Ricardo salva um rascunho para Maria (Maria não vê), publica (Maria vê),
 * altera a prescrição vendo o diff antes de publicar; Maria vê a nova versão,
 * o histórico de versões e o pedido de alteração pelos comentários — sem
 * botão de editar.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);
const TITULO = `Rascunho E2E ${RUN}`;

test.describe.configure({ timeout: 360_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function blocoDistancia(page: Page, metros: string) {
  const bloco = page.getByTestId("builder-block").first();
  await bloco.getByLabel("Distância (m)").fill(metros);
}

test("rascunho invisível, publicação, alteração com diff e histórico", async ({ page, browser }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const athleteId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const hub = `/professor/independente/atletas/${athleteId}`;

  // 1. Rascunho: salvo e listado só no hub do professor.
  await page.goto(`${hub}/treinos/novo`);
  await page.getByLabel("Título do treino").fill(TITULO);
  await blocoDistancia(page, "1000");
  await page.getByTestId("save-draft").click();
  await expect(page.getByTestId("builder-message")).toContainText("Rascunho salvo", { timeout: 30_000 });
  await page.goto(`${hub}/treinos`);
  await expect(page.getByTestId("prescription-draft").filter({ hasText: TITULO })).toBeVisible({ timeout: 30_000 });

  // 2. Maria não vê o rascunho.
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);
  await maria.goto("/app/treinos?view=list");
  await expect(maria.getByText(TITULO)).toHaveCount(0);

  // 3. Publicar: some dos rascunhos e aparece nas prescrições.
  await page.getByTestId("prescription-draft").filter({ hasText: TITULO }).getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByTestId("prescription-draft").filter({ hasText: TITULO })).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("link", { name: TITULO }).first().click();
  await page.waitForURL(/\/treinos\/[^/]+$/);
  const assignmentId = page.url().split("/treinos/")[1]!.split(/[/?#]/)[0]!;

  // 4. Alterar com diff antes de publicar.
  await page.getByTestId("revise-prescription").click();
  await expect(page.getByRole("heading", { name: /Alterar prescrição/ })).toBeVisible({ timeout: 30_000 });
  await blocoDistancia(page, "1200");
  await page.getByRole("button", { name: "Revisar mudanças" }).click();
  await expect(page.getByTestId("revision-diff")).toContainText("1000 m → 1200 m");
  await page.getByRole("button", { name: "Publicar alteração" }).click();
  await page.waitForURL(new RegExp(`/treinos/${assignmentId}$`), { timeout: 60_000 });
  await expect(page.getByTestId("prescription-version")).toHaveCount(2, { timeout: 30_000 });

  // 5. Maria vê a nova versão, o histórico e o pedido de alteração pelos comentários.
  await maria.goto(`/app/treinos/${assignmentId}`);
  await expect(maria.getByTestId("prescription-version")).toHaveCount(2, { timeout: 30_000 });
  await expect(maria.getByText("1200", { exact: false }).first()).toBeVisible();
  await expect(maria.getByTestId("request-change-by-comment")).toBeVisible();
  await expect(maria.getByRole("link", { name: /Alterar prescrição/ })).toHaveCount(0);
  await mariaContext.close();
});
