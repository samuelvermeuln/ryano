/**
 * E2E — 17: Adicionar membro em modal (/escola/<id>/membros) — SAM-6
 *
 * O ponto do spec é que a admissão acontece *sobre* a tela de membros: o que
 * prova isso não é o diálogo aparecer, é a URL continuar a mesma. Um teste que
 * só olhasse o formulário passaria igual com a navegação que existia antes.
 *
 * Idempotência: a suíte roda duas vezes seguidas na mesma base. O alvo do
 * cadastro é o PROFESSOR_3 das fixtures (o único sem escola), e o teste
 * converge — se ele já é membro de uma execução anterior, o estado final
 * esperado já está satisfeito e a asserção é sobre a lista, não sobre ter
 * acabado de criar o vínculo.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner } from "./helpers";
import { ESCOLA_1, PROFESSOR_3 } from "./fixtures";

/** Usuário que com certeza não existe — usado para provar a exibição de erro. */
const EMAIL_INEXISTENTE = "ninguem.mesmo@ryvano-e2e.test";

async function abrirMembros(page: Page): Promise<string> {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  await page.goto(`/escola/${schoolId}/membros`);
  await page.waitForLoadState("load");
  return schoolId;
}

function gatilho(page: Page) {
  // Por nome acessível, não por texto: o menu lateral rouba clique por texto,
  // e enquanto o modal está aberto o botão de confirmar se chama "Adicionar".
  return page.getByRole("button", { name: "Adicionar membro" });
}

function dialogo(page: Page) {
  return page.getByRole("dialog");
}

async function abrirModal(page: Page) {
  await gatilho(page).click();
  const modal = dialogo(page);
  await expect(modal).toBeVisible({ timeout: 10_000 });
  return modal;
}

/** Linha da tabela de membros correspondente a um e-mail. */
function linhaDoMembro(page: Page, email: string) {
  return page.locator("tbody tr").filter({ hasText: email });
}

test.describe.configure({ mode: "serial" });

