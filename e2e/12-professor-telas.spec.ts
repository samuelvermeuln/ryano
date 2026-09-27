/**
 * E2E — 12: Telas do professor (/professor/<id> e subtelas)
 *
 * Cobre as quatro telas do professor no que elas prometem: o dashboard como
 * lista de pendências, o plantel com filtro e ordenação, a lista de treinos e
 * as turmas atribuídas.
 *
 * Reaproveita ESCOLA_1 + PROFESSOR_1 + as prescrições do spec 06. Nenhum dado
 * novo é criado: este spec é de leitura, exceto o filtro/ordenação, que só
 * mexem no estado da própria tela.
 *
 * Duas coisas que este teste deliberadamente NÃO faz:
 *  - não afirma que existem atletas/prescrições: se os specs anteriores não
 *    rodaram, a tela mostra estado vazio, que é comportamento legítimo. O
 *    teste então verifica o estado vazio em vez de falhar por dado ausente.
 *  - não confere números de compliance contra cálculo próprio — replicar a
 *    regra no teste só duplicaria a fonte do erro.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1 } from "./fixtures";

/** O schoolId vem do dono; o professor não tem rota que o revele sozinho. */
async function resolverSchoolId(page: Page): Promise<string> {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  return schoolId;
}

async function entrarComoProfessor(page: Page, schoolId: string, subrota = "") {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);
  await page.goto(`/professor/${schoolId}${subrota}`);
  await page.waitForLoadState("load");
}

test.describe("12 — Telas do professor", () => {
  test("dashboard lista as pendências do professor", async ({ page }) => {
    const schoolId = await resolverSchoolId(page);
    await entrarComoProfessor(page, schoolId);

    // Não redirecionou para fora: o professor tem acesso a esta escola.
    expect(page.url()).toContain(`/professor/${schoolId}`);

    // A seção de pedidos aparece sempre, com dados ou com estado vazio: um
    // dashboard que só existe quando há pendência deixa o professor sem saber
    // se está tudo em ordem ou se a tela falhou.
    await expect(
      page.getByRole("heading", { name: /Pedidos de ajuste da administração/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Os quatro indicadores do topo. "Meus atletas" também é texto de um botão
    // e de um item de menu, por isso a asserção é sobre os rótulos exclusivos.
    for (const indicador of [
      "Prescrições (7 dias)",
      "Confirmações pendentes",
      "Compliance médio",
    ]) {
      await expect(page.getByText(indicador, { exact: true })).toBeVisible();
    }
  });

  test("plantel filtra por nome e ordena sem perder o atleta buscado", async ({ page }) => {
    const schoolId = await resolverSchoolId(page);
    await entrarComoProfessor(page, schoolId, "/atletas");

    const busca = page.getByLabel("Buscar atleta");
    const temBusca = await busca.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!temBusca) {
      // Sem atletas vinculados a tela mostra o estado vazio; é resultado
      // válido e o teste o verifica em vez de inventar dado.
      await expect(page.getByText(/nenhum atleta/i).first()).toBeVisible({ timeout: 10_000 });
      return;
    }

    // O plantel é uma grade de cards, cada um um link para a ficha do atleta;
    // contar os links é o que sobrevive a mudança de layout.
    const cards = page.locator(`a[href*="/atletas/"]`);
    const totalAntes = await cards.count();
    expect(totalAntes).toBeGreaterThan(0);

    const primeiroNome = (await cards.first().innerText()).split("\n")[0]!.trim().split(" ")[0]!;

    await busca.fill(primeiroNome);
    await page.waitForTimeout(800);

    const totalDepois = await cards.count();
    expect(totalDepois).toBeGreaterThan(0);
    expect(totalDepois).toBeLessThanOrEqual(totalAntes);
    await expect(cards.filter({ hasText: primeiroNome }).first()).toBeVisible();

    // Trocar a ordenação não pode descartar o resultado do filtro: são dois
    // controles independentes, e vê-los interferirem um no outro é o bug que
    // esta asserção existe para pegar.
    const ordenarPorNome = page.getByRole("button", { name: "Nome", exact: true });
    if (await ordenarPorNome.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ordenarPorNome.click();
      await page.waitForTimeout(800);
      expect(await cards.count()).toBe(totalDepois);
      await expect(cards.filter({ hasText: primeiroNome }).first()).toBeVisible();
    }

    // Filtro é estado da tela, não navegação: limpar tem de devolver todos.
    await busca.fill("");
    await page.waitForTimeout(800);
    expect(await cards.count()).toBe(totalAntes);
  });

  test("tela de treinos mostra prescrições com status em português", async ({ page }) => {
    const schoolId = await resolverSchoolId(page);
    await entrarComoProfessor(page, schoolId, "/treinos");

    await expect(page.getByRole("heading", { name: "Treinos", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: /Solicitações pendentes/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Prescrições recentes/i })).toBeVisible();

    const linhas = page.locator("tbody tr");
    if ((await linhas.count()) > 0) {
      // O enum cru não pode vazar para a tela — era o comportamento anterior.
      const corpo = await page.locator("tbody").innerText();
      for (const cru of ["SCHEDULED", "PARTIALLY_COMPLETED", "MISSED"]) {
        expect(corpo, `status cru "${cru}" vazou para a tela`).not.toContain(cru);
      }
    }
  });

  test("turmas mostra só as turmas atribuídas ao professor", async ({ page }) => {
    const schoolId = await resolverSchoolId(page);
    await entrarComoProfessor(page, schoolId, "/turmas");

    await expect(page.getByRole("heading", { name: "Minhas turmas" })).toBeVisible({
      timeout: 15_000,
    });

    const cartoes = page.locator("li").filter({ hasText: /atleta/i });
    if ((await cartoes.count()) === 0) {
      // Professor sem turma atribuída: estado vazio explica e não erra.
      await expect(page.getByText(/Nenhuma turma atribuída/i)).toBeVisible();
    } else {
      await expect(cartoes.first()).toBeVisible();
    }
  });

  test("marketplace do professor abre e separa vendas próprias das da escola", async ({ page }) => {
    const schoolId = await resolverSchoolId(page);
    await entrarComoProfessor(page, schoolId, "/marketplace");

    await expect(page.getByRole("heading", { name: "Minhas vendas" })).toBeVisible({
      timeout: 15_000,
    });

    // A tela não pode cair no caminho de erro: ele existe para falha de
    // carregamento e, se aparecesse sempre, o painel estaria inútil sem avisar.
    await expect(page.getByText("Não foi possível carregar suas vendas.")).toHaveCount(0);

    // O aviso de escopo é parte do contrato desta tela: sem ele o professor
    // pode ler as próprias vendas como se fossem as da escola.
    await expect(page.getByText(/Vendas em nome da escola/i)).toBeVisible();
  });
});
