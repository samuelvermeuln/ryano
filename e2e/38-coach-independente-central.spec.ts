/**
 * E2E — 38 (SAM-30): a central do atleta para o professor independente.
 *
 * Ricardo (PROFESSOR_3, sem escola) acompanha Maria (ALUNOS[1]). Antes só a via
 * como nome em /professor/independente; agora o nome abre a mesma central da
 * escola em /professor/independente/atletas/<id>, onde ele prescreve. Maria vê a
 * prescrição em /app/treinos e abre o detalhe em /app/treinos/<id> (sem escola).
 *
 * Converge como o spec 34: se não há vínculo ativo, Maria pede e Ricardo aceita.
 * Idempotente: título único por execução.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const TZ = "America/Sao_Paulo";

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

/** Garante Ricardo → Maria ACTIVE (independente), pedindo e aceitando se preciso. */
async function garantirAcompanhamento(page: Page): Promise<void> {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  await page.waitForLoadState("load");
  const ativo = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name });
  if (await ativo.first().isVisible({ timeout: 3_000 }).catch(() => false)) return;

  await loginComo(page, MARIA);
  const { dialog } = await abrirPerfilDoProfessor(page, PROFESSOR_3.email, PROFESSOR_3.displayName);
  if (!(await dialog.getByTestId("coach-request-pending").isVisible({ timeout: 1_000 }).catch(() => false))) {
    await dialog.getByRole("button", { name: "Solicitar acompanhamento" }).click();
    await expect(dialog.getByTestId("coach-request-pending")).toBeVisible({ timeout: 15_000 });
  }

  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor");
  await page.waitForLoadState("load");
  const pedido = page.getByTestId("coach-request").filter({ hasText: MARIA.name }).first();
  await expect(pedido).toBeVisible({ timeout: 15_000 });
  await pedido.getByRole("button", { name: "Aceitar" }).click();
  await expect(page.getByTestId("coach-request").filter({ hasText: MARIA.name })).toHaveCount(0, { timeout: 45_000 });
}

function amanhaAs(hhmm: string): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return `${base.toISOString().slice(0, 10)}T${hhmm}`;
}

test.describe("38 — Central do atleta independente (SAM-30)", () => {
  const title = `Independente E2E ${Date.now().toString(36)}`;
  let athleteId = "";
  let assignmentId = "";

  test("o professor independente abre a central do atleta e prescreve um treino", async ({ page }) => {
    await garantirAcompanhamento(page);

    // /professor/independente → o nome do atleta é um link para a central.
    await loginComo(page, PROFESSOR_3);
    await page.goto("/professor/independente");
    await page.waitForLoadState("load");
    const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
    await expect(linha).toBeVisible({ timeout: 15_000 });
    const link = linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) });
    const href = (await link.getAttribute("href"))!;
    athleteId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
    await link.click();

    // A central: breadcrumb de volta ao hub independente, rótulo e as mesmas abas.
    await page.waitForURL(new RegExp(`/professor/independente/atletas/${athleteId}(\\?|$)`), { timeout: 30_000 });
    await expect(page.getByText("Acompanhamento independente")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Você é o professor responsável")).toBeVisible();
    const secoes = page.getByRole("navigation", { name: "Seções do atleta" });
    for (const [label, segment] of [["Treinos", "/treinos"], ["Análise", "/analise"], ["Ficha técnica", "/ficha-tecnica"], ["Histórico", "/historico"]] as const) {
      expect(await secoes.getByRole("link", { name: label }).getAttribute("href"))
        .toBe(`/professor/independente/atletas/${athleteId}${segment}`);
    }

    // Prescrever: sem seletor de turma fora da escola.
    await page.getByLabel("Prescrever treino para este atleta").click();
    await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('select[name="teamId"]')).toHaveCount(0);
    await page.locator('input[name="title"]').fill(title);
    await page.locator('select[name="sportType"]').selectOption("run");
    await page.locator('input[name="scheduledAt"]').fill(amanhaAs("07:00"));
    const blocos = page.locator("ol > li");
    await blocos.nth(0).getByLabel("Duração (min)").fill("30");
    await page.getByRole("button", { name: /^Prescrever treino$/ }).click();

    await page.waitForURL(new RegExp(`/professor/independente/atletas/${athleteId}/treinos(\\?|$)`), { timeout: 30_000 });
    const criado = page.locator(`a[href^="/professor/independente/atletas/${athleteId}/treinos/"]`).filter({ hasText: title }).first();
    await expect(criado, "o treino criado deve aparecer na lista de Treinos").toBeVisible({ timeout: 15_000 });
    assignmentId = (await criado.getAttribute("href"))!.split("/treinos/")[1]!;

    // O detalhe (visão do professor) abre no mesmo prefixo e diz que a prescrição é dele.
    await criado.click();
    await expect(page.getByText("Prescrição sua")).toBeVisible({ timeout: 15_000 });
    console.log(`✅ ${PROFESSOR_3.displayName} prescreveu "${title}" para ${MARIA.name} fora de uma escola`);
  });

  test("a atleta vê a prescrição independente no calendário e abre o detalhe sem escola", async ({ page }) => {
    test.skip(!assignmentId, "depende do teste anterior");
    await loginComo(page, MARIA);
    await page.goto("/app/treinos?view=list");
    await page.waitForLoadState("load");
    const card = page.locator(`a[href="/app/treinos/${assignmentId}"]`).first();
    await expect(card, "o card da prescrição independente deve linkar para /app/treinos/<id>").toBeVisible({ timeout: 30_000 });
    await card.click();

    await page.waitForURL(new RegExp(`/app/treinos/${assignmentId}(\\?|$)`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(PROFESSOR_3.displayName).first()).toBeVisible();
    // Fora de uma escola o pedido de alteração não existe (regra SAM-27); comentários sim.
    await expect(page.getByRole("button", { name: /Pedir alteração/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Comentários/i })).toBeVisible();
    console.log(`✅ ${MARIA.name} abriu "${title}" em /app/treinos/${assignmentId}`);
  });
});