test.describe("17 — Adicionar membro em modal", () => {
  test("O gatilho abre um modal centralizado sem sair da rota", async ({ page }) => {
    const schoolId = await abrirMembros(page);
    const urlAntes = page.url();

    // Antes do clique não existe diálogo nenhum na tela.
    await expect(dialogo(page)).toHaveCount(0);

    const modal = await abrirModal(page);

    // O critério de aceite central: nem navegação, nem reload.
    expect(page.url()).toBe(urlAntes);
    expect(page.url()).toContain(`/escola/${schoolId}/membros`);

    await expect(modal).toHaveAttribute("aria-modal", "true");
    await expect(modal.getByRole("heading", { name: "Adicionar membro" })).toBeVisible();

    // Centralizado, não gaveta colada na borda (architecture/rules/ui.md): as
    // duas folgas laterais existem e são equivalentes.
    const viewport = page.viewportSize()!;
    const box = (await modal.boundingBox())!;
    const folgaEsquerda = box.x;
    const folgaDireita = viewport.width - (box.x + box.width);
    expect(folgaEsquerda).toBeGreaterThan(0);
    expect(Math.abs(folgaEsquerda - folgaDireita)).toBeLessThan(4);
  });

  test("O modal traz os campos do fluxo existente", async ({ page }) => {
    await abrirMembros(page);
    const modal = await abrirModal(page);

    const email = modal.getByLabel("E-mail da pessoa");
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute("type", "email");

    // Os papéis são os atribuíveis pela UI; OWNER não é um deles.
    await expect(modal.getByRole("checkbox", { name: "Atleta" })).toBeVisible();
    await expect(modal.getByRole("checkbox", { name: "Professor", exact: true })).toBeVisible();
    await expect(modal.getByRole("checkbox", { name: "Proprietário" })).toHaveCount(0);

    await expect(modal.getByRole("button", { name: "Adicionar", exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Cancelar" })).toBeVisible();
  });

  test("Cancelar fecha sem salvar, e reabrir começa em branco", async ({ page }) => {
    await abrirMembros(page);
    const membrosAntes = await page.locator("tbody tr").count();

    let modal = await abrirModal(page);
    await modal.getByLabel("E-mail da pessoa").fill("digitado.e.descartado@ryvano-e2e.test");
    await modal.getByRole("checkbox", { name: "Atleta" }).check();
    await modal.getByRole("button", { name: "Cancelar" }).click();

    await expect(dialogo(page)).toHaveCount(0);
    // Nada foi gravado: a lista não mudou de tamanho.
    await page.waitForTimeout(1_000);
    expect(await page.locator("tbody tr").count()).toBe(membrosAntes);

    // Reabrir parte de defaults limpos — o que foi digitado não volta.
    modal = await abrirModal(page);
    await expect(modal.getByLabel("E-mail da pessoa")).toHaveValue("");
    await expect(modal.getByRole("checkbox", { name: "Atleta" })).not.toBeChecked();
  });

  test("Campo obrigatório vazio não submete e o modal permanece aberto", async ({ page }) => {
    await abrirMembros(page);
    const modal = await abrirModal(page);

    // E-mail vazio: a validação nativa do campo obrigatório barra o envio.
    await modal.getByRole("button", { name: "Adicionar", exact: true }).click();
    await page.waitForTimeout(1_000);
    await expect(modal).toBeVisible();

    const email = modal.getByLabel("E-mail da pessoa");
    const validoVazio = await email.evaluate((el) => (el as HTMLInputElement).checkValidity());
    expect(validoVazio, "e-mail vazio não deve passar pela validação do campo").toBe(false);

    // Com e-mail e sem papel, a regra é do servidor e volta como mensagem.
    await email.fill(PROFESSOR_3.email);
    await modal.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(modal.getByRole("alert")).toContainText(/ao menos um papel/i, {
      timeout: 15_000,
    });
    await expect(modal).toBeVisible();
  });

  test("Erro do domínio aparece dentro do modal, que não fecha", async ({ page }) => {
    await abrirMembros(page);
    const modal = await abrirModal(page);

    await modal.getByLabel("E-mail da pessoa").fill(EMAIL_INEXISTENTE);
    await modal.getByRole("checkbox", { name: "Atleta" }).check();
    await modal.getByRole("button", { name: "Adicionar", exact: true }).click();

    // A permissão e a validação continuam no use-case: quem não tem conta não
    // entra, e a tela explica em vez de fechar como se tivesse dado certo.
    await expect(modal.getByRole("alert")).toContainText(/não encontrado/i, { timeout: 20_000 });
    await expect(modal).toBeVisible();
    await expect(linhaDoMembro(page, EMAIL_INEXISTENTE)).toHaveCount(0);
  });

  test("Submeter dados válidos fecha o modal e atualiza a lista", async ({ page }) => {
    await abrirMembros(page);

    const jaEraMembro = (await linhaDoMembro(page, PROFESSOR_3.email).count()) > 0;

    if (!jaEraMembro) {
      const modal = await abrirModal(page);
      await modal.getByLabel("E-mail da pessoa").fill(PROFESSOR_3.email);
      await modal.getByRole("checkbox", { name: "Professor", exact: true }).check();
      await modal.getByRole("button", { name: "Adicionar", exact: true }).click();

      // Sucesso é o modal fechar por conta própria; erro manteria o alert.
      await expect(dialogo(page)).toHaveCount(0, { timeout: 25_000 });
    } else {
      // Segunda execução: o vínculo já existe, que é o estado final desejado.
      // O que ainda precisa ser provado é que a tela recusa a duplicata em vez
      // de criar um segundo vínculo aberto.
      const modal = await abrirModal(page);
      await modal.getByLabel("E-mail da pessoa").fill(PROFESSOR_3.email);
      await modal.getByRole("checkbox", { name: "Professor", exact: true }).check();
      await modal.getByRole("button", { name: "Adicionar", exact: true }).click();

      await expect(modal.getByRole("alert")).toContainText(/já existe um vínculo/i, {
        timeout: 20_000,
      });
      await modal.getByRole("button", { name: "Cancelar" }).click();
      await expect(dialogo(page)).toHaveCount(0);
    }

    // Em qualquer das duas execuções o estado final é o mesmo: uma linha viva.
    const linha = linhaDoMembro(page, PROFESSOR_3.email);
    await expect(linha).toHaveCount(1, { timeout: 20_000 });
    await expect(linha).toContainText(/Professor/);

    // A URL segue a mesma do começo — o fluxo inteiro aconteceu na tela.
    expect(page.url()).toContain("/membros");
  });

  test("Esc fecha o modal e devolve o foco ao gatilho", async ({ page }) => {
    await abrirMembros(page);
    const modal = await abrirModal(page);

    // Ao abrir, o foco entra no diálogo — o conteúdo atrás não recebe teclado.
    const focoDentro = await modal.evaluate((el) => el.contains(document.activeElement));
    expect(focoDentro, "o foco deve entrar no modal ao abrir").toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialogo(page)).toHaveCount(0);

    const focoNoGatilho = await gatilho(page).evaluate(
      (el) => el === document.activeElement,
    );
    expect(focoNoGatilho, "o foco deve voltar para 'Adicionar membro'").toBe(true);
  });

  test("Tab não escapa do modal para a lista atrás do backdrop", async ({ page }) => {
    await abrirMembros(page);
    const modal = await abrirModal(page);

    // Dez tabulações dão a volta completa nos controles do diálogo; se o foco
    // vazasse para a tabela atrás, alguma delas cairia fora.
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Tab");
      const dentro = await modal.evaluate((el) => el.contains(document.activeElement));
      expect(dentro, `foco escapou do modal na tabulação ${i + 1}`).toBe(true);
    }
  });

  test("O modal funciona em viewport mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await abrirMembros(page);
    const modal = await abrirModal(page);

    const box = (await modal.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390);
    expect(box.x).toBeGreaterThanOrEqual(0);
    await expect(modal.getByLabel("E-mail da pessoa")).toBeVisible();
    await expect(modal.getByRole("button", { name: "Adicionar", exact: true })).toBeVisible();
  });

  test("A superfície do modal acompanha o tema claro e o escuro", async ({ page }) => {
    // A regressão clássica desta base é uma cor de superfície literal, que fica
    // preta em [data-theme="light"]; medir o pixel é o que prova. A cor vem em
    // lab()/oklch(), então ela é resolvida por um canvas em vez de parseada:
    // um parser de "rgb(...)" leria 0 e acusaria preto num branco.
    const luminancia = async (seletor: ReturnType<typeof dialogo>) =>
      seletor.evaluate((el) => {
        const cor = getComputedStyle(el).backgroundColor;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#808080"; // referência neutra sob a superfície translúcida
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = cor;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return { cor, valor: 0.2126 * r! + 0.7152 * g! + 0.0722 * b! };
      });

    const aplicarTema = (tema: "light" | "dark") =>
      page.evaluate((valor) => {
        localStorage.setItem("ryvano-theme", valor);
        document.documentElement.setAttribute("data-theme", valor);
      }, tema);

    await abrirMembros(page);

    await aplicarTema("light");
    await abrirModal(page);
    const claro = await luminancia(dialogo(page));
    expect(claro.valor, `superfície escura no tema claro: ${claro.cor}`).toBeGreaterThan(160);

    await page.keyboard.press("Escape");
    await expect(dialogo(page)).toHaveCount(0);

    await aplicarTema("dark");
    await abrirModal(page);
    const escuro = await luminancia(dialogo(page));
    expect(escuro.valor, `superfície clara no tema escuro: ${escuro.cor}`).toBeLessThan(120);
  });
});
