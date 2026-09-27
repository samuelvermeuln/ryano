/**
 * E2E — 11: Pedido de ajuste de prescrição (ciclo administração ↔ professor)
 *
 * Este é o fluxo que faltava fechar: a administração já conseguia abrir o
 * pedido, mas o professor não tinha onde responder, e o pedido ficava PENDING
 * para sempre. O teste cobre a volta inteira, só pela UI, entre dois usuários:
 *
 *   dono      → /escola/<id>/professores/<membershipId> → "Solicitar alteração"
 *   professor → /professor/<id>                         → "Assumir"
 *   dono      → vê "Em análise"
 *   professor → "Concluí o ajuste" (com observação)
 *   dono      → vê "Resolvida" + a observação do professor
 *
 * Depende das prescrições criadas pelo spec 06: sem nenhuma prescrição do
 * professor não existe o que pedir para alterar. Se não houver, o teste falha
 * dizendo isso, em vez de passar sem exercitar nada.
 *
 * Idempotência: a UI permite só um pedido aberto por prescrição, então o teste
 * começa procurando uma prescrição *livre*. Como ele mesmo fecha o pedido que
 * abre (RESOLVED), reexecutar volta a encontrar a mesma prescrição livre.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1 } from "./fixtures";

const MOTIVO = "E2E: reduzir o volume desta sessão.";
const OBSERVACAO = "E2E: volume ajustado para 8 km.";

/**
 * Abre a ficha do PROFESSOR_1 na administração e devolve a URL dela.
 *
 * Lê o href e navega direto, em vez de clicar: no dev server a primeira visita
 * a uma rota ainda compila, e o clique expirava esperando navegação por um
 * motivo que nada tem a ver com o que este teste verifica.
 */
async function abrirFichaDoProfessor(page: Page, schoolId: string): Promise<string> {
  await page.goto(`/escola/${schoolId}/professores`);
  await page.waitForLoadState("load");

  const sobrenome = PROFESSOR_1.displayName.split(" ")[1]!;
  const link = page
    .locator(`a[href*="/professores/"]`)
    .filter({ hasText: new RegExp(sobrenome, "i") })
    .first();

  expect(
    await link.isVisible({ timeout: 15_000 }).catch(() => false),
    `${PROFESSOR_1.displayName} não aparece em /escola/${schoolId}/professores — rode o spec 03 primeiro`,
  ).toBe(true);

  const href = await link.getAttribute("href");
  expect(href, "o link da ficha do professor não tem href").toBeTruthy();

  await page.goto(href!);
  await page.waitForLoadState("load");
  return page.url();
}

/**
 * Fecha pedidos de ajuste do E2E que tenham sobrado abertos.
 *
 * Sem isto, uma execução interrompida no meio deixa um pedido PENDING com o
 * mesmo texto das fixtures, e a execução seguinte encontra dois cartões
 * idênticos: o teste falha ao conferir que o pedido saiu do dashboard, sem que
 * haja nada de errado com o produto.
 */
async function limparPedidosAbertos(page: Page, schoolId: string) {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);

  for (let tentativa = 0; tentativa < 6; tentativa++) {
    await page.goto(`/professor/${schoolId}`);
    await page.waitForLoadState("load");

    const pendente = page.locator("li").filter({ hasText: /^E2E:|\bE2E:/ }).first();
    if (!(await pendente.isVisible({ timeout: 4_000 }).catch(() => false))) return;

    await pendente.locator('button:has-text("Concluí o ajuste")').click();
    await page.waitForTimeout(2_500);
  }
}

