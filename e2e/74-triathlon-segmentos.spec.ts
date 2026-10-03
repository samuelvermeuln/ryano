/**
 * E2E — 74 (SAM-75): triathlon e multiesporte.
 *
 * Maria importa (fixture) um arquivo multiesporte com três pernas e as três
 * cópias por esporte que o provedor envia como filhas. Ricardo vê os
 * segmentos com T1/T2, as cópias "contadas uma vez" e, no evento de
 * triathlon, a semana por modalidade sem dupla contagem; pactua um objetivo
 * só para a natação. Um brick bike + corrida casa com as duas execuções e
 * mostra o intervalo real. Dois trechos do mesmo arquivo para duas
 * prescrições não se sobrepõem.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 600_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

const localDate = (offsetDays: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offsetDays * 86_400_000));
function localMinusHours(hours: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() - hours * 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

test("multiesporte com pernas e cópias contadas uma vez, objetivo por segmento, brick com intervalo real e trechos sem sobreposição", async ({ page, browser }) => {
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);

  // 1. Evento de triathlon da Maria.
  const criada = await maria.request.post("/api/events", {
    data: { confirmDistinct: true, event: { name: `Tri E2E 74 ${RUN}`, type: "COMPETITION", sportType: "triathlon", startLocalDate: localDate(45), timeZone: "America/Sao_Paulo" }, participation: { goalText: "terminar bem" } },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  const participation = (await criada.json()) as { id: string };

  // 2. Arquivo multiesporte (há 30 h) + três cópias por esporte, filhas pelo provedor.
  const startedAt = new Date(Date.now() - 30 * 3_600_000);
  const parentExternalId = `tri-${RUN}`;
  const fixture = async (data: Record<string, unknown>) => {
    const response = await maria.request.post("/api/e2e/activity-fixture", { data: { athleteEmail: MARIA.email, ...data } });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as { activityId: string };
  };
  const parent = await fixture({
    startedAt: startedAt.toISOString(), sportType: "triathlon", externalId: parentExternalId,
    laps: [{ durationSeconds: 1500, distanceMeters: 1500, averageHeartRate: 140 }, { durationSeconds: 3900, distanceMeters: 40000, averageHeartRate: 150 }, { durationSeconds: 2700, distanceMeters: 10000, averageHeartRate: 160 }],
    legs: [{ sportType: "SWIMMING", elapsedDuration: 1500, distance: 1500 }, { sportType: "TRANSITION", elapsedDuration: 120 }, { sportType: "CYCLING", elapsedDuration: 3900, distance: 40000 }, { sportType: "TRANSITION", elapsedDuration: 60 }, { sportType: "RUNNING", elapsedDuration: 2700, distance: 10000 }],
  });
  for (const [sport, offset, duration, distance] of [["swim", 0, 1500, 1500], ["bike", 1620, 3900, 40000], ["run", 5580, 2700, 10000]] as const) {
    await fixture({ startedAt: new Date(startedAt.getTime() + offset * 1000).toISOString(), sportType: sport, externalId: `${parentExternalId}-${sport}`, parentExternalId, laps: [{ durationSeconds: duration, distanceMeters: distance, averageHeartRate: 150 }] });
  }

  // 3. Ricardo: segmentos e cópias na atividade; semana por modalidade no evento; objetivo da natação.
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const base = `/professor/independente/atletas/${mariaId}`;

  let bike: string | null = null;
  let corrida: string | null = null;
  try {
    await page.goto(`${base}/atividades/${parent.activityId}`);
    const segmentos = page.getByTestId("activity-segments");
    await expect(segmentos).toBeVisible({ timeout: 90_000 });
    await expect(segmentos.getByTestId("activity-segment")).toHaveCount(5);
    expect(await segmentos.getByTestId("activity-segment").evaluateAll((items) => items.map((item) => item.getAttribute("data-kind")))).toEqual(["SWIM", "T1", "BIKE", "T2", "RUN"]);
    await expect(segmentos.getByTestId("segment-totals")).toContainText("não são somadas entre modalidades");
    await expect(segmentos.getByTestId("child-copies")).toContainText("contadas uma vez");

    await page.goto(`${base}/eventos/${participation.id}`);
    const semana = page.getByTestId("week-by-sport");
    await expect(semana).toBeVisible({ timeout: 90_000 });
    // 8.100 s (soma das voltas) do arquivo multiesporte contados uma vez; as cópias por esporte não entram.
    await expect(semana).toContainText(/Tria\w+ 135 min/);
    await expect(semana).not.toContainText("Natação 25 min");
    const pactuar = page.getByTestId("agree-goal");
    await pactuar.getByLabel("Segmento do objetivo").selectOption("SWIM");
    await pactuar.getByLabel("Objetivo pactuado").fill(`Sair da água em 30 min ${RUN}`);
    await pactuar.getByRole("button", { name: "Pactuar" }).click();
    await expect(page.getByText(`Sair da água em 30 min ${RUN}`)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("[Natação]")).toBeVisible();

    // 4. Brick: bike (há 5 h) e corrida (12 min depois), encadeadas; execuções casadas pela fixture.
    const publicar = async (titulo: string, sportType: string, horas: number, blocks: unknown[], chave: string) => {
      const lote = await page.request.post("/api/assignment-batches", {
        data: { scope: { kind: "independent" }, idempotencyKey: `e2e-74-${chave}-${RUN}`, prescription: { title: titulo, sportType, scheduledAtLocal: localMinusHours(horas), blocks }, recipients: [{ athleteId: mariaId }] },
      });
      expect(lote.status(), await lote.text()).toBe(201);
      return ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;
    };
    bike = await publicar(`Brick bike ${RUN}`, "bike", 5, [{ blockType: "STEADY", durationS: 2700 }], "bike");
    corrida = await publicar(`Brick corrida ${RUN}`, "run", 4.2, [{ blockType: "STEADY", durationS: 900 }], "run");
    const encadear = await page.request.post("/api/bricks", { data: { assignmentIds: [bike, corrida] } });
    expect(encadear.status(), await encadear.text()).toBe(201);
    await fixture({ assignmentId: bike, laps: [{ durationSeconds: 2700, distanceMeters: 27000, averageHeartRate: 145 }] });
    await fixture({ assignmentId: corrida, laps: [{ durationSeconds: 900, distanceMeters: 3000, averageHeartRate: 160 }] });

    await page.goto(`${base}/treinos/${corrida}`);
    const brick = page.getByTestId("brick-card");
    await expect(brick).toBeVisible({ timeout: 90_000 });
    await expect(brick.getByTestId("brick-leg")).toHaveCount(2);
    await expect(brick.getByTestId("brick-leg").nth(1)).toHaveAttribute("data-interval-label", "transição");
    await expect(brick.getByTestId("brick-leg").nth(1)).toContainText("intervalo real desde a etapa anterior");
    await expect(brick.getByTestId("brick-elapsed")).toContainText("incluindo os intervalos");

    // 5. Dois trechos do mesmo arquivo para duas prescrições: sem sobreposição.
    const trecho = (body: Record<string, unknown>) => page.request.post(`/api/activities/${parent.activityId}/segments`, { data: body });
    expect((await trecho({ startOffsetSeconds: 0, endOffsetSeconds: 1500, kind: "SWIM", label: "nado", workoutAssignmentId: null })).status()).toBe(201);
    expect((await trecho({ startOffsetSeconds: 1620, endOffsetSeconds: 5520, kind: "BIKE", label: "pedal", workoutAssignmentId: bike })).status()).toBe(201);
    const sobreposto = await trecho({ startOffsetSeconds: 5000, endOffsetSeconds: 8220, kind: "RUN", label: "corrida", workoutAssignmentId: corrida });
    expect(sobreposto.status()).toBe(422);
    expect(await sobreposto.text()).toContain("não podem contar duas vezes");
    await page.goto(`${base}/atividades/${parent.activityId}`);
    await expect(page.getByTestId("selected-segments")).toContainText(`responde à prescrição "Brick bike ${RUN}"`, { timeout: 90_000 });
  } finally {
    await mariaContext.close();
    for (const id of [bike, corrida].filter((value): value is string => Boolean(value))) {
      await page.request.post(`/api/workout-assignments/${id}/cancel`, { data: { reason: "limpeza do E2E 74" } });
    }
  }
});
