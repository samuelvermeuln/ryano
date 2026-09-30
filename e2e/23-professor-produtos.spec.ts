/**
 * SAM-12 — gestão de produtos do professor.
 *
 * Fluxo desejado: Professor → Meus produtos → Novo produto → salvar → produto
 * criado, tudo dentro do shell da Ryvano e sem passar pela vitrine do
 * Marketplace. As rotas antigas `/professor/estudio/planos*` redirecionam.
 *
 * Pré-condição de domínio (não é atalho do fluxo): o wizard exige ao menos um
 * template de treino do professor para montar a sessão do plano. Se o fixture
 * não tiver nenhum, o teste cria um pelo endpoint público
 * `POST /api/workout-templates` (a mesma API que a UI de templates usa). O
 * PRODUTO em si é sempre criado pela UI.
 */
import { test, expect, type Page } from "@playwright/test";

import { PROFESSOR_1 } from "./fixtures";
import { completeOnboarding } from "./helpers";

const sidebar = (page: Page) => page.locator("aside nav");
const activeItems = (page: Page) => sidebar(page).locator('a[aria-current="page"]');
const TITULO = "Produto E2E — base de corrida (SAM-12)";

async function abrir(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  await sidebar(page).waitFor({ state: "visible", timeout: 15_000 });
}

async function entrarComoProfessor(page: Page) {
  const response = await page.request.post("/api/e2e/login", {
    data: { email: PROFESSOR_1.email, password: PROFESSOR_1.password },
  });
  expect(response.ok(), `login E2E do professor: ${response.status()}`).toBe(true);
  await page.goto("/professor");
  await page.waitForLoadState("load");
  if (page.url().includes("/onboarding")) {
    await completeOnboarding(page, PROFESSOR_1.name);
  }
}

/** Garante um template de treino do professor (pré-condição do editor de plano). */
async function garantirTemplate(page: Page) {
  await page.goto("/professor/estudio/produtos/novo");
  await page.waitForLoadState("load");
  const semTemplates = await page.getByText(/nenhum template de treino/i).isVisible({ timeout: 3_000 }).catch(() => false);
  if (!semTemplates) return;

  const res = await page.request.post("/api/workout-templates", {
    data: { ownerType: "COACH", title: "Template E2E — rodagem leve", sportType: "run", status: "ACTIVE" },
  });
  expect(res.status(), `criar template: ${await res.text()}`).toBe(201);
}

