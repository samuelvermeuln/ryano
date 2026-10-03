/**
 * E2E — 72 (SAM-73): qualidade dos dados da atividade.
 *
 * Maria importa uma natação em piscina (1.950 m) e corrige para 2.000 m com
 * justificativa; depois corrige a piscina marcada (25 m → 50 m), com o
 * recálculo explícito (80 piscinas × 50 m = 4.000 m). Ricardo vê original,
 * corrigido e motivo no detalhe da mesma atividade. O original do provedor
 * nunca muda. Uma corrida com salto de GPS mostra o aviso e nada é alterado.
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

test("natação corrigida (distância e piscina) com original e motivo visíveis ao aluno e ao professor", async ({ page, browser }) => {
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);

  // 1. Natação em piscina de 1.950 m, há 2 h.
  const importada = await maria.request.post("/api/e2e/activity-fixture", {
    data: {
      athleteEmail: MARIA.email, startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), sportType: "swim", externalId: `e2e-72-${RUN}`,
      laps: [{ durationSeconds: 1200, distanceMeters: 975, averageHeartRate: 140 }, { durationSeconds: 1200, distanceMeters: 975, averageHeartRate: 146 }],
    },
  });
  expect(importada.ok(), await importada.text()).toBe(true);
  const { activityId } = (await importada.json()) as { activityId: string };

  try {
    await maria.goto(`/app/atividades/${activityId}`);
    const qualidade = maria.getByTestId("activity-data-quality");
    await expect(qualidade).toBeVisible({ timeout: 90_000 });
    await expect(qualidade.getByTestId("quality-distance")).toHaveAttribute("data-corrected", "false");
    await expect(qualidade.getByTestId("quality-distance")).toContainText("1,95 km");

    // 2. 1.950 m → 2.000 m com justificativa.
    await qualidade.locator("summary").filter({ hasText: "Corrigir um valor" }).click();
    const form = qualidade.getByTestId("activity-correction-form");
    await form.getByLabel("Campo a corrigir").selectOption("distanceMeters");
    await form.getByLabel("Valor corrigido").fill("2000");
    await form.getByLabel("Justificativa da correção").fill(`o relógio perdeu duas piscinas ${RUN}`);
    await form.getByRole("button", { name: "Registrar correção" }).click();
    await expect(form.getByRole("status")).toContainText("Correção registrada", { timeout: 60_000 });
    await maria.reload();
    await expect(qualidade.getByTestId("quality-distance")).toHaveAttribute("data-corrected", "true", { timeout: 90_000 });
    await expect(qualidade.getByTestId("quality-distance")).toContainText("2 km");
    await expect(qualidade.getByTestId("quality-distance")).toContainText("corrigido");
    await expect(qualidade.getByTestId("quality-distance")).toContainText("original: 1,95 km");
    await expect(qualidade.getByTestId("correction-row").first()).toContainText(`o relógio perdeu duas piscinas ${RUN}`);
    await expect(qualidade.getByTestId("correction-row").first()).toContainText("aluno");

    // 3. Piscina marcada como 25 m era de 50 m: recálculo explícito (80 × 50 = 4.000 m).
    await qualidade.locator("summary").filter({ hasText: "Corrigir um valor" }).click();
    await form.getByLabel("Campo a corrigir").selectOption("poolLengthMeters");
    await form.getByLabel("Piscina marcada").selectOption("25");
    await form.getByLabel("Piscina real").selectOption("50");
    await form.getByLabel("Justificativa da correção").fill(`nadei na piscina olímpica ${RUN}`);
    await form.getByRole("button", { name: "Registrar correção" }).click();
    await expect(form.getByRole("status")).toContainText("Correção registrada", { timeout: 60_000 });
    await maria.reload();
    await expect(qualidade.getByTestId("quality-pool")).toContainText("50 m", { timeout: 90_000 });
    await expect(qualidade.getByTestId("quality-distance")).toContainText("4 km");
    await expect(qualidade.getByTestId("correction-history")).toContainText("80 piscinas × 50 m");

    // 4. Ricardo vê original, corrigido e motivo.
    await loginComo(page, PROFESSOR_3);
    await page.goto("/professor/independente");
    const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
    await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
    const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
    const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
    await page.goto(`/professor/independente/atletas/${mariaId}/atividades/${activityId}`);
    const visao = page.getByTestId("activity-data-quality");
    await expect(visao).toBeVisible({ timeout: 90_000 });
    await expect(visao.getByTestId("quality-distance")).toContainText("corrigido");
    await expect(visao.getByTestId("correction-history")).toContainText(`o relógio perdeu duas piscinas ${RUN}`);
    await expect(visao.getByTestId("correction-history")).toContainText(`nadei na piscina olímpica ${RUN}`);

    // 5. Corrida com salto de GPS: aviso, nada alterado.
    const corrida = await maria.request.post("/api/e2e/activity-fixture", {
      data: {
        athleteEmail: MARIA.email, startedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(), sportType: "run", externalId: `e2e-72-gps-${RUN}`, rich: true,
        laps: [{ durationSeconds: 60, distanceMeters: 200, averageHeartRate: 140 }, { durationSeconds: 60, distanceMeters: 2400, averageHeartRate: 150 }],
      },
    });
    expect(corrida.ok(), await corrida.text()).toBe(true);
    const gpsId = ((await corrida.json()) as { activityId: string }).activityId;
    await maria.goto(`/app/atividades/${gpsId}`);
    await expect(maria.getByTestId("gps-warning")).toContainText("Nada foi alterado automaticamente", { timeout: 90_000 });
    await expect(maria.getByTestId("quality-distance")).toHaveAttribute("data-corrected", "false");
  } finally {
    await mariaContext.close();
  }
});
