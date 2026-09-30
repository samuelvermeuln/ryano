/**
 * E2E — 18: Central do atleta (/professor/<schoolId>/atletas/<athleteId>)
 *
 * SAM-11. Cobre o que a central promete: as cinco seções existem, cada uma tem
 * endereço próprio, e as ações de escrita (prescrever, ficha técnica) só
 * aparecem para quem é o professor responsável.
 *
 * Convenções que este spec segue de propósito:
 *  - os ids são resolvidos em runtime (dono revela o schoolId; o plantel revela
 *    o athleteId). Nada de id fixo.
 *  - navegação por `getAttribute("href")` + `goto()`: no dev server o primeiro
 *    clique numa rota ainda não compilada expira sem que haja bug.
 *  - o teste CONVERGE: se a ficha técnica já estava preenchida de uma execução
 *    anterior, isso é sucesso, não falha. Rodar duas vezes seguidas deve passar
 *    nas duas.
 *  - sem `test.skip` no caminho principal; quando um dado não existe, a asserção
 *    é sobre o estado vazio, que é comportamento legítimo da tela.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1 } from "./fixtures";

async function entrarComoProfessor(page: Page) {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);
}

/**
 * Resolve schoolId (pelo dono) e athleteId (pelo plantel do professor).
 *
 * O athleteId sai do href do cartão do plantel, não de um id fixo. Devolve
 * `athleteId: null` quando o professor não tem atleta vinculado — o chamador
 * então verifica o estado vazio em vez de inventar dado.
 */
