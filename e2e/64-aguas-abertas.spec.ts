/**
 * E2E — 64 (SAM-65): águas abertas — cenário §22.1 com os atores do ambiente
 * de testes (o professor independente Ricardo e a aluna Maria fazem o papel
 * de Carlos e Samuel do documento).
 *
 * Requer a migração 0073_open_water_session aplicada.
 *
 * Ricardo prescreve NAT-AA-001 (46 min) com percurso, responsável e apoio.
 * Maria vê o contexto no detalhe (AC15), o relógio registra 46 min com
 * distância incoerente e ela relata dificuldade de orientação. Ricardo vê a
 * duração, o relato, a limitação do GPS (sem ritmo) e a tarefa técnica
 * pendente de revisão.
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

function localMinusHours(hours: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() - hours * 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// §13.6 — 8 min; 6 × 1 min com 1 min entre (5 recuperações); 3 × 6 min com 2 min entre (2 recuperações); 5 min = 46 min.
const BLOCKS = [
  { blockType: "WARMUP", title: "Início", durationS: 480 },
  { blockType: "INTERVAL", title: "Técnica: orientação", durationS: 60, repetitions: 6, restDurationS: 60 },
  { blockType: "INTERVAL", title: "Principal", durationS: 360, repetitions: 3, restDurationS: 120 },
  { blockType: "COOLDOWN", title: "Final", durationS: 300 },
];

test("NAT-AA-001: contexto visível ao aluno; GPS incoerente, relato técnico e tarefa pendente para o professor", async ({ page, browser }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;

  const lote = await page.request.post("/api/assignment-batches", {
    data: {
      scope: { kind: "independent" }, idempotencyKey: `e2e-64-${RUN}`,
      prescription: {
        title: `NAT-AA-001 orientação em circuito ${RUN}`, sportType: "open-water", scheduledAtLocal: localMinusHours(3), blocks: BLOCKS,
        openWater: {
          sessionKind: "ORIENTATION",
          course: { layout: "CIRCUIT", laps: 2, buoys: "3 boias amarelas", direction: "CLOCKWISE", visualReference: "torre do salva-vidas", entryExit: "rampa do clube" },
          environment: { kind: "LAKE", water: "FRESH", familiarToAthlete: true },
          expectedConditions: [{ variable: "WIND", value: "fraco", provenance: "FORECAST", source: "previsão local" }],
          responsiblePerson: `Ricardo na margem ${RUN}`, supportPlan: "caiaque de apoio", communicationSignals: "braço levantado = parar",
          distance: { kind: "ESTIMATED", estimatedMeters: 2000 }, briefingNotes: "briefing de 10 min",
        },
      },
      recipients: [{ athleteId: mariaId }],
    },
  });
  expect(lote.status(), await lote.text()).toBe(201);
  const assignmentId = ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;

  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  try {
    await loginComo(maria, MARIA);
    // AC15 — Maria vê percurso, responsável e apoio.
    await maria.goto(`/app/treinos/${assignmentId}`);
    const cartao = maria.getByTestId("open-water-card");
    await expect(cartao.getByTestId("open-water-responsible")).toContainText(`Ricardo na margem ${RUN}`, { timeout: 30_000 });
    await expect(cartao.getByTestId("open-water-course")).toContainText("Circuito");
    await expect(cartao.getByTestId("open-water-support")).toContainText("caiaque de apoio");
    await expect(cartao).toContainText("previsão");

    // O relógio registra 46 min com distância incoerente; Maria relata a orientação.
    const fixture = await page.request.post("/api/e2e/activity-fixture", {
      data: { athleteEmail: MARIA.email, assignmentId, sportType: "open-water", externalId: `e2e-64-${RUN}`, laps: [{ durationSeconds: 2760, distanceMeters: 9000, averageHeartRate: 130 }] },
    });
    expect(fixture.ok(), await fixture.text()).toBe(true);
    const relato = await maria.request.post("/api/session-feedback", {
      data: { assignmentId, completion: "FULL", rpe: 6, openWater: { orientation: 2, environmentalDifficulty: 4, confidence: 3, observedConditions: "vento lateral" }, comment: "difícil manter a linha da boia" },
    });
    expect(relato.ok(), await relato.text()).toBe(true);

    // Ricardo: duração, relato, limitação do GPS e tarefa técnica pendente.
    await page.goto(`/professor/independente/atletas/${mariaId}/treinos/${assignmentId}`);
    const analise = page.getByTestId("open-water-card").getByTestId("open-water-analysis");
    await expect(analise).toContainText("Tempo realizado: 46", { timeout: 30_000 });
    await expect(analise.getByTestId("open-water-gps")).toHaveAttribute("data-status", "INCOHERENT");
    await expect(analise.getByTestId("open-water-gps")).toContainText("ritmo não calculado");
    await expect(analise.getByTestId("open-water-feedback")).toContainText("Orientação 2/5");
    await expect(analise.getByTestId("open-water-task")).toHaveText("Tarefa técnica pendente de revisão");
  } finally {
    await mariaContext.close();
    await page.request.post(`/api/workout-assignments/${assignmentId}/cancel`, { data: { reason: "limpeza do E2E 64" } });
  }
});
