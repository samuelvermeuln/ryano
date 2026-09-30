/**
 * SAM-15 — piloto Zustand em /escola/[schoolId]/turmas.
 *
 * Prova pela UI: criar → aparece na hora; editar → atualiza na hora; arquivar
 * → some na hora; indicadores acompanham; ir ao detalhe e voltar continua
 * correto; e após um reload REAL o estado vem do banco igual ao que a UI
 * mostrava (a store nunca mascara falha de persistência).
 *
 * Métrica registrada no relatório: bytes da resposta da Server Action de
 * criação. Antes (com `revalidatePath` da lista) a resposta carregava a
 * página inteira re-renderizada; agora só a entidade.
 */
import { test, expect, type Page } from "@playwright/test";

import { ESCOLA_1 } from "./fixtures";
import { loginAsSchoolOwner } from "./helpers";

const NOME = `Turma Zustand E2E ${Date.now().toString(36)}`;
const NOME_EDITADO = `${NOME} (editada)`;

async function abrirTurmas(page: Page, schoolId: string) {
  await page.goto(`/escola/${schoolId}/turmas`);
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { name: "Turmas", exact: true })).toBeVisible();
}

function linha(page: Page, nome: string) {
  return page.locator("tbody tr").filter({ has: page.getByRole("link", { name: nome, exact: true }) });
}

async function tileValor(page: Page, rotulo: string): Promise<number> {
  // O primeiro "Turmas ativas" da página é o indicador; o segundo é o título da
  // seção. O valor é o <p> imediatamente após o rótulo (StatTiles).
  const valor = page.getByText(rotulo, { exact: true }).first().locator("xpath=following-sibling::p[1]");
  return Number(((await valor.textContent()) ?? "").trim());
}

test.describe("SAM-15 — turmas com store (piloto)", () => {
  test.setTimeout(150_000);

  test("create/edit/archive refletem na hora, sem reload, e o reload confirma o banco", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await abrirTurmas(page, schoolId);

    const ativasAntes = await tileValor(page, "Turmas ativas");

    // Métrica: tamanho da resposta da Server Action de criação e quantidade de
    // GETs de RSC/HTML para a rota da lista disparados pela mutação.
    let actionBytes = 0;
    let listRefetches = 0;
    page.on("response", async (response) => {
      const req = response.request();
      const url = new URL(response.url());
      if (req.method() === "POST" && req.headers()["next-action"]) {
        actionBytes += Number(response.headers()["content-length"] ?? (await response.body().catch(() => Buffer.alloc(0))).length);
      }
      if (req.method() === "GET" && url.pathname === `/escola/${schoolId}/turmas` && req.headers()["rsc"] === "1") {
        listRefetches += 1;
      }
    });

    // Criar pela UI.
    await page.getByRole("button", { name: "Nova turma" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nome").fill(NOME);
    await modal.getByLabel("Modalidade").fill("Corrida");
    await modal.getByRole("button", { name: "Criar turma" }).click();
    await expect(modal).toBeHidden({ timeout: 20_000 });

    // Aparece imediatamente, sem reload, e o indicador acompanha.
    await expect(linha(page, NOME)).toHaveCount(1);
    await expect(linha(page, NOME)).toContainText("Corrida");
    await expect(linha(page, NOME)).toContainText("Sem professor");
    expect(await tileValor(page, "Turmas ativas")).toBe(ativasAntes + 1);
    expect(listRefetches, "a criação não deve refazer o GET da lista").toBe(0);
    test.info().annotations.push({ type: "metric", description: `resposta da action de criação: ${actionBytes} bytes; refetches da lista: ${listRefetches}` });

    // Detalhe e voltar (navegação client-side) — lista continua correta.
    const detalhe = await linha(page, NOME).getByRole("link", { name: "Gerenciar" }).getAttribute("href");
    await page.goto(detalhe!);
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: NOME })).toBeVisible();
    await page.goBack();
    await page.waitForLoadState("load");
    await expect(linha(page, NOME)).toHaveCount(1);

    // Editar: reflete na hora.
    await linha(page, NOME).getByRole("button", { name: "Editar" }).click();
    const edit = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "Salvar" }) });
    await edit.getByLabel("Nome").fill(NOME_EDITADO);
    await edit.getByLabel("Nível").fill("Iniciante");
    await edit.getByRole("button", { name: "Salvar" }).click();
    await expect(linha(page, NOME_EDITADO)).toHaveCount(1, { timeout: 20_000 });
    await expect(linha(page, NOME_EDITADO)).toContainText("Iniciante");
    await expect(linha(page, NOME)).toHaveCount(0);

    // Reload real: o banco tem o que a UI mostrava.
    await page.reload();
    await page.waitForLoadState("load");
    await expect(linha(page, NOME_EDITADO)).toHaveCount(1);
    await expect(linha(page, NOME_EDITADO)).toContainText("Iniciante");

    // Arquivar: some na hora, indicador volta, e o reload confirma.
    await linha(page, NOME_EDITADO).getByRole("button", { name: "Editar" }).click();
    await page.getByRole("button", { name: "Arquivar turma" }).click();
    await page.getByRole("button", { name: "Confirmar arquivamento" }).click();
    await expect(linha(page, NOME_EDITADO)).toHaveCount(0, { timeout: 20_000 });
    expect(await tileValor(page, "Turmas ativas")).toBe(ativasAntes);

    await page.reload();
    await page.waitForLoadState("load");
    await expect(linha(page, NOME_EDITADO)).toHaveCount(0);
  });

  test("erro do domínio não deixa a store inconsistente (turma não aparece)", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await abrirTurmas(page, schoolId);
    const ativasAntes = await tileValor(page, "Turmas ativas");

    await page.getByRole("button", { name: "Nova turma" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nome").fill(`Inválida ${Date.now()}`);
    // Regra de domínio (CreateTeam): mais alunos do que a capacidade declarada.
    await modal.getByLabel("Capacidade").fill("1");
    const alunos = modal.locator('input[type="checkbox"]');
    const disponiveis = await alunos.count();
    expect(disponiveis, "fixture precisa de ao menos 2 alunos ativos").toBeGreaterThanOrEqual(2);
    await alunos.nth(0).check();
    await alunos.nth(1).check();
    await modal.getByRole("button", { name: "Criar turma" }).click();

    await expect(modal.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await expect(modal).toBeVisible();
    expect(await tileValor(page, "Turmas ativas")).toBe(ativasAntes);
  });
});