test.describe("SAM-12 — produtos do professor", () => {
  test.setTimeout(120_000);

  test("Cenário A — Meus produtos é acessível pela sidebar, no shell, sem passar pelo Marketplace", async ({ page }) => {
    await entrarComoProfessor(page);
    await abrir(page, "/professor");

    const href = await sidebar(page).locator("a", { hasText: "Meus produtos" }).first().getAttribute("href");
    expect(href).toBe("/professor/estudio/produtos");

    await abrir(page, href!);
    await expect(page.getByRole("heading", { name: "Meus produtos" })).toBeVisible();
    await expect(page.getByTestId("user-menu")).toBeVisible();
    await expect(activeItems(page)).toHaveCount(1);
    expect((await activeItems(page).first().textContent())?.trim()).toBe("Meus produtos");
    await expect(page.getByRole("link", { name: "Novo produto" })).toBeVisible();
    // Terminologia: nada de "Meus planos" no título/menu desta área.
    await expect(page.getByRole("heading", { name: "Meus planos" })).toHaveCount(0);
  });

  test("Cenário B — criar produto pela UI e vê-lo na gestão com os dados salvos", async ({ page }) => {
    await entrarComoProfessor(page);
    await garantirTemplate(page);

    await abrir(page, "/professor/estudio/produtos");
    const novo = await page.getByRole("link", { name: "Novo produto" }).getAttribute("href");
    expect(novo).toBe("/professor/estudio/produtos/novo");
    await abrir(page, novo!);

    // Breadcrumb/contexto coerente.
    const trilha = page.getByRole("navigation", { name: "Trilha de navegação" });
    await expect(trilha).toContainText("Meus produtos");
    await expect(trilha).toContainText("Novo produto");
    await expect(page.getByRole("heading", { name: "Novo produto" })).toBeVisible();

    // Passo 1 — dados básicos.
    await page.getByLabel("Título do produto").fill(TITULO);
    await page.getByLabel("Descrição").fill("Criado pelo E2E do SAM-12.");
    const continuar = page.getByRole("button", { name: "Continuar para o editor" });
    await expect(continuar).toBeEnabled({ timeout: 10_000 });
    await continuar.click();

    // Passo 2 — um dia com uma sessão, salvar rascunho.
    await expect(page.getByRole("heading", { name: /Montar o plano/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^\+ Seg/ }).first().click();
    await page.getByRole("button", { name: /^\+ sessão/ }).first().click();
    const salvar = page.getByRole("button", { name: "Salvar rascunho" });
    await expect(salvar).toBeEnabled();
    await salvar.click();

    // Feedback claro + caminho para o produto e para a gestão (sem tela sem contexto).
    const status = page.getByRole("status");
    await expect(status).toContainText(/Rascunho salvo/, { timeout: 15_000 });
    const abrirProduto = await status.getByRole("link", { name: "Abrir produto" }).getAttribute("href");
    expect(abrirProduto).toMatch(/^\/professor\/estudio\/produtos\/[^/]+$/);

    // Aparece na gestão.
    await abrir(page, "/professor/estudio/produtos");
    const card = page.locator(`main a[href="${abrirProduto}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(TITULO);
    await expect(card).toContainText("Rascunho");

    // Abrir o produto: dados salvos, breadcrumb e shell.
    await abrir(page, abrirProduto!);
    await expect(page.getByRole("heading", { name: TITULO })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Trilha de navegação" })).toContainText("Meus produtos");
    await expect(page.getByLabel(/Título/).first()).toHaveValue(TITULO);
    await expect(activeItems(page)).toHaveCount(1);
  });

  test("Cenário C — o Voltar do cadastro leva para Meus produtos", async ({ page }) => {
    await entrarComoProfessor(page);
    await abrir(page, "/professor/estudio/produtos/novo");

    const voltar = page.getByRole("navigation", { name: "Trilha de navegação" }).getByRole("link", { name: /Meus produtos/ });
    expect(await voltar.getAttribute("href")).toBe("/professor/estudio/produtos");
    await abrir(page, (await voltar.getAttribute("href"))!);
    await expect(page.getByRole("heading", { name: "Meus produtos" })).toBeVisible();
  });

  test("Cenário D — Marketplace segue como vitrine e oferece atalho para a gestão", async ({ page }) => {
    await entrarComoProfessor(page);

    // Vitrine pública continua funcionando.
    await page.goto("/marketplace");
    await page.waitForLoadState("load");
    expect(page.url()).toContain("/marketplace");
    await expect(page.locator("body")).not.toContainText(/Application error/i);

    // "Minhas vendas" do professor: atalhos, não porta única.
    await abrir(page, "/professor");
    const escola = await page.locator(`main a[href^="/professor/"]`).first().getAttribute("href");
    const schoolId = escola?.match(/^\/professor\/([^/?#]+)/)?.[1];
    expect(schoolId).toBeTruthy();
    await abrir(page, `/professor/${schoolId}/marketplace`);
    await expect(page.getByRole("heading", { name: "Minhas vendas" })).toBeVisible();
    expect(await page.getByRole("link", { name: "Meus produtos" }).first().getAttribute("href")).toBe("/professor/estudio/produtos");
    expect(await page.getByRole("link", { name: "Novo produto" }).first().getAttribute("href")).toBe("/professor/estudio/produtos/novo");
  });

  test("Cenário E — rotas antigas redirecionam sem loop", async ({ page }) => {
    await entrarComoProfessor(page);

    await page.goto("/professor/estudio/planos");
    await page.waitForURL(/\/professor\/estudio\/produtos$/, { timeout: 20_000 });

    await page.goto("/professor/estudio/planos/novo");
    await page.waitForURL(/\/professor\/estudio\/produtos\/novo$/, { timeout: 20_000 });

    await page.goto("/professor/estudio/planos/abc123");
    await page.waitForURL(/\/professor\/estudio\/produtos\/abc123$/, { timeout: 20_000 });
    // Produto inexistente → 404 da tela nova, não um loop.
    await expect(page.locator("body")).toContainText(/não encontrad|404/i);
  });

  test("Cenário F — mobile: abrir produtos, cadastro, voltar e vendas", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      await entrarComoProfessor(page);
      await page.goto("/professor/estudio/produtos");
      await page.waitForLoadState("load");
      await expect(page.getByRole("heading", { name: "Meus produtos" })).toBeVisible();
      const dock = page.getByRole("navigation", { name: "Navegação inferior" });
      await dock.waitFor({ state: "visible", timeout: 15_000 });
      expect(await dock.locator('button[aria-label="Meus produtos"]').count()).toBe(1);

      await page.goto("/professor/estudio/produtos/novo");
      await page.waitForLoadState("load");
      await expect(page.getByRole("heading", { name: "Novo produto" })).toBeVisible();
      const voltar = page.getByRole("navigation", { name: "Trilha de navegação" }).getByRole("link", { name: /Meus produtos/ });
      await expect(voltar).toBeVisible();

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow).toBe(false);
    } finally {
      await mobile.close();
    }
  });
});
