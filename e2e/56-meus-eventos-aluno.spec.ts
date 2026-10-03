/**
 * E2E — 56 (SAM-57): "Meus eventos" e calendário do aluno.
 *
 * Requer as migrações 0060–0065 aplicadas.
 *
 * O atleta sem vínculo (ALUNO_SEM_ESCOLA) cadastra pelo calendário uma
 * travessia de 2 km em 20/12/2026 → confirmação "sem professor responsável";
 * o evento aparece no "Meus eventos" e no calendário (dia 20/12) sem recarregar
 * a página; o filtro de modalidade esconde o resto; uma indisponibilidade
 * aparece com legenda; o detalhe abre com as seis abas. Também em 390 px.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNO_SEM_ESCOLA } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const RUN = Date.now().toString(36);
const NOME = `Travessia aluno ${RUN}`;

test.describe.configure({ timeout: 300_000 });

async function entrar(page: Page) {
  await login(page, ALUNO_SEM_ESCOLA.email, ALUNO_SEM_ESCOLA.password);
  await completeOnboarding(page, ALUNO_SEM_ESCOLA.name);
}

test("cadastro pelo calendário, Meus eventos, calendário com filtro e indisponibilidade, detalhe com abas", async ({ page }) => {
  await entrar(page);

  // 1. Calendário → Adicionar evento (modal centralizado).
  await page.goto("/app/treinos?view=month&month=2026-12");
  await expect(page.getByTestId("calendar-legend")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Adicionar evento" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do evento").fill(NOME);
  await dialog.getByLabel("Tipo").selectOption("ORGANIZED_CROSSING");
  await dialog.getByLabel("Modalidade").selectOption("open-water");
  await dialog.getByLabel("Data").fill("2026-12-20");
  await dialog.getByLabel("Distância").fill("2");
  await dialog.getByLabel("Unidade").selectOption("km");
  await dialog.getByLabel("Objetivo desejado").fill("concluir com controle e boa orientação");
  await dialog.getByTestId("new-event-submit").click();
  await expect(dialog.getByTestId("new-event-confirmation")).toContainText("sem professor responsável", { timeout: 30_000 });
  await dialog.getByRole("button", { name: "Concluir" }).click();

  // 2. Calendário atualizado sem recarregar: marca do evento no dia 20.
  await expect(page.getByTestId("month-event").filter({ hasText: NOME }).first()).toBeAttached({ timeout: 30_000 });

  // 3. Dia 20/12: o evento; filtro de modalidade esconde outras modalidades.
  await page.goto("/app/treinos?view=day&date=2026-12-20&modalidade=open-water");
  await expect(page.getByTestId("calendar-event").filter({ hasText: NOME })).toBeVisible({ timeout: 30_000 });
  await page.goto("/app/treinos?view=day&date=2026-12-20&modalidade=run");
  await expect(page.getByTestId("calendar-event").filter({ hasText: NOME })).toHaveCount(0);

  // 4. Indisponibilidade com legenda.
  await page.goto("/app/treinos?view=week&week=2026-12-14");
  await page.getByTestId("unavailability-button").click();
  const periodo = page.getByRole("dialog");
  await periodo.getByLabel("Início").fill("2026-12-15");
  await periodo.getByLabel("Fim").fill("2026-12-16");
  await periodo.getByLabel("Motivo").fill(`viagem ${RUN}`);
  await periodo.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("calendar-unavailability").filter({ hasText: `viagem ${RUN}` }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("calendar-legend")).toContainText("Indisponível");

  // 5. Meus eventos e detalhe com as abas.
  await page.goto("/app/eventos");
  const card = page.getByTestId("my-event").filter({ hasText: NOME });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId("my-event-status")).toContainText("sem professor responsável");
  await card.click();
  await expect(page.getByTestId("event-overview")).toBeVisible({ timeout: 30_000 });
  for (const aba of ["Visão geral", "Objetivos", "Preparação", "Treinos relacionados", "Resultados", "Histórico"]) {
    await expect(page.getByRole("tab", { name: aba })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Objetivos" }).click();
  await expect(page.getByText("concluir com controle e boa orientação")).toBeVisible({ timeout: 30_000 });

  // 6. Mobile 390 px: sem rolagem horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ["/app/eventos", "/app/treinos?view=month&month=2026-12"]) {
    await page.goto(url);
    await page.waitForLoadState("load");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${url} rola na horizontal`).toBeLessThanOrEqual(1);
  }
});
