/**
 * E2E — 43 (SAM-36): calendário do professor, prescrito × executado, nos dois escopos.
 *
 * Fluxo real: a fixture E2E importa, para o atleta, uma natação de hoje sem
 * prescrição (como uma sync faria, com matching automático) → o calendário da
 * semana mostra um chip "não planejada" no dia de hoje; o modal do chip diz
 * "Atividade importada" / "Não planejada" e linka o detalhe da atividade; o
 * resumo do período conta a não planejada; a visão mensal existe e mostra o
 * mesmo dia. Escola (Carlos → aluno da Alpha, /professor/<id>/agenda) e
 * independente (Ricardo → Maria, /professor/independente/calendario, chegando
 * pela sidebar "Calendário"). Sem fixture o cenário FALHA.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ALUNOS, ESCOLA_1, PROFESSOR_1, PROFESSOR_3 } from "./fixtures";

const MARIA = ALUNOS[1]!;
const TZ = "America/Sao_Paulo";

test.describe.configure({ timeout: 240_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function atletaDaEscola(page: Page, schoolId: string): Promise<{ athleteId: string; email: string }> {
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
    if (aluno) return { athleteId, email: aluno.email };
  }
  throw new Error("fixture: nenhum atleta conhecido no plantel do professor (specs 06/14)");
}

async function abrirPerfilDoProfessor(page: Page, email: string, displayName: string): Promise<{ dialog: Locator }> {
  await page.goto("/app/professor");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar professor").fill(email);
  await expect.poll(() => page.getByTestId("coach-card").count(), { timeout: 30_000 }).toBe(1);
  const card = page.getByTestId("coach-card").filter({ hasText: displayName }).first();
  await card.getByRole("button", { name: "Ver perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
  return { dialog };
}

async function garantirAcompanhamentoIndependente(page: Page): Promise<void> {
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

/** Hoje às 10:00 no fuso da escola (sempre dentro da semana corrente), como instante ISO. */
function hojeAs10(): { iso: string; localDate: string } {
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  return { iso: new Date(`${localDate}T10:00:00-03:00`).toISOString(), localDate };
}

async function importarNatacaoDeHoje(page: Page, email: string, externalId: string) {
  const { iso, localDate } = hojeAs10();
  const response = await page.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: email, startedAt: iso, sportType: "open-water", externalId, autoMatch: true,
      laps: [{ durationSeconds: 1477, distanceMeters: 672, averageHeartRate: 138 }],
    },
  });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
  const body = (await response.json()) as { activityId: string; matching: { skipped: boolean; reason?: string } | null };
  expect(body.matching?.reason === "NO_CANDIDATES" || body.matching?.reason === "ALREADY_LINKED", "a natação não deve casar com prescrição alguma").toBe(true);
  return { activityId: body.activityId, localDate };
}

/** `base` pode já ter query (`?atleta=`); junta com `&` quando precisa. */
function comQuery(base: string, query: string): string {
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}

async function validarCalendario(page: Page, base: string, activityId: string, localDate: string, athleteName: string | null) {
  await page.goto(base);
  await page.waitForLoadState("load");
  await expect(page.getByTestId("agenda-week")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("agenda-summary")).toContainText("não planejada(s)");

  // O chip das 10:00 de hoje é "não planejada" (dashed) e abre o modal com a atividade importada.
  const grid = page.getByTestId("agenda-week-grid");
  const chip = grid.locator(`[data-testid="agenda-slot"][data-slot-key="${localDate}T10:00"]`).first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await expect(chip).toHaveAttribute("data-kind", /unplanned|mixed/);
  await chip.click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  const entrada = dialogo.locator(`[data-testid="agenda-entry"][data-kind="unplanned-import"]`).first();
  await expect(entrada).toBeVisible();
  await expect(entrada).toContainText("Não planejada");
  await expect(entrada).toContainText("Atividade importada");
  if (athleteName) await expect(entrada).toContainText(athleteName);
  const link = entrada.getByRole("link", { name: /Abrir atividade/ });
  expect(await link.getAttribute("href")).toContain(`/atividades/${activityId}`);
  await page.keyboard.press("Escape");

  // Filtro de tipo: só prescrições esconde a natação.
  await page.goto(comQuery(base, "tipo=prescricao"));
  await page.waitForLoadState("load");
  await expect(page.locator(`[data-testid="agenda-slot"][data-slot-key="${localDate}T10:00"][data-kind="unplanned"]`)).toHaveCount(0);

  // Visão mensal: o dia de hoje tem itens (chips, e "+N horário(s)" quando passam de 3).
  await page.goto(comQuery(base, "visao=mes"));
  await page.waitForLoadState("load");
  const monthGrid = page.getByTestId("agenda-month-grid");
  await expect(monthGrid).toBeVisible({ timeout: 30_000 });
  const hoje = monthGrid.locator('td[aria-current="date"]');
  await expect(hoje).toHaveCount(1);
  expect(await hoje.locator('[data-testid="agenda-slot"]').count()).toBeGreaterThan(0);
  await expect(page.getByTestId("agenda-summary")).toContainText("não planejada(s)");
}

test.describe("43 — Calendário do professor: prescrito × executado (SAM-36)", () => {
  test("escola: a agenda de Carlos mostra a natação não planejada do aluno, filtra por tipo e tem visão mensal", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await loginComo(page, PROFESSOR_1);
    const { athleteId, email } = await atletaDaEscola(page, schoolId);
    const { activityId, localDate } = await importarNatacaoDeHoje(page, email, `cal-school-${Date.now().toString(36)}`);
    await validarCalendario(page, `/professor/${schoolId}/agenda?atleta=${athleteId}`, activityId, localDate, null);
  });

  test("independente: Ricardo chega pela sidebar 'Calendário' e vê a natação de Maria", async ({ page }) => {
    await garantirAcompanhamentoIndependente(page);
    await loginComo(page, PROFESSOR_3);
    await page.goto("/professor");
    await page.waitForLoadState("load");
    const item = page.getByRole("link", { name: /Calendário/ }).first();
    expect(await item.getAttribute("href")).toBe("/professor/independente/calendario");

    const { activityId, localDate } = await importarNatacaoDeHoje(page, MARIA.email, `cal-indep-${Date.now().toString(36)}`);
    await validarCalendario(page, "/professor/independente/calendario", activityId, localDate, MARIA.name);
  });
});