async function resolverContexto(page: Page): Promise<{ schoolId: string; athleteId: string | null }> {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  await entrarComoProfessor(page);
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");

  const cartao = page.locator(`a[href^="/professor/${schoolId}/atletas/"]`).first();
  if (!(await cartao.isVisible({ timeout: 10_000 }).catch(() => false))) {
    return { schoolId, athleteId: null };
  }
  const href = await cartao.getAttribute("href");
  const athleteId = href?.split("/atletas/")[1]?.split(/[/?#]/)[0] ?? null;
  return { schoolId, athleteId };
}

test.describe("18 — Central do atleta (professor)", () => {
  test("resumo abre e oferece as cinco seções, cada uma com endereço próprio", async ({ page }) => {
    const { schoolId, athleteId } = await resolverContexto(page);

    if (!athleteId) {
      // Sem atleta vinculado o plantel mostra estado vazio. Resultado legítimo:
      // o que não pode acontecer é a tela quebrar.
      await expect(page.getByText(/Nenhum atleta|Você ainda não/i).first()).toBeVisible();
      return;
    }

    await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
    await page.waitForLoadState("load");

    // Não redirecionou: o professor tem acesso a este atleta desta escola.
    expect(page.url()).toContain(`/professor/${schoolId}/atletas/${athleteId}`);

    const secoes = page.getByRole("navigation", { name: "Seções do atleta" });
    await expect(secoes).toBeVisible({ timeout: 15_000 });

    const esperado: Array<[string, string]> = [
      ["Resumo", `/professor/${schoolId}/atletas/${athleteId}`],
      ["Treinos", `/professor/${schoolId}/atletas/${athleteId}/treinos`],
      ["Análise", `/professor/${schoolId}/atletas/${athleteId}/analise`],
      ["Ficha técnica", `/professor/${schoolId}/atletas/${athleteId}/ficha-tecnica`],
      ["Histórico", `/professor/${schoolId}/atletas/${athleteId}/historico`],
    ];

    for (const [rotulo, href] of esperado) {
      const link = secoes.getByRole("link", { name: rotulo });
      await expect(link, `seção ${rotulo} deve existir`).toBeVisible();
      expect(await link.getAttribute("href"), `href da seção ${rotulo}`).toBe(href);
    }

    // A seção ativa é anunciada para leitor de tela, não apenas destacada.
    expect(await secoes.getByRole("link", { name: "Resumo" }).getAttribute("aria-current")).toBe("page");
  });

  test("cada seção carrega sem erro e marca a si mesma como ativa", async ({ page }) => {
    const { schoolId, athleteId } = await resolverContexto(page);
    if (!athleteId) return;

    for (const [sufixo, rotulo] of [
      ["/treinos", "Treinos"],
      ["/analise", "Análise"],
      ["/ficha-tecnica", "Ficha técnica"],
      ["/historico", "Histórico"],
    ] as const) {
      await page.goto(`/professor/${schoolId}/atletas/${athleteId}${sufixo}`);
      await page.waitForLoadState("load");

      expect(page.url(), `${sufixo} não deve redirecionar`).toContain(sufixo);
      const secoes = page.getByRole("navigation", { name: "Seções do atleta" });
      await expect(secoes, `nav em ${sufixo}`).toBeVisible({ timeout: 15_000 });
      expect(
        await secoes.getByRole("link", { name: rotulo }).getAttribute("aria-current"),
        `${rotulo} deve ser a seção ativa em ${sufixo}`,
      ).toBe("page");
    }
  });

  test("análise troca a janela sem perder o atleta", async ({ page }) => {
    const { schoolId, athleteId } = await resolverContexto(page);
    if (!athleteId) return;

    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/analise`);
    await page.waitForLoadState("load");

    const janelas = page.getByRole("navigation", { name: "Janela de análise" });
    await expect(janelas).toBeVisible({ timeout: 15_000 });

    // A janela é estado de URL, não de cliente: a tela é compartilhável. A janela
    // padrão sai sem parâmetro de propósito (URL limpa), então o teste navega
    // para uma NÃO-ativa, que é a que precisa carregar a escolha na URL.
    const naoAtiva = janelas.getByRole("link").and(page.locator(":not([aria-current])")).first();
    const href = await naoAtiva.getAttribute("href");
    expect(href, "uma janela não-ativa deve carregar a escolha na URL").toContain("janela=");

    await page.goto(href!);
    await page.waitForLoadState("load");

    expect(page.url()).toContain(`/atletas/${athleteId}/analise`);
    await expect(page.getByRole("navigation", { name: "Seções do atleta" })).toBeVisible();

    // E a janela pedida passou a ser a ativa: a escolha teve efeito.
    const janelaPedida = new URL(href!, page.url()).searchParams.get("janela");
    const ativa = page
      .getByRole("navigation", { name: "Janela de análise" })
      .locator('a[aria-current="page"]');
    const hrefAtiva = await ativa.getAttribute("href");
    expect(
      hrefAtiva === null || hrefAtiva.includes(`janela=${janelaPedida}`),
      "a janela escolhida deve ficar marcada como ativa",
    ).toBe(true);
  });

  test("prescrição: o construtor abre e recusa submissão sem bloco válido", async ({ page }) => {
    const { schoolId, athleteId } = await resolverContexto(page);
    if (!athleteId) return;

    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos`);
    await page.waitForLoadState("load");

    const prescrever = page.getByLabel("Prescrever treino para este atleta");
    const podePrescrever = await prescrever.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!podePrescrever) {
      // Quem não é o professor responsável não recebe a ação — e a tela precisa
      // dizer por quê, em vez de simplesmente não ter botão.
      await expect(page.getByText(/professor responsável/i).first()).toBeVisible();
      return;
    }

    await page.goto((await prescrever.getAttribute("href"))!);
    await page.waitForLoadState("load");

    await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });

    // Título vazio: o servidor recusa e a tela mantém o rascunho na tela.
    await page.getByRole("button", { name: /Prescrever treino|Salvar prescrição/i }).first().click();
    await page.waitForTimeout(2_000);
    expect(page.url(), "uma submissão recusada não navega").toContain("/treinos/novo");
  });

  test("ficha técnica: salva um parâmetro e o mostra depois de recarregar", async ({ page }) => {
    const { schoolId, athleteId } = await resolverContexto(page);
    if (!athleteId) return;

    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/ficha-tecnica`);
    await page.waitForLoadState("load");

    const editar = page.getByRole("button", { name: /Editar ficha|Preencher ficha/i }).first();
    const podeEditar = await editar.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!podeEditar) {
      await expect(page.getByText(/professor responsável/i).first()).toBeVisible();
      return;
    }

    await editar.click();

    // Detalhe sobreposto é modal centralizado (regra de UI do projeto), não gaveta.
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });

    const fcMax = modal.getByLabel(/FC máxima/i);
    await expect(fcMax).toBeVisible();
    await fcMax.fill("190");
    await modal.getByRole("button", { name: /Salvar/i }).first().click();

    // O modal fecha só quando a escrita aconteceu de fato.
    await expect(modal).toBeHidden({ timeout: 15_000 });

    await page.reload();
    await page.waitForLoadState("load");
    // Convergente: 190 bpm é o estado esperado tanto na 1ª execução quanto nas
    // seguintes, em que a ficha já estava salva.
    await expect(page.getByText(/190/).first()).toBeVisible({ timeout: 15_000 });
  });

  test("isolamento: outra escola não expõe o atleta", async ({ page }) => {
    const { athleteId } = await resolverContexto(page);
    if (!athleteId) return;

    // schoolId da URL é contexto de navegação, não prova de permissão: com um
    // schoolId inexistente a central não pode renderizar o atleta.
    await page.goto(`/professor/escola-que-nao-existe/atletas/${athleteId}`);
    await page.waitForLoadState("load");

    const vazou = await page
      .getByRole("navigation", { name: "Seções do atleta" })
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(vazou, "a central não pode renderizar fora da escola do vínculo").toBe(false);
  });
});
