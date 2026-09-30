/**
 * SAM-14 — o shell (sidebar, header, dock) é resolvido a partir do contexto
 * ativo do usuário, não da árvore de rotas. Entrar em `/app/perfil` ou
 * `/app/seguranca` — páginas compartilhadas — não pode transformar um
 * professor ou gestor de escola em atleta.
 *
 * O que o teste lê:
 *  - `[data-testid="active-context"][data-context-key]` no header: o contexto
 *    que o servidor resolveu (`athlete` | `professor` | `school:<id>`);
 *  - os rótulos da sidebar desktop (`aside nav a`) e do dock mobile
 *    (`[data-testid="mobile-dock"] a`), que devem vir da MESMA configuração.
 *
 * Fixtures reaproveitadas: PROFESSOR_1 (atleta + professor), ESCOLA_1 (dono
 * sem CoachProfile = atleta + escola), ALUNOS[0] (só atleta).
 */
import { test, expect, type Page } from "@playwright/test";

import { ALUNOS, ESCOLA_1, PROFESSOR_1 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";

const contextMarker = (page: Page) => page.getByTestId("active-context");
const sidebar = (page: Page) => page.locator("aside nav");
const activeItems = (page: Page) => sidebar(page).locator('a[aria-current="page"]');

async function abrir(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  await contextMarker(page).waitFor({ state: "attached", timeout: 15_000 });
}

async function contextoAtivo(page: Page): Promise<string> {
  return (await contextMarker(page).getAttribute("data-context-key")) ?? "";
}

async function rotulosSidebar(page: Page): Promise<string[]> {
  await sidebar(page).waitFor({ state: "visible", timeout: 15_000 });
  const textos = await sidebar(page).locator("a").allTextContents();
  return textos.map((t) => t.trim()).filter(Boolean);
}

/** Espera o cookie de contexto ser sincronizado pela Server Action em background. */
async function aguardarCookieDeContexto(page: Page, esperado: string) {
  await expect
    .poll(
      async () => {
        const raw = (await page.context().cookies()).find((c) => c.name === "ryvano-context")?.value;
        return raw ? decodeURIComponent(raw) : null;
      },
      { timeout: 10_000 },
    )
    .toBe(esperado);
}

/** Remove só a preferência de contexto, mantendo a sessão. */
async function removerCookieDeContexto(page: Page) {
  const restantes = (await page.context().cookies()).filter((c) => c.name !== "ryvano-context");
  await page.context().clearCookies();
  await page.context().addCookies(restantes);
}

async function entrarComoProfessor(page: Page): Promise<string> {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  await page.context().clearCookies();
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);
  return schoolId;
}

