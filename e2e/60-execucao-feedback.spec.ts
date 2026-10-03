/**
 * E2E — 60 (SAM-61): execução e feedback do aluno.
 *
 * Requer a migração 0069_session_feedback aplicada.
 *
 * Ricardo publica (via lote) uma travessia para Maria há poucas horas: a
 * sessão aparece "Aguardando registro" (não "não realizada"). Maria registra
 * manualmente, sem relógio, "parcial — interrompida por condições do mar",
 * com relato de dor. Ricardo recebe UM aviso de dor (com o aviso de que o app
 * não é canal de emergência) e vê o relato no detalhe. Uma atividade não
 * planejada de Maria recebe RPE no detalhe da atividade.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 360_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

function localNowMinusHours(hours: number) {
  const date = new Date(Date.now() - hours * 3_600_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

test("registro manual parcial com dor, aviso ao professor e RPE em atividade não planejada", async ({ page, browser }) => {
  // 1. Ricardo publica a sessão (há 3 h) para Maria.
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const titulo = `Travessia feedback ${RUN}`;
  const lote = await page.request.post("/api/assignment-batches", {
    data: {
      scope: { kind: "independent" }, idempotencyKey: `e2e-60-${RUN}`,
      prescription: { title: titulo, sportType: "open-water", scheduledAtLocal: localNowMinusHours(3), blocks: [{ blockType: "STEADY", distanceM: 2000 }] },
      recipients: [{ athleteId: mariaId }],
    },
  });
  expect(lote.status(), await lote.text()).toBe(201);
  const assignmentId = ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;
  const inicio = new Date(Date.now() - 5_000);

  // 2. Maria: "aguardando registro", depois registro manual parcial com dor.
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);
  await maria.goto(`/app/treinos/${assignmentId}`);
  await expect(maria.getByTestId("execution-state")).toHaveAttribute("data-state", "AWAITING_RECORD", { timeout: 30_000 });
  const form = maria.getByTestId("session-feedback-form");
  await form.getByLabel("Realizei parcialmente").check();
  await form.getByLabel("Duração feita (min)").fill("25");
  await form.getByLabel("Distância feita (m)").fill("1200");
  await form.getByLabel("Motivo", { exact: true }).selectOption("SAFETY_CONDITIONS");
  await form.getByLabel("Detalhe do motivo").fill("mar agitado");
  await form.getByLabel("Senti dor ou uma dificuldade relevante").check();
  await form.getByLabel("Descrição da dor").fill(`dor no ombro ${RUN}`);
  await form.getByTestId("session-feedback-submit").click();
  await expect(form.getByRole("status")).toContainText("Relato enviado", { timeout: 30_000 });
  await maria.reload();
  await expect(maria.getByTestId("execution-state")).toHaveAttribute("data-state", "PARTIAL", { timeout: 30_000 });
  await expect(maria.getByTestId("feedback-reason")).toContainText("Interrompida por segurança/condições");

  // 3. Ricardo: um aviso de dor e o relato no detalhe.
  const { items } = (await (await page.request.get("/api/notifications?limit=100")).json()) as { items: Array<{ title: string; body: string; createdAt: string }> };
  const avisos = items.filter((item) => item.title === `Relato de dor no treino de ${MARIA.name}` && new Date(item.createdAt) >= inicio);
  expect(avisos).toHaveLength(1);
  expect(avisos[0]!.body).toContain("não é canal de emergência");
  await page.goto(`/professor/independente/atletas/${mariaId}/treinos/${assignmentId}`);
  const relato = page.getByTestId("coach-athlete-report");
  await expect(relato.getByTestId("feedback-pain")).toContainText(`dor no ombro ${RUN}`, { timeout: 30_000 });
  await expect(relato).toContainText("registro manual do aluno");

  // 4. Atividade não planejada recebe RPE.
  const fixture = await maria.request.post("/api/e2e/activity-fixture", {
    // Days ago and far from any prescription: stays unplanned.
    data: { athleteEmail: MARIA.email, sportType: "run", externalId: `e2e-60-${RUN}`, provider: "GARMIN", startedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), laps: [{ durationSeconds: 1800, distanceMeters: 5000, averageHeartRate: 140 }] },
  });
  expect(fixture.ok(), await fixture.text()).toBe(true);
  const { activityId } = (await fixture.json()) as { activityId: string };
  await maria.goto(`/app/atividades/${activityId}`);
  const formAtividade = maria.getByTestId("session-feedback-form");
  await formAtividade.getByLabel("RPE").fill("5");
  await formAtividade.getByLabel("Observação").fill("rodagem leve");
  await formAtividade.getByTestId("session-feedback-submit").click();
  await expect(formAtividade.getByRole("status")).toContainText("Relato enviado", { timeout: 30_000 });
  await mariaContext.close();
});
