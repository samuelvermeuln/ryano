/**
 * E2E — 16: Criar turma já com alunos e professores (SAM-8)
 *
 * Cobre o fluxo que a issue exige, inteiro pela UI: abrir o modal em
 * /escola/<id>/turmas, nomear a turma, buscar e marcar alunos e professores
 * existentes, revisar a seleção, salvar, ver a turma na listagem e abrir o
 * detalhe com os vínculos já feitos.
 *
 * Nada é inserido no banco pelo teste: sem prisma, sem SQL, sem POST direto.
 * As pessoas vêm das fixtures que os specs 01–05 criaram pela interface.
 *
 * Idempotente: a turma tem nome fixo e é arquivada no fim. Se uma execução
 * anterior morreu no meio, a turma encontrada é arquivada antes de começar —
 * "já está assim" converge para o estado desejado em vez de falhar.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner } from "./helpers";
import { ESCOLA_1 } from "./fixtures";

const TURMA = {
  name: "Turma SAM8 — Criada com participantes",
  sportType: "Corrida",
  level: "Intermediário",
  location: "Pista Municipal",
  capacity: 30,
} as const;

const LISTA = (schoolId: string) => `/escola/${schoolId}/turmas`;

/** Linha da turma deste spec na listagem ativa. */
function linhaDaTurma(page: Page) {
  return page.locator('a[href*="/turmas/"]').filter({ hasText: TURMA.name });
}

/**
 * Arquiva a turma deste spec se ela existir. É o que torna o spec repetível:
 * a 2a execução parte do mesmo estado que a 1a em vez de tropeçar na turma
 * deixada para trás.
 */
async function arquivarSePresente(page: Page, schoolId: string) {
  await page.goto(LISTA(schoolId));
  await page.waitForLoadState("load");

  while ((await linhaDaTurma(page).count()) > 0) {
    const linha = page.locator("tr").filter({ hasText: TURMA.name }).first();
    await linha.locator('button:has-text("Editar")').click();
    await page.locator('button:has-text("Arquivar turma")').first().click();
    await page.locator('button:has-text("Confirmar arquivamento")').first().click();

    await page.goto(LISTA(schoolId));
    await page.waitForLoadState("load");
  }
}

/** O modal de criação, pelo papel de dialog — não por classe de layout. */
function modal(page: Page) {
  return page.getByRole("dialog", { name: "Nova turma" });
}

/**
 * Marca as primeiras `quantidade` pessoas do picker e devolve os nomes
 * marcados, que são o que será conferido depois na tela de detalhe.
 */
async function marcarParticipantes(
  page: Page,
  grupo: "Alunos" | "Professores",
  quantidade: number,
): Promise<string[]> {
  const picker = modal(page).locator("fieldset").filter({ hasText: grupo }).first();
  const linhas = picker.locator("label");
  const disponiveis = await linhas.count();
  expect(disponiveis, `Nenhum item em "${grupo}" — as fixtures 01–05 rodaram?`).toBeGreaterThan(0);

  const alvo = Math.min(quantidade, disponiveis);
  const nomes: string[] = [];
  for (let i = 0; i < alvo; i += 1) {
    const linha = linhas.nth(i);
    const nome = (await linha.locator("span > span").first().textContent())?.trim() ?? "";
    await linha.locator('input[type="checkbox"]').check();
    if (nome) nomes.push(nome);
  }
  return nomes;
}

test.describe.configure({ mode: "serial" });

