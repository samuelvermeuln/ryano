/**
 * E2E — 39 (SAM-30): transferência do atleta entre acompanhamento independente
 * e escola, sempre proposta pelo professor e confirmada pelo atleta.
 *
 * (B) Escola → independente: Carlos (PROFESSOR_1, ativo na Alpha) propõe, pela
 *     central do atleta-cobaia em /professor/<alpha>/atletas/<id>, continuar
 *     como independente → a cobaia abre /app/professor?professor=<carlos> pela
 *     notificação, vê "Proposta do professor" e confirma → Carlos vê a cobaia
 *     em /professor/independente e a central da escola mostra "Sem professor
 *     responsável"; a cobaia continua membro da Alpha (/escola/<alpha>/atletas).
 *
 * (A) Independente → escola: na sequência, Carlos propõe levar a cobaia de volta
 *     para a Alpha → a cobaia abre /app/escola?school=&coach= pela notificação,
 *     o modal vem com Carlos pré-selecionado e "encerrar vínculo anterior"
 *     marcado → confirma o pedido → o dono aprova com Carlos → a cobaia some de
 *     /professor/independente e volta ao plantel de /professor/<alpha>/atletas.
 *
 * Pré-condição (specs 06/14/34): a cobaia (último de ALUNOS) é membro ACTIVE da
 * Alpha com Carlos como professor responsável. O spec converge para esse estado
 * ao final de (A), então rodar 2× seguidas passa nas duas.
 */
import { test, expect, type Page } from "@playwright/test";

