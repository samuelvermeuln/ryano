/**
 * SAM-18 — zonas completas na ficha técnica + builder com alvos por zona,
 * ritmo, potência e RPE.
 *
 * Fluxo real: o professor preenche FCmáx, FC de limiar, ritmo de limiar e FTP
 * e escolhe o método %LTHR → a ficha mostra as zonas de FC por LTHR, de ritmo
 * e de potência e o histórico registra o valor anterior/novo → prescreve
 * (corrida) escolhendo "Z4" no bloco, que preenche FC e ritmo, e RPE →
 * o detalhe mostra os alvos; refresh confirma. Em bike o alvo vira potência.
 * Mobile incluído.
 *
 * Idempotente: valores distintos por execução (FCmáx alterna 190/191, …), de
 * modo que cada run gera uma revisão nova com antes/depois.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1 } from "./fixtures";

const SCHOOL_TZ = "America/Sao_Paulo";

async function entrarComoProfessor(page: Page) {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);
}

async function primeiroAtleta(page: Page, schoolId: string): Promise<string> {
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");
  const href = await page.locator(`a[href^="/professor/${schoolId}/atletas/"]`).first().getAttribute("href");
  const athleteId = href?.split("/atletas/")[1]?.split(/[/?#]/)[0];
  if (!athleteId) throw new Error("fixture: professor sem atleta no plantel (specs 06/14)");
  return athleteId;
}

function futureTuesday(weeksAhead: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() - (dow - 1) + weeksAhead * 7 + 1);
  return base.toISOString().slice(0, 10);
}

/** FCmáx alterna entre execuções, para que cada run grave uma revisão com antes ≠ depois. */
function parametros() {
  const odd = Math.floor(Date.now() / 60_000) % 2 === 1;
  return { maxHeartRate: odd ? 191 : 190, thresholdHeartRate: 170, thresholdPace: "5:00", ftp: 250 };
}

