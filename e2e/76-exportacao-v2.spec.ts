/**
 * E2E — 76 (SAM-77): exportação ao relógio de uma sessão v2.
 *
 * Maria tem uma conexão Garmin (fixture). Ricardo publica NAT-PISC-001 na
 * estrutura v2 (séries e 20 s entre repetições, piscina de 25 m, referência
 * secundária em texto). A prévia de "Enviar ao relógio" lista o que foi
 * convertido (séries desenroladas) e omitido (referência secundária,
 * comprimento da piscina), sem inventar faixa. Uma sessão só com término
 * manual não mostra o botão; a prévia pela API explica. O envio real passa
 * pelo proxy Garmin e é coberto por testes unitários; aqui termina em "Cancelar".
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

function localPlusHours(hours: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() + hours * 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

const dist = (value: number, extra: Record<string, unknown> = {}) => ({ kind: "STEP", duration: { type: "DISTANCE", value }, ...extra });

test("prévia da v2 lista conversões e omissões; sessão só com término manual não tem botão", async ({ page, browser }) => {
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);
  // A Garmin connection, as a sync would leave it.
  const conexao = await maria.request.post("/api/e2e/activity-fixture", {
    data: { athleteEmail: MARIA.email, provider: "GARMIN", startedAt: new Date(Date.now() - 48 * 3_600_000).toISOString(), sportType: "run", externalId: `e2e-76-${RUN}`, laps: [{ durationSeconds: 600, distanceMeters: 2000, averageHeartRate: 140 }] },
  });
  expect(conexao.ok(), await conexao.text()).toBe(true);

  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;

  const publicar = async (titulo: string, chave: string, sessionV2: unknown) => {
    const lote = await page.request.post("/api/assignment-batches", {
      data: { scope: { kind: "independent" }, idempotencyKey: `e2e-76-${chave}-${RUN}`, prescription: { title: titulo, sportType: "swim", scheduledAtLocal: localPlusHours(26), blocks: [], sessionV2 }, recipients: [{ athleteId: mariaId }] },
    });
    expect(lote.status(), await lote.text()).toBe(201);
    return ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;
  };
  const natacao = await publicar(`NAT-PISC-001 v2 ${RUN}`, "nat", {
    schemaVersion: 2, pool: { length: 25, unit: "m" },
    blocks: [
      { type: "WARMUP", name: "Aquecimento", children: [dist(200), dist(100)] },
      { type: "TECHNIQUE", name: "Técnica", children: [{ kind: "SET", repetitions: 4, children: [dist(50)] }] },
      { type: "MAIN", name: "Principal", children: [{ kind: "SET", repetitions: 6, children: [dist(100, { intensity: { primary: { kind: "HEART_RATE", min: 140, max: 155 }, secondary: [{ kind: "TEXT", text: "forte" }] } })], rest: { position: "BETWEEN_REPS", seconds: 20 } }] },
      { type: "COOLDOWN", name: "Soltura", children: [dist(100)] },
    ],
  });
  const manual = await publicar(`Só término manual ${RUN}`, "manual", { schemaVersion: 2, blocks: [{ type: "MAIN", name: "Livre", children: [{ kind: "STEP", name: "Nado livre", duration: { type: "MANUAL" } }] }] });

  try {
    // 1. Prévia pela tela: conversões e omissões listadas; nenhuma faixa inventada.
    await maria.goto(`/app/treinos/${natacao}`);
    const enviar = maria.getByRole("button", { name: /Enviar ao relógio/ });
    await expect(enviar).toBeVisible({ timeout: 90_000 });
    await enviar.click();
    const revisao = maria.getByTestId("watch-export-review");
    await expect(revisao).toBeVisible({ timeout: 60_000 });
    const notas = maria.getByTestId("watch-export-notes");
    await expect(notas).toContainText("6 repetições");
    await expect(notas).toContainText("Referência secundária (forte)");
    await expect(notas).toContainText("Piscina de 25 m");
    await expect(notas).not.toContainText("inventa");
    await revisao.getByRole("button", { name: "Cancelar" }).click();

    // 2. O payload da prévia pela API: FC em faixa enviada, 5 descansos entre 6 repetições.
    const previa = await maria.request.get(`/api/workout-assignments/${natacao}/push-to-watch`);
    expect(previa.ok(), await previa.text()).toBe(true);
    const corpo = (await previa.json()) as { provider: string; schemaVersion: number; notes: Array<{ kind: string; item: string }> };
    expect(corpo).toMatchObject({ provider: "GARMIN", schemaVersion: 2 });
    expect(corpo.notes.some((note) => note.kind === "converted" && note.item === "6 repetições")).toBe(true);
    expect(corpo.notes.some((note) => note.item.startsWith("FC"))).toBe(false);

    // 3. Sessão só com término manual: sem botão; a API explica.
    await maria.goto(`/app/treinos/${manual}`);
    await expect(maria.getByTestId("session-v2-view")).toBeVisible({ timeout: 90_000 });
    await expect(maria.getByRole("button", { name: /Enviar ao relógio/ })).toHaveCount(0);
    const semSuporte = await maria.request.get(`/api/workout-assignments/${manual}/push-to-watch`);
    expect(semSuporte.status()).toBe(422);
    expect(await semSuporte.text()).toContain("Nenhum passo desta sessão pode ir ao relógio");
  } finally {
    await mariaContext.close();
    for (const id of [natacao, manual]) await page.request.post(`/api/workout-assignments/${id}/cancel`, { data: { reason: "limpeza do E2E 76" } });
  }
});
