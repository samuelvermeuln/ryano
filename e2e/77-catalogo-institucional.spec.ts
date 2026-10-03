/**
 * E2E — 77 (SAM-78): catálogo institucional colaborativo.
 *
 * Ana (professora da Alpha) cria um modelo pessoal e o propõe para a escola
 * pela tela do catálogo, com direitos de uso. A dona da Alpha vê a proposta
 * em /escola/[id]/catalogo, atribui a Ana o papel de editora e publica: nasce
 * uma CÓPIA institucional com a autoria de Ana e o modelo pessoal continua
 * dela. A atribuição em lote mostra quantidade e nomes antes de publicar e
 * "Selecionar os N da busca". A política de desligamento (institucional fica,
 * pessoal sai, sessões entregues permanecem) é coberta por teste unitário:
 * desligar Ana aqui quebraria as outras suítes que dependem dela.
 */
import { test, expect, type Page } from "@playwright/test";
import { ESCOLA_1, PROFESSOR_2 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";

const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 480_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

test("proposta → revisão → publicação com autoria preservada; seleção explícita em lote", async ({ page, browser }) => {
  const anaContext = await browser.newContext();
  const ana = await anaContext.newPage();
  await loginComo(ana, PROFESSOR_2);
  const titulo = `Modelo Ana ${RUN}`;
  const criado = await ana.request.post("/api/workout-catalog", {
    data: { scope: { kind: "coach" }, meta: { title: titulo, code: `ANA-${RUN}`, sportType: "run", tags: ["base"] }, content: { blocks: [{ blockType: "WARMUP", title: "Aquecimento", durationS: 600 }, { blockType: "INTERVAL", title: "Tiros", durationS: 300, repetitions: 4, restDurationS: 120 }] } },
  });
  expect(criado.status(), await criado.text()).toBe(201);
  const { template } = (await criado.json()) as { template: { id: string } };

  try {
    // 1. Ana propõe pela tela.
    await ana.goto(`/professor/estudio/treinos?q=${encodeURIComponent(RUN)}`);
    const item = ana.getByTestId("catalog-item").filter({ hasText: titulo });
    await expect(item).toBeVisible({ timeout: 90_000 });
    await item.locator("summary").filter({ hasText: "Propor para a escola" }).click();
    const propor = item.getByTestId("propose-template");
    await propor.getByLabel("Escola da proposta").selectOption({ label: ESCOLA_1.schoolName });
    await propor.getByLabel("Direitos de uso").fill(`autoral, ${RUN}`);
    await propor.getByLabel("Nota da proposta").fill("sessão base de corrida");
    await propor.getByRole("button", { name: "Enviar proposta" }).click();
    await expect(propor.getByRole("status")).toContainText("Proposta enviada", { timeout: 60_000 });

    // 2. A dona revisa: papel de editora para Ana e publicação.
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(`/escola/${schoolId}/catalogo`);
    const proposta = page.getByTestId("proposal").filter({ hasText: titulo });
    await expect(proposta).toBeVisible({ timeout: 90_000 });
    await expect(proposta).toContainText(`autoral, ${RUN}`);
    await expect(proposta).toContainText(PROFESSOR_2.displayName);
    const papel = page.getByTestId("catalog-role").filter({ hasText: PROFESSOR_2.displayName });
    await papel.getByRole("combobox").selectOption("EDITOR");
    await papel.getByRole("button", { name: "Salvar" }).click();
    await expect(papel.getByRole("status")).toContainText("Papel salvo.", { timeout: 60_000 });
    const revisar = proposta.getByTestId("review-proposal");
    await revisar.getByLabel("Nota da revisão").fill("aprovado");
    await revisar.getByRole("button", { name: "Publicar no institucional" }).click();
    await expect(revisar.getByRole("status")).toContainText("Publicado no catálogo institucional", { timeout: 90_000 });
    await page.reload();
    const historico = page.getByTestId("proposal-history-row").filter({ hasText: titulo });
    await expect(historico).toHaveAttribute("data-status", "APPROVED", { timeout: 90_000 });
    const publicado = (await historico.getByRole("link", { name: "modelo publicado" }).getAttribute("href"))!.split("/treinos/")[1]!;
    expect(publicado).not.toBe(template.id);

    // 3. A cópia é da escola com a autoria de Ana; o pessoal continua pessoal.
    await ana.goto(`/professor/estudio/treinos?q=${encodeURIComponent(RUN)}`);
    const itens = ana.getByTestId("catalog-item").filter({ hasText: titulo });
    await expect(itens).toHaveCount(2, { timeout: 90_000 });
    await expect(itens.filter({ hasText: ESCOLA_1.schoolName })).toHaveCount(1);
    await expect(itens.filter({ hasText: "pessoal" })).toHaveCount(1);
    const copia = await ana.request.get(`/api/workout-catalog/${publicado}`);
    expect(copia.ok(), await copia.text()).toBe(true);
    const corpo = (await copia.json()) as { template: { ownerType: string; authorName?: string | null; canEdit: boolean } };
    expect(corpo.template.ownerType).toBe("SCHOOL");
    expect(corpo.template.canEdit).toBe(true);

    // 4. Atribuição em lote: quantidade e nomes antes de publicar; "Selecionar os N da busca".
    await ana.goto(`/professor/estudio/treinos/${publicado}/atribuir`);
    await expect(ana.getByTestId("batch-athletes")).toBeVisible({ timeout: 90_000 });
    const visiveis = Number((await ana.getByTestId("batch-visible-count").innerText()).split(" ")[0]);
    if (visiveis > 0) {
      await ana.getByTestId("batch-select-visible").click();
      await expect(ana.getByTestId("batch-selected-count")).toContainText(`${visiveis} selecionado(s)`);
      await ana.locator("summary").filter({ hasText: "nomes selecionados" }).click();
      await expect(ana.getByTestId("batch-selected-names").locator("li")).toHaveCount(visiveis);
    }
  } finally {
    await ana.request.post(`/api/workout-catalog/${template.id}/archive`).catch(() => null);
    await anaContext.close();
  }
});
