/**
 * SAM-13 — "Conta de recebimento" em /app/perfil, só para quem pode receber
 * receita do Marketplace (Professor e Escola via OWNER/ADMIN), com o
 * beneficiário explícito e o cadastro delegado ao onboarding hospedado do
 * provedor.
 *
 * Neste ambiente NÃO há chaves do provedor (STRIPE_SECRET_KEY ausente): o
 * fluxo até o provedor é exercitado até o ponto em que o backend responde
 * "provedor não configurado" — sem crash, sem estado inventado. Os estados
 * "Aguardando verificação" / "Verificada" e o webhook `account.updated` são
 * cobertos por unit tests (tests/seller-payout-account.test.ts,
 * tests/marketplace-payment-webhook-route.test.ts) com o provedor simulado.
 */
import { test, expect, type Page } from "@playwright/test";

import { ALUNOS, ESCOLA_1, PROFESSOR_1 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";

const section = (page: Page) => page.locator("section#recebimento");
const cards = (page: Page) => page.getByTestId("payout-account");

async function abrirPerfil(page: Page) {
  await page.goto("/app/perfil");
  await page.waitForLoadState("load");
  await page.getByTestId("active-context").waitFor({ state: "attached", timeout: 15_000 });
}

async function loginDireto(page: Page, email: string, password: string, name: string) {
  const response = await page.request.post("/api/e2e/login", { data: { email, password } });
  expect(response.ok(), `login E2E: ${response.status()}`).toBe(true);
  await abrirPerfil(page);
  if (page.url().includes("/onboarding")) {
    await completeOnboarding(page, name);
    await abrirPerfil(page);
  }
}

test.describe("SAM-13 — conta de recebimento no Perfil", () => {
  test.setTimeout(90_000);

  test("Cenário A — professor vê a própria conta como beneficiário e inicia o cadastro pela UI", async ({ page }) => {
    await loginDireto(page, PROFESSOR_1.email, PROFESSOR_1.password, PROFESSOR_1.name);

    await expect(section(page)).toBeVisible();
    await expect(section(page).getByRole("heading", { name: "Conta de recebimento" })).toBeVisible();

    await expect(cards(page).first()).toBeVisible();
    const professorCard = page.locator('[data-testid="payout-account"][data-seller-type="COACH"]');
    await expect(professorCard).toHaveCount(1);
    await expect(professorCard).toContainText(`Professor · ${PROFESSOR_1.displayName}`);
    // Professor comum (não é gestor da escola) NÃO vê a conta da escola.
    await expect(page.locator('[data-testid="payout-account"][data-seller-type="SCHOOL"]')).toHaveCount(0);

    // Status vem do backend: sem conta → "Não configurada" + CTA.
    const status = await professorCard.getAttribute("data-status");
    expect(["NOT_CONFIGURED", "ONBOARDING_STARTED", "PENDING_VERIFICATION", "ACTION_REQUIRED", "VERIFIED", "BLOCKED"]).toContain(status);
    if (status === "NOT_CONFIGURED") {
      await expect(professorCard).toContainText("Não configurada");
      await expect(professorCard).toContainText(/repasse só é liberado/);
      await professorCard.getByRole("button", { name: "Cadastrar conta de recebimento" }).click();
      // Sem provedor configurado neste ambiente, o backend recusa com mensagem útil — e nada é marcado como verificado.
      await expect(professorCard.getByRole("alert")).toContainText(/provedor de pagamentos/i, { timeout: 20_000 });
      await expect(professorCard).toHaveAttribute("data-status", "NOT_CONFIGURED");
    }
  });

  test("Cenário B — atleta não vê a seção, e a rota do Perfil segue íntegra", async ({ page }) => {
    const aluno = ALUNOS[0];
    await login(page, aluno.email, aluno.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, aluno.name);
    await abrirPerfil(page);

    await expect(section(page)).toHaveCount(0);
    await expect(page.getByText("Conta de recebimento")).toHaveCount(0);
    // Ainda é o Perfil normal do atleta.
    await expect(page.getByRole("heading", { name: /Informações pessoais/i })).toBeVisible();
  });

  test("Cenário C — gestor da escola configura a conta DA ESCOLA (beneficiário explícito)", async ({ page }) => {
    await loginAsSchoolOwner(page, ESCOLA_1);
    await abrirPerfil(page);

    const schoolCard = page.locator('[data-testid="payout-account"][data-seller-type="SCHOOL"]');
    await expect(schoolCard).toHaveCount(1);
    await expect(schoolCard).toContainText(`Escola · ${ESCOLA_1.schoolName}`);
    // O dono da Alpha não tem CoachProfile: nenhuma conta pessoal de professor é criada/exibida.
    await expect(page.locator('[data-testid="payout-account"][data-seller-type="COACH"]')).toHaveCount(0);
  });

  test("Cenário D — o Marketplace aponta para o Perfil em vez de duplicar o formulário", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/marketplace`);
    await page.waitForLoadState("load");

    const aviso = page.getByText("Conta de recebimento não configurada").or(page.getByText("Verificação de recebimento pendente"));
    const temAviso = await aviso.first().isVisible({ timeout: 10_000 }).catch(() => false);
    if (temAviso) {
      const link = page.getByRole("link", { name: /Configurar no Perfil|Acompanhar no Perfil/ }).first();
      expect(await link.getAttribute("href")).toBe("/app/perfil#recebimento");
      await abrirPerfil(page);
      await expect(section(page)).toBeVisible();
    } else {
      // Conta já verificada no ambiente: não há aviso, e o Marketplace não tem formulário de conta.
      await expect(page.locator("form").filter({ hasText: /Cadastrar conta de recebimento/ })).toHaveCount(0);
    }
  });
});
