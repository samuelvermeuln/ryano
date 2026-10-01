/**
 * SAM-17 — Detalhe do treino do professor com zonas, laps e planejado × realizado
 * por bloco, a partir da atividade importada vinculada à execução.
 *
 * Fluxo real: o professor prescreve pela UI um treino estruturado
 * (aquecimento 10 min + 3×4 min com 2 min de descanso) → a fixture E2E
 * (`/api/e2e/activity-fixture`, só fora de produção) simula a sincronização de
 * uma atividade Garmin com 6 splits e tempo em zonas e roda os casos de uso
 * REAIS de match + confirmação → o detalhe mostra zonas (bpm/%), tabela de
 * laps com o lap de recuperação identificado, overlay bloco a bloco com
 * veredito e totais planejados com repetições e descanso. Sem fixture o
 * cenário FALHA (nenhum `return` silencioso). Mobile incluído.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1, ALUNOS } from "./fixtures";

const SCHOOL_TZ = "America/Sao_Paulo";

async function entrarComoProfessor(page: Page) {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);
}

function futureTuesday(weeksAhead: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() - (dow - 1) + weeksAhead * 7 + 1);
  return base.toISOString().slice(0, 10);
}

/** Primeiro atleta do plantel do professor que também é uma fixture conhecida (para o e-mail). */
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

