/**
 * E2E — 48 (SAM-49): "Enviar ao relógio" mostra antes o que o relógio NÃO
 * vai receber como prescrito (§11.4).
 *
 * Maria tem uma conexão Garmin (criada pela fixture de atividade, como uma
 * sync deixaria). Ricardo prescreve "4 × 5 min com 2 min de descanso, ritmo
 * 5:00/km". Maria abre o treino: o botão aparece por capability
 * (`plannedWorkoutPush`), a prévia lista "4 repetições" como convertidas e o
 * ritmo único como não enviado (nenhuma faixa inventada). O envio real passa
 * pelo proxy Garmin externo e é coberto pelos testes unitários com o cliente
 * HTTP simulado; aqui o fluxo termina em "Cancelar".
 */
import { test, expect, type Page } from "@playwright/test";
import { login, completeOnboarding } from "./helpers";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";

const MARIA = ALUNOS[1]!;
const TZ = "America/Sao_Paulo";
const TITLE = `E2E 48 relógio ${Date.now().toString(36)}`;

test.describe.configure({ timeout: 300_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

function amanha(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + 86_400_000));
}

test("a prévia do envio ao relógio lista repetições convertidas e o ritmo não enviado", async ({ page }) => {
  // Conexão Garmin da atleta, como uma sync deixaria.
  await loginComo(page, PROFESSOR_3);
  const fixture = await page.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: MARIA.email, startedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      sportType: "run", externalId: `watch-${Date.now().toString(36)}`, provider: "GARMIN",
      laps: [{ durationSeconds: 600, distanceMeters: 2000, averageHeartRate: 140 }],
    },
  });
  expect(fixture.ok(), await fixture.text()).toBe(true);

  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria (specs 34/38/47)").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const athleteId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;

  await page.goto(`/professor/independente/atletas/${athleteId}/treinos/novo`);
  await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 60_000 });
  await page.locator('input[name="title"]').fill(TITLE);
  await page.locator('select[name="sportType"]').selectOption("run");
  await page.locator('input[name="scheduledAt"]').fill(`${amanha()}T06:30`);
  const remover = page.getByRole("button", { name: /^Remover bloco / });
  while ((await remover.count()) > 1) await remover.last().click();
  const bloco = page.locator("ol > li").nth(0);
  await bloco.getByLabel("Duração (min)").fill("5");
  await bloco.getByLabel("Repetições").fill("4");
  await bloco.getByLabel("Descanso (min)").fill("2");
  await bloco.getByLabel(/Ritmo/).fill("5:00");
  await page.getByRole("button", { name: /^Prescrever treino$/ }).click();
  await page.waitForURL(new RegExp(`/professor/independente/atletas/${athleteId}/treinos(\\?|$)`), { timeout: 120_000 });
  const criado = page.locator(`a[href^="/professor/independente/atletas/${athleteId}/treinos/"]`).filter({ hasText: TITLE }).first();
  await expect(criado).toBeVisible({ timeout: 30_000 });
  const assignmentId = (await criado.getAttribute("href"))!.split("/treinos/")[1]!;

  await loginComo(page, MARIA);
  await page.goto(`/app/treinos/${assignmentId}`);
  const enviar = page.getByRole("button", { name: /Enviar ao relógio/ });
  await expect(enviar, "o botão aparece pela capability plannedWorkoutPush da conexão Garmin").toBeVisible({ timeout: 60_000 });
  await enviar.click();

  const revisao = page.getByTestId("watch-export-review");
  await expect(revisao).toBeVisible({ timeout: 60_000 });
  const notas = page.getByTestId("watch-export-notes");
  await expect(notas.locator('[data-kind="converted"]').filter({ hasText: "4 repetições" })).toHaveCount(1);
  await expect(notas.locator('[data-kind="omitted"]').filter({ hasText: "Ritmo por km" })).toHaveCount(1);
  await expect(notas).toContainText("não inventa margem");

  // A prévia é só leitura: cancelar não envia nem muda o estado do treino.
  await revisao.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("button", { name: /Enviar ao relógio/ })).toBeVisible();
});
