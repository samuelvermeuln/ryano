/**
 * E2E — 71 (SAM-72): comparativo por bloco e repetição.
 *
 * Ricardo prescreve COR-001 (§14.4) para Maria: aquecimento 10 min, 3 × 6 min
 * a 5:00–5:20/km com 2 min de descanso e 8 min finais. A fixture rica casa a
 * sessão com uma corrida cujas voltas seguem a estrutura e cujas amostras têm
 * uma lacuna no terceiro tiro. A seção "Blocos e repetições" mostra a série
 * principal com aderência e cobertura lado a lado, as três contagens de
 * repetição e a direção legível; o aquecimento fica fora da série. Maria
 * confirma as repetições; o professor vê a confirmação.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 480_000 });

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

test("COR-001 casada: série principal com aderência e cobertura, repetições prevista/identificada/confirmada, direção legível", async ({ page, browser }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;

  // 1. COR-001 publicada 3 h atrás.
  const titulo = `COR-001 ${RUN}`;
  const lote = await page.request.post("/api/assignment-batches", {
    data: {
      scope: { kind: "independent" }, idempotencyKey: `e2e-71-${RUN}`,
      prescription: {
        title: titulo, sportType: "run", scheduledAtLocal: localMinusHours(3),
        blocks: [
          { blockType: "WARMUP", title: "Aquecimento", durationS: 600 },
          { blockType: "INTERVAL", title: "Tiros", durationS: 360, repetitions: 3, target: { paceSecPerKmMin: 300, paceSecPerKmMax: 320, tolerancePct: 0 }, restDurationS: 120 },
          { blockType: "COOLDOWN", title: "Final", durationS: 480 },
        ],
      },
      recipients: [{ athleteId: mariaId }],
    },
  });
  expect(lote.status(), await lote.text()).toBe(201);
  const assignmentId = ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;

  try {
    // 2. Corrida com voltas na estrutura (aquecimento, 3 × tiro/descanso, final); o 3.º tiro sem amostras.
    // Tiro 1 a 5:10/km (dentro), tiro 2 a 4:40/km (mais rápido), tiro 3 a 5:10/km mas sem medição.
    const lap = (durationSeconds: number, paceSecPerKm: number, hr: number) => ({ durationSeconds, distanceMeters: Math.round((durationSeconds / paceSecPerKm) * 1000), averageHeartRate: hr });
    const fixture = await page.request.post("/api/e2e/activity-fixture", {
      data: {
        athleteEmail: MARIA.email, assignmentId, rich: true,
        gap: { fromSecond: 600 + 360 + 120 + 360 + 120, toSecond: 600 + 360 + 120 + 360 + 120 + 360 },
        laps: [lap(600, 390, 130), lap(360, 310, 158), lap(120, 480, 140), lap(360, 280, 165), lap(120, 480, 142), lap(360, 310, 160), lap(480, 400, 135)],
      },
    });
    expect(fixture.ok(), await fixture.text()).toBe(true);

    // 3. Professor: a série principal e as repetições.
    await page.goto(`/professor/independente/atletas/${mariaId}/treinos/${assignmentId}`);
    const comparativo = page.getByTestId("block-comparison");
    await expect(comparativo).toBeVisible({ timeout: 90_000 });
    // 2 tiros medidos (720 s) de 3 (1.080 s) → cobertura 66,7%; 1 dos 2 medidos na faixa → aderência 50%.
    await expect(comparativo.getByTestId("main-adherence")).toHaveText("50%");
    await expect(comparativo.getByTestId("main-coverage")).toHaveText("66,7%");
    const tiros = comparativo.getByTestId("comparison-block").filter({ hasText: "Tiros" });
    await expect(tiros.getByTestId("repetition-counts")).toContainText("prevista 3 · identificada 3 (voltas alinhadas à estrutura) · confirmada —");
    const reps = tiros.getByTestId("comparison-repetition");
    await expect(reps).toHaveCount(3);
    await expect(reps.nth(0)).toHaveAttribute("data-direction", "INSIDE");
    await expect(reps.nth(1)).toHaveAttribute("data-direction", "FASTER");
    await expect(reps.nth(1)).toContainText("mais rápido que a faixa");
    await expect(reps.nth(2)).toContainText("cobertura 0%");
    await expect(comparativo.getByTestId("comparison-block").filter({ hasText: "Aquecimento" })).toHaveAttribute("data-auxiliary", "true");
    await expect(page.getByTestId("comparison-chart")).toBeVisible();
    await expect(page.getByTestId("session-sections")).toContainText("Blocos/voltas");

    // 4. Maria confirma 3 repetições; o professor vê.
    const mariaContext = await browser.newContext();
    const maria = await mariaContext.newPage();
    try {
      await loginComo(maria, MARIA);
      await maria.goto(`/app/treinos/${assignmentId}`);
      const bloco = maria.getByTestId("comparison-block").filter({ hasText: "Tiros" });
      await expect(bloco).toBeVisible({ timeout: 90_000 });
      await expect(bloco.getByTestId("repetition-counts")).toContainText("identificada 3");
      const confirmar = bloco.getByTestId("confirm-repetitions");
      await confirmar.getByRole("spinbutton").fill("3");
      await confirmar.getByRole("button", { name: "Confirmar" }).click();
      await expect(confirmar.getByRole("status")).toContainText("Repetições confirmadas.", { timeout: 60_000 });
    } finally {
      await mariaContext.close();
    }
    await page.reload();
    await expect(page.getByTestId("block-comparison").getByTestId("comparison-block").filter({ hasText: "Tiros" }).getByTestId("repetition-counts")).toContainText("confirmada 3", { timeout: 90_000 });
  } finally {
    await page.request.post(`/api/workout-assignments/${assignmentId}/cancel`, { data: { reason: "limpeza do E2E 71" } });
  }
});
