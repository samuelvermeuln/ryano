/**
 * E2E — 49 (SAM-50): níveis por modalidade e ambiente na ficha técnica.
 *
 * Requer a migração 0059_athlete_sport_levels aplicada.
 *
 * Ricardo (independente) abre a ficha técnica de Maria, registra
 * "Natação · Piscina curta: Avançado" (avaliado em 10/09/2026) e
 * "Águas abertas · Mar: Iniciante", salva e vê os dois na ficha e a revisão
 * com antes/depois. Carlos (sem vínculo independente com Maria) recebe 404 na
 * mesma URL.
 */
import { test, expect, type Page } from "@playwright/test";
import { login, completeOnboarding } from "./helpers";
import { ALUNOS, PROFESSOR_1, PROFESSOR_3 } from "./fixtures";

const MARIA = ALUNOS[1]!;

test.describe.configure({ timeout: 300_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

test("professor registra níveis por modalidade e ambiente; outro professor não acessa", async ({ page }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria (specs 34/38/47)").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const athleteId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const fichaUrl = `/professor/independente/atletas/${athleteId}/ficha-tecnica`;

  await page.goto(fichaUrl);
  await page.getByRole("button", { name: /(Editar|Adicionar) ficha técnica do atleta/ }).first().click();
  const editor = page.getByTestId("sport-levels-editor");
  await expect(editor).toBeVisible({ timeout: 30_000 });

  // Recomeça do zero: remove níveis deixados por execuções anteriores.
  const remover = editor.getByRole("button", { name: /^Remover nível / });
  while ((await remover.count()) > 0) await remover.first().click();

  await editor.getByRole("button", { name: "Adicionar nível" }).click();
  await editor.getByRole("button", { name: "Adicionar nível" }).click();
  const linhas = editor.getByTestId("sport-level-row");
  await linhas.nth(0).getByLabel("Modalidade").selectOption("swim");
  await linhas.nth(0).getByLabel("Ambiente").selectOption("POOL_SHORT");
  await linhas.nth(0).getByLabel("Nível").selectOption("ADVANCED");
  await linhas.nth(0).getByLabel("Avaliado em").fill("2026-09-10");
  await linhas.nth(1).getByLabel("Modalidade").selectOption("open-water");
  await linhas.nth(1).getByLabel("Ambiente").selectOption("SEA");
  await linhas.nth(1).getByLabel("Nível").selectOption("BEGINNER");
  await linhas.nth(1).getByLabel("Condição atual").fill("Pouca experiência em mar aberto");

  await page.getByRole("dialog").getByRole("button", { name: /Salvar/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 90_000 });

  const niveis = page.getByTestId("sport-levels");
  await expect(niveis.getByTestId("sport-level")).toHaveCount(2, { timeout: 30_000 });
  await expect(niveis).toContainText("Piscina curta (25 m/yd): Avançado");
  await expect(niveis).toContainText("Mar: Iniciante");
  await expect(niveis).toContainText("Condição atual: Pouca experiência em mar aberto");
  await expect(page.getByText(/Níveis por modalidade:/).first()).toBeVisible();

  // Outro professor, sem acompanhamento independente de Maria: 404.
  await loginComo(page, PROFESSOR_1);
  const response = await page.goto(fichaUrl);
  expect(response?.status()).toBe(404);
});
