/**
 * E2E — 20: Escola cadastra e administra produto no Marketplace — SAM-9
 *
 * O ponto do spec é que o produto nasce da UI da ESCOLA e pertence à escola:
 * o dono da Escola Alpha **não tem CoachProfile** (só PROFESSOR_1..3 têm, ver
 * `02-criar-professores.spec.ts`), então antes desta tarefa ele era barrado com
 * COACH_PROFILE_NOT_FOUND. Um teste que cadastrasse como professor passaria
 * igual com a regra antiga e não provaria nada.
 *
 * Idempotência: a suíte roda duas vezes na mesma base. O produto usa um título
 * fixo e o teste **converge** — se ele já existe de uma execução anterior, o
 * estado final esperado já está satisfeito e as asserções são sobre a lista,
 * não sobre ter acabado de criar. Nenhum registro é inserido por prisma/SQL: o
 * cadastro é sempre pela UI.
 *
 * Fora de alcance aqui (e por quê): promover uma compra a COMPLETED exige
 * webhook verificado do provedor de pagamento — invariante do domínio, não
 * limitação do teste. Cenários C (venda) e E (reembolso) da issue estão em
 * `tests/school-product-revenue-attribution.test.ts`, que percorre
 * checkout -> webhook -> ledger -> reembolso nos casos de uso reais. Fabricar a
 * venda no banco testaria só o estado final.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, ESCOLA_2, PROFESSOR_1 } from "./fixtures";

/** Título fixo: o spec converge para "este produto existe e é da escola". */
const PRODUTO = "Plano E2E da Escola Alpha";

/**
 * Navega tolerando `ERR_ABORTED`: quando o guard da rota responde 307, o
 * documento pedido é abortado em favor do destino do redirect e o `goto`
 * rejeita, ainda que a navegação tenha acontecido. Quem chama afirma sobre a
 * URL final, então engolir esse erro específico não esconde falha alguma.
 */
async function irPara(page: Page, path: string) {
  await page.goto(path).catch((error: Error) => {
    if (!error.message.includes("ERR_ABORTED")) throw error;
  });
  await page.waitForLoadState("load");
}

async function abrirMarketplaceDaEscola(page: Page): Promise<string> {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  await page.goto(`/escola/${schoolId}/marketplace`);
  await page.waitForLoadState("load");
  return schoolId;
}

function gatilho(page: Page) {
  // Por nome acessível: o menu lateral rouba clique por texto, e com o modal
  // aberto o botão de confirmar se chama "Criar", não "Cadastrar produto".
  return page.getByRole("button", { name: "Cadastrar produto" });
}

/** Linha da tabela do produto — `filter` em vez de `:has-text` para não casar com div interna. */
function linhaDoProduto(page: Page, titulo = PRODUTO) {
  return page.locator("tbody tr").filter({ hasText: titulo }).first();
}

async function produtoJaExiste(page: Page, titulo = PRODUTO): Promise<boolean> {
  const busca = page.getByLabel("Buscar produto");
  if (await busca.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await busca.fill(titulo);
    return await linhaDoProduto(page, titulo).isVisible({ timeout: 3_000 }).catch(() => false);
  }
  // Sem campo de busca a tela está no estado vazio — nenhum produto ainda.
  return false;
}

/** Cadastra pela UI; devolve false se já existia (execução repetida). */
async function cadastrarProduto(page: Page, titulo = PRODUTO): Promise<boolean> {
  if (await produtoJaExiste(page, titulo)) return false;

  await gatilho(page).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();

  await modal.getByLabel("Título do plano").fill(titulo);
  await modal.getByLabel("Descrição").fill("Plano criado pelo E2E em nome da escola.");
  await modal.getByLabel("Modalidade").selectOption("run");
  await modal.getByLabel("Duração (semanas)").fill("8");
  await modal.getByRole("button", { name: "Criar" }).click();

  await expect(modal).toBeHidden({ timeout: 20_000 });
  return true;
}

