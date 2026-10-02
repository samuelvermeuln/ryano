/**
 * SAM-20 — Análise do atleta: toda atividade conta (prescrita ou não), semanas
 * no fuso da escola, tendências, alertas no resumo e histórico com cursor.
 *
 * Fluxo real: a fixture E2E (`/api/e2e/activity-fixture` sem `assignmentId`,
 * só fora de produção) importa uma atividade Garmin SEM prescrição, datada
 * de domingo 22:00 no fuso da escola → a Análise a exibe no volume como "não
 * prescrito", na semana que termina nesse domingo (não na seguinte, como em
 * UTC) → trocar janela e modalidade mantém a sessão → o resumo mostra o
 * alerta que corresponde aos fatos → mobile. Sem fixture o cenário FALHA.
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

/** Último domingo (local, fuso da escola) às 22:00, como instante UTC — isto é 01:00Z de segunda. */
function lastSundayAt22(): { localDate: string; iso: string; weekMondayLabel: string } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay(); // 0 = domingo
  base.setUTCDate(base.getUTCDate() - (dow === 0 ? 7 : dow));
  const localDate = base.toISOString().slice(0, 10);
  // 22:00 em São Paulo (UTC−3, sem horário de verão) = 01:00Z do dia seguinte.
  const iso = new Date(`${localDate}T22:00:00-03:00`).toISOString();
  const monday = new Date(base);
  monday.setUTCDate(monday.getUTCDate() - 6);
  const weekMondayLabel = `${String(monday.getUTCDate()).padStart(2, "0")}/${String(monday.getUTCMonth() + 1).padStart(2, "0")}`;
  return { localDate, iso, weekMondayLabel };
}

async function importarAtividadeSemPrescricao(page: Page, email: string, iso: string, externalId: string) {
  const response = await page.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: email, startedAt: iso, sportType: "bike", externalId,
      laps: [{ durationSeconds: 2700, distanceMeters: 20000, averageHeartRate: 135 }],
    },
  });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
  const body = await response.json();
  expect(body.executionId).toBeNull();
  return body as { activityId: string };
}

test.describe("30 — Análise do atleta: volume completo no fuso da escola (SAM-20)", () => {
  test.setTimeout(240_000);

  test("atividade importada sem prescrição aparece no volume, na semana certa, e sobrevive à troca de janela/modalidade", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await entrarComoProfessor(page);
    const { athleteId, email } = await atletaFixture(page, schoolId);
    const sunday = lastSundayAt22();
    await importarAtividadeSemPrescricao(page, email, sunday.iso, `sun-${sunday.localDate}`);

    const base = `/professor/${schoolId}/atletas/${athleteId}/analise`;
    await page.goto(`${base}?janela=28`);
    await page.waitForLoadState("load");

    // Volume conta a atividade (bike, 45 min) como "não prescrito".
    await expect(page.getByTestId("volume-legend")).toContainText("Não prescrito");
    const sportTrends = page.getByTestId("sport-trends");
    await expect(sportTrends).toContainText("Ciclismo");
    await expect(sportTrends).toContainText("km/h");

    // Semana certa: domingo 22h BRT (01:00Z de segunda) pertence à semana que começa na segunda ANTERIOR.
    const bar = page.getByRole("button", { name: new RegExp(`^${sunday.weekMondayLabel}:`) });
    await expect(bar).toBeVisible();
    await bar.click();
    await expect(page.locator("text=Não prescrito: 1 sessão(ões)").first()).toBeVisible();
    // A barra tem o segmento "Não prescrito".
    await expect(bar.locator('[data-segment="Não prescrito"]')).toHaveCount(1);

    // Tempo em zonas agregado (a fixture guarda hrTimeInZone_*).
    await expect(page.getByTestId("zone-totals")).toContainText("Z2");

    // SAM-44 — aderência expandida sempre presente (vazia quando não há prescrição na janela)
    // e evolução por atividade: com uma sessão só, a tela diz que faltam pontos; com duas,
    // os pontos linkam para o detalhe da atividade.
    await expect(page.getByTestId("adherence-detail").or(page.getByTestId("adherence-detail-empty"))).toBeVisible();
    await expect(page.getByTestId("adherence-volume")).toContainText("Sessões por semana");
    await expect(page.getByTestId("activity-evolution").or(page.getByTestId("activity-evolution-empty"))).toBeVisible();

    // Trocar janela mantém a sessão; filtrar por modalidade também (mesmo campo nas duas fontes).
    await page.goto(`${base}?janela=84&modalidade=bike`);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("sport-trends")).toContainText("Ciclismo");
    await expect(page.getByTestId("sport-trends")).not.toContainText("Corrida");
    await expect(page.getByRole("button", { name: new RegExp(`^${sunday.weekMondayLabel}:`) })).toBeVisible();

    // Resumo: comparação por semana de calendário e alertas reais (lista vazia é legítima).
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("week-volume")).toBeVisible();
    const alerts = page.getByTestId("alerts");
    const empty = page.getByTestId("alerts-empty");
    expect((await alerts.count()) + (await empty.count())).toBe(1);
    // Com uma sessão no último domingo, "inativo há 14 dias" não pode aparecer.
    await expect(page.locator('[data-kind="inactive"]')).toHaveCount(0);

    // Histórico: paginação por cursor (a primeira página tem no máximo 50 entradas; o link, quando existe, leva a ?cursor=).
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/historico`);
    await page.waitForLoadState("load");
    const next = page.getByRole("link", { name: "Próxima página" });
    if (await next.count()) {
      expect(await next.getAttribute("href")).toContain("cursor=");
      await next.click();
      await page.waitForURL(/cursor=/);
      await expect(page.getByRole("link", { name: "Voltar ao início" })).toBeVisible();
    }
  });

  test("mobile: gráfico, tendências e alertas cabem sem overflow", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
      await entrarComoProfessor(page);
      const { athleteId, email } = await atletaFixture(page, schoolId);
      const sunday = lastSundayAt22();
      await importarAtividadeSemPrescricao(page, email, sunday.iso, `sun-${sunday.localDate}`);

      await page.goto(`/professor/${schoolId}/atletas/${athleteId}/analise?janela=28`);
      await page.waitForLoadState("load");
      await expect(page.getByTestId("sport-trends")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
      await page.waitForLoadState("load");
      await expect(page.getByRole("heading", { name: "Alertas" })).toBeVisible();
    } finally {
      await mobile.close();
    }
  });
});
