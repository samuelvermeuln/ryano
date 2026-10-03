/**
 * E2E — 57 (SAM-58): catálogo versionado.
 *
 * Requer a migração 0066_workout_template_versions aplicada.
 *
 * Ricardo cria NAT-PISC-001 (§12.5) — o resumo mostra 1.400 m e duração
 * estimada —, encontra um modelo de mar buscando "orientação mar", usa
 * NAT-PISC-001 para prescrever a Maria (builder pré-preenchido), edita o
 * modelo (v2 sem a soltura) e a prescrição de Maria permanece igual (AC08);
 * a v1 continua consultável.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 300_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

const NAT_PISC_001 = {
  objective: "manter execução e parciais consistentes",
  blocks: [
    { blockType: "WARMUP", title: "Aquecimento", distanceM: 300 },
    { blockType: "DRILL", title: "Técnica", distanceM: 50, repetitions: 4 },
    { blockType: "INTERVAL", title: "Principal", distanceM: 100, repetitions: 6, restDurationS: 20 },
    { blockType: "DRILL", title: "Habilidade", distanceM: 50, repetitions: 4 },
    { blockType: "COOLDOWN", title: `Soltura ${RUN}`, distanceM: 100 },
  ],
};

test("cria NAT-PISC-001, busca, usa para Maria, edita e a prescrição não muda", async ({ page }) => {
  await loginComo(page, PROFESSOR_3);
  const titulo = `Piscina 1.400 ${RUN}`;
  const meta = { title: titulo, code: "NAT-PISC-001", sportType: "swim", environment: "POOL_SHORT", tags: ["piscina"] };

  // 1. Criar (v1) e ver o resumo calculado na lista.
  const criado = await page.request.post("/api/workout-catalog", { data: { scope: { kind: "coach" }, meta, content: NAT_PISC_001 } });
  expect(criado.status(), await criado.text()).toBe(201);
  const { template } = (await criado.json()) as { template: { id: string } };
  await page.goto(`/professor/estudio/treinos?q=${encodeURIComponent(RUN)}`);
  const item = page.getByTestId("catalog-item").filter({ hasText: titulo });
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item.getByTestId("catalog-summary")).toHaveText(/(1[.,]4 ?km|1\.400 ?m).*duração estimada/);

  // 2. Busca livre por instrução + etiqueta, sem acento.
  const mar = await page.request.post("/api/workout-catalog", {
    data: { scope: { kind: "coach" }, meta: { title: `Travessia guiada ${RUN}`, sportType: "open-water", tags: ["mar"] }, content: { instructions: "Treinar orientação com referência visual", blocks: [{ blockType: "STEADY", distanceM: 1500 }] } },
  });
  expect(mar.status(), await mar.text()).toBe(201);
  await page.goto(`/professor/estudio/treinos?q=${encodeURIComponent(`orientacao mar ${RUN}`)}`);
  await expect(page.getByTestId("catalog-item").filter({ hasText: `Travessia guiada ${RUN}` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("catalog-item").filter({ hasText: titulo })).toHaveCount(0);

  // 3. "Usar este modelo" para Maria: o construtor vem pré-preenchido; prescrever.
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const athleteId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  await page.goto(`/professor/independente/atletas/${athleteId}/treinos/novo?modelo=${template.id}`);
  await expect(page.getByTestId("builder-from-template")).toContainText("versão 1", { timeout: 30_000 });
  await expect(page.getByTestId("builder-block")).toHaveCount(5);
  await expect(page.getByTestId("builder-totals")).toHaveText(/1[.,]4 ?km|1\.400 ?m/);
  await page.getByRole("button", { name: "Prescrever treino" }).click();
  await page.waitForURL(/\/treinos$/, { timeout: 60_000 });

  // 4. Editar o modelo: v2 sem a soltura.
  const v2 = await page.request.put(`/api/workout-catalog/${template.id}`, { data: { meta, content: { ...NAT_PISC_001, blocks: NAT_PISC_001.blocks.slice(0, 4) }, expectedVersion: 1 } });
  expect(v2.status(), await v2.text()).toBe(200);
  expect(((await v2.json()) as { version: { number: number } }).version.number).toBe(2);

  // 5. A prescrição de Maria continua com a soltura (AC08); a v1 segue consultável.
  await page.goto(`/professor/independente/atletas/${athleteId}/treinos`);
  await page.getByRole("link", { name: titulo }).first().click();
  await expect(page.getByText(`Soltura ${RUN}`).first()).toBeVisible({ timeout: 30_000 });
  await page.goto(`/professor/estudio/treinos/${template.id}?versao=1`);
  await expect(page.getByTestId("template-versions")).toContainText("Versão 2 (atual)");
  await expect(page.getByTestId("template-summary")).toHaveText(/1[.,]4 ?km|1\.400 ?m/);
});