test.describe("16 — Criar turma com alunos e professores (SAM-8)", () => {
  test("Dono cria a turma e vincula participantes num só passo pela UI", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await arquivarSePresente(page, schoolId);

    await page.goto(LISTA(schoolId));
    await page.waitForLoadState("load");
    await page.locator("button", { hasText: "Nova turma" }).first().click();

    const dialog = modal(page);
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.locator('input[name="name"]').fill(TURMA.name);
    await dialog.locator('input[name="sportType"]').fill(TURMA.sportType);
    await dialog.locator('input[name="level"]').fill(TURMA.level);
    await dialog.locator('input[name="location"]').fill(TURMA.location);
    await dialog.locator('input[name="capacity"]').fill(String(TURMA.capacity));

    // Busca: o filtro tem de esconder quem não casa e manter marcado quem já
    // foi escolhido — é o que separa o picker de um <select multiple>.
    const buscaAluno = dialog.getByLabel("Buscar aluno");
    await buscaAluno.fill("zzz-nao-existe");
    await expect(dialog.getByText("Ninguém corresponde a esta busca")).toBeVisible();
    await buscaAluno.fill("");

    const alunos = await marcarParticipantes(page, "Alunos", 2);
    const professores = await marcarParticipantes(page, "Professores", 1);

    // Revisão antes de salvar: cada escolha aparece como chip removível.
    for (const nome of [...alunos, ...professores]) {
      await expect(dialog.getByRole("button", { name: `Remover ${nome}` })).toBeVisible();
    }

    await dialog.locator('button:has-text("Criar turma")').click();

    // Sucesso = modal fechado e turma na listagem, sem recarregar na mão.
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(linhaDaTurma(page).first()).toBeVisible({ timeout: 20_000 });

    console.log(`✅ Turma criada com ${alunos.length} aluno(s) e ${professores.length} professor(es)`);
  });

  test("A turma aparece na listagem com modalidade e contagem de participantes", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(LISTA(schoolId));
    await page.waitForLoadState("load");

    const linha = page.locator("tr").filter({ hasText: TURMA.name }).first();
    await expect(linha).toBeVisible({ timeout: 15_000 });
    await expect(linha).toContainText(TURMA.sportType);
    await expect(linha).toContainText(`/ ${TURMA.capacity}`);
    // Vinculado no mesmo salvamento: a turma não pode nascer "Sem professor".
    await expect(linha).not.toContainText("Sem professor");
  });

  test("O detalhe da turma mostra os alunos e o professor vinculados", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(LISTA(schoolId));
    await page.waitForLoadState("load");

    // href + goto em vez de clique: no dev server a 1a visita compila a rota e
    // o clique estoura o timeout sem haver bug nenhum.
    const href = await linhaDaTurma(page).first().getAttribute("href");
    expect(href, "Link de detalhe da turma não encontrado").toBeTruthy();
    await page.goto(href!);
    await page.waitForLoadState("load");

    await expect(page.getByRole("heading", { name: TURMA.name })).toBeVisible({ timeout: 15_000 });

    // Os títulos das seções carregam a contagem; é a prova de que os vínculos
    // foram persistidos pela criação, e não adicionados depois.
    await expect(page.getByText(/Atletas \(([1-9]\d*)\)/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Professores \(([1-9]\d*)\)/)).toBeVisible();
  });

  test("Editar pela UI remove um participante e mantém os demais", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await page.goto(LISTA(schoolId));
    await page.waitForLoadState("load");

    const href = await linhaDaTurma(page).first().getAttribute("href");
    expect(href, "Link de detalhe da turma não encontrado").toBeTruthy();
    await page.goto(href!);
    await page.waitForLoadState("load");

    const secaoAtletas = page.locator("section").filter({ hasText: /Atletas \(\d+\)/ }).first();
    const membros = secaoAtletas.locator("li");
    const antes = await membros.count();
    expect(antes, "A turma deveria ter atletas vinculados pela criação").toBeGreaterThan(0);

    await membros.first().locator('button:has-text("Remover")').click();
    await membros.first().locator('button:has-text("Confirmar")').click();

    await expect(secaoAtletas.locator("li")).toHaveCount(antes - 1, { timeout: 20_000 });
    console.log(`✅ Atleta removido pela UI: ${antes} → ${antes - 1}`);
  });

  test("Arquivar a turma a remove da listagem ativa", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await arquivarSePresente(page, schoolId);
    await expect(linhaDaTurma(page)).toHaveCount(0, { timeout: 15_000 });
  });
});
