/**
 * E2E — 33 (SAM-25): o atleta encontra um professor por nome ou e-mail em
 * /app/professor, vê o perfil em modal e pede acompanhamento com o histórico
 * compartilhado por padrão.
 *
 *   aluno → /app/professor → busca "Ana" → card "Ana Lima"
 *         → busca pelo e-mail do Prof. Ricardo (independente) → "Ver perfil"
 *         → "Solicitar acompanhamento" → "Aguardando resposta"
 *         → pedido duplicado pela API é recusado (409)
 *         → "Cancelar pedido" → pode pedir de novo → fica pendente (SAM-26 decide)
 *
 * Usa ALUNOS[1] (e não o cobaia dos specs 10/32) para não misturar estados.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

import { ALUNOS, PROFESSOR_2, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const ALUNO = ALUNOS[1]!;

test.describe.configure({ mode: "serial", timeout: 180_000 });

async function buscarProfessor(page: Page, texto: string): Promise<Locator> {
  await page.goto("/app/professor");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar professor").fill(texto);
  await page.waitForTimeout(2_500); // busca é debounced
  return page.getByTestId("coach-card");
}

async function abrirPerfil(card: Locator, page: Page): Promise<Locator> {
  await card.getByRole("button", { name: "Ver perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // O perfil vem da API depois que o modal abre (no dev server, a 1ª chamada compila a rota).
  await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
  return dialog;
}

test.describe("33 — Atleta solicita acompanhamento a um professor (SAM-25)", () => {
  test("busca por nome e por e-mail encontra o professor certo, sem expor o e-mail", async ({ page }) => {
    await login(page, ALUNO.email, ALUNO.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, ALUNO.name);

    const porNome = await buscarProfessor(page, "Ana");
    await expect(porNome.filter({ hasText: PROFESSOR_2.displayName }).first()).toBeVisible({ timeout: 15_000 });

    const porEmail = await buscarProfessor(page, PROFESSOR_3.email);
    // Busca por e-mail é exata: a lista converge para só o dono daquele e-mail
    // (a 1ª chamada à rota pode levar segundos no dev server enquanto compila).
    await expect.poll(() => porEmail.count(), { timeout: 30_000 }).toBe(1);
    await expect(porEmail.filter({ hasText: PROFESSOR_3.displayName }).first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(PROFESSOR_3.email);
  });

  test("perfil em modal, pedido com histórico por padrão, duplicado recusado, cancelamento e novo pedido", async ({ page }) => {
    await login(page, ALUNO.email, ALUNO.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, ALUNO.name);

    const card = (await buscarProfessor(page, PROFESSOR_3.email)).filter({ hasText: PROFESSOR_3.displayName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    let dialog = await abrirPerfil(card, page);

    await expect(dialog.getByRole("heading", { name: PROFESSOR_3.displayName })).toBeVisible();
    await expect(dialog.getByText(/Na Ryvano desde/i)).toBeVisible();
    await expect(dialog.getByText(/atletas? acompanhados?/i)).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Atua em" })).toBeVisible();

    // Converge: um pedido pendente de rodada anterior é cancelado antes de pedir de novo.
    if (await dialog.getByTestId("coach-request-pending").isVisible({ timeout: 1_000 }).catch(() => false)) {
      await dialog.getByRole("button", { name: "Cancelar pedido" }).click();
      await expect(dialog.getByRole("button", { name: "Solicitar acompanhamento" })).toBeVisible({ timeout: 15_000 });
    }
    // Um acompanhamento já ATIVO não tem como ser desfeito pelo atleta nesta tela.
    expect(
      await dialog.getByText(/já acompanha seus treinos/i).isVisible().catch(() => false),
      `${PROFESSOR_3.displayName} já acompanha ${ALUNO.name}; o estado não converge`,
    ).toBe(false);

    // Histórico compartilhado vem marcado por padrão.
    await expect(dialog.getByTestId("share-history")).toBeChecked();
    await dialog.getByRole("button", { name: "Solicitar acompanhamento" }).click();
    await expect(dialog.getByTestId("coach-request-pending")).toBeVisible({ timeout: 15_000 });

    // O card reflete o estado sem recarregar.
    await page.keyboard.press("Escape");
    await expect(card.getByText(/Aguardando resposta/)).toBeVisible({ timeout: 10_000 });

    // Descobre o coachId pelo botão do card → API: um segundo pedido é recusado.
    const search = await page.request.get(`/api/coaches/search?q=${encodeURIComponent(PROFESSOR_3.email)}`);
    const { items } = (await search.json()) as { items: Array<{ id: string }> };
    const coachId = items[0]!.id;
    const repetido = await page.request.post(`/api/coaches/${coachId}/athlete-requests`, { data: {} });
    expect(repetido.status()).toBe(409);
    expect((await repetido.json()).code).toBe("COACH_ATHLETE_ASSIGNMENT_CONFLICT");

    // Cancelar devolve o botão de pedir; pedir de novo deixa pendente para o professor (SAM-26).
    dialog = await abrirPerfil(card, page);
    await dialog.getByRole("button", { name: "Cancelar pedido" }).click();
    await expect(dialog.getByRole("button", { name: "Solicitar acompanhamento" })).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Solicitar acompanhamento" }).click();
    await expect(dialog.getByTestId("coach-request-pending")).toBeVisible({ timeout: 15_000 });

    // Recarregar mantém o estado vindo do servidor.
    await page.keyboard.press("Escape");
    await page.reload();
    await page.waitForLoadState("load");
    await page.getByLabel("Buscar professor").fill(PROFESSOR_3.email);
    await page.waitForTimeout(2_500);
    await expect(
      page.getByTestId("coach-card").filter({ hasText: PROFESSOR_3.displayName }).first().getByText(/Aguardando resposta/),
    ).toBeVisible({ timeout: 10_000 });
    console.log(`✅ ${ALUNO.name} pediu acompanhamento a ${PROFESSOR_3.displayName} (pendente para a SAM-26)`);
  });
});
