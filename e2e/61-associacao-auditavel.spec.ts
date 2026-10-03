/**
 * E2E — 61 (SAM-62): associação prescrição ↔ atividade auditável e reversível.
 *
 * Requer a migração 0070_auditable_matching aplicada.
 *
 * Ricardo prescreve para Maria duas sessões de remo (hoje há 2 h e ontem).
 * Uma atividade importada casa automaticamente com a de hoje. Ricardo vê o
 * motivo ("mesma modalidade, mesmo dia…"), desfaz com motivo e associa a
 * atividade à sessão de ontem pela lista de candidatas. A sessão de hoje
 * mantém a trilha (automática → desfeita) e a de ontem mostra a associação
 * feita pelo professor, 1 dia depois do previsto.
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

test("associação automática explicada, desfeita com motivo e refeita em outra sessão, com trilha", async ({ page }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;

  async function prescrever(chave: string, titulo: string, horasAtras: number) {
    const lote = await page.request.post("/api/assignment-batches", {
      data: {
        scope: { kind: "independent" }, idempotencyKey: `e2e-61-${chave}-${RUN}`,
        prescription: { title: titulo, sportType: "rowing", scheduledAtLocal: localMinusHours(horasAtras), blocks: [{ blockType: "STEADY", distanceM: 5000 }] },
        recipients: [{ athleteId: mariaId }],
      },
    });
    expect(lote.status(), await lote.text()).toBe(201);
    return ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;
  }
  const hoje = await prescrever("hoje", `Remo hoje ${RUN}`, 2);
  const ontem = await prescrever("ontem", `Remo ontem ${RUN}`, 26);

  try {
    // 1. A atividade importada casa automaticamente com a sessão de hoje.
    const startedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const fixture = await page.request.post("/api/e2e/activity-fixture", {
      data: {
        athleteEmail: MARIA.email, sportType: "rowing", externalId: `e2e-61-${RUN}`, provider: "GARMIN", startedAt, autoMatch: true,
        laps: [{ durationSeconds: 1800, distanceMeters: 5000, averageHeartRate: 140 }],
      },
    });
    expect(fixture.ok(), await fixture.text()).toBe(true);
    const imported = (await fixture.json()) as { activityId: string; matchStatus: string | null; matching: { workoutAssignmentId?: string } | null };
    expect(imported.matchStatus).toBe("AUTO_MATCHED");
    expect(imported.matching?.workoutAssignmentId).toBe(hoje);

    // 2. Ricardo vê o motivo e desfaz com motivo.
    await page.goto(`/professor/independente/atletas/${mariaId}/treinos/${hoje}`);
    const painel = page.getByTestId("match-panel");
    await expect(painel.getByTestId("match-explanation").first()).toContainText("Associada automaticamente — mesma modalidade, mesmo dia", { timeout: 30_000 });
    await painel.getByRole("button", { name: "Desfazer" }).click();
    await painel.getByLabel("Motivo de desfazer").fill("era o treino de ontem");
    await painel.getByRole("button", { name: "Confirmar desfazer" }).click();
    await expect(painel.getByTestId("match-link").first()).toHaveAttribute("data-status", "NO_MATCH", { timeout: 30_000 });
    await expect(painel.getByTestId("match-link").first()).toContainText("era o treino de ontem");

    // 3. Associa à sessão de ontem pela lista de candidatas.
    await page.goto(`/professor/independente/atletas/${mariaId}/treinos/${ontem}`);
    const painelOntem = page.getByTestId("match-panel");
    await painelOntem.getByRole("button", { name: "Associar atividade" }).click();
    const quando = await page.evaluate((iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), startedAt);
    const candidata = page.getByTestId("match-candidate").filter({ hasText: quando }).first();
    await expect(candidata).toBeVisible({ timeout: 30_000 });
    await candidata.getByRole("button", { name: "Associar" }).click();
    await expect(painelOntem.getByTestId("match-explanation").first()).toContainText("Associada pelo professor — mesma modalidade, 1 dia depois do previsto", { timeout: 30_000 });
    await expect(painelOntem.getByTestId("match-history")).toContainText("Atividade associada pelo professor");

    // 4. A trilha da sessão de hoje guarda a automática e o desfazer.
    await page.goto(`/professor/independente/atletas/${mariaId}/treinos/${hoje}`);
    const trilha = page.getByTestId("match-panel").getByTestId("match-history");
    await expect(trilha).toContainText("Associada automaticamente", { timeout: 30_000 });
    await expect(trilha).toContainText("Associação desfeita — era o treino de ontem");
  } finally {
    // Sessões de teste não ficam abertas para casar com atividades de outras execuções.
    for (const id of [hoje, ontem]) await page.request.post(`/api/workout-assignments/${id}/cancel`, { data: { reason: "limpeza do E2E 61" } });
  }
});
