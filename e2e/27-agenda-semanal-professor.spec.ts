/**
 * SAM-16 — Agenda semanal do professor.
 *
 * Fluxo real pela UI: o professor prescreve DOIS treinos no mesmo horário para
 * DOIS atletas → a agenda mostra UM chip "2 atletas" no dia/horário da escola →
 * expandir lista os dois → abrir detalhe → remarcar um deles → a grade reflete
 * (chips separados) → refresh confirma o banco → o horário digitado aparece
 * igual no professor e no atleta. Depois, o mesmo em viewport mobile (visão diária).
 *
 * Fixture: ESCOLA_1 com PROFESSOR_1 responsável por ≥2 atletas (specs 06/14).
 * Idempotente: cada execução usa uma semana futura distinta (semana atual + 3..6)
 * e um título único, então rodar duas vezes seguidas passa nas duas.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1, ALUNOS } from "./fixtures";

const SCHOOL_TZ = "America/Sao_Paulo";

async function entrarComoProfessor(page: Page) {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);
}

/**
 * Horário único por execução (HH:mm entre 05:00 e 20:59, derivado da hora e do
 * minuto atuais): dois runs no mesmo dia não caem no mesmo slot, e o slot criado
 * aqui não herda sobras de execuções anteriores — só o minuto colidia entre
 * horas diferentes.
 */
