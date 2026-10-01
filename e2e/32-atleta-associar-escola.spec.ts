/**
 * E2E — 32 (SAM-24): o atleta encontra a escola em /app/escola, vê o perfil em
 * modal e pede vínculo com o histórico compartilhado por padrão.
 *
 *   aluno → /app/escola → busca → "Ver escola" (modal com perfil público)
 *         → "Associar-se à escola" → "Aguardando aprovação"
 *         → segundo pedido pela API é recusado (409)
 *   dono  → /escola/<id>/solicitacoes → "Aprovar"
 *   aluno → /atleta/<id>/historico mostra o grant SCHOOL ativo criado no pedido
 *
 * Reaproveita a Escola Alpha (REQUIRE_APPROVAL) e o último aluno das fixtures,
 * o mesmo "cobaia" do spec 10 — ambos convergem para o estado que precisam.
 */
import { test, expect } from "@playwright/test";

import { ALUNOS, ESCOLA_1 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";
import {
  alunoSolicitaEntradaPelaBusca,
  buscarEscolaNoAtleta,
  garantirAlunoForaDaEscola,
  temPedidoPendente,
} from "./school-flows";

const ALUNO = ALUNOS[ALUNOS.length - 1]!;
const SOBRENOME = ALUNO.name.split(" ")[1]!;

// Dois usuários, várias páginas e um modal que carrega da API: não cabe em 60s.
test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("32 — Atleta associa-se a uma escola (SAM-24)", () => {
  test("o modal mostra o perfil público da escola e fecha por Escape", async ({ page }) => {
    await login(page, ALUNO.email, ALUNO.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, ALUNO.name);

    const cartao = await buscarEscolaNoAtleta(page, ESCOLA_1.schoolName);
    await expect(cartao).toBeVisible({ timeout: 15_000 });
    await cartao.getByRole("button", { name: "Ver escola" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole("heading", { name: ESCOLA_1.schoolName })).toBeVisible();
    // O perfil vem da API depois que o modal abre (no dev server, a 1ª chamada compila a rota).
    await expect(dialog.getByLabel("Carregando perfil da escola")).toHaveCount(0, { timeout: 30_000 });
    await expect(dialog.getByText(/Na Ryvano desde/i)).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/atletas? ativos?/i)).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Modalidades" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Contato" })).toBeVisible();
    await expect(dialog.getByTestId("school-phone")).toHaveText(/91234-0001/);
    await expect(dialog.getByTestId("school-email")).toHaveText(ESCOLA_1.schoolEmail);
    await expect(dialog.getByRole("heading", { name: "Responsável" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /Professores \(\d+\)/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("aluno pede vínculo com histórico por padrão, não repete o pedido, e o dono aprova", async ({ page }) => {
    // 1. Converge para "aluno fora da escola" (ou retoma de um pedido pendente).
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const jaPendente = await temPedidoPendente(page, schoolId, ALUNO);

    if (!jaPendente) {
      const fora = await garantirAlunoForaDaEscola(page, schoolId, ALUNO);
      expect(fora, `Não consegui desligar ${ALUNO.name} da escola`).toBe(true);

      // 2. Aluno pede entrada pela descoberta do atleta.
      const solicitou = await alunoSolicitaEntradaPelaBusca(page, ALUNO, ESCOLA_1.schoolName);
      expect(solicitou, `${ALUNO.name} não conseguiu solicitar entrada`).toBe(true);

      // 2b. O card reflete o estado sem recarregar e também depois de recarregar.
      const cartao = page.getByTestId("school-card").filter({ hasText: ESCOLA_1.schoolName }).first();
      await page.keyboard.press("Escape");
      await expect(cartao.getByText(/Aguardando aprovação/)).toBeVisible({ timeout: 10_000 });
      await page.reload();
      await page.waitForLoadState("load");
      await page.getByLabel("Buscar escola").fill(ESCOLA_1.schoolName);
      await page.waitForTimeout(2_500);
      await expect(
        page.getByTestId("school-card").filter({ hasText: ESCOLA_1.schoolName }).first().getByText(/Aguardando aprovação/),
      ).toBeVisible({ timeout: 10_000 });

      // 2c. Um segundo pedido enquanto o primeiro está pendente é recusado pela API.
      const repetido = await page.request.post(`/api/schools/${schoolId}/athletes`, { data: {} });
      expect(repetido.status()).toBe(409);
      expect((await repetido.json()).code).toBe("SCHOOL_ATHLETE_MEMBERSHIP_ALREADY_PENDING");
      console.log(`✅ ${ALUNO.name} solicitou entrada; pedido duplicado recusado`);
    } else {
      console.log(`↻ ${ALUNO.name} já estava pendente — retomando na aprovação`);
    }

    // 3. Dono vê e aprova.
    const schoolIdDono = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolIdDono}/solicitacoes`);
    await page.waitForLoadState("load");
    const pedido = page.locator("li").filter({ hasText: new RegExp(SOBRENOME, "i") }).first();
    await expect(pedido).toBeVisible({ timeout: 15_000 });
    await pedido.locator('button:has-text("Aprovar")').first().click();
    // Enquanto a server action roda o botão diz "Aprovando…", então esperar o
    // botão sumir passaria cedo demais e a navegação seguinte abortaria a ação.
    // O item inteiro só sai da fila depois do revalidate: essa é a prova.
    await expect(page.locator("li").filter({ hasText: new RegExp(SOBRENOME, "i") })).toHaveCount(0, { timeout: 45_000 });

    // 4. O aluno está matriculado…
    await page.goto(`/escola/${schoolIdDono}/atletas`);
    await page.waitForLoadState("load");
    await page.getByLabel("Buscar atleta").fill(SOBRENOME);
    await page.waitForTimeout(1_500);
    await expect(
      page
        .locator("tbody tr")
        .filter({ hasText: new RegExp(SOBRENOME, "i") })
        .filter({ has: page.locator('button:has-text("Gerenciar")') })
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // 5. …e o consentimento dado no pedido existe como grant SCHOOL ativo.
    await login(page, ALUNO.email, ALUNO.password);
    await page.goto(`/atleta/${schoolIdDono}/historico`);
    await page.waitForLoadState("load");
    const grantEscola = page
      .locator("li")
      .filter({ hasText: new RegExp(`Escola:\\s*${ESCOLA_1.schoolName}`, "i") })
      .filter({ hasText: /ACTIVE/ })
      .first();
    await expect(grantEscola).toBeVisible({ timeout: 15_000 });
    console.log(`✅ ${ALUNO.name} aprovado; grant de histórico da escola ativo`);

    // 6. O card agora diz "Vinculado" e leva ao painel do atleta.
    const cartaoVinculado = await buscarEscolaNoAtleta(page, ESCOLA_1.schoolName);
    await expect(cartaoVinculado.getByText(/Vinculado/)).toBeVisible({ timeout: 10_000 });
    await expect(cartaoVinculado.getByRole("link", { name: /Meu painel/ })).toHaveAttribute("href", `/atleta/${schoolIdDono}`);
  });
});
