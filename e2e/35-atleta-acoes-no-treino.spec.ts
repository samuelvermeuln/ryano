/**
 * E2E — 35 (SAM-27): o atleta age sobre o treino prescrito, e o professor vê.
 *
 * A. Prof. Carlos prescreve um treino para um aluno-fixture → o aluno abre
 *    /atleta/<escola>/treinos/<id>: pede alteração (modal centralizado) e vê o
 *    aviso "Alteração solicitada"; comenta e o comentário entra no fio; informa
 *    falta com justificativa e o status vira "Justificado". Carlos abre o
 *    detalhe do mesmo treino: vê o comentário, o pedido de alteração, e responde
 *    no fio.
 *
 * B. Nova prescrição + atividade casada pela fixture E2E (`/api/e2e/activity-fixture`,
 *    só fora de produção) → o aluno pede revisão → Carlos vê "Revisões pedidas"
 *    no dashboard e o aviso no detalhe → avalia a execução → o pedido fecha
 *    (aviso some, comentário marcado "Revisão feita").
 */
import { test, expect, type Page } from "@playwright/test";

import { ALUNOS, ESCOLA_1, PROFESSOR_1 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";

const SCHOOL_TZ = "America/Sao_Paulo";

test.describe.configure({ mode: "serial", timeout: 240_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

function futureTuesday(weeksAhead: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  const dow = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() - (dow - 1) + weeksAhead * 7 + 1);
  return base.toISOString().slice(0, 10);
}

/** Primeiro atleta do plantel do professor que também é uma fixture conhecida (para logar como ele). */
async function atletaFixture(page: Page, schoolId: string) {
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");
  const cards = page.locator(`a[href^="/professor/${schoolId}/atletas/"]`);
  const count = await cards.count();
  for (let index = 0; index < count; index += 1) {
    const href = await cards.nth(index).getAttribute("href");
    const athleteId = href?.split("/atletas/")[1]?.split(/[/?#]/)[0];
    if (!athleteId) continue;
    const texto = await cards.nth(index).innerText();
    const aluno = ALUNOS.find((candidate) => texto.includes(candidate.name) || texto.includes(candidate.email));
    if (aluno) return { athleteId, aluno };
  }
  throw new Error("fixture: nenhum atleta conhecido no plantel do professor (specs 06/14)");
}

/** Corrida de 10 min (FC 110–130), agendada numa terça futura. */
async function prescrever(page: Page, schoolId: string, athleteId: string, title: string, when: string) {
  await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos/novo`);
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="sportType"]').selectOption("run");
  await page.locator('input[name="scheduledAt"]').fill(when);
  const bloco = page.locator("ol > li").nth(0);
  await bloco.getByLabel("Duração (min)").fill("10");
  await bloco.getByLabel(/^FC mín\./).fill("110");
  await bloco.getByLabel(/^FC máx\./).fill("130");
  await page.getByRole("button", { name: /^Prescrever treino$/ }).click();
  // A 1ª prescrição após subir o dev server compila a server action e abre ~10
  // round trips no banco remoto; 30 s não bastam a frio.
  await page.waitForURL(new RegExp(`/professor/${schoolId}/atletas/${athleteId}/treinos(\\?|$)`), { timeout: 90_000 });

  const link = page.locator(`a[href^="/professor/${schoolId}/atletas/${athleteId}/treinos/"]`).filter({ hasText: title }).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  const href = (await link.getAttribute("href"))!;
  return { href, assignmentId: href.split("/treinos/")[1]! };
}

async function abrirDetalheDoAtleta(page: Page, schoolId: string, assignmentId: string, title: string) {
  await page.goto(`/atleta/${schoolId}/treinos/${assignmentId}`);
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("workout-actions")).toBeVisible();
}

test.describe("35 — Ações do atleta no treino prescrito (SAM-27)", () => {
  test("atleta pede alteração, comenta e justifica falta; o professor vê tudo no detalhe e responde", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await loginComo(page, PROFESSOR_1);
    const { athleteId, aluno } = await atletaFixture(page, schoolId);
    const title = `Ações E2E ${Date.now().toString(36)}`;
    const { assignmentId } = await prescrever(page, schoolId, athleteId, title, `${futureTuesday(7)}T07:30`);

    await loginComo(page, aluno);
    await abrirDetalheDoAtleta(page, schoolId, assignmentId, title);

    // 1. Pedir alteração — modal centralizado, aviso persistente depois.
    const motivo = `Distância acima do que consigo nesta semana (${title}).`;
    await page.getByRole("button", { name: "Pedir alteração" }).click();
    const dialogAlteracao = page.getByRole("dialog");
    await expect(dialogAlteracao).toBeVisible();
    await dialogAlteracao.getByLabel("Motivo da alteração").fill(motivo);
    await dialogAlteracao.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(page.getByTestId("change-requested")).toContainText(motivo, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Pedir alteração" })).toHaveCount(0);
    console.log("✉️  alteração solicitada pelo atleta");

    // 2. Comentar — entra no fio como "Você".
    const comentario = `Comentário E2E do atleta ${Date.now().toString(36)}`;
    await page.getByLabel("Novo comentário").fill(comentario);
    await page.getByRole("button", { name: "Comentar" }).click();
    const meuComentario = page.getByTestId("workout-comment").filter({ hasText: comentario });
    await expect(meuComentario).toBeVisible({ timeout: 30_000 });
    await expect(meuComentario).toContainText("Você");
    console.log("💬 comentário do atleta no fio");

    // 3. Informar falta com justificativa → Justificado (não conta como falta).
    await page.getByRole("button", { name: "Não vou conseguir" }).click();
    const dialogFalta = page.getByRole("dialog");
    await dialogFalta.getByLabel("Justificativa").fill("Viagem de trabalho (E2E).");
    await dialogFalta.getByRole("button", { name: "Registrar falta justificada" }).click();
    await expect(page.getByTestId("assignment-status")).toHaveText(/Justificado/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Não vou conseguir" })).toHaveCount(0);
    console.log("🗓️  falta justificada; status Justificado");

    // 4. O professor vê o comentário e o pedido de alteração no detalhe, e responde no mesmo fio.
    await loginComo(page, PROFESSOR_1);
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos/${assignmentId}`);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("coach-comments-section")).toContainText(comentario, { timeout: 30_000 });
    await expect(page.locator("section").filter({ hasText: "Solicitações de alteração" }).first()).toContainText(motivo);
    await expect(page.getByText("Justificado").first()).toBeVisible();

    const resposta = `Resposta E2E do professor ${Date.now().toString(36)}`;
    await page.getByLabel("Novo comentário").fill(resposta);
    await page.getByRole("button", { name: "Comentar" }).click();
    await expect(page.getByTestId("workout-comment").filter({ hasText: resposta })).toBeVisible({ timeout: 30_000 });
    console.log("💬 professor respondeu no fio");
  });

  test("atleta pede revisão de um treino executado; o professor vê a pendência e a avaliação a encerra", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await loginComo(page, PROFESSOR_1);
    const { athleteId, aluno } = await atletaFixture(page, schoolId);
    const title = `Revisão E2E ${Date.now().toString(36)}`;
    const { assignmentId, href } = await prescrever(page, schoolId, athleteId, title, `${futureTuesday(7)}T07:40`);

    // Atividade Garmin casada pelos casos de uso reais (match + confirmação).
    const fixture = await page.request.post("/api/e2e/activity-fixture", {
      data: { athleteEmail: aluno.email, assignmentId, laps: [{ durationSeconds: 600, distanceMeters: 2000, averageHeartRate: 122 }] },
    });
    expect(fixture.ok(), `fixture de atividade falhou: ${fixture.status()} ${await fixture.text()}`).toBe(true);
    expect((await fixture.json()).matchStatus).toBe("CONFIRMED");

    // 1. Atleta pede revisão.
    await loginComo(page, aluno);
    await abrirDetalheDoAtleta(page, schoolId, assignmentId, title);
    await page.getByRole("button", { name: "Pedir revisão" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Mensagem para a revisão").fill("Pode olhar a FC do bloco principal?");
    await dialog.getByRole("button", { name: "Pedir revisão" }).click();
    await expect(page.getByTestId("review-requested")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("workout-comment").filter({ hasText: "Pode olhar a FC" })).toContainText("Pediu revisão");
    await expect(page.getByRole("button", { name: "Pedir revisão" })).toHaveCount(0);
    console.log("🔎 revisão pedida pelo atleta");

    // 2. Professor vê a pendência no dashboard e no detalhe.
    await loginComo(page, PROFESSOR_1);
    await page.goto(`/professor/${schoolId}`);
    await page.waitForLoadState("load");
    const tile = page.getByText("Revisões pedidas", { exact: true }).locator("xpath=..");
    await expect(tile).toContainText(/[1-9]\d*/, { timeout: 30_000 });

    await page.goto(href);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("review-pending")).toBeVisible({ timeout: 30_000 });

    // 3. Avaliar a execução encerra o pedido.
    await page.getByRole("link", { name: "Avaliar esta execução" }).click();
    await page.waitForURL(/\/avaliar\?execId=/, { timeout: 30_000 });
    await page.locator("#score").fill("8");
    await page.locator("#note").fill("Boa execução, FC dentro da faixa (E2E).");
    await page.getByRole("button", { name: /Salvar avaliação|Atualizar avaliação/ }).click();
    await page.waitForURL(new RegExp(`/professor/${schoolId}/atletas/${athleteId}(\\?|$)`), { timeout: 45_000 });

    await page.goto(href);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("coach-comments-section")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("review-pending")).toHaveCount(0);
    await expect(page.getByTestId("workout-comment").filter({ hasText: "Pode olhar a FC" })).toContainText("Revisão feita");
    console.log("✅ avaliação encerrou o pedido de revisão");
  });
});