function uniqueTime(): string {
  const now = new Date();
  const hh = String(5 + (now.getHours() % 16)).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** "HH:mm" deslocado em `hours` (para remarcar sem cair no mesmo slot). */
function shiftHour(hhmm: string, hours: number): string {
  const [hh, mm] = hhmm.split(":");
  return `${String(Number(hh) + hours).padStart(2, "0")}:${mm}`;
}

/** "YYYY-MM-DD" de hoje no fuso da escola, e a terça-feira de uma semana futura. */
function futureTuesday(weeksAhead: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay() || 7; // 1..7
  base.setUTCDate(base.getUTCDate() - (dow - 1) + weeksAhead * 7 + 1); // terça
  return base.toISOString().slice(0, 10);
}

function isoWeek(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Ids dos atletas do plantel do professor (pelos hrefs, nunca id fixo). */
async function atletasDoProfessor(page: Page, schoolId: string): Promise<string[]> {
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");
  const hrefs = await page.locator(`a[href^="/professor/${schoolId}/atletas/"]`).evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  return [...new Set(hrefs.map((href) => href.split("/atletas/")[1]?.split(/[/?#]/)[0]).filter(Boolean))] as string[];
}

async function prescrever(page: Page, schoolId: string, athleteId: string, title: string, when: string) {
  await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos/novo`);
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });
  // O formulário diz em qual relógio o horário é lido.
  await expect(page.getByText(/Horário da escola/)).toBeVisible();

  await page.locator('input[name="title"]').fill(title);
  await page.locator('input[name="scheduledAt"]').fill(when);
  await page.getByLabel("Duração (min)").first().fill("40");
  await page.getByRole("button", { name: /^Prescrever treino$/ }).click();
  // A primeira prescrição após subir o dev server leva ~30 s no banco remoto.
  await page.waitForURL(new RegExp(`/professor/${schoolId}/atletas/${athleteId}/treinos(\\?|$)`), { timeout: 90_000 });
}

test.describe("27 — Agenda semanal do professor (SAM-16)", () => {
  // Cada prescrição pela UI leva até ~90 s no banco remoto; os fluxos fazem duas e remarcam
  // (o mobile estourou 420 s com o banco lento).
  test.setTimeout(600_000);

  test("mesmo horário → chip agrupado → expandir → detalhe → remarcar → grade e banco refletem", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await entrarComoProfessor(page);
    const atletas = await atletasDoProfessor(page, schoolId);
    expect(atletas.length, "fixture precisa de ≥2 atletas do professor (specs 06/14)").toBeGreaterThanOrEqual(2);

    const suffix = Date.now().toString(36);
    const tuesday = futureTuesday(3);
    const hhmm = uniqueTime();
    const when = `${tuesday}T${hhmm}`;
    const titleA = `Agenda E2E A ${suffix}`;
    const titleB = `Agenda E2E B ${suffix}`;
    await prescrever(page, schoolId, atletas[0], titleA, when);
    await prescrever(page, schoolId, atletas[1], titleB, when);

    // Sidebar: item "Agenda" ativo e único no shell padrão.
    await page.goto(`/professor/${schoolId}/agenda?semana=${isoWeek(tuesday)}`);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("active-context")).toHaveAttribute("data-context-key", "professor");
    const ativos = page.locator('aside nav a[aria-current="page"]');
    await expect(ativos).toHaveCount(1);
    await expect(ativos).toHaveText(/Agenda/);

    // Semana com 7 colunas (+ coluna de hora) e a terça marcada.
    const grid = page.getByTestId("agenda-week-grid");
    await expect(grid.locator("thead th")).toHaveCount(8);
    await expect(page.getByTestId("agenda-week")).toContainText(isoWeek(tuesday));

    // UM chip com os dois atletas no horário digitado (horário da escola, não UTC).
    const chip = grid.locator(`[data-testid="agenda-slot"][data-slot-key="${when}"]`);
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveAttribute("data-count", "2");
    await expect(chip).toContainText(hhmm);
    await expect(chip).toContainText("2 atletas");

    // Expandir: modal centralizado lista os dois com status e link.
    await chip.click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    const entradas = dialogo.getByTestId("agenda-entry");
    await expect(entradas).toHaveCount(2);
    await expect(dialogo).toContainText(titleA);
    await expect(dialogo).toContainText(titleB);
    await expect(dialogo.getByText("Agendado")).toHaveCount(2);

    // Abrir detalhe do primeiro e voltar.
    const entradaA = entradas.filter({ hasText: titleA });
    const detalheHref = await entradaA.getByRole("link", { name: /Abrir treino de/ }).getAttribute("href");
    expect(detalheHref).toMatch(new RegExp(`^/professor/${schoolId}/atletas/${atletas[0]}/treinos/`));
    await entradaA.getByRole("link", { name: /Abrir treino de/ }).click();
    await page.waitForURL(new RegExp(detalheHref!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 30_000 });
    // O detalhe exibe o mesmo relógio digitado.
    await expect(page.locator("main")).toContainText(hhmm);
    await page.goBack();
    await page.waitForLoadState("load");

    // Remarcar o primeiro para uma hora depois, no mesmo dia (motivo auditado).
    const moved = shiftHour(hhmm, 1);
    await grid.locator(`[data-testid="agenda-slot"][data-slot-key="${when}"]`).click();
    const entradaARemarcar = page.getByRole("dialog").getByTestId("agenda-entry").filter({ hasText: titleA });
    await entradaARemarcar.getByRole("button", { name: "Remarcar" }).click();
    await entradaARemarcar.locator('input[name="scheduledAt"]').fill(`${tuesday}T${moved}`);
    await entradaARemarcar.locator('input[name="reason"]').fill("Chuva prevista");
    await entradaARemarcar.getByRole("button", { name: /Confirmar remarcação/ }).click();

    // A grade reflete: dois chips separados, cada um com um atleta.
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
    const chip0600 = grid.locator(`[data-testid="agenda-slot"][data-slot-key="${when}"]`);
    const chip0730 = grid.locator(`[data-testid="agenda-slot"][data-slot-key="${tuesday}T${moved}"]`);
    await expect(chip0600).toHaveAttribute("data-count", "1", { timeout: 30_000 });
    await expect(chip0730).toHaveAttribute("data-count", "1");

    // Refresh confirma o banco e o status "Remarcado".
    await page.reload();
    await page.waitForLoadState("load");
    await expect(chip0730).toHaveAttribute("data-count", "1");
    await chip0730.click();
    const remarcado = page.getByRole("dialog").getByTestId("agenda-entry");
    await expect(remarcado).toHaveCount(1);
    await expect(remarcado).toContainText(titleA);
    await expect(remarcado).toContainText("Remarcado");
    await page.keyboard.press("Escape");

    // Filtro por atleta na URL: o slot original fica só com o atleta B (o de A
    // saiu para uma hora depois) e nada de A aparece na semana.
    await page.goto(`/professor/${schoolId}/agenda?semana=${isoWeek(tuesday)}&atleta=${atletas[1]}`);
    await page.waitForLoadState("load");
    await expect(chip0600).toHaveAttribute("data-count", "1");
    await expect(chip0730).toHaveCount(0);
    // Navegar de semana mantém os filtros da URL.
    await page.getByRole("link", { name: "Próxima semana" }).click();
    const nextWeek = isoWeek(futureTuesday(4));
    await page.waitForURL(new RegExp(`semana=${nextWeek}`), { timeout: 30_000 });
    expect(page.url()).toContain(`atleta=${atletas[1]}`);

    // Histórico do treino remarcado registra a mudança (auditoria).
    await page.goto(detalheHref!);
    await page.waitForLoadState("load");
    await expect(page.locator("main")).toContainText("Remarcado");
    await expect(page.locator("main")).toContainText(moved);
  });

  test("o atleta vê o mesmo horário digitado pelo professor (fuso da escola)", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await entrarComoProfessor(page);
    const atletas = await atletasDoProfessor(page, schoolId);
    expect(atletas.length).toBeGreaterThanOrEqual(1);

    const tuesday = futureTuesday(4);
    const title = `Agenda E2E atleta ${Date.now().toString(36)}`;
    await prescrever(page, schoolId, atletas[0], title, `${tuesday}T18:45`);

    // Quem é esse atleta? O nome/e-mail sai da ficha; o login usa a fixture correspondente.
    await page.goto(`/professor/${schoolId}/atletas/${atletas[0]}`);
    await page.waitForLoadState("load");
    const texto = await page.locator("main").innerText();
    const aluno = ALUNOS.find((candidate) => texto.includes(candidate.email) || texto.includes(candidate.name));
    expect(aluno, "o atleta do plantel deve ser uma fixture conhecida").toBeTruthy();

    await login(page, aluno!.email, aluno!.password);
    if (page.url().includes("/onboarding")) await completeOnboarding(page, aluno!.name);
    await page.goto(`/atleta/${schoolId}/calendario`);
    await page.waitForLoadState("load");
    const link = page.locator(`a[href^="/atleta/${schoolId}/treinos/"]`).filter({ hasText: title }).first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await page.goto((await link.getAttribute("href"))!);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("scheduled-at")).toContainText("18:45", { timeout: 30_000 });
  });

  test("mobile: visão diária com o mesmo agrupamento, sem overflow horizontal", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
      await entrarComoProfessor(page);
      const atletas = await atletasDoProfessor(page, schoolId);
      expect(atletas.length).toBeGreaterThanOrEqual(2);

      const suffix = Date.now().toString(36);
      const tuesday = futureTuesday(5);
      const hhmm = uniqueTime();
      const when = `${tuesday}T${hhmm}`;
      await prescrever(page, schoolId, atletas[0], `Agenda mobile A ${suffix}`, when);
      await prescrever(page, schoolId, atletas[1], `Agenda mobile B ${suffix}`, when);

      await page.goto(`/professor/${schoolId}/agenda?semana=${isoWeek(tuesday)}&dia=${tuesday}`);
      await page.waitForLoadState("load");

      const dia = page.getByTestId("agenda-day-view");
      await expect(dia).toBeVisible();
      await expect(page.getByTestId("agenda-week-grid")).toBeHidden();
      const chip = dia.locator(`[data-testid="agenda-slot"][data-slot-key="${when}"]`);
      await expect(chip).toHaveCount(1);
      await expect(chip).toHaveAttribute("data-count", "2");

      // Sem overflow horizontal da página.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      await chip.click();
      const dialogo = page.getByRole("dialog");
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByTestId("agenda-entry")).toHaveCount(2);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      const box = await dialogo.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(viewportWidth);
      expect(Math.abs(box!.x + box!.width / 2 - viewportWidth / 2)).toBeLessThan(8);

      // Remarcar no mobile também.
      const entrada = dialogo.getByTestId("agenda-entry").first();
      await entrada.getByRole("button", { name: "Remarcar" }).click();
      const moved = shiftHour(hhmm, 2);
      await entrada.locator('input[name="scheduledAt"]').fill(`${tuesday}T${moved}`);
      await entrada.getByRole("button", { name: /Confirmar remarcação/ }).click();
      await expect(dialogo).toBeHidden({ timeout: 30_000 });
      await expect(dia.locator(`[data-testid="agenda-slot"][data-slot-key="${tuesday}T${moved}"]`)).toHaveCount(1, { timeout: 30_000 });
    } finally {
      await mobile.close();
    }
  });

  test("escola sem vínculo: o professor não vê agenda alguma", async ({ page }) => {
    await loginAsSchoolOwner(page, ESCOLA_1);
    await entrarComoProfessor(page);
    // Uma escola à qual o professor não pertence cai fora do painel (o layout
    // manda de volta ao hub) — nunca uma agenda parcial.
    await page.goto(`/professor/escola-inexistente/agenda`);
    await page.waitForLoadState("load");
    expect(page.url()).not.toContain("escola-inexistente/agenda");
    await expect(page.getByTestId("agenda-week-grid")).toHaveCount(0);
  });
});