test.describe("11 — Pedido de ajuste: administração ↔ professor", () => {
  test("a administração pede, o professor assume e conclui, e a resposta volta", async ({ page }) => {
    // ---------------------------------------------------------------------
    // 1. Administração abre o pedido numa prescrição do professor
    // ---------------------------------------------------------------------
    let schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await limparPedidosAbertos(page, schoolId);

    schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const fichaUrl = await abrirFichaDoProfessor(page, schoolId);

    const temPrescricoes = await page
      .locator("table tbody tr")
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);
    expect(
      temPrescricoes,
      "o professor não tem prescrições nesta escola — rode o spec 06 primeiro",
    ).toBe(true);

    // Uma prescrição livre é a que ainda oferece "Solicitar alteração"; as que
    // já têm pedido aberto mostram apenas "Alteração solicitada".
    const botaoSolicitar = page.locator('button:has-text("Solicitar alteração")').first();
    expect(
      await botaoSolicitar.isVisible({ timeout: 8_000 }).catch(() => false),
      "nenhuma prescrição livre: todas já têm pedido aberto",
    ).toBe(true);

    await botaoSolicitar.click();
    const motivo = page.getByPlaceholder("O que precisa ser alterado?").first();
    await motivo.waitFor({ state: "visible", timeout: 8_000 });
    await motivo.fill(MOTIVO);
    await page.locator('button:has-text("Enviar")').first().click();

    // O pedido aparece na seção "Solicitações de alteração" aguardando o professor.
    await expect(page.getByText("Aguardando professor").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(MOTIVO).first()).toBeVisible();

    // ---------------------------------------------------------------------
    // 2. Professor assume o pedido no próprio dashboard
    // ---------------------------------------------------------------------
    await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);

    await page.goto(`/professor/${schoolId}`);
    await page.waitForLoadState("load");

    // É esta asserção que prova o gap fechado: o pedido da administração é
    // visível para o professor, com ação, e não só do lado de quem pediu.
    const cartao = page.locator("li").filter({ hasText: MOTIVO }).first();
    await expect(cartao).toBeVisible({ timeout: 15_000 });
    await expect(cartao.getByText("Aguardando você")).toBeVisible();

    await cartao.locator('button:has-text("Assumir")').click();
    await page.waitForTimeout(3_000);

    await page.goto(`/professor/${schoolId}`);
    await page.waitForLoadState("load");
    const assumido = page.locator("li").filter({ hasText: MOTIVO }).first();
    await expect(assumido.getByText("Você assumiu")).toBeVisible({ timeout: 15_000 });
    // Assumir duas vezes não é transição válida, então o botão sai de cena.
    await expect(assumido.locator('button:has-text("Assumir")')).toHaveCount(0);

    // ---------------------------------------------------------------------
    // 3. A administração vê que o professor assumiu
    // ---------------------------------------------------------------------
    await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(fichaUrl);
    await page.waitForLoadState("load");
    await expect(page.getByText("Em análise").first()).toBeVisible({ timeout: 15_000 });

    // ---------------------------------------------------------------------
    // 4. Professor conclui, com observação
    // ---------------------------------------------------------------------
    await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
    await page.goto(`/professor/${schoolId}`);
    await page.waitForLoadState("load");

    const paraConcluir = page.locator("li").filter({ hasText: MOTIVO }).first();
    await expect(paraConcluir).toBeVisible({ timeout: 15_000 });
    await paraConcluir.getByLabel("Observação").fill(OBSERVACAO);
    await paraConcluir.locator('button:has-text("Concluí o ajuste")').click();
    await page.waitForTimeout(3_000);

    // Fechado deixa de ser pendência: sai do dashboard do professor.
    await page.goto(`/professor/${schoolId}`);
    await page.waitForLoadState("load");
    await expect(page.locator("li").filter({ hasText: MOTIVO })).toHaveCount(0, {
      timeout: 15_000,
    });

    // ---------------------------------------------------------------------
    // 5. A resposta do professor chega à administração
    // ---------------------------------------------------------------------
    await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(fichaUrl);
    await page.waitForLoadState("load");
    await expect(page.getByText("Resolvida").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(OBSERVACAO).first()).toBeVisible();
  });

  test("o professor pode recusar um pedido, e a administração vê a recusa", async ({ page }) => {
    const motivoRecusa = "E2E: trocar o treino inteiro de dia.";
    const justificativa = "E2E: o atleta compete neste fim de semana.";

    let schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await limparPedidosAbertos(page, schoolId);

    schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const fichaUrl = await abrirFichaDoProfessor(page, schoolId);

    const botaoSolicitar = page.locator('button:has-text("Solicitar alteração")').first();
    expect(
      await botaoSolicitar.isVisible({ timeout: 8_000 }).catch(() => false),
      "nenhuma prescrição livre para pedir alteração",
    ).toBe(true);
    await botaoSolicitar.click();

    const motivo = page.getByPlaceholder("O que precisa ser alterado?").first();
    await motivo.waitFor({ state: "visible", timeout: 8_000 });
    await motivo.fill(motivoRecusa);
    await page.locator('button:has-text("Enviar")').first().click();
    await expect(page.getByText(motivoRecusa).first()).toBeVisible({ timeout: 15_000 });

    // Recusar direto de PENDING, sem passar por "Assumir": o professor não é
    // obrigado a aceitar o pedido antes de poder negá-lo.
    await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
    await page.goto(`/professor/${schoolId}`);
    await page.waitForLoadState("load");

    const cartao = page.locator("li").filter({ hasText: motivoRecusa }).first();
    await expect(cartao).toBeVisible({ timeout: 15_000 });
    await cartao.getByLabel("Observação").fill(justificativa);
    await cartao.locator('button:has-text("Recusar")').click();
    await page.waitForTimeout(3_000);

    await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(fichaUrl);
    await page.waitForLoadState("load");
    await expect(page.getByText("Recusada").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(justificativa).first()).toBeVisible();
  });
});
