/**
 * E2E — 10: Solicitações de vínculo (/escola/<id>/solicitacoes)
 *
 * Fluxo completo de ponta a ponta, entre dois usuários, só pela UI:
 *   atleta → /escola/buscar → "Solicitar entrada"
 *   dono   → /escola/<id>/solicitacoes → "Aprovar"
 *   atleta → aparece na lista de atletas da escola
 *
 * Reaproveita ESCOLA_2 (política AUTO_APPROVE não serve aqui, então o teste
 * usa a Alpha, que é REQUIRE_APPROVAL) e um aluno já existente das fixtures.
 * Nenhum dado novo é criado — é por isso que o teste começa desvinculando o
 * atleta: sem isso não haveria solicitação pendente para aprovar numa segunda
 * execução, e o teste viraria um no-op silencioso.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, ALUNOS } from "./fixtures";

// O último aluno da lista é o "cobaia" deste spec: é ele que sai e volta.
const ALUNO = ALUNOS[ALUNOS.length - 1];

/**
 * Garante que o aluno-cobaia não tem vínculo ativo com a escola, para que haja
 * o que solicitar. Devolve false só quando esse estado não pôde ser atingido.
 *
 * A tela lista o histórico: um mesmo atleta pode ter várias linhas, umas
 * "Desligado" e outra ativa. Por isso o alvo é a linha que oferece
 * "Gerenciar", e não a primeira que casa com o nome — mirar na primeira pega a
 * linha morta e faz o teste concluir, errado, que já está tudo certo.
 */
async function garantirAlunoForaDaEscola(page: Page, schoolId: string): Promise<boolean> {
  const sobrenome = ALUNO.name.split(" ")[1]!;

  // Pode haver mais de um vínculo ativo; desliga até não sobrar nenhum.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");
    await page.getByLabel("Buscar atleta").fill(sobrenome);
    await page.waitForTimeout(1_000);

    const linhaAtiva = page
      .locator("tbody tr")
      .filter({ hasText: new RegExp(sobrenome, "i") })
      .filter({ has: page.locator('button:has-text("Gerenciar")') })
      .first();

    if (!(await linhaAtiva.isVisible({ timeout: 4_000 }).catch(() => false))) return true;

    // A UI protege a ação destrutiva em três passos.
    await linhaAtiva.locator('button:has-text("Gerenciar")').click();
    const desligar = page.locator('button:has-text("Desligar da escola")').first();
    if (!(await desligar.isVisible({ timeout: 5_000 }).catch(() => false))) return false;
    await desligar.click();
    await page.locator('button:has-text("Confirmar")').first().click();
    await page.waitForTimeout(3_000);
  }
  return false;
}

/** Há um pedido pendente deste aluno na fila do dono? */
async function temPedidoPendente(page: Page, schoolId: string, sobrenome: string): Promise<boolean> {
  await page.goto(`/escola/${schoolId}/solicitacoes`);
  await page.waitForLoadState("load");
  return page
    .locator("li")
    .filter({ hasText: new RegExp(sobrenome, "i") })
    .locator('button:has-text("Aprovar")')
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
}

/** O aluno pede entrada na escola pela busca pública. */
async function alunoSolicitaEntrada(page: Page): Promise<boolean> {
  await login(page, ALUNO.email, ALUNO.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, ALUNO.name);

  await page.goto("/escola/buscar");
  await page.waitForLoadState("load");

  await page.locator('input[type="search"]').fill(ESCOLA_1.schoolName);
  await page.waitForTimeout(2_500); // busca é debounced

  const cartao = page.locator("li").filter({ hasText: ESCOLA_1.schoolName }).first();
  if (!(await cartao.isVisible({ timeout: 10_000 }).catch(() => false))) return false;

  // Já vinculado ou já solicitado: o botão nem aparece.
  const botao = cartao.locator('button:has-text("Solicitar entrada")');
  if (!(await botao.isVisible({ timeout: 3_000 }).catch(() => false))) return false;

  await botao.click();

  // O painel troca o botão por "Solicitado ✓" em caso de sucesso e mostra a
  // mensagem do servidor em caso de erro. Esperar só pelo sucesso transforma
  // uma recusa explícita da API num timeout opaco, então observa-se os dois.
  const sucesso = cartao.getByText(/Solicitado/i);
  const erro = cartao.locator(".text-destructive");
  await expect(sucesso.or(erro)).toBeVisible({ timeout: 15_000 });

  if (await erro.isVisible().catch(() => false)) {
    console.log(`⚠️  Escola recusou o pedido: ${(await erro.textContent())?.trim()}`);
    return false;
  }
  return true;
}

