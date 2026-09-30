/**
 * SAM-10 — `/professor` (hub) e as telas sem escola do professor passam a
 * viver no shell padrão da Ryvano: header, sidebar do contexto Professor,
 * item ativo único e um caminho persistente de voltar/trocar de escola
 * (sidebar "Minhas escolas" no painel da escola + breadcrumb no topo).
 *
 * A navegação é feita pela UI real (links da sidebar/breadcrumb); o teste lê
 * `href` e navega em vez de `click()+waitForURL`, que no dev server expira
 * enquanto a rota compila.
 */
import { test, expect, type Page } from "@playwright/test";

import { ESCOLA_1, PROFESSOR_1 } from "./fixtures";
import { completeOnboarding } from "./helpers";

const sidebar = (page: Page) => page.locator("aside nav");
const activeItems = (page: Page) => sidebar(page).locator('a[aria-current="page"]');

async function abrir(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  await sidebar(page).waitFor({ state: "visible", timeout: 15_000 });
}

async function unicoAtivo(page: Page): Promise<string> {
  await expect(activeItems(page), "esperava exatamente um item ativo").toHaveCount(1);
  return ((await activeItems(page).first().textContent()) ?? "").trim();
}

async function hrefDaSidebar(page: Page, rotulo: string): Promise<string> {
  const href = await sidebar(page).locator("a", { hasText: rotulo }).first().getAttribute("href");
  expect(href, `sidebar deveria ter "${rotulo}"`).toBeTruthy();
  return href!;
}

/**
 * Login direto pelo endpoint E2E, sem passar por `/app/dashboard` (o helper
 * `login` visita o dashboard do atleta, a tela mais pesada do app, e isso
 * estourava o timeout no dev server). O schoolId vem do próprio hub.
 */
