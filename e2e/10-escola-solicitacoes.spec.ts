/**
 * E2E — 10: Solicitações de vínculo (/escola/<id>/solicitacoes)
 *
 * Fluxo completo de ponta a ponta, entre dois usuários, só pela UI:
 *   atleta → /app/escola → "Ver escola" → "Associar-se à escola" (SAM-24)
 *   dono   → /escola/<id>/solicitacoes → "Aprovar"
 *   atleta → aparece na lista de atletas da escola
 *
 * Reaproveita ESCOLA_2 (política AUTO_APPROVE não serve aqui, então o teste
 * usa a Alpha, que é REQUIRE_APPROVAL) e um aluno já existente das fixtures.
 * Nenhum dado novo é criado — é por isso que o teste começa desvinculando o
 * atleta: sem isso não haveria solicitação pendente para aprovar numa segunda
 * execução, e o teste viraria um no-op silencioso.
 *
 * Os passos de convergência (desligar, detectar pendente, pedir pela busca)
 * vivem em `school-flows.ts`, compartilhados com o spec 32.
 */
import { test, expect } from "@playwright/test";
import { loginAsSchoolOwner } from "./helpers";
import { ESCOLA_1, ALUNOS } from "./fixtures";
import { alunoSolicitaEntradaPelaBusca, garantirAlunoForaDaEscola, temPedidoPendente } from "./school-flows";

// O último aluno da lista é o "cobaia" deste spec: é ele que sai e volta.
const ALUNO = ALUNOS[ALUNOS.length - 1]!;

// Dois usuários, várias páginas e um modal que carrega da API: não cabe em 60s.
test.describe.configure({ mode: "serial", timeout: 180_000 });

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
    // 1. Converge para o estado inicial desejado (aluno fora da escola) a
    //    partir de onde quer que a rodada anterior tenha parado. Se o aluno
    //    já está pendente — porque uma execução morreu no meio — não há o que
    //    desligar, e o teste segue direto para a aprovação.
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const jaPendente = await temPedidoPendente(page, schoolId, ALUNO);

    if (!jaPendente) {
      const fora = await garantirAlunoForaDaEscola(page, schoolId, ALUNO);
      expect(fora, `Não consegui desligar ${ALUNO.name} da escola`).toBe(true);

      // 2. Aluno pede entrada pela descoberta do contexto Atleta.
      const solicitou = await alunoSolicitaEntradaPelaBusca(page, ALUNO, ESCOLA_1.schoolName);
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
    // Enquanto a server action roda o botão diz "Aprovando…", então esperar o
    // botão sumir passaria cedo demais e a navegação seguinte abortaria a ação.
    // O item inteiro só sai da fila depois do revalidate: essa é a prova.
    await expect(page.locator("li").filter({ hasText: new RegExp(sobrenome, "i") })).toHaveCount(0, { timeout: 45_000 });

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