test.describe.configure({ mode: "serial" });

test.describe("10 — Solicitações de vínculo", () => {
  test("A tela mostra o total de pedidos aguardando", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/solicitacoes`);
    await page.waitForLoadState("load");

    await expect(page.getByText(/Aguardando/i).first()).toBeVisible({ timeout: 15_000 });
    // A tela não pode ser um beco sem saída quando não há pedidos.
    await expect(page.getByText(/Convidar alguém/i).first()).toBeVisible();
  });

  test("Atleta solicita entrada e o dono aprova", async ({ page }) => {
    const sobrenomeAluno = ALUNO.name.split(" ")[1]!;

    // 1. Converge para o estado inicial desejado (aluno fora da escola) a
    //    partir de onde quer que a rodada anterior tenha parado. Se o aluno
    //    já está pendente — porque uma execução morreu no meio — não há o que
    //    desligar, e o teste segue direto para a aprovação.
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const jaPendente = await temPedidoPendente(page, schoolId, sobrenomeAluno);

    if (!jaPendente) {
      const fora = await garantirAlunoForaDaEscola(page, schoolId);
      expect(fora, `Não consegui desligar ${ALUNO.name} da escola`).toBe(true);

      // 2. Aluno pede entrada pela busca pública.
      const solicitou = await alunoSolicitaEntrada(page);
      expect(solicitou, `${ALUNO.name} não conseguiu solicitar entrada`).toBe(true);
      console.log(`✅ ${ALUNO.name} solicitou entrada`);
    } else {
      console.log(`↻ ${ALUNO.name} já estava pendente — retomando na aprovação`);
    }

    // 3. Dono vê e aprova o pedido.
    const schoolIdDono = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolIdDono}/solicitacoes`);
    await page.waitForLoadState("load");

    // O item da fila é um <li>; qualquer seletor mais amplo casa com divs
    // internas que não contêm o botão de decisão.
    const sobrenome = ALUNO.name.split(" ")[1]!;
    const pedido = page.locator("li").filter({ hasText: new RegExp(sobrenome, "i") }).first();
    await expect(pedido).toBeVisible({ timeout: 15_000 });

    await pedido.locator('button:has-text("Aprovar")').first().click();
    await page.waitForTimeout(3_000);

    // 4. A prova real: o aluno agora consta entre os atletas da escola.
    await page.goto(`/escola/${schoolIdDono}/atletas`);
    await page.waitForLoadState("load");
    await page.getByLabel("Buscar atleta").fill(sobrenome);
    await page.waitForTimeout(1_500);

    // Precisa ser o vínculo ATIVO: a tela guarda o histórico, então as linhas
    // "Desligado" da rodada anterior satisfariam um seletor só pelo nome.
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: new RegExp(sobrenome, "i") })
        .filter({ has: page.locator('button:has-text("Gerenciar")') })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    console.log(`✅ ${ALUNO.name} aprovado e matriculado`);
  });

  test("Após aprovar, o pedido some da fila de pendentes", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/solicitacoes`);
    await page.waitForLoadState("load");

    const sobrenome = ALUNO.name.split(" ")[1]!;
    // Um pedido aprovado não pode continuar oferecendo "Aprovar".
    const aindaPendente = page
      .locator("li")
      .filter({ hasText: new RegExp(sobrenome, "i") })
      .locator('button:has-text("Aprovar")');
    await expect(aindaPendente).toHaveCount(0, { timeout: 15_000 });
  });
});