/** Aquecimento 10 min (FC 110–130) + 3×4 min (FC 160–175, descanso 2 min). */
async function prescreverEstruturado(page: Page, schoolId: string, athleteId: string, title: string, when: string) {
  await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos/novo`);
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[name="title"]').fill(title);
  // Corrida: o ritmo dos laps sai em /km (na natação seria /100 m, "Volta").
  await page.locator('select[name="sportType"]').selectOption("run");
  await page.locator('input[name="scheduledAt"]').fill(when);

  const blocos = page.locator("ol > li");
  await blocos.nth(0).getByLabel("Duração (min)").fill("10");
  await blocos.nth(0).getByLabel(/^FC mín\./).fill("110");
  await blocos.nth(0).getByLabel(/^FC máx\./).fill("130");

  await page.getByRole("button", { name: "Adicionar bloco" }).click();
  await expect(blocos).toHaveCount(2);
  await blocos.nth(1).getByLabel("Duração (min)").fill("4");
  await blocos.nth(1).getByLabel("Repetições").fill("3");
  await blocos.nth(1).getByLabel(/^FC mín\./).fill("160");
  await blocos.nth(1).getByLabel(/^FC máx\./).fill("175");
  await blocos.nth(1).getByLabel("Descanso (min)").fill("2");

  await page.getByRole("button", { name: /^Prescrever treino$/ }).click();
  await page.waitForURL(new RegExp(`/professor/${schoolId}/atletas/${athleteId}/treinos(\\?|$)`), { timeout: 30_000 });

  const link = page.locator(`a[href^="/professor/${schoolId}/atletas/${athleteId}/treinos/"]`).filter({ hasText: title }).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  const href = (await link.getAttribute("href"))!;
  return { href, assignmentId: href.split("/treinos/")[1] };
}

/** 6 laps como o relógio gravaria a estrutura: aquec., rep1, desc., rep2, desc., rep3 (a última acima da faixa). */
const LAPS = [
  { durationSeconds: 600, distanceMeters: 2000, averageHeartRate: 125 },
  { durationSeconds: 240, distanceMeters: 1000, averageHeartRate: 168 },
  { durationSeconds: 120, distanceMeters: 300, averageHeartRate: 120 },
  { durationSeconds: 240, distanceMeters: 1000, averageHeartRate: 170 },
  { durationSeconds: 120, distanceMeters: 300, averageHeartRate: 118 },
  { durationSeconds: 240, distanceMeters: 1000, averageHeartRate: 182 },
];

async function vincularAtividade(page: Page, athleteEmail: string, assignmentId: string) {
  const response = await page.request.post("/api/e2e/activity-fixture", {
    data: { athleteEmail, assignmentId, laps: LAPS },
  });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
  const body = await response.json();
  // O caminho real de match gravou o vínculo explícito execução → atividade.
  expect(body.executionActivityId).toBe(body.activityId);
  expect(body.matchStatus).toBe("CONFIRMED");
  return body as { activityId: string; executionId: string };
}

async function validarDetalhe(page: Page, href: string) {
  await page.goto(href);
  await page.waitForLoadState("load");

  // (d) Totais planejados com repetições e descanso: 10 + 3×(4+2) = 28 min.
  const prescrito = page.locator("table").filter({ hasText: "Prescrito" }).first();
  await expect(prescrito).toContainText("28 min");
  await expect(prescrito).toContainText("26 min"); // Σ laps realizados = 1560 s

  // SAM-19 — casar a execução calculou a aderência sem passo manual: a linha
  // "Aderência" tem nota (não "—") e o breakdown inclui `zones` vindo dos laps,
  // ponderado pela duração: aquecimento 600 s (125 ∈ 110–130) + reps 240 s ×2
  // (168/170 ∈ 160–175) na faixa, 182 fora → 1080/1320 = 82%.
  const aderencia = prescrito.locator("tr").filter({ hasText: "Aderência" });
  await expect(aderencia).toContainText(/\d\.\d\/10/);
  const breakdown = page.locator("section").filter({ hasText: "Aderência por dimensão" }).first();
  await expect(breakdown).toBeVisible();
  await expect(breakdown).toContainText("Compliance Ryvano");
  await expect(breakdown).toContainText("Zonas");
  await expect(breakdown.locator("dd").filter({ hasText: /^8\.2$/ })).toHaveCount(1);

  // (a) Zonas com bpm e % — nenhuma "Zona 3" (nenhum lap entre 140 e 160 bpm).
  const zonas = page.getByTestId("zones-heart-rate-zones");
  await expect(zonas).toBeVisible();
  await expect(zonas).toContainText("bpm");
  await expect(zonas).toContainText("Zona 4");
  await expect(zonas).toContainText("%");
  await expect(zonas).not.toContainText("Zona 3");

  // (b) Laps: 6 linhas, 2 de recuperação, ritmo e FC por lap.
  const laps = page.getByTestId("laps-table").locator('[data-testid="lap-row"]');
  await expect(laps).toHaveCount(6);
  await expect(page.getByTestId("laps-table").locator('[data-recovery="true"]')).toHaveCount(2);
  await expect(laps.nth(1)).toContainText("4:00 /km");
  await expect(laps.nth(1)).toContainText("168");

  // (c) Overlay bloco a bloco: 6 segmentos, vereditos pela FC, última rep acima.
  const overlay = page.getByTestId("overlay-table").locator('[data-testid="overlay-row"]');
  await expect(overlay).toHaveCount(6);
  await expect(page.getByTestId("overlay-table").locator('[data-kind="rest"]')).toHaveCount(2);
  await expect(page.getByTestId("overlay-table").locator('[data-verdict="within"]')).toHaveCount(3);
  await expect(page.getByTestId("overlay-table").locator('[data-verdict="above"]')).toHaveCount(1);
  await expect(page.getByTestId("overlay-table").locator('[data-verdict="unknown"]')).toHaveCount(2);
  await expect(overlay.nth(5)).toContainText("rep. 3");
  await expect(overlay.nth(5)).toContainText("182 bpm");
  await expect(overlay.nth(5)).toContainText("Acima");
  await expect(page.getByTestId("insights-overlay")).toContainText("Resultado por FC média");
}

test.describe("28 — Detalhe do treino: zonas, laps e overlay (SAM-17)", () => {
  test.setTimeout(240_000);

  test("sem atividade: estado vazio honesto", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await entrarComoProfessor(page);
    const { athleteId } = await atletaFixture(page, schoolId);
    const { href } = await prescreverEstruturado(page, schoolId, athleteId, `Zonas vazio ${Date.now().toString(36)}`, `${futureTuesday(6)}T07:10`);
    await page.goto(href);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("insights-empty")).toContainText("Nenhuma atividade importada para este treino.");
    await expect(page.getByTestId("laps-table")).toHaveCount(0);
  });

  test("com atividade vinculada: zonas, laps, overlay e totais com repetições", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await entrarComoProfessor(page);
    const { athleteId, email } = await atletaFixture(page, schoolId);
    const { href, assignmentId } = await prescreverEstruturado(page, schoolId, athleteId, `Zonas E2E ${Date.now().toString(36)}`, `${futureTuesday(6)}T07:20`);

    await vincularAtividade(page, email, assignmentId);
    await validarDetalhe(page, href);

    // Reload confirma que tudo vem do banco (sem estado de cliente).
    await page.reload();
    await page.waitForLoadState("load");
    await expect(page.getByTestId("laps-table").locator('[data-testid="lap-row"]')).toHaveCount(6);
  });

  test("mobile: as seções cabem sem overflow horizontal da página", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
      await entrarComoProfessor(page);
      const { athleteId, email } = await atletaFixture(page, schoolId);
      const { href, assignmentId } = await prescreverEstruturado(page, schoolId, athleteId, `Zonas mobile ${Date.now().toString(36)}`, `${futureTuesday(6)}T07:30`);
      await vincularAtividade(page, email, assignmentId);
      await validarDetalhe(page, href);

      // As tabelas rolam dentro do próprio contêiner; a página não.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await page.getByTestId("zones-heart-rate-zones").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    } finally {
      await mobile.close();
    }
  });
});
