/**
 * E2E — 31 (SAM-23): o dashboard do atleta não exibe o bloco de escola vazio.
 *
 * O contexto Atleta nunca mostra CTAs de outro contexto: "Criar escola" é ação
 * da Escola, e descobrir escola/professor tem telas próprias na sidebar
 * (/app/escola, /app/professor). Logo, um atleta sem vínculo não pode ver
 * "Nenhuma escola vinculada", "Encontrar escola" nem "Criar escola" no
 * dashboard — e nenhum link do dashboard pode levar a /escola/* (contexto
 * administrativo).
 *
 * Fixtures: ALUNO_SEM_ESCOLA (criado aqui se não existir; ninguém o matricula)
 * e ALUNOS[0], vinculado à Escola Alpha pelos specs 04/05/09, para provar que o
 * caminho positivo (cards de "Minhas modalidades") continua funcionando.
 */
import { test, expect, type Page } from "@playwright/test";

import { ALUNO_SEM_ESCOLA, ALUNOS, ESCOLA_1 } from "./fixtures";
import { completeOnboarding, ensureUser, login } from "./helpers";

async function abrirDashboard(page: Page) {
  await page.goto("/app/dashboard");
  await page.waitForLoadState("load");
  // O marcador de contexto é renderizado pelo shell; esperar por ele garante
  // que a página do dashboard (e não um redirect) está na tela.
  await page.getByTestId("active-context").waitFor({ state: "attached", timeout: 20_000 });
  await expect(page).toHaveURL(/\/app\/dashboard/);
}

test.describe("31 — Dashboard do atleta sem escola (SAM-23)", () => {
  test("atleta sem vínculo não vê bloco de escola vazio nem CTAs de outro contexto", async ({ page }) => {
    await ensureUser(page, ALUNO_SEM_ESCOLA.name, ALUNO_SEM_ESCOLA.email, ALUNO_SEM_ESCOLA.password);
    await abrirDashboard(page);

    const main = page.locator("main");
    await expect(main.getByText(/Nenhuma escola vinculada/i)).toHaveCount(0);
    await expect(main.getByRole("link", { name: /Criar escola/i })).toHaveCount(0);
    await expect(main.getByRole("link", { name: /^Encontrar escola$/i })).toHaveCount(0);
    await expect(main.getByText(/Minhas modalidades/i)).toHaveCount(0);

    // Nenhum link do conteúdo do dashboard aponta para o contexto Escola.
    const linksAdministrativos = await main.locator('a[href^="/escola/"]').count();
    expect(linksAdministrativos, "dashboard do atleta não pode linkar para /escola/*").toBe(0);

    // O resto do dashboard continua lá: o header do atleta renderizou.
    await expect(page.getByTestId("active-context")).toHaveAttribute("data-context-key", "athlete");
  });

  test("atleta vinculado continua vendo o card da escola em Minhas modalidades", async ({ page }) => {
    const aluno = ALUNOS[0]!;
    await login(page, aluno.email, aluno.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, aluno.name);
    await abrirDashboard(page);

    const main = page.locator("main");
    await expect(main.getByText(/Minhas modalidades/i)).toBeVisible({ timeout: 15_000 });
    await expect(main.getByText(ESCOLA_1.schoolName).first()).toBeVisible();
    // O card da escola leva ao painel do ATLETA nessa escola, não à administração.
    await expect(main.locator('a[href^="/atleta/"]').first()).toBeVisible();
    expect(await main.locator('a[href^="/escola/"]').count()).toBe(0);
  });
});
