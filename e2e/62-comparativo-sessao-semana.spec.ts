/**
 * E2E — 62 (SAM-63): comparativo transparente de sessão e semana.
 *
 * Requer a migração 0071_session_load_method aplicada.
 *
 * Ricardo usa uma janela de sincronização de 1 h e o método sRPE (restaurados
 * no fim) e prescreve duas sessões de 40 min para Maria, há 3 h e há 2 h.
 * Maria registra a primeira como parcial (30 min, RPE 6) e deixa a segunda
 * sem registro. Na central da Maria, Ricardo vê os grupos da semana mudarem
 * (+1 parcial, +1 sem registro, denominador +2) e, no detalhe, o volume de
 * tempo 75% com a fórmula e a carga sRPE 30 min × RPE 6 = 180 UA.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);
const POLICY_KEYS = ["firstAnalysisBusinessDays", "reminderDaysBefore", "workingDays", "timeZone", "notifyCoordinationOnOverdue", "milestoneNotifyAthlete", "milestoneNotifyCoach", "syncWindowHours", "sessionLoadMethod"] as const;

test.describe.configure({ timeout: 420_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

function localMinusHours(hours: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() - hours * 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

async function grupos(page: Page, overviewHref: string) {
  await page.goto(overviewHref);
  await expect(page.getByTestId("week-regularity")).toBeVisible({ timeout: 30_000 });
  const read = async (testId: string) => Number(await page.getByTestId(testId).getAttribute("data-value"));
  return {
    full: await read("regularity-full"), partial: await read("regularity-partial"),
    noRecord: await read("regularity-no-record"), notDone: await read("regularity-not-done"), denominator: await read("regularity-denominator"),
  };
}

test("grupos da semana, volume com denominador e sRPE com método escolhido", async ({ page, browser }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const overviewHref = `/professor/independente/atletas/${mariaId}`;

  const atual = await page.request.get("/api/follow-up-policy");
  expect(atual.ok(), await atual.text()).toBe(true);
  const original = (await atual.json()) as Record<string, unknown>;
  const body = (overrides: Record<string, unknown>) => Object.fromEntries(POLICY_KEYS.map((key) => [key, key in overrides ? overrides[key] : original[key] ?? null]));
  const ids: string[] = [];
  try {
    const ajuste = await page.request.put("/api/follow-up-policy", { data: body({ syncWindowHours: 1, sessionLoadMethod: "SRPE" }) });
    expect(ajuste.ok(), await ajuste.text()).toBe(true);
    const antes = await grupos(page, overviewHref);
    await expect(page.getByTestId("week-load")).toContainText("UA");

    for (const [chave, horas] of [["parcial", 3], ["sem-registro", 2]] as const) {
      const lote = await page.request.post("/api/assignment-batches", {
        data: {
          scope: { kind: "independent" }, idempotencyKey: `e2e-62-${chave}-${RUN}`,
          prescription: { title: `Rodagem ${chave} ${RUN}`, sportType: "run", scheduledAtLocal: localMinusHours(horas), blocks: [{ blockType: "STEADY", durationS: 2400 }] },
          recipients: [{ athleteId: mariaId }],
        },
      });
      expect(lote.status(), await lote.text()).toBe(201);
      ids.push(((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId);
    }
    const [parcial] = ids;

    // Maria registra a primeira como parcial, sem relógio; a segunda fica sem registro.
    const mariaContext = await browser.newContext();
    const maria = await mariaContext.newPage();
    await loginComo(maria, MARIA);
    await maria.goto(`/app/treinos/${parcial}`);
    const form = maria.getByTestId("session-feedback-form");
    await form.getByLabel("Realizei parcialmente").check();
    await form.getByLabel("Duração feita (min)").fill("30");
    await form.getByLabel("RPE").fill("6");
    await form.getByTestId("session-feedback-submit").click();
    await expect(form.getByRole("status")).toContainText("Relato enviado", { timeout: 30_000 });
    await mariaContext.close();

    // Ricardo: grupos separados mudam, sem um único "% concluído".
    const depois = await grupos(page, overviewHref);
    expect(depois.partial - antes.partial).toBe(1);
    expect(depois.noRecord - antes.noRecord).toBe(1);
    expect(depois.full - antes.full).toBe(0);
    expect(depois.denominator - antes.denominator).toBe(2);

    // Detalhe: volume com a fórmula e o denominador; carga sRPE identificada.
    await page.goto(`${overviewHref}/treinos/${parcial}`);
    const comparativo = page.getByTestId("session-comparison");
    await expect(comparativo.getByTestId("volume-time")).toContainText("75%", { timeout: 30_000 });
    await expect(comparativo.getByTestId("volume-time")).toContainText("÷ 40 min prescritos");
    await expect(comparativo.getByTestId("volume-distance")).toContainText("sem distância prescrita");
    await expect(comparativo.getByTestId("session-load")).toContainText("30 min × RPE 6 = 180 UA");
  } finally {
    for (const id of ids) await page.request.post(`/api/workout-assignments/${id}/cancel`, { data: { reason: "limpeza do E2E 62" } });
    await page.request.put("/api/follow-up-policy", { data: body({}) });
  }
});
