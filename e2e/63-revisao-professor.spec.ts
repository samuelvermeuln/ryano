/**
 * E2E — 63 (SAM-64): revisão do professor.
 *
 * Requer a migração 0072_coach_review aplicada.
 *
 * Ricardo prescreve uma sessão para Maria (há 3 h); Maria relata que fez.
 * A lista de treinos mostra "Aguardando revisão". Ricardo revisa com
 * próxima revisão marcada; a lista passa a "Revisado" e Maria lê o parecer.
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

test("revisar sessão realizada: aguardando revisão → revisado, parecer visível ao aluno", async ({ page, browser }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const hub = `/professor/independente/atletas/${mariaId}`;
  const titulo = `Revisão ${RUN}`;

  const lote = await page.request.post("/api/assignment-batches", {
    data: {
      scope: { kind: "independent" }, idempotencyKey: `e2e-63-${RUN}`,
      prescription: { title: titulo, sportType: "run", scheduledAtLocal: localMinusHours(3), blocks: [{ blockType: "STEADY", durationS: 1800 }] },
      recipients: [{ athleteId: mariaId }],
    },
  });
  expect(lote.status(), await lote.text()).toBe(201);
  const assignmentId = ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;

  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  try {
    await loginComo(maria, MARIA);
    const relato = await maria.request.post("/api/session-feedback", { data: { assignmentId, completion: "FULL", manual: { durationMinutes: 30 }, rpe: 5 } });
    expect(relato.ok(), await relato.text()).toBe(true);

    // Realizado, ainda não revisado.
    await page.goto(`${hub}/treinos`);
    const item = page.getByRole("link", { name: `Abrir treino ${titulo}` });
    await expect(item.getByTestId("review-badge")).toHaveAttribute("data-state", "AWAITING_REVIEW", { timeout: 30_000 });

    // Revisão com próxima revisão; salvar não altera o treino.
    await item.click();
    const bloco = page.getByTestId("coach-review");
    await expect(bloco.getByTestId("review-state")).toHaveAttribute("data-state", "AWAITING_REVIEW", { timeout: 30_000 });
    await bloco.getByRole("button", { name: "Revisar" }).click();
    const form = page.getByTestId("coach-review-form");
    await form.getByLabel("Observação técnica").fill(`Boa execução, ritmo estável ${RUN}`);
    await form.getByLabel("Decisão").selectOption("KEEP");
    const proxima = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await form.getByLabel("Próxima revisão").fill(proxima);
    await form.getByRole("button", { name: "Salvar revisão" }).click();
    await expect(bloco.getByTestId("review-state")).toHaveAttribute("data-state", "REVIEWED", { timeout: 30_000 });
    await expect(bloco.getByTestId("coach-review-summary")).toContainText(`Próxima revisão: ${proxima.split("-").reverse().join("/")}`);

    await page.goto(`${hub}/treinos`);
    await expect(page.getByRole("link", { name: `Abrir treino ${titulo}` }).getByTestId("review-badge")).toHaveAttribute("data-state", "REVIEWED", { timeout: 30_000 });

    // Maria lê o parecer; o relato dela continua como escreveu.
    await maria.goto(`/app/treinos/${assignmentId}`);
    await expect(maria.getByTestId("athlete-coach-review")).toContainText(`Boa execução, ritmo estável ${RUN}`, { timeout: 30_000 });
    await expect(maria.getByTestId("session-feedback-summary")).toContainText("Realizei integralmente");
  } finally {
    await mariaContext.close();
    await page.request.post(`/api/workout-assignments/${assignmentId}/cancel`, { data: { reason: "limpeza do E2E 63" } });
  }
});
