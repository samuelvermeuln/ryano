/**
 * E2E — 14: Ficha do atleta na administração (/escola/<id>/atletas/<athleteId>)
 *
 * A administração precisava ver, por atleta, tudo o que o professor prescreveu
 * (feito, atrasado e por vir), abrir a estrutura de cada treino e pedir alteração
 * ao professor. Antes só dava para pedir pela ficha do professor, nas 20
 * prescrições mais recentes, sem estrutura e sem visão por atleta.
 *
 * Depende das prescrições criadas pelo spec 06: sem nenhuma não há o que abrir.
 * Se não houver, o teste falha dizendo isso, em vez de passar sem exercitar nada.
 *
 * Idempotência: o teste termina retirando o pedido que abriu, então reexecutar
 * volta ao mesmo estado. Um pedido aberto por uma execução interrompida é
 * retirado antes de começar.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login } from "./helpers";
import { ALUNOS, ESCOLA_1, PROFESSOR_1 } from "./fixtures";

const MOTIVO = "E2E ficha: reduzir o volume desta sessão.";

/** Lê o href da primeira ficha e navega direto (a 1ª visita ao compilar expira o clique). */
async function abrirPrimeiraFicha(page: Page, schoolId: string): Promise<string> {
  await page.goto(`/escola/${schoolId}/atletas`);
  await page.waitForLoadState("load");

  const link = page.getByRole("link", { name: /^Ver ficha de / }).first();
  expect(
    await link.isVisible({ timeout: 15_000 }).catch(() => false),
    "nenhum atleta ativo com 'Ver ficha' — rode os specs 02–05 primeiro",
  ).toBe(true);

  const href = await link.getAttribute("href");
  expect(href, "o link da ficha do atleta não tem href").toMatch(/\/escola\/[^/]+\/atletas\/[^/?#]+$/);

  await page.goto(href!);
  await page.waitForLoadState("load");
  return href!;
}

async function abrirPrimeiroTreino(page: Page) {
  const primeiro = page.getByRole("button", { name: /^Ver treino / }).first();
  expect(
    await primeiro.isVisible({ timeout: 15_000 }).catch(() => false),
    "o atleta não tem treinos prescritos — rode o spec 06 primeiro",
  ).toBe(true);
  await primeiro.click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible({ timeout: 8_000 });
  return dialogo;
}

/**
 * Retira pedidos abertos que tenham sobrado de uma execução interrompida.
 * A retirada é uma server action no banco remoto (lento): espera-se o estado
 * "Retirada" no modal e recarrega-se a ficha antes de contar de novo — um
 * `waitForTimeout` curto deixava o pedido pendente e o teste seguinte sem o
 * botão "Solicitar alteração".
 */
async function retirarPedidosAbertos(page: Page) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const abertos = page.getByText(/^Alteração: (Aguardando professor|Em análise)$/);
    if ((await abertos.count()) === 0) return;

    await page.getByRole("button", { name: /^Ver treino / }).first().waitFor({ state: "visible" });
    const linha = page.locator("tbody tr").filter({ has: abertos.first() }).first();
    await linha.getByRole("button", { name: /^Ver treino / }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: "Retirar solicitação" }).first().click();
    await expect(dialogo.getByText("Retirada").first()).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await page.reload();
    await page.waitForLoadState("load");
  }
}

