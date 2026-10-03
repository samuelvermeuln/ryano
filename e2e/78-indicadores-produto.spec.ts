/**
 * E2E — 78 (SAM-80): indicadores do produto.
 *
 * O "Aluno Solo" ganha o papel ADMIN de plataforma pela rota de E2E, abre
 * /admin/indicadores e vê os sete indicadores, cada um com definição,
 * numerador, denominador e período, sem nome de professor ou aluno. O papel
 * é devolvido no fim e, como usuário comum, a mesma URL redireciona.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNO_SEM_ESCOLA, ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

test.describe.configure({ timeout: 300_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

const TITULOS = [
  "Tempo até a primeira análise", "Acompanhamentos com responsável e próxima revisão", "Tempo de atribuição em turma",
  "Uso do catálogo e adaptações", "Atividades extras visíveis × tratadas", "Falhas e duplicidades de importação/publicação", "Eventos com resultado e parecer",
];

test("admin vê os sete indicadores com definição e sem nomes; usuário comum é redirecionado", async ({ page }) => {
  await loginComo(page, ALUNO_SEM_ESCOLA);
  // Usuário comum: redirecionado para fora de /admin.
  await page.goto("/admin/indicadores");
  await expect(page).not.toHaveURL(/\/admin/, { timeout: 60_000 });

  const promover = await page.request.post("/api/e2e/platform-role", { data: { email: ALUNO_SEM_ESCOLA.email, admin: true } });
  expect(promover.ok(), await promover.text()).toBe(true);
  try {
    await page.goto("/admin/indicadores?dias=365");
    await expect(page.getByText("Indicadores do produto")).toBeVisible({ timeout: 90_000 });
    for (const titulo of TITULOS) await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    for (const chave of ["first-analysis", "follow-ups", "batch-time", "catalog", "extras", "failures", "events"]) {
      await expect(page.getByTestId(`indicator-${chave}`)).toBeVisible();
    }
    await expect(page.getByText("Numerador:")).toHaveCount(7);
    await expect(page.getByText("Denominador:")).toHaveCount(7);
    await expect(page.getByTestId("indicators-period")).toBeVisible();
    const texto = await page.locator("main").innerText().catch(async () => page.innerText("body"));
    for (const pessoa of [...ALUNOS.map((aluno) => aluno.name), PROFESSOR_3.name]) expect(texto).not.toContain(pessoa);
    // Recorte por escola é só do admin: o filtro existe e aceita "Toda a plataforma".
    await expect(page.getByLabel("Escola")).toBeVisible();
  } finally {
    const rebaixar = await page.request.post("/api/e2e/platform-role", { data: { email: ALUNO_SEM_ESCOLA.email, admin: false } });
    expect(rebaixar.ok()).toBe(true);
  }
  await page.goto("/admin/indicadores");
  await expect(page).not.toHaveURL(/\/admin/, { timeout: 60_000 });
});