async function salvarFicha(page: Page, schoolId: string, athleteId: string, p: ReturnType<typeof parametros>) {
  await page.goto(`/professor/${schoolId}/atletas/${athleteId}/ficha-tecnica`);
  await page.waitForLoadState("load");
  await page.getByRole("button", { name: /Editar ficha|Adicionar ficha/i }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await modal.getByLabel(/FC máxima/i).fill(String(p.maxHeartRate));
  await modal.getByLabel(/FC de limiar/i).fill(String(p.thresholdHeartRate));
  await modal.getByLabel(/Ritmo de limiar/i).fill(p.thresholdPace);
  await modal.getByLabel(/FTP/i).fill(String(p.ftp));
  await modal.locator('select[name="heartRateZoneMethod"]').selectOption("LTHR");
  await modal.getByRole("button", { name: /Salvar/i }).first().click();
  await expect(modal).toBeHidden({ timeout: 15_000 });
}

async function validarFicha(page: Page, p: ReturnType<typeof parametros>) {
  await page.reload();
  await page.waitForLoadState("load");

  // Zonas de FC pelo método escolhido (%LTHR de 170: Z4 = 162–170 bpm).
  const hr = page.getByTestId("zones-heart-rate");
  await expect(hr).toHaveAttribute("data-method", "LTHR");
  await expect(hr).toContainText("LTHR");
  await expect(hr).toContainText("162–170 bpm");
  await expect(page.getByText("Método: % FC de limiar")).toBeVisible();

  // Ritmo (5:00/km de limiar: Z4 = 4:48–5:16) e potência (250 W: Z4 = 225–263 W); natação ausente (sem CSS).
  await expect(page.getByTestId("zones-pace")).toContainText("4:48 /km – 5:16 /km");
  await expect(page.getByTestId("zones-power")).toContainText("225–263 W");
  await expect(page.getByTestId("zones-swim")).toHaveCount(0);

  // Histórico: a revisão mais recente traz a FCmáx nova com autor e data.
  const history = page.getByTestId("parameter-history");
  await expect(history).toBeVisible();
  const latest = history.locator('[data-testid="parameter-revision"]').first();
  await expect(latest).toContainText(`${p.maxHeartRate} bpm`);
  await expect(latest).toContainText(/Carlos|Mendes|prof\.carlos/);
  await expect(latest).toContainText("→");
}

test.describe("29 — Zonas na ficha técnica e alvos no builder (SAM-18)", () => {
  test.setTimeout(240_000);

  test("ficha: FCmáx + limiar + ritmo + FTP com método LTHR → zonas e histórico; builder: Z4 preenche FC e ritmo", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await entrarComoProfessor(page);
    const athleteId = await primeiroAtleta(page, schoolId);
    const p = parametros();
    await salvarFicha(page, schoolId, athleteId, p);
    await validarFicha(page, p);

    // Builder (corrida): escolher Z4 preenche FC mín/máx (LTHR) e o ritmo (meio da faixa Z4 = 5:02).
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos/novo`);
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });
    const title = `Zonas builder ${Date.now().toString(36)}`;
    await page.locator('input[name="title"]').fill(title);
    await page.locator('select[name="sportType"]').selectOption("run");
    await expect(page.getByTestId("target-kind")).toHaveAttribute("data-kind", "pace");
    await page.locator('input[name="scheduledAt"]').fill(`${futureTuesday(7)}T07:00`);

    const bloco = page.locator("ol > li").first();
    // Pré-preenchido pela ficha: o aquecimento nasce em Z2.
    await expect(bloco.getByTestId("block-zone")).toHaveValue("2");
    await bloco.getByLabel("Duração (min)").fill("20");
    await bloco.getByTestId("block-zone").selectOption("4");
    await expect(bloco.getByLabel(/^FC mín\./)).toHaveValue("162");
    await expect(bloco.getByLabel(/^FC máx\./)).toHaveValue("170");
    await expect(bloco.getByLabel(/^Ritmo/)).toHaveValue("5:02");
    await bloco.getByLabel(/^RPE/).fill("8");

    // Bike: o alvo extra vira potência e o seletor de zona preenche watts.
    await page.locator('select[name="sportType"]').selectOption("bike");
    await expect(page.getByTestId("target-kind")).toHaveAttribute("data-kind", "power");
    await expect(bloco.getByLabel(/^Potência/)).toBeVisible();
    await expect(bloco.getByLabel(/^Ritmo/)).toHaveCount(0);
    await bloco.getByTestId("block-zone").selectOption("3");
    await expect(bloco.getByLabel(/^Potência/)).toHaveValue("207"); // meio de Z3 (188–225 W)
    // De volta à corrida, com Z4.
    await page.locator('select[name="sportType"]').selectOption("run");
    await bloco.getByTestId("block-zone").selectOption("4");

    await page.getByRole("button", { name: /^Prescrever treino$/ }).click();
    await page.waitForURL(new RegExp(`/professor/${schoolId}/atletas/${athleteId}/treinos(\\?|$)`), { timeout: 30_000 });
    const link = page.locator(`a[href^="/professor/${schoolId}/atletas/${athleteId}/treinos/"]`).filter({ hasText: title }).first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await page.goto((await link.getAttribute("href"))!);
    await page.waitForLoadState("load");

    // Detalhe: os alvos salvos (FC, ritmo, zona, RPE) renderizados por describeBlockTargets.
    const estrutura = page.locator("ol").filter({ hasText: "Aquecimento" }).first();
    await expect(estrutura).toContainText("FC: 162–170 bpm");
    await expect(estrutura).toContainText("Pace: 5:02 /km");
    await expect(estrutura).toContainText("Zona 4");
    await expect(estrutura).toContainText("RPE 8/10");
    await page.reload();
    await page.waitForLoadState("load");
    await expect(page.locator("ol").filter({ hasText: "Aquecimento" }).first()).toContainText("Pace: 5:02 /km");
  });

  test("mobile: zonas e histórico cabem na tela; builder mostra o seletor de zona", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
      await entrarComoProfessor(page);
      const athleteId = await primeiroAtleta(page, schoolId);
      // Autossuficiente: o plantel pode ordenar outro atleta no mobile, então a ficha é salva aqui também.
      const p = parametros();
      await salvarFicha(page, schoolId, athleteId, p);
      await validarFicha(page, p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await page.getByTestId("zones-pace").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);

      await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos/novo`);
      await page.waitForLoadState("load");
      await expect(page.locator("ol > li").first().getByTestId("block-zone")).toBeVisible({ timeout: 15_000 });
    } finally {
      await mobile.close();
    }
  });
});