test.describe("14 — Ficha do atleta na administração", () => {
  // Cada server action da ficha devolve a página re-renderizada no banco remoto (10–20 s);
  // o fluxo de pedir e retirar a alteração faz três delas.
  test.setTimeout(300_000);

  test("mostra os treinos prescritos e filtra por situação", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await abrirPrimeiraFicha(page, schoolId);

    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByText("Treinos prescritos")).toBeVisible();
    expect(await page.locator("tbody tr").count(), "a ficha não lista nenhum treino").toBeGreaterThan(0);

    // Cada filtro é um link com a contagem; o ativo se declara como página atual.
    const filtros = page.getByRole("navigation", { name: "Filtrar treinos" });
    await expect(filtros.getByRole("link", { name: /^Todos \(\d+\)$/ })).toHaveAttribute("aria-current", "page");

    await filtros.getByRole("link", { name: /^Realizados \(\d+\)$/ }).click();
    // Navegação client-side só confirma a URL quando o servidor (banco remoto) responde: até 30 s.
    await expect(page).toHaveURL(/filtro=realizados/, { timeout: 30_000 });
    await expect(filtros.getByRole("link", { name: /^Realizados \(\d+\)$/ })).toHaveAttribute("aria-current", "page", { timeout: 30_000 });
  });

  test("abre o treino num modal centralizado, com estrutura, e fecha por Escape e pelo fundo", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await abrirPrimeiraFicha(page, schoolId);

    const dialogo = await abrirPrimeiroTreino(page);
    await expect(dialogo).toHaveAttribute("aria-modal", "true");
    await expect(dialogo.getByText("Estrutura do treino")).toBeVisible();
    await expect(dialogo.getByText("Solicitações de alteração")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Fundo: um clique fora do diálogo, no canto da tela, também fecha.
    await abrirPrimeiroTreino(page);
    await page.mouse.click(4, 4);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("a administração pede alteração pela ficha e depois retira o pedido", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    await abrirPrimeiraFicha(page, schoolId);
    await retirarPedidosAbertos(page);

    // Uma prescrição livre é a que ainda oferece "Solicitar alteração".
    const dialogo = await abrirPrimeiroTreino(page);
    const solicitar = dialogo.getByRole("button", { name: "Solicitar alteração" });
    expect(
      await solicitar.isVisible({ timeout: 8_000 }).catch(() => false),
      "a primeira prescrição não oferece 'Solicitar alteração' (sem professor responsável?)",
    ).toBe(true);
    await solicitar.click();

    await dialogo.getByPlaceholder("O que precisa ser alterado?").fill(MOTIVO);
    await dialogo.getByRole("button", { name: "Enviar" }).click();

    // O pedido aparece no próprio modal, aguardando o professor, e a ficha reflete.
    // A resposta da server action inclui a ficha re-renderizada no banco remoto
    // (dezenas de consultas): o botão fica em "Enviando…" por bem mais de 45 s.
    await expect(dialogo.getByText("Aguardando professor")).toBeVisible({ timeout: 120_000 });
    // Pedidos retirados em execuções anteriores repetem o mesmo motivo: basta o primeiro.
    await expect(dialogo.getByText(MOTIVO).first()).toBeVisible();
    await expect(dialogo.getByText("Alteração solicitada")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText("Alteração: Aguardando professor").first()).toBeVisible({ timeout: 120_000 });

    // Retirar volta ao estado inicial: é o que torna o teste repetível.
    await page.locator("tbody tr").filter({ hasText: "Alteração: Aguardando professor" }).first()
      .getByRole("button", { name: /^Ver treino / }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Retirar solicitação" }).click();
    await expect(page.getByRole("dialog").getByText("Retirada").first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("dialog").getByRole("button", { name: "Solicitar alteração" })).toBeVisible({ timeout: 120_000 });
  });

  test("um professor não alcança a ficha da administração", async ({ page }) => {
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const href = await abrirPrimeiraFicha(page, schoolId);

    await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
    await page.goto(href);
    // O guard do layout redireciona (no dev server, por meta-refresh).
    await expect(page).not.toHaveURL(/\/escola\/[^/]+\/atletas\/[^/?#]+/, { timeout: 15_000 });
  });

  // SAM-37 — a administração abre as atividades do atleta (a mesma visão do professor).
  test("a administração vê as atividades importadas do atleta e abre o detalhe", async ({ page }) => {
    test.setTimeout(240_000);
    const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
    const href = await abrirPrimeiraFicha(page, schoolId);
    const athleteId = href.split("/atletas/")[1]!;

    // O e-mail da fixture vem do nome no cabeçalho da ficha.
    const nome = (await page.getByRole("heading", { level: 1 }).first().innerText()).trim();
    const aluno = ALUNOS.find((candidate) => nome.includes(candidate.name) || nome.includes(candidate.email));
    expect(aluno, `a primeira ficha (${nome}) não é de um aluno conhecido das fixtures`).toBeTruthy();

    const response = await page.request.post("/api/e2e/activity-fixture", {
      data: {
        athleteEmail: aluno!.email, startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), sportType: "open-water",
        externalId: `school-admin-${Date.now().toString(36)}`, autoMatch: true,
        laps: [{ durationSeconds: 1477, distanceMeters: 672, averageHeartRate: 138 }],
      },
    });
    expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
    const { activityId } = (await response.json()) as { activityId: string };

    await page.goto(href);
    await page.waitForLoadState("load");
    await page.getByTestId("athlete-activities-link").click();
    await page.waitForURL(`**/escola/${schoolId}/atletas/${athleteId}/atividades`, { timeout: 60_000 });
    const card = page.locator(`a[href="/escola/${schoolId}/atletas/${athleteId}/atividades/${activityId}"]`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Não planejada");

    await card.click();
    await page.waitForURL(`**/atividades/${activityId}`, { timeout: 90_000 });
    await expect(page.getByTestId("activity-outcome")).toContainText("Não planejada", { timeout: 30_000 });
    await expect(page.getByText("Resumo do treino").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Salvar layout" })).toHaveCount(0);

    // Na lista de atletas, a semana conta a atividade não planejada.
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");
    await expect(page.getByTestId("unplanned-week").first()).toBeVisible({ timeout: 30_000 });
  });
});
