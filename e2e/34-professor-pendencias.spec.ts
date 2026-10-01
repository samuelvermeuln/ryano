/**
 * E2E — 34 (SAM-26): quem recebe um pedido decide no seu contexto.
 *
 * A. Professor independente: Maria (ALUNOS[1]) pede acompanhamento ao Prof.
 *    Ricardo em /app/professor (SAM-25) → Ricardo vê o pedido no hub /professor
 *    (com badge na sidebar) → Aceitar → Maria vê "Seu professor".
 *    Converge: se Ricardo já acompanha Maria, encerra em /professor/independente
 *    antes, para que haja o que pedir e o que aceitar.
 *
 * B. Escola com professor preferido: o aluno-cobaia (último de ALUNOS) pede
 *    vínculo na Alpha escolhendo Carlos (SAM-24) → o dono vê "Professor
 *    preferido: Carlos Mendes" em /escola/<id>/solicitacoes, com o select já
 *    nele → Aprovar → Carlos vê o aluno em /professor/<id>/atletas.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

import { ALUNOS, ESCOLA_1, PROFESSOR_1, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";
import { buscarEscolaNoAtleta, garantirAlunoForaDaEscola, temPedidoPendente } from "./school-flows";

const MARIA = ALUNOS[1]!;
const COBAIA = ALUNOS[ALUNOS.length - 1]!;
const SOBRENOME_COBAIA = COBAIA.name.split(" ")[1]!;

test.describe.configure({ mode: "serial", timeout: 240_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function abrirPerfilDoProfessor(page: Page, email: string, displayName: string): Promise<{ card: Locator; dialog: Locator }> {
  await page.goto("/app/professor");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar professor").fill(email);
  await expect.poll(() => page.getByTestId("coach-card").count(), { timeout: 30_000 }).toBe(1);
  const card = page.getByTestId("coach-card").filter({ hasText: displayName }).first();
  await card.getByRole("button", { name: "Ver perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
  return { card, dialog };
}

test.describe("34 — Pendências do professor e da escola (SAM-26)", () => {
  test("professor independente vê o pedido no hub (com badge), aceita, e o atleta passa a ter o professor", async ({ page }) => {
    // 0. Converge: se Ricardo já acompanha Maria, encerra o acompanhamento.
    await loginComo(page, PROFESSOR_3);
    await page.goto("/professor/independente");
    await page.waitForLoadState("load");
    const ativo = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name });
    if (await ativo.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await ativo.first().getByRole("button", { name: "Encerrar acompanhamento" }).click();
      await ativo.first().getByRole("button", { name: "Confirmar encerramento" }).click();
      await expect(page.getByTestId("independent-athlete").filter({ hasText: MARIA.name })).toHaveCount(0, { timeout: 30_000 });
      console.log("↻ acompanhamento anterior de Maria encerrado para o teste poder pedir de novo");
    }

    // 1. Maria garante um pedido pendente para Ricardo.
    await loginComo(page, MARIA);
    const { dialog } = await abrirPerfilDoProfessor(page, PROFESSOR_3.email, PROFESSOR_3.displayName);
    if (!(await dialog.getByTestId("coach-request-pending").isVisible({ timeout: 1_000 }).catch(() => false))) {
      await dialog.getByRole("button", { name: "Solicitar acompanhamento" }).click();
      await expect(dialog.getByTestId("coach-request-pending")).toBeVisible({ timeout: 15_000 });
    }

    // 2. Ricardo vê o pedido no hub, com badge na navegação, e aceita.
    await loginComo(page, PROFESSOR_3);
    await page.goto("/professor");
    await page.waitForLoadState("load");
    await expect(page.locator("aside nav").getByTestId("nav-badge").first()).toBeVisible({ timeout: 15_000 });
    const pedido = page.getByTestId("coach-request").filter({ hasText: MARIA.name }).first();
    await expect(pedido).toBeVisible({ timeout: 15_000 });
    await expect(pedido.getByText("Independente")).toBeVisible();
    await pedido.getByRole("button", { name: "Aceitar" }).click();
    // O item sai da lista depois do revalidate; esperar o botão sumir passaria
    // cedo demais ("Aceitando…") e a navegação seguinte abortaria a ação.
    await expect(page.getByTestId("coach-request").filter({ hasText: MARIA.name })).toHaveCount(0, { timeout: 45_000 });

    await page.goto("/professor/independente");
    await page.waitForLoadState("load");
    await expect(page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first()).toBeVisible({ timeout: 15_000 });

    // 3. Maria vê "Seu professor".
    await loginComo(page, MARIA);
    const depois = await abrirPerfilDoProfessor(page, PROFESSOR_3.email, PROFESSOR_3.displayName);
    await expect(depois.dialog.getByText(/já acompanha seus treinos/i)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(depois.card.getByText("Seu professor")).toBeVisible();
    console.log(`✅ ${PROFESSOR_3.displayName} aceitou ${MARIA.name}`);
  });

  test("escola vê o professor preferido no pedido e aprova atribuindo-o", async ({ page }) => {
    // 1. Converge para "cobaia fora da escola", a menos que já haja pedido pendente.
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const jaPendente = await temPedidoPendente(page, schoolId, COBAIA);

    if (!jaPendente) {
      expect(await garantirAlunoForaDaEscola(page, schoolId, COBAIA), `Não consegui desligar ${COBAIA.name}`).toBe(true);

      // 2. Cobaia pede vínculo escolhendo Carlos como professor preferido.
      await loginComo(page, COBAIA);
      const cartao = await buscarEscolaNoAtleta(page, ESCOLA_1.schoolName);
      await cartao.getByRole("button", { name: "Ver escola" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByLabel("Carregando perfil da escola")).toHaveCount(0, { timeout: 30_000 });
      await dialog.getByLabel("Professor preferido").selectOption({ label: PROFESSOR_1.displayName });
      await dialog.getByRole("button", { name: /Associar-se à escola/ }).click();
      await expect(dialog.getByTestId("school-request-pending")).toBeVisible({ timeout: 15_000 });
      console.log(`✅ ${COBAIA.name} pediu vínculo preferindo ${PROFESSOR_1.displayName}`);
    } else {
      console.log(`↻ ${COBAIA.name} já estava pendente — retomando na aprovação`);
    }

    // 3. Dono vê a preferência e aprova mantendo Carlos.
    const schoolIdDono = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolIdDono}/solicitacoes`);
    await page.waitForLoadState("load");
    const pedido = page.locator("li").filter({ hasText: new RegExp(SOBRENOME_COBAIA, "i") }).first();
    await expect(pedido).toBeVisible({ timeout: 15_000 });
    if (!jaPendente) {
      await expect(pedido.getByTestId("preferred-coach")).toContainText(PROFESSOR_1.displayName);
    }
    const select = pedido.getByLabel("Professor a atribuir");
    await expect(select).toBeVisible();
    // Garante Carlos selecionado mesmo quando o pedido pendente veio de outra rodada sem preferência.
    const carlosValue = await select.locator("option", { hasText: PROFESSOR_1.displayName }).first().getAttribute("value");
    expect(carlosValue, "Carlos precisa estar entre os professores atribuíveis").toBeTruthy();
    await select.selectOption(carlosValue!);
    await pedido.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.locator("li").filter({ hasText: new RegExp(SOBRENOME_COBAIA, "i") })).toHaveCount(0, { timeout: 45_000 });

    // 4. Carlos vê o aluno entre os seus atletas na escola.
    await loginComo(page, PROFESSOR_1);
    await page.goto(`/professor/${schoolIdDono}/atletas`);
    await page.waitForLoadState("load");
    await expect(page.locator("main").getByText(COBAIA.name).first()).toBeVisible({ timeout: 15_000 });
    console.log(`✅ ${COBAIA.name} aprovado com ${PROFESSOR_1.displayName} como professor`);
  });
});
