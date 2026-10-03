/**
 * E2E — 47 (SAM-48): um só total planejado em todas as telas e a mesma
 * sessão espelhada por duas conexões contando uma vez.
 *
 * 1. Ricardo (independente) prescreve para Maria "6 × 2 min com 1 min de
 *    descanso + 100 m cada": o total é 6×2 + 5×1 = 17 min (cinco pausas, não
 *    seis — §11.2) e 600 m. O builder, a lista de treinos do professor, o card
 *    do calendário da atleta e o detalhe da atleta mostram o MESMO total.
 * 2. A fixture importa a mesma natação de hoje pelo Garmin e pelo Strava
 *    (mesmo instante e duração): a segunda vira espelho e a agenda do
 *    professor continua com uma entrada "não planejada" naquele horário.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { login, completeOnboarding } from "./helpers";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";

const MARIA = ALUNOS[1]!;
const TZ = "America/Sao_Paulo";
const RUN = Date.now().toString(36);
const TITLE = `E2E 47 totais ${RUN}`;

test.describe.configure({ mode: "serial", timeout: 300_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function abrirPerfilDoProfessor(page: Page): Promise<Locator> {
  await page.goto("/app/professor");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar professor").fill(PROFESSOR_3.email);
  await expect.poll(() => page.getByTestId("coach-card").count(), { timeout: 30_000 }).toBe(1);
  await page.getByTestId("coach-card").first().getByRole("button", { name: "Ver perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
  return dialog;
}

async function garantirAcompanhamento(page: Page) {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  await page.waitForLoadState("load");
  if (await page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first().isVisible({ timeout: 3_000 }).catch(() => false)) return;
  await loginComo(page, MARIA);
  const dialog = await abrirPerfilDoProfessor(page);
  if (!(await dialog.getByTestId("coach-request-pending").isVisible({ timeout: 1_000 }).catch(() => false))) {
    await dialog.getByRole("button", { name: "Solicitar acompanhamento" }).click();
    await expect(dialog.getByTestId("coach-request-pending")).toBeVisible({ timeout: 15_000 });
  }
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor");
  const pedido = page.getByTestId("coach-request").filter({ hasText: MARIA.name }).first();
  await expect(pedido).toBeVisible({ timeout: 15_000 });
  await pedido.getByRole("button", { name: "Aceitar" }).click();
  await expect(page.getByTestId("coach-request").filter({ hasText: MARIA.name })).toHaveCount(0, { timeout: 45_000 });
}

function localDate(offsetDays: number): string {
  const day = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(day);
}

let assignmentId = "";
let athleteId = "";
let durationLabel = "";

test("o total planejado é o mesmo no builder, no hub do professor e nas telas da atleta (§11.2)", async ({ page }) => {
  await garantirAcompanhamento(page);
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const link = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first()
    .getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) });
  athleteId = (await link.getAttribute("href"))!.split("/atletas/")[1]!.split(/[/?#]/)[0]!;

  await page.goto(`/professor/independente/atletas/${athleteId}/treinos/novo`);
  await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 60_000 });
  await page.locator('input[name="title"]').fill(TITLE);
  await page.locator('select[name="sportType"]').selectOption("swim");
  await page.locator('input[name="scheduledAt"]').fill(`${localDate(1)}T07:00`);
  const bloco = page.locator("ol > li").nth(0);
  await bloco.getByLabel("Duração (min)").fill("2");
  await bloco.getByLabel("Distância (m)").fill("100");
  await bloco.getByLabel("Repetições").fill("6");
  await bloco.getByLabel("Descanso (min)").fill("1");

  // Remove os demais blocos do modelo padrão, se houver, para o total ser só o deste.
  const remover = page.getByRole("button", { name: /^Remover bloco / });
  while ((await remover.count()) > 1) await remover.last().click();

  const totais = page.getByTestId("builder-totals");
  await expect(totais).toContainText("600 m");
  const texto = (await totais.innerText()).trim();
  durationLabel = texto.split("⏱")[1]!.split("·")[0]!.trim();
  expect(durationLabel.length, `total do builder: "${texto}"`).toBeGreaterThan(0);
  console.log(`builder: ${texto} (esperado 17 min: 6×2 + 5×1)`);

  await page.getByRole("button", { name: /^Prescrever treino$/ }).click();
  const destino = new RegExp(`/professor/independente/atletas/${athleteId}/treinos(\\?|$)`);
  await expect.poll(async () => {
    if (destino.test(page.url())) return "ok";
    const alertas = await page.locator("form [role=alert], form .text-destructive").allInnerTexts().catch(() => []);
    const texto = alertas.map((value) => value.trim()).filter(Boolean).join(" | ");
    return texto ? `alerta: ${texto}` : "aguardando";
  }, { timeout: 120_000, intervals: [2_000] }).toBe("ok");
  const linha = page.locator(`a[href^="/professor/independente/atletas/${athleteId}/treinos/"]`).filter({ hasText: TITLE }).first();
  await expect(linha).toBeVisible({ timeout: 30_000 });
  assignmentId = (await linha.getAttribute("href"))!.split("/treinos/")[1]!;
  await expect(linha).toContainText(durationLabel);
  await expect(linha).toContainText("600 m");

  await loginComo(page, MARIA);
  await page.goto("/app/treinos?view=list");
  const card = page.locator(`a[href="/app/treinos/${assignmentId}"]`).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText(durationLabel);
  await expect(card).toContainText("600 m");
  await card.click();
  await page.waitForURL(new RegExp(`/app/treinos/${assignmentId}(\\?|$)`), { timeout: 60_000 });
  await expect(page.getByRole("main")).toContainText(durationLabel);
});

test("a mesma sessão vinda do Garmin e do Strava conta uma vez na agenda do professor (AC13)", async ({ page }) => {
  await loginComo(page, PROFESSOR_3);
  const startedAt = new Date(`${localDate(0)}T06:10:00-03:00`).toISOString();
  const importar = async (provider: "GARMIN" | "STRAVA") => {
    const response = await page.request.post("/api/e2e/activity-fixture", {
      data: {
        athleteEmail: MARIA.email, startedAt, sportType: "open-water", externalId: `mirror-${RUN}`, provider, autoMatch: true,
        laps: [{ durationSeconds: 1800, distanceMeters: 1500, averageHeartRate: 140 }],
      },
    });
    expect(response.ok(), `fixture ${provider}: ${response.status()} ${await response.text()}`).toBe(true);
    return (await response.json()) as { activityId: string; duplicateOfActivityId: string | null };
  };

  const garmin = await importar("GARMIN");
  const slot = (await page.goto(`/professor/independente/calendario?atleta=${athleteId}`), page)
    .getByTestId("agenda-week-grid").locator(`[data-testid="agenda-slot"][data-slot-key="${localDate(0)}T06:10"]`).first();
  await expect(slot).toBeVisible({ timeout: 60_000 });
  await slot.click();
  const entradas = page.getByRole("dialog").locator('[data-testid="agenda-entry"][data-kind="unplanned-import"]');
  const antes = await entradas.count();
  expect(antes).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  const strava = await importar("STRAVA");
  expect(strava.duplicateOfActivityId, "a cópia do Strava deve ser marcada como espelho da Garmin").toBe(garmin.activityId);

  await page.goto(`/professor/independente/calendario?atleta=${athleteId}`);
  await page.getByTestId("agenda-week-grid").locator(`[data-testid="agenda-slot"][data-slot-key="${localDate(0)}T06:10"]`).first().click();
  await expect(page.getByRole("dialog").locator('[data-testid="agenda-entry"][data-kind="unplanned-import"]')).toHaveCount(antes);
});
