/**
 * E2E — 36 (SAM-28): perfil público editável, visto pelo atleta.
 *
 * A. Dono da Alpha edita o perfil público em /escola/<id> (modal centralizado):
 *    prêmios, especialidades e responsável → o aluno abre a escola em
 *    /app/escola e vê prêmios e responsável no modal.
 * B. Prof. Ricardo (independente) edita "Meu perfil de professor" em /professor:
 *    marca Natação e informa CREF → o aluno vê chips e credencial no modal de
 *    /app/professor.
 * C. Ricardo desmarca "Aceito atletas independentes" → um aluno sem escola em
 *    comum não vê o formulário de pedido (aviso "atende apenas dentro das
 *    escolas"). Restaura a opção ao final para não quebrar o spec 34.
 */
import { test, expect, type Page } from "@playwright/test";

import { ALUNOS, ESCOLA_1, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";
import { buscarEscolaNoAtleta } from "./school-flows";

const ALUNO_A = ALUNOS[0]!;
const ALUNO_C = ALUNOS[2]!;

test.describe.configure({ mode: "serial", timeout: 240_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function abrirPerfilDoProfessor(page: Page, email: string) {
  await page.goto("/app/professor");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar professor").fill(email);
  await expect.poll(() => page.getByTestId("coach-card").count(), { timeout: 30_000 }).toBe(1);
  await page.getByTestId("coach-card").first().getByRole("button", { name: "Ver perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
  return dialog;
}

async function editarPerfilDoProfessor(page: Page, aceitaIndependentes: boolean, marcarNatacao: boolean, cref?: string) {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor");
  await page.waitForLoadState("load");
  await expect(page.getByTestId("coach-public-profile")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Editar perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (marcarNatacao) await dialog.getByRole("checkbox", { name: "Natação" }).setChecked(true);
  if (cref !== undefined) await dialog.getByLabel("Credenciais (uma por linha)").fill(cref);
  await dialog.getByLabel("Aceito atletas independentes").setChecked(aceitaIndependentes);
  await dialog.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
}

test.describe("36 — Perfil público editável: escola e professor (SAM-28)", () => {
  test("dono edita prêmios, especialidades e responsável; o aluno vê no modal de /app/escola", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}`);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("public-profile-section")).toBeVisible({ timeout: 30_000 });

    const premio = `Campeã estadual de travessia E2E ${Date.now().toString(36)}`;
    await page.getByRole("button", { name: "Editar perfil público" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Prêmios e conquistas (um por linha)").fill(`${premio}\nTop 3 no Brasileiro Master`);
    await dialog.getByLabel("Especialidades (uma por linha)").fill("Travessias em águas abertas\nIniciação adulta");
    // Responsável: um gestor que não seja o dono, quando houver; senão fica o dono (padrão).
    const responsavel = dialog.getByLabel("Responsável administrativo");
    const opcoes = await responsavel.locator("option").allTextContents();
    if (opcoes.length > 1) await responsavel.selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "Salvar perfil público" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("school-achievements-admin")).toContainText(premio, { timeout: 30_000 });
    const nomeResponsavel = (await page.getByTestId("school-responsible-admin").locator("p").first().innerText()).trim();
    console.log(`🏫 perfil público salvo; responsável: ${nomeResponsavel}`);

    // O aluno vê exatamente isso no modal da descoberta.
    await loginComo(page, ALUNO_A);
    const card = await buscarEscolaNoAtleta(page, ESCOLA_1.schoolName);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Ver escola" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByLabel("Carregando perfil da escola")).toHaveCount(0, { timeout: 30_000 });
    await expect(modal.getByTestId("school-achievements")).toContainText(premio);
    await expect(modal.getByTestId("school-achievements")).toContainText("Top 3 no Brasileiro Master");
    await expect(modal.getByTestId("school-specialties")).toContainText("Travessias em águas abertas");
    await expect(modal.getByTestId("school-responsible")).toContainText(nomeResponsavel);
    console.log("👀 aluno vê prêmios, especialidades e responsável");
  });

  test("professor marca Natação e CREF; o aluno vê chips e credencial no modal de /app/professor", async ({ page }) => {
    const cref = `CREF 012345-G/SP (E2E ${Date.now().toString(36)})`;
    await editarPerfilDoProfessor(page, true, true, cref);
    await expect(page.getByTestId("coach-sports-admin")).toContainText("Natação", { timeout: 30_000 });
    await expect(page.getByTestId("coach-credentials-admin")).toContainText(cref);
    console.log("🧑‍🏫 perfil do professor salvo");

    await loginComo(page, ALUNO_A);
    const dialog = await abrirPerfilDoProfessor(page, PROFESSOR_3.email);
    await expect(dialog.getByTestId("coach-sports")).toContainText("Natação");
    await expect(dialog.getByTestId("coach-credentials")).toContainText(cref);
    console.log("👀 aluno vê modalidades e credencial");
  });

  test("professor que não aceita independentes não oferece o pedido fora de escola", async ({ page }) => {
    await editarPerfilDoProfessor(page, false, false);
    await expect(page.getByTestId("coach-independent-flag")).toContainText("apenas dentro das escolas", { timeout: 30_000 });

    try {
      await loginComo(page, ALUNO_C);
      const dialog = await abrirPerfilDoProfessor(page, PROFESSOR_3.email);
      // Sem escola em comum e sem vínculo aberto, não há como pedir: o aviso substitui o formulário.
      const vinculoAberto = await dialog.getByTestId("coach-request-pending").or(dialog.getByText("já acompanha seus treinos")).count();
      if (vinculoAberto === 0) {
        await expect(dialog.getByTestId("coach-schools-only")).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Solicitar acompanhamento" })).toHaveCount(0);
        console.log("🚫 pedido independente indisponível, como o professor escolheu");
      } else {
        console.log("ℹ️  aluno já tem vínculo com o professor; a regra foi exercitada no unitário (COACH_NOT_ACCEPTING_INDEPENDENT)");
      }
    } finally {
      // Restaura para os demais specs (34 depende de pedidos independentes ao Ricardo).
      await editarPerfilDoProfessor(page, true, false);
      await expect(page.getByTestId("coach-independent-flag")).toContainText("Aceita atletas independentes", { timeout: 30_000 });
    }
  });
});
