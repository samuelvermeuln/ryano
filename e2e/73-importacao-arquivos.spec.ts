/**
 * E2E — 73 (SAM-74): importação de arquivos de atividade.
 *
 * Maria importa um TCX de corrida (escrito conforme o schema oficial v2)
 * sem relógio nem integração: a atividade nasce com voltas e séries e casa
 * com a prescrição de Ricardo pelo fluxo existente; reimportar os mesmos
 * bytes não duplica. Ricardo abre a atividade e baixa o arquivo pela rota
 * privada; outro professor, sem vínculo, recebe 404 na mesma URL (AC21). Um
 * arquivo corrompido mostra erro claro e a alternativa de registro manual.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_2, PROFESSOR_3 } from "./fixtures";
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

/** A TCX run per the official v2 schema: three 5-minute laps of 1 km with track points every 150 s. */
function tcxRun(startedAt: Date) {
  const iso = (offset: number) => new Date(startedAt.getTime() + offset * 1000).toISOString();
  const lap = (index: number) => {
    const base = index * 300;
    const points = [0, 150, 300].map((offset) => `<Trackpoint><Time>${iso(base + offset)}</Time><Position><LatitudeDegrees>${(-23.55 - (base + offset) / 400_000).toFixed(6)}</LatitudeDegrees><LongitudeDegrees>-46.63</LongitudeDegrees></Position><DistanceMeters>${index * 1000 + (offset / 300) * 1000}</DistanceMeters><HeartRateBpm><Value>${140 + index * 4}</Value></HeartRateBpm></Trackpoint>`).join("");
    return `<Lap StartTime="${iso(base)}"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>1000</DistanceMeters><Calories>70</Calories><AverageHeartRateBpm><Value>${140 + index * 4}</Value></AverageHeartRateBpm><Intensity>Active</Intensity><TriggerMethod>Distance</TriggerMethod><Track>${points}</Track></Lap>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${iso(0)}</Id>${lap(0)}${lap(1)}${lap(2)}</Activity></Activities></TrainingCenterDatabase>`;
}

test("TCX importado casa com a prescrição, não duplica, professor baixa o arquivo e terceiro recebe 404; arquivo corrompido tem erro claro", async ({ page, browser }) => {
  // 1. Ricardo prescreve 3 × 1 km para Maria, 3 h atrás.
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const startedAt = new Date(Date.now() - 3 * 3_600_000);
  const lote = await page.request.post("/api/assignment-batches", {
    data: {
      scope: { kind: "independent" }, idempotencyKey: `e2e-73-${RUN}`,
      prescription: { title: `Tiros de 1 km ${RUN}`, sportType: "run", scheduledAtLocal: localMinusHours(3), blocks: [{ blockType: "INTERVAL", distanceM: 1000, repetitions: 3 }] },
      recipients: [{ athleteId: mariaId }],
    },
  });
  expect(lote.status(), await lote.text()).toBe(201);
  const assignmentId = ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;

  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  const terceiroContext = await browser.newContext();
  const terceiro = await terceiroContext.newPage();
  try {
    // 2. Maria importa o TCX pela tela.
    await loginComo(maria, MARIA);
    await maria.goto("/app/atividades");
    const importar = maria.getByTestId("import-activity");
    await expect(importar).toBeVisible({ timeout: 90_000 });
    const tcx = Buffer.from(tcxRun(startedAt), "utf-8");
    await importar.getByLabel("Arquivo de atividade (FIT, GPX ou TCX)").setInputFiles({ name: `corrida-${RUN}.tcx`, mimeType: "application/vnd.garmin.tcx+xml", buffer: tcx });
    const resultado = importar.getByTestId("import-result");
    await expect(resultado).toContainText("Arquivo TCX importado e associado a uma prescrição", { timeout: 120_000 });
    const activityId = (await resultado.getByRole("link", { name: "Abrir atividade" }).getAttribute("href"))!.split("/atividades/")[1]!;

    // 3. Reimportar os mesmos bytes: nada novo.
    const reimport = await maria.request.post("/api/activities/import", { multipart: { file: { name: `copia-${RUN}.tcx`, mimeType: "application/xml", buffer: tcx } } });
    expect(reimport.status(), await reimport.text()).toBe(201);
    expect(await reimport.json()).toMatchObject({ activityId, duplicate: true });

    // 4. A atividade tem voltas, séries e o arquivo; o detalhe da prescrição mostra a execução.
    await maria.goto(`/app/atividades/${activityId}`);
    await expect(maria.getByTestId("activity-detail")).toBeVisible({ timeout: 90_000 });
    await expect(maria.getByTestId("activity-files")).toContainText(`corrida-${RUN}.tcx`);
    const fileHref = (await maria.getByTestId("activity-files").getByRole("link").first().getAttribute("href"))!;
    const download = await maria.request.get(fileHref);
    expect(download.status()).toBe(200);
    expect(download.headers()["cache-control"]).toContain("no-store");
    expect((await download.body()).length).toBe(tcx.length);
    await maria.goto(`/app/treinos/${assignmentId}`);
    await expect(maria.getByTestId("execution-state")).not.toHaveAttribute("data-state", "AWAITING_RECORD", { timeout: 90_000 });

    // 5. Ricardo abre a atividade e baixa o arquivo; outro professor recebe 404.
    await page.goto(`/professor/independente/atletas/${mariaId}/atividades/${activityId}`);
    await expect(page.getByTestId("activity-detail")).toBeVisible({ timeout: 90_000 });
    expect((await page.request.get(fileHref)).status()).toBe(200);
    await loginComo(terceiro, PROFESSOR_2);
    expect((await terceiro.request.get(fileHref)).status()).toBe(404);
    expect((await terceiro.request.get(`/app/atividades/${activityId}`)).status()).toBe(404);

    // 6. Arquivo corrompido: erro claro e registro manual oferecido.
    await maria.goto("/app/atividades");
    await expect(importar).toBeVisible({ timeout: 90_000 });
    await importar.getByLabel("Arquivo de atividade (FIT, GPX ou TCX)").setInputFiles({ name: "quebrado.fit", mimeType: "application/octet-stream", buffer: Buffer.from("isto não é um FIT") });
    await expect(resultado).toContainText("não é um FIT válido", { timeout: 60_000 });
    await expect(resultado.getByRole("link", { name: "Registrar manualmente" })).toBeVisible();
  } finally {
    await mariaContext.close();
    await terceiroContext.close();
    await page.request.post(`/api/workout-assignments/${assignmentId}/cancel`, { data: { reason: "limpeza do E2E 73" } });
  }
});
