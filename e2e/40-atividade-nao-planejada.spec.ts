/**
 * E2E — 40 (SAM-33): matching automático na importação e atividade não planejada.
 *
 * Fluxo real: Carlos (PROFESSOR_1, Escola Alpha) prescreve pela UI uma Bike de
 * 45 min para amanhã 07:00 → a fixture E2E (`/api/e2e/activity-fixture` com
 * `autoMatch`, só fora de produção) importa, como uma sync faria, (a) uma
 * natação de hoje: modalidade diferente nunca casa, a atividade fica "não
 * planejada" e aparece no volume da semana como sessão sem prescrição; (b) uma
 * bike amanhã 07:10 de 45 min: casa como AUTO_MATCHED e a prescrição mostra
 * "Realizado". A natação nunca "cumpre" a bike. Re-importar a mesma bike não
 * cria segunda execução (ALREADY_LINKED). Sem fixture o cenário FALHA.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1, ALUNOS } from "./fixtures";

const SCHOOL_TZ = "America/Sao_Paulo";

async function entrarComoProfessor(page: Page) {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);
}

async function atletaFixture(page: Page, schoolId: string): Promise<{ athleteId: string; email: string }> {
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

/** Amanhã (fuso da escola) como `YYYY-MM-DD`. */
function amanha(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
}

/** Bike de 45 min, um bloco, para `when` (datetime-local no fuso da escola). */
async function prescreverBike(page: Page, schoolId: string, athleteId: string, title: string, when: string) {
  await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos/novo`);
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="sportType"]').selectOption("bike");
  await page.locator('input[name="scheduledAt"]').fill(when);
  await page.locator("ol > li").nth(0).getByLabel("Duração (min)").fill("45");
  await page.getByRole("button", { name: /^Prescrever treino$/ }).click();
  // A primeira prescrição depois de subir o dev server leva ~30 s no banco remoto.
  await page.waitForURL(new RegExp(`/professor/${schoolId}/atletas/${athleteId}/treinos(\\?|$)`), { timeout: 90_000 });
  const link = page.locator(`a[href^="/professor/${schoolId}/atletas/${athleteId}/treinos/"]`).filter({ hasText: title }).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  const href = (await link.getAttribute("href"))!;
  return { href, assignmentId: href.split("/treinos/")[1]! };
}

async function importarComMatching(page: Page, email: string, body: { startedAt: string; sportType: string; externalId: string; durationSeconds: number; distanceMeters: number }) {
  const response = await page.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: email, startedAt: body.startedAt, sportType: body.sportType, externalId: body.externalId, autoMatch: true,
      laps: [{ durationSeconds: body.durationSeconds, distanceMeters: body.distanceMeters, averageHeartRate: 138 }],
    },
  });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as {
    activityId: string;
    matchStatus: string | null;
    matching: { skipped: boolean; reason?: string; matchStatus?: string; workoutAssignmentId?: string } | null;
  };
}

test.describe("40 — Atividade não planejada e matching automático (SAM-33)", () => {
  test.setTimeout(240_000);

  test("natação de hoje não casa com a bike prescrita; bike de amanhã casa sozinha; re-sync não duplica", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await entrarComoProfessor(page);
    const { athleteId, email } = await atletaFixture(page, schoolId);
    const stamp = Date.now().toString(36);
    const dia = amanha();
    // Hora variável por execução: prescrições iguais deixadas por execuções
    // anteriores (mesmo dia, mesma modalidade) empatariam no score; a
    // proximidade de horário desempata a favor da prescrição desta execução.
    const hora = String(5 + (Date.now() % 12)).padStart(2, "0");
    const { href, assignmentId } = await prescreverBike(page, schoolId, athleteId, `Bike SAM-33 ${stamp}`, `${dia}T${hora}:00`);

    // (a) Natação de hoje, 24:37 / 672 m: nenhuma prescrição compatível (modalidade diferente).
    const hoje = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const natacao = await importarComMatching(page, email, {
      startedAt: hoje, sportType: "open-water", externalId: `swim-${stamp}`, durationSeconds: 1477, distanceMeters: 672,
    });
    expect(natacao.matching?.skipped).toBe(true);
    expect(natacao.matching?.reason).toBe("NO_CANDIDATES");
    expect(natacao.matchStatus).toBeNull();

    // A bike prescrita continua sem execução: "Realizado" não aparece no card.
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos?filtro=todos`);
    await page.waitForLoadState("load");
    const cardBike = page.locator(`a[href="${href}"]`);
    await expect(cardBike).toBeVisible({ timeout: 15_000 });
    await expect(cardBike).not.toContainText("Realizado");

    // E a natação entra no volume da semana como sessão sem prescrição.
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("week-volume")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=/sessão\\(ões\\) sem prescrição/")).toBeVisible();

    // (b) Bike amanhã, 10 min depois do horário prescrito, 45 min: casa sem ninguém clicar.
    const bikeStartedAt = new Date(`${dia}T${hora}:10:00-03:00`).toISOString();
    const bike = await importarComMatching(page, email, {
      startedAt: bikeStartedAt, sportType: "bike", externalId: `bike-${stamp}`, durationSeconds: 2700, distanceMeters: 21_000,
    });
    expect(bike.matching?.skipped).toBe(false);
    expect(bike.matching?.matchStatus).toBe("AUTO_MATCHED");
    expect(bike.matching?.workoutAssignmentId).toBe(assignmentId);

    // AUTO_MATCHED promove a prescrição a AVAILABLE e grava a execução; o card
    // mostra "Realizado: …" a partir da execução (o status fecha com a aderência).
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos?filtro=todos`);
    await page.waitForLoadState("load");
    await expect(page.locator(`a[href="${href}"]`)).toContainText("Realizado", { timeout: 15_000 });

    // (c) Re-importar a mesma bike (re-sync) é idempotente.
    const again = await importarComMatching(page, email, {
      startedAt: bikeStartedAt, sportType: "bike", externalId: `bike-${stamp}`, durationSeconds: 2700, distanceMeters: 21_000,
    });
    expect(again.activityId).toBe(bike.activityId);
    expect(again.matching).toEqual({ skipped: true, reason: "ALREADY_LINKED" });
  });
});