import { ALUNOS, ESCOLA_1, PROFESSOR_1 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";

const COBAIA = ALUNOS[ALUNOS.length - 1]!;
const SOBRENOME_COBAIA = COBAIA.name.split(" ")[1]!;

test.describe.configure({ mode: "serial", timeout: 300_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

/** Id da cobaia pelo href do cartão no plantel de Carlos na Alpha. */
async function cobaiaNoPlantel(page: Page, schoolId: string): Promise<string | null> {
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");
  const card = page.locator(`a[href^="/professor/${schoolId}/atletas/"]`).filter({ hasText: COBAIA.name }).first();
  if (!(await card.isVisible({ timeout: 5_000 }).catch(() => false))) return null;
  const href = (await card.getAttribute("href"))!;
  return href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
}

test.describe("39 — Transferência do atleta (SAM-30)", () => {
  let schoolId = "";
  let athleteId = "";

  test("(B) escola → independente: Carlos propõe, a cobaia confirma, a matrícula fica", async ({ page }) => {
    schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await loginComo(page, PROFESSOR_1);
    const found = await cobaiaNoPlantel(page, schoolId);
    expect(found, `pré-condição: ${COBAIA.name} precisa estar no plantel de ${PROFESSOR_1.displayName} na Alpha (specs 06/14/34)`).toBeTruthy();
    athleteId = found!;

    // 1. Carlos propõe pela central da escola.
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
    await page.waitForLoadState("load");
    const botao = page.getByTestId("transfer-to-independent");
    if (await botao.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await botao.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Enviar proposta" }).click();
      await expect(dialog.getByTestId("transfer-proposed")).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press("Escape");
    } else {
      await expect(page.getByTestId("transfer-pending"), "sem botão nem proposta pendente: estado inesperado").toBeVisible();
      console.log("↻ proposta já estava pendente — retomando na confirmação");
    }

    // 2. A cobaia chega pelo link da notificação e confirma.
    await loginComo(page, COBAIA);
    await page.goto(`/app/professor?professor=${encodeURIComponent(await coachIdDeCarlos(page))}`);
    await page.waitForLoadState("load");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
    await expect(dialog.getByTestId("coach-transfer-proposal")).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Confirmar" }).click();
    await expect(dialog.getByText(/já acompanha seus treinos/i)).toBeVisible({ timeout: 30_000 });

    // 3. Carlos: a cobaia está na central independente; na escola, sem responsável; ainda membro.
    await loginComo(page, PROFESSOR_1);
    await page.goto("/professor/independente");
    await page.waitForLoadState("load");
    await expect(page.getByTestId("independent-athlete").filter({ hasText: COBAIA.name }).first()).toBeVisible({ timeout: 15_000 });
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
    await page.waitForLoadState("load");
    await expect(page.getByText("Sem professor responsável")).toBeVisible({ timeout: 15_000 });

    await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");
    await expect(page.locator("main").getByText(new RegExp(SOBRENOME_COBAIA, "i")).first()).toBeVisible({ timeout: 15_000 });
    console.log(`✅ ${COBAIA.name} continua com ${PROFESSOR_1.displayName} fora da escola, e segue membro da Alpha`);
  });

  test("(A) independente → escola: Carlos propõe, a cobaia pede o vínculo seguindo-o, o dono aprova", async ({ page }) => {
    test.skip(!athleteId, "depende do teste anterior");

    // 0. A cobaia precisa sair da Alpha para poder pedir de novo (o dono a desliga).
    const schoolIdDono = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolIdDono}/atletas`);
    await page.waitForLoadState("load");
    const linha = page.locator("li").filter({ hasText: new RegExp(SOBRENOME_COBAIA, "i") }).first();
    const desligar = linha.getByRole("button", { name: /Desligar|Remover/ }).first();
    if (await desligar.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await desligar.click();
      const confirmar = page.getByRole("button", { name: /Confirmar/ }).first();
      if (await confirmar.isVisible({ timeout: 3_000 }).catch(() => false)) await confirmar.click();
      await expect(page.locator("li").filter({ hasText: new RegExp(SOBRENOME_COBAIA, "i") })).toHaveCount(0, { timeout: 45_000 });
    }

    // 1. Carlos propõe levar a cobaia para a Alpha, pela central independente.
    await loginComo(page, PROFESSOR_1);
    await page.goto(`/professor/independente/atletas/${athleteId}`);
    await page.waitForLoadState("load");
    await page.getByTestId("transfer-to-school").click();
    const proposta = page.getByRole("dialog");
    await proposta.getByLabel("Escola").selectOption({ label: ESCOLA_1.schoolName });
    await proposta.getByRole("button", { name: "Enviar proposta" }).click();
    await expect(proposta.getByTestId("transfer-proposed")).toBeVisible({ timeout: 30_000 });

    // 2. A cobaia chega pelo link SAM-29 com Carlos pré-selecionado e "encerrar anterior" marcado.
    await loginComo(page, COBAIA);
    await page.goto(`/app/escola?school=${schoolIdDono}&coach=${encodeURIComponent(await coachIdDeCarlos(page))}`);
    await page.waitForLoadState("load");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByLabel("Carregando perfil da escola")).toHaveCount(0, { timeout: 30_000 });
    await expect(dialog.getByLabel("Professor preferido")).toHaveValue(/.+/);
    await expect(dialog.getByTestId("end-previous-coaching")).toBeChecked();
    await dialog.getByRole("button", { name: /Associar-se à escola/ }).click();
    await expect(dialog.getByTestId("school-request-pending")).toBeVisible({ timeout: 15_000 });

    // 3. O dono aprova mantendo Carlos; o vínculo independente encerra.
    await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolIdDono}/solicitacoes`);
    await page.waitForLoadState("load");
    const pedido = page.locator("li").filter({ hasText: new RegExp(SOBRENOME_COBAIA, "i") }).first();
    await expect(pedido).toBeVisible({ timeout: 15_000 });
    const select = pedido.getByLabel("Professor a atribuir");
    const carlosValue = await select.locator("option", { hasText: PROFESSOR_1.displayName }).first().getAttribute("value");
    await select.selectOption(carlosValue!);
    await pedido.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.locator("li").filter({ hasText: new RegExp(SOBRENOME_COBAIA, "i") })).toHaveCount(0, { timeout: 45_000 });

    await loginComo(page, PROFESSOR_1);
    await page.goto("/professor/independente");
    await page.waitForLoadState("load");
    await expect(page.getByTestId("independent-athlete").filter({ hasText: COBAIA.name })).toHaveCount(0, { timeout: 15_000 });
    expect(await cobaiaNoPlantel(page, schoolIdDono)).toBe(athleteId);
    console.log(`✅ ${COBAIA.name} voltou para a Alpha com ${PROFESSOR_1.displayName}; o vínculo independente foi encerrado`);
  });
});

/** O id do CoachProfile de Carlos, lido do link "Ver perfil" na busca do atleta (nunca id fixo). */
async function coachIdDeCarlos(page: Page): Promise<string> {
  await page.goto("/app/professor");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar professor").fill(PROFESSOR_1.email);
  await expect.poll(() => page.getByTestId("coach-card").count(), { timeout: 30_000 }).toBe(1);
  await page.getByTestId("coach-card").first().getByRole("button", { name: "Ver perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
  const response = await page.waitForResponse((r) => r.url().includes("/api/coaches/") && r.url().endsWith("/profile"), { timeout: 1_000 }).catch(() => null);
  const url = response?.url() ?? "";
  const fromResponse = url.split("/api/coaches/")[1]?.split("/")[0];
  await page.keyboard.press("Escape");
  if (fromResponse) return fromResponse;
  // Fallback: the modal's profile fetch already happened; read it from performance entries.
  const entries = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  const match = entries.map((name) => /\/api\/coaches\/([^/]+)\/profile/.exec(name)?.[1]).find(Boolean);
  if (!match) throw new Error("não foi possível descobrir o id do professor");
  return match;
}