async function entrarComoProfessor(page: Page): Promise<string> {
  const response = await page.request.post("/api/e2e/login", {
    data: { email: PROFESSOR_1.email, password: PROFESSOR_1.password },
  });
  expect(response.ok(), `login E2E do professor: ${response.status()}`).toBe(true);

  await page.goto("/professor");
  await page.waitForLoadState("load");
  if (page.url().includes("/onboarding")) {
    await completeOnboarding(page, PROFESSOR_1.name);
    await page.goto("/professor");
    await page.waitForLoadState("load");
  }

  const href = await page.locator(`main a[href^="/professor/"]`).filter({ hasText: ESCOLA_1.schoolName }).first().getAttribute("href");
  const schoolId = href?.match(/^\/professor\/([^/?#]+)/)?.[1];
  expect(schoolId, "hub do professor deveria listar a Escola Alpha").toBeTruthy();
  return schoolId!;
}

test.describe("SAM-10 — hub do professor no shell padrão", () => {
  test.setTimeout(90_000);

  test("/professor tem header, sidebar, perfil e escolas; o hub é o item ativo", async ({ page }) => {
    await entrarComoProfessor(page);
    await abrir(page, "/professor");

    // Header padrão (menu do usuário + contexto) e sidebar do contexto Professor.
    await expect(page.getByTestId("user-menu")).toBeVisible();
    expect(await page.getByTestId("active-context").getAttribute("data-context-key")).toBe("professor");

    const rotulos = (await sidebar(page).locator("a").allTextContents()).map((t) => t.trim());
    expect(rotulos).toContain("Painel do professor");
    expect(rotulos).toContain("Vincular escola");
    expect(rotulos).toContain("Coach independente");
    // Nada de módulo de atleta nem de escola misturado.
    expect(rotulos).not.toContain("Atividades");
    expect(rotulos).not.toContain("Membros");

    expect(await unicoAtivo(page)).toContain("Painel do professor");

    // Conteúdo do hub preservado: nome do professor, badge e escolas vinculadas.
    await expect(page.getByRole("heading", { name: PROFESSOR_1.displayName })).toBeVisible();
    await expect(page.getByText("Professor ativo")).toBeVisible();
    await expect(page.getByText("Minhas escolas", { exact: false }).first()).toBeVisible();
    await expect(page.locator(`main a[href^="/professor/"]`).filter({ hasText: ESCOLA_1.schoolName }).first()).toBeVisible();
  });

  test("entrar na escola pela UI e voltar ao hub pela própria UI (sidebar e breadcrumb)", async ({ page }) => {
    const schoolId = await entrarComoProfessor(page);
    await abrir(page, "/professor");

    const hrefEscola = await page
      .locator(`main a[href="/professor/${schoolId}"]`)
      .first()
      .getAttribute("href");
    expect(hrefEscola).toBe(`/professor/${schoolId}`);

    await abrir(page, hrefEscola!);
    expect(page.url()).toContain(`/professor/${schoolId}`);
    expect(await unicoAtivo(page)).toContain("Dashboard");

    // Contexto/escola visíveis no header e no breadcrumb.
    await expect(page.getByTestId("active-context")).toContainText(ESCOLA_1.schoolName);
    const breadcrumb = page.getByRole("navigation", { name: "Contexto do professor" });
    await expect(breadcrumb).toContainText(ESCOLA_1.schoolName);

    // Voltar pela sidebar ("Minhas escolas") — sem botão Voltar do navegador.
    const voltarSidebar = await hrefDaSidebar(page, "Minhas escolas");
    expect(voltarSidebar).toBe("/professor");

    // E pelo breadcrumb.
    const voltarBreadcrumb = await breadcrumb.locator("a").first().getAttribute("href");
    expect(voltarBreadcrumb).toBe("/professor");

    await abrir(page, voltarSidebar);
    expect(page.url().replace(/\/$/, "")).toMatch(/\/professor$/);
    expect(await unicoAtivo(page)).toContain("Painel do professor");
  });

  test("Coach independente e Vincular escola são alcançáveis pela sidebar e mantêm o shell", async ({ page }) => {
    await entrarComoProfessor(page);
    await abrir(page, "/professor");

    const independente = await hrefDaSidebar(page, "Coach independente");
    await abrir(page, independente);
    expect(page.url()).toContain("/professor/independente");
    expect(await unicoAtivo(page)).toContain("Coach independente");
    await expect(page.getByTestId("user-menu")).toBeVisible();

    const vincular = await hrefDaSidebar(page, "Vincular escola");
    await abrir(page, vincular);
    expect(page.url()).toContain("/professor/buscar-escola");
    expect(await unicoAtivo(page)).toContain("Vincular escola");
    // O fluxo existente continua lá: campo de busca de escola.
    await expect(page.locator("input").first()).toBeVisible();

    // Os cards do hub não são o único caminho: a sidebar leva de volta.
    const hub = await hrefDaSidebar(page, "Painel do professor");
    expect(hub).toBe("/professor");
  });

  test("cada item da sidebar do hub ativa somente a si mesmo", async ({ page }) => {
    await entrarComoProfessor(page);
    await abrir(page, "/professor");

    const links = await sidebar(page).locator("a").all();
    const secoes: { href: string; label: string }[] = [];
    for (const link of links) {
      const href = await link.getAttribute("href");
      const label = ((await link.textContent()) ?? "").trim();
      if (href) secoes.push({ href, label });
    }
    expect(secoes.length).toBeGreaterThan(2);

    for (const secao of secoes) {
      await abrir(page, secao.href);
      expect(await unicoAtivo(page), `${secao.href} deveria ativar "${secao.label}"`).toContain(secao.label);
    }
  });

  test("navegação por teclado alcança a sidebar e o item ativo é semântico", async ({ page }) => {
    await entrarComoProfessor(page);
    await abrir(page, "/professor");

    const ativo = activeItems(page).first();
    await expect(ativo).toHaveAttribute("aria-current", "page");
    await ativo.focus();
    await expect(ativo).toBeFocused();
    await page.keyboard.press("Tab");
    const focado = await page.evaluate(() => document.activeElement?.tagName ?? "");
    expect(["A", "BUTTON"]).toContain(focado);
  });

  test("mobile: header acessível e o dock traz os itens do hub", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      await entrarComoProfessor(page);
      await page.goto("/professor");
      await page.waitForLoadState("load");

      await expect(page.getByTestId("user-menu")).toBeVisible();
      const dock = page.getByRole("navigation", { name: "Navegação inferior" });
      await dock.waitFor({ state: "visible", timeout: 15_000 });
      const itens = await dock.locator("button[aria-label]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
      expect(itens).toContain("Painel do professor");
      expect(itens).toContain("Coach independente");
      expect(itens).not.toContain("Atividades");

      // Sem overflow horizontal.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow).toBe(false);
    } finally {
      await mobile.close();
    }
  });
});