test.describe("20 — Escola cadastra e vende produto no Marketplace (SAM-9)", () => {
  test("Cenário A — dono da escola (sem perfil de professor) cadastra produto em nome da escola", async ({ page }) => {
    const schoolId = await abrirMarketplaceDaEscola(page);

    // A própria existência do gatilho é parte da regra nova: antes desta tarefa
    // a tela da escola não tinha caminho de cadastro nenhum.
    await expect(gatilho(page)).toBeVisible();

    await cadastrarProduto(page);

    // O cadastro acontece SOBRE a tela do marketplace: a URL não muda. Um teste
    // que só olhasse o formulário passaria com uma navegação para outra página.
    expect(page.url(), "cadastro deve ocorrer sobre /escola/<id>/marketplace").toContain(
      `/escola/${schoolId}/marketplace`,
    );

    await page.goto(`/escola/${schoolId}/marketplace`);
    await page.waitForLoadState("load");
    await page.getByLabel("Buscar produto").fill(PRODUTO);

    const linha = linhaDoProduto(page);
    await expect(linha).toBeVisible();
    // Vendedor = escola, e não "Professor: null" nem um professor fictício.
    await expect(linha).toContainText(`Vendido por ${ESCOLA_1.schoolName}`);
    await expect(linha).toContainText("Rascunho");
  });

  test("Cenário A (cont.) — o produto é administrável pela escola: preço e visibilidade", async ({ page }) => {
    const schoolId = await abrirMarketplaceDaEscola(page);
    await cadastrarProduto(page);

    await page.goto(`/escola/${schoolId}/marketplace`);
    await page.waitForLoadState("load");
    await page.getByLabel("Buscar produto").fill(PRODUTO);

    await linhaDoProduto(page).getByRole("button", { name: "Gerenciar" }).click();

    // As mesmas ações que já existiam para produto de professor, agora aplicadas
    // a um produto que a escola criou — reuso, não um segundo fluxo.
    const preco = page.getByLabel("Preço (R$)");
    await expect(preco).toBeVisible();
    await preco.fill("49.90");
    await page.getByRole("button", { name: "Salvar preço" }).click();

    await page.waitForLoadState("load");
    await page.getByLabel("Buscar produto").fill(PRODUTO);
    await expect(linhaDoProduto(page)).toContainText("49,90");
  });

  test("Cenário B — isolamento: gestor da Escola Beta não vê nem administra o produto da Alpha", async ({ page }) => {
    // Garante que o produto da Alpha existe antes de trocar de usuário.
    const alphaId = await abrirMarketplaceDaEscola(page);
    await cadastrarProduto(page);

    // Agora como dono da Escola Beta — outra escola, outro SellerAccount.
    const betaId = await loginAsSchoolOwner(page, ESCOLA_2);
    expect(betaId, "as fixtures devem ser escolas distintas").not.toBe(alphaId);

    // Trocar o schoolId na URL não dá acesso ao marketplace da Alpha: o guard
    // manda o gestor da Beta embora. Asserção sobre a URL final, que é a prova
    // forte — "a linha não apareceu" também passaria numa página em branco.
    await irPara(page, `/escola/${alphaId}/marketplace`);
    expect(page.url(), "gestor da Beta não pode abrir o marketplace da Alpha").not.toContain(
      `/escola/${alphaId}/marketplace`,
    );

    // E no marketplace da própria Beta o produto da Alpha também não aparece.
    await irPara(page, `/escola/${betaId}/marketplace`);
    expect(page.url(), "gestor da Beta deve abrir o marketplace da própria escola").toContain(
      `/escola/${betaId}/marketplace`,
    );
    const vazouNaBeta = await linhaDoProduto(page).isVisible({ timeout: 3_000 }).catch(() => false);
    expect(vazouNaBeta, "produto da Alpha não pertence à Beta").toBe(false);
  });

  test("Cenário B (backend) — requisição manipulada não cria produto para outra escola", async ({ page }) => {
    // Autorização é no servidor, não na UI: como dono da Beta, pedir um produto
    // com o schoolId da Alpha deve falhar mesmo sem passar pela tela.
    const alphaId = await loginAsSchoolOwner(page, ESCOLA_1);
    await loginAsSchoolOwner(page, ESCOLA_2);

    const res = await page.request.post("/api/coach/products", {
      data: { title: "Produto forjado pela Beta", schoolId: alphaId },
      failOnStatusCode: false,
    });
    expect(res.ok(), `esperava recusa, veio ${res.status()}`).toBe(false);
    expect([401, 403, 404]).toContain(res.status());
  });

  test("Cenário D — sem regressão: o estúdio do professor continua acessível e independente", async ({ page }) => {
    await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);

    await page.goto("/professor/estudio/produtos");
    await page.waitForLoadState("load");

    // O professor não foi expulso do seu próprio fluxo pela mudança na escola.
    expect(page.url(), "professor deve seguir com acesso ao estúdio").toContain("/professor/estudio/produtos");

    // E o produto da escola não passou a pertencer ao professor.
    const doProfessor = await linhaDoProduto(page).isVisible({ timeout: 3_000 }).catch(() => false);
    expect(doProfessor, "produto da escola não deve aparecer como produto do professor").toBe(false);
  });
});