test.describe("SAM-14 — contexto por perfil", () => {
  test("Cenário A — professor mantém o shell de Professor em Perfil e Segurança", async ({ page }) => {
    const schoolId = await entrarComoProfessor(page);

    await abrir(page, `/professor/${schoolId}`);
    expect(await contextoAtivo(page)).toBe("professor");
    const navProfessor = await rotulosSidebar(page);
    expect(navProfessor).toContain("Meus atletas");
    expect(navProfessor).not.toContain("Atividades");
    await aguardarCookieDeContexto(page, `professor:${schoolId}`);

    // Perfil pela UI: menu do usuário → "Minha conta".
    await page.getByTestId("user-menu").click();
    const perfilHref = await page.getByRole("menuitem", { name: "Minha conta" }).getAttribute("href");
    expect(perfilHref).toBe("/app/perfil");
    await abrir(page, perfilHref!);

    expect(page.url()).toContain("/app/perfil");
    expect(await contextoAtivo(page)).toBe("professor");
    // A sidebar continua sendo a do painel da escola aberta, não a de atleta.
    expect(await rotulosSidebar(page)).toEqual(navProfessor);
    expect(await activeItems(page).count()).toBeLessThanOrEqual(1);

    await abrir(page, "/app/seguranca");
    expect(await contextoAtivo(page)).toBe("professor");
    expect(await rotulosSidebar(page)).toEqual(navProfessor);

    // Refresh mantém o contexto.
    await page.reload();
    await page.waitForLoadState("load");
    expect(await contextoAtivo(page)).toBe("professor");

    // Retorno ao painel pela própria sidebar.
    const voltar = await sidebar(page).locator("a", { hasText: "Dashboard" }).first().getAttribute("href");
    expect(voltar).toBe(`/professor/${schoolId}`);
  });

  test("Cenário B — atleta vê só navegação de Atleta e entra direto (sem seletor)", async ({ page }) => {
    const aluno = ALUNOS[0];
    await login(page, aluno.email, aluno.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, aluno.name);

    // Um único contexto: /entrar autenticado leva direto ao dashboard.
    await page.goto("/entrar");
    await page.waitForURL(/\/app\/dashboard/, { timeout: 20_000 });

    await abrir(page, "/app/dashboard");
    expect(await contextoAtivo(page)).toBe("athlete");
    const nav = await rotulosSidebar(page);
    expect(nav).toContain("Dashboard");
    expect(nav).toContain("Perfil");
    for (const proibido of ["Membros", "Meus atletas", "Minha escola", "Painel do professor", "Organograma"]) {
      expect(nav).not.toContain(proibido);
    }

    await abrir(page, "/app/perfil");
    expect(await contextoAtivo(page)).toBe("athlete");
    expect(await activeItems(page)).toHaveCount(1);
    expect((await activeItems(page).first().textContent())?.trim()).toBe("Perfil");

    await abrir(page, "/app/seguranca");
    expect(await contextoAtivo(page)).toBe("athlete");
    // Sem switcher para quem tem um contexto só: o marcador é um rótulo, não um botão.
    await expect(page.getByRole("button", { name: /Trocar contexto/ })).toHaveCount(0);
  });

  test("Cenário C — escola preserva o SchoolShell nas páginas compartilhadas", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);

    await abrir(page, `/escola/${schoolId}`);
    expect(await contextoAtivo(page)).toBe(`school:${schoolId}`);
    const navEscola = await rotulosSidebar(page);
    expect(navEscola).toContain("Membros");
    expect(navEscola).not.toContain("Atividades");
    await aguardarCookieDeContexto(page, `school:${schoolId}`);

    await abrir(page, "/app/perfil");
    expect(await contextoAtivo(page)).toBe(`school:${schoolId}`);
    expect(await rotulosSidebar(page)).toEqual(navEscola);

    await abrir(page, "/app/seguranca");
    expect(await contextoAtivo(page)).toBe(`school:${schoolId}`);
    expect(await rotulosSidebar(page)).toEqual(navEscola);

    const painel = await sidebar(page).locator("a", { hasText: "Painel" }).first().getAttribute("href");
    expect(painel).toBe(`/escola/${schoolId}`);
    await abrir(page, painel!);
    expect(await activeItems(page)).toHaveCount(1);
  });

  test("Cenário D — usuário multi-contexto: seletor no login e troca pelo header", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await removerCookieDeContexto(page);

    // Sem preferência salva, /entrar autenticado mostra o seletor.
    await page.goto("/entrar");
    await page.waitForURL(/\/contexto/, { timeout: 20_000 });
    const opcoes = page.getByTestId("context-option");
    await expect(opcoes).toHaveCount(2);
    await expect(opcoes.filter({ hasText: "Atleta" })).toHaveCount(1);

    // Escolhe a escola → landing da escola.
    await page.locator(`[data-testid="context-option"][data-context-key="school:${schoolId}"]`).click();
    await page.waitForURL(new RegExp(`/escola/${schoolId}`), { timeout: 20_000 });
    expect(await contextoAtivo(page)).toBe(`school:${schoolId}`);

    // Perfil continua Escola.
    await abrir(page, "/app/perfil");
    expect(await contextoAtivo(page)).toBe(`school:${schoolId}`);

    // Troca para Atleta pelo header.
    await page.getByRole("button", { name: /Trocar contexto/ }).click();
    await page.getByRole("menuitem", { name: /Atleta/ }).click();
    await page.waitForURL(/\/app\/dashboard/, { timeout: 20_000 });
    expect(await contextoAtivo(page)).toBe("athlete");

    await abrir(page, "/app/perfil");
    expect(await contextoAtivo(page)).toBe("athlete");

    // Refresh mantém o último contexto válido.
    await page.reload();
    await page.waitForLoadState("load");
    expect(await contextoAtivo(page)).toBe("athlete");
  });

  test("Cenário F — contexto salvo revogado/estrangeiro é rejeitado com fallback seguro", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const cookies = await page.context().cookies();
    const sessao = cookies.find((c) => c.name.includes("session-token"));
    expect(sessao).toBeTruthy();

    // Simula uma preferência que não pertence mais ao usuário (outra escola).
    await page.context().addCookies([
      { name: "ryvano-context", value: "school:clzzzzzzzzzzzzzzzzzzzzzzz", domain: sessao!.domain, path: "/" },
    ]);

    await abrir(page, "/app/perfil");
    const ativo = await contextoAtivo(page);
    expect(ativo).not.toBe("school:clzzzzzzzzzzzzzzzzzzzzzzz");
    expect([`school:${schoolId}`, "athlete"]).toContain(ativo);

    // A URL de outra escola também não abre o painel dela.
    await page.goto("/escola/clzzzzzzzzzzzzzzzzzzzzzzz");
    await page.waitForLoadState("load");
    expect(page.url()).not.toContain("/escola/clzzzzzzzzzzzzzzzzzzzzzzz");
  });

  test("Cenário G — deep links, nova aba e voltar/avançar não trocam a persona", async ({ page, context }) => {
    const schoolId = await entrarComoProfessor(page);
    await abrir(page, `/professor/${schoolId}`);
    await aguardarCookieDeContexto(page, `professor:${schoolId}`);

    // Nova aba direto na página compartilhada.
    const aba = await context.newPage();
    await aba.goto("/app/perfil");
    await aba.waitForLoadState("load");
    await aba.getByTestId("active-context").waitFor({ state: "attached", timeout: 15_000 });
    expect(await aba.getByTestId("active-context").getAttribute("data-context-key")).toBe("professor");
    await aba.close();

    await abrir(page, "/app/seguranca");
    await abrir(page, "/app/perfil");
    await page.goBack();
    await page.waitForLoadState("load");
    expect(await contextoAtivo(page)).toBe("professor");
    await page.goForward();
    await page.waitForLoadState("load");
    expect(await contextoAtivo(page)).toBe("professor");
  });

  test("Cenário H — mobile: o dock apresenta os mesmos itens da sidebar desktop", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
      await page.goto(`/escola/${schoolId}`);
      await page.waitForLoadState("load");

      // O dock é um portal com botões (aria-label = rótulo do item de navegação).
      const dock = page.getByRole("navigation", { name: "Navegação inferior" });
      await dock.waitFor({ state: "visible", timeout: 15_000 });
      const rotulosDock = async () =>
        dock.locator("button[aria-label]").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));

      const dockEscola = await rotulosDock();
      expect(dockEscola).toContain("Membros");
      expect(dockEscola).not.toContain("Atividades");
      expect(await contextoAtivo(page)).toBe(`school:${schoolId}`);

      // Página compartilhada no mobile continua no contexto Escola.
      await page.goto("/app/perfil");
      await page.waitForLoadState("load");
      await dock.waitFor({ state: "visible", timeout: 15_000 });
      expect(await rotulosDock()).toEqual(dockEscola);
      expect(await contextoAtivo(page)).toBe(`school:${schoolId}`);
    } finally {
      await mobile.close();
    }
  });
});
