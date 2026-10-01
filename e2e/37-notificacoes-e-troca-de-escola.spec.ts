/**
 * E2E — 37 (SAM-29): notificações in-app e "seguir professor".
 *
 * Atores: Prof. Ricardo (PROFESSOR_3, independente), Maria (ALUNOS[1], sua
 * atleta independente — spec 34) e a Escola Beta (ESCOLA_2).
 *
 * 0. Converge: Ricardo fora da Beta; Maria fora da Beta; Maria ↔ Ricardo com
 *    acompanhamento independente ATIVO (pede e Ricardo aceita, se preciso).
 * 1. Ricardo pede vínculo na Beta → dono da Beta aprova (professor).
 * 2. Maria vê no sino "Ricardo agora também atende na Escola Beta" → clica →
 *    /app/escola?school=&coach= → modal da Beta com Ricardo pré-selecionado e
 *    "encerrar acompanhamento anterior" marcado → "Associar-se à escola".
 * 3. Dono da Beta vê "Professor preferido: Ricardo" → Aprovar → Maria vê a
 *    notificação de aprovação e, em /atleta/<beta>, Ricardo como professor.
 * 4. Dono da Beta desativa Ricardo → Maria recebe "Ricardo deixou a Escola Beta".
 *
 * Deixa: Ricardo fora da Beta, Maria membro da Beta sem professor e sem vínculo
 * com Ricardo (o spec 34 e o passo 0 convergem a partir daí).
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

import { ALUNOS, ESCOLA_2, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login, loginAsSchoolOwner } from "./helpers";

const MARIA = ALUNOS[1]!;
const RICARDO_NOME = PROFESSOR_3.displayName ?? PROFESSOR_3.name.replace(/^Prof\.\s*/, "");

// Dois donos, um professor e uma atleta se revezando num banco remoto lento: 7 minutos.
test.describe.configure({ mode: "serial", timeout: 420_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function abrirPerfilDoProfessor(page: Page, email: string): Promise<Locator> {
  await page.goto("/app/professor");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar professor").fill(email);
  // O card certo basta: a busca por e-mail filtra a lista, mas com o banco lento a
  // lista inicial pode ficar na tela por um tempo, e Ricardo já está nela.
  const card = page.getByTestId("coach-card").filter({ hasText: RICARDO_NOME }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button", { name: "Ver perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByLabel("Carregando perfil do professor")).toHaveCount(0, { timeout: 30_000 });
  return dialog;
}

/**
 * Server actions respondem a um POST na própria URL da página. Esperar essa
 * resposta é a única forma segura de saber que a ação terminou: o rótulo do
 * botão muda ("Aprovando…") antes do fim, e um `goto` em seguida aborta a ação
 * (lição do spec 34).
 */
async function comAcaoDoServidor(page: Page, pathPart: string, act: () => Promise<void>) {
  // O shell dispara `rememberActiveContextAction` (também um POST na URL da
  // página) logo após carregar; esperar a rede acalmar evita confundir essa
  // resposta com a da ação clicada.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  const done = page.waitForResponse(
    (response) => {
      const request = response.request();
      return request.method() === "POST" && response.url().includes(pathPart) && Boolean(request.headers()["next-action"]);
    },
    { timeout: 60_000 },
  );
  await act();
  await done;
}

/** Clica na ação inline e confirma, se a ação pedir confirmação; espera a server action terminar. */
async function acaoInline(page: Page, pathPart: string, scope: Locator, label: string) {
  await scope.getByRole("button", { name: label }).first().click();
  const confirmar = scope.getByRole("button", { name: /^Confirmar/ });
  if (await confirmar.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await comAcaoDoServidor(page, pathPart, () => confirmar.first().click());
  }
}

/** Cards de professores ATIVOS da escola (a seção "Ativos (n)" de /escola/<id>/professores). */
function professoresAtivos(page: Page): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: /^Ativos/ }) }).getByRole("listitem");
}

/**
 * Desativa Ricardo na escola pela ficha dele ("Desativar" → "Confirmar" vive em
 * /escola/<id>/professores/<membershipId>). Devolve false se ele não estava ativo.
 */
async function desativarRicardo(page: Page, schoolId: string): Promise<boolean> {
  await page.goto(`/escola/${schoolId}/professores`);
  await page.waitForLoadState("load");
  const card = professoresAtivos(page).filter({ hasText: RICARDO_NOME }).first();
  await page.getByRole("heading", { name: /^Ativos|ainda não tem professores/ }).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  if (!(await card.isVisible({ timeout: 10_000 }).catch(() => false))) return false;
  await card.getByRole("link", { name: /Ver ficha/ }).click();
  await page.waitForURL(/\/professores\/[^/?#]+$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Desativar" }).click();
  await comAcaoDoServidor(page, "/professores/", () => page.getByRole("button", { name: /^Confirmar/ }).click());
  await page.goto(`/escola/${schoolId}/professores`);
  await page.waitForLoadState("load");
  await expect(professoresAtivos(page).filter({ hasText: RICARDO_NOME })).toHaveCount(0, { timeout: 30_000 });
  return true;
}

/** Beta sem Ricardo (professor) e sem Maria (atleta). */
async function convergirBeta(page: Page, betaId: string) {
  if (await desativarRicardo(page, betaId)) console.log("↻ Ricardo desativado na Beta (convergência)");

  await page.goto(`/escola/${betaId}/atletas`);
  await page.waitForLoadState("load");
  // Uma linha por período de vínculo: um ENDED antigo e o ACTIVE atual têm o
  // mesmo nome, e só o ativo tem "Gerenciar" (que vira "Fechar" ao abrir).
  const linhaMaria = page.locator("tr").filter({ hasText: MARIA.name }).filter({ has: page.getByRole("button", { name: /^(Gerenciar|Fechar)$/ }) }).first();
  const gerenciar = linhaMaria.getByRole("button", { name: "Gerenciar" });
  // A tabela chega depois do "load" (banco remoto); 3 s já deixaram Maria passar despercebida numa rodada.
  await page.getByRole("table").or(page.getByText(/Nenhum atleta/)).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  if (await gerenciar.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await gerenciar.click();
    await acaoInline(page, "/atletas", linhaMaria, "Desligar da escola");
    await page.reload();
    await expect(page.locator("tr").filter({ hasText: MARIA.name }).getByRole("button", { name: "Gerenciar" })).toHaveCount(0, { timeout: 45_000 });
    console.log("↻ Maria desligada da Beta (convergência)");
  }
}

/** Maria com acompanhamento independente ATIVO com Ricardo. */
async function garantirAcompanhamentoIndependente(page: Page) {
  await loginComo(page, MARIA);
  let dialog = await abrirPerfilDoProfessor(page, PROFESSOR_3.email);
  if (await dialog.getByText("já acompanha seus treinos").isVisible({ timeout: 1_000 }).catch(() => false)) {
    console.log("✓ Ricardo já acompanha Maria");
    return;
  }
  if (!(await dialog.getByTestId("coach-request-pending").isVisible({ timeout: 1_000 }).catch(() => false))) {
    const onde = dialog.getByLabel("Onde");
    if (await onde.isVisible({ timeout: 1_000 }).catch(() => false)) await onde.selectOption("");
    await dialog.getByRole("button", { name: "Solicitar acompanhamento" }).click();
    await expect(dialog.getByTestId("coach-request-pending")).toBeVisible({ timeout: 30_000 });
    console.log("✉️  Maria pediu acompanhamento independente a Ricardo");
  }

  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor");
  await page.waitForLoadState("load");
  const pedido = page.getByTestId("coach-request").filter({ hasText: MARIA.name }).first();
  await expect(pedido).toBeVisible({ timeout: 30_000 });
  await pedido.getByRole("button", { name: "Aceitar" }).click();
  await expect(page.getByTestId("coach-request").filter({ hasText: MARIA.name })).toHaveCount(0, { timeout: 45_000 });
  console.log("✅ Ricardo aceitou Maria (independente)");

  await loginComo(page, MARIA);
  dialog = await abrirPerfilDoProfessor(page, PROFESSOR_3.email);
  await expect(dialog.getByText("já acompanha seus treinos")).toBeVisible();
}

async function abrirSino(page: Page): Promise<Locator> {
  await page.getByTestId("notifications-bell").click();
  const popover = page.getByTestId("notifications-popover");
  await expect(popover).toBeVisible({ timeout: 10_000 });
  await expect(popover.getByText("Carregando…")).toHaveCount(0, { timeout: 30_000 });
  return popover;
}

test.describe("37 — Notificações in-app e troca de escola (SAM-29)", () => {
  test("professor entra numa escola → atleta é avisado e segue o professor em um clique; professor sai → atleta é avisado", async ({ page }) => {
    // 0. Convergência.
    const betaId = await loginAsSchoolOwner(page, ESCOLA_2);
    await convergirBeta(page, betaId);
    await garantirAcompanhamentoIndependente(page);

    // 1. Ricardo pede vínculo na Beta; o dono aprova.
    await loginComo(page, PROFESSOR_3);
    await page.goto("/professor/buscar-escola");
    await page.waitForLoadState("load");
    await page.locator('input[type="search"]').fill(ESCOLA_2.schoolName);
    const resultadoBeta = page.locator("li").filter({ hasText: ESCOLA_2.schoolName }).first();
    await expect(resultadoBeta).toBeVisible({ timeout: 30_000 });
    const solicitar = resultadoBeta.getByRole("button", { name: "Solicitar entrada" });
    if (await solicitar.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await solicitar.click();
      await expect(resultadoBeta.getByText(/Solicitado/)).toBeVisible({ timeout: 30_000 });
    }
    console.log("✉️  Ricardo pediu vínculo na Beta");

    await loginAsSchoolOwner(page, ESCOLA_2);
    await page.goto(`/escola/${betaId}/solicitacoes`);
    await page.waitForLoadState("load");
    const pedidoRicardo = page.getByRole("listitem").filter({ hasText: RICARDO_NOME }).filter({ has: page.getByRole("button", { name: "Aprovar" }) }).first();
    await expect(pedidoRicardo).toBeVisible({ timeout: 30_000 });
    await comAcaoDoServidor(page, "/solicitacoes", () => pedidoRicardo.getByRole("button", { name: "Aprovar" }).click());
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: RICARDO_NOME }).filter({ has: page.getByRole("button", { name: "Aprovar" }) })).toHaveCount(0, { timeout: 45_000 });
    console.log("✅ Beta aprovou Ricardo");

    // 2. Maria é avisada e segue o professor.
    await loginComo(page, MARIA);
    await page.goto("/app/dashboard");
    await page.waitForLoadState("load");
    await expect(page.getByTestId("notifications-unread")).toBeVisible({ timeout: 30_000 });
    const popover = await abrirSino(page);
    const aviso = popover.getByTestId("notification-item").filter({ hasText: `agora também atende na ${ESCOLA_2.schoolName}` }).first();
    await expect(aviso).toBeVisible();
    await aviso.click();
    await page.waitForURL(/\/app\/escola\?school=.*coach=/, { timeout: 30_000 });
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 15_000 });
    await expect(modal.getByLabel("Carregando perfil da escola")).toHaveCount(0, { timeout: 30_000 });
    const preferido = modal.getByLabel("Professor preferido");
    await expect(preferido).toBeVisible();
    await expect(preferido.locator("option:checked")).toHaveText(new RegExp(RICARDO_NOME));
    await expect(modal.getByTestId("end-previous-coaching")).toBeChecked();
    await modal.getByRole("button", { name: "Associar-se à escola" }).click();
    await expect(modal.getByTestId("school-request-pending")).toBeVisible({ timeout: 30_000 });
    console.log("🔗 Maria pediu vínculo na Beta seguindo Ricardo");

    // 3. Beta aprova com o professor preferido; Maria vê a aprovação e o professor.
    await loginAsSchoolOwner(page, ESCOLA_2);
    await page.goto(`/escola/${betaId}/solicitacoes`);
    await page.waitForLoadState("load");
    const pedidoMaria = page.getByRole("listitem").filter({ hasText: MARIA.name }).first();
    await expect(pedidoMaria).toBeVisible({ timeout: 30_000 });
    await expect(pedidoMaria.getByTestId("preferred-coach")).toContainText(RICARDO_NOME);
    await comAcaoDoServidor(page, "/solicitacoes", () => pedidoMaria.getByRole("button", { name: "Aprovar" }).click());
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: MARIA.name }).filter({ has: page.getByRole("button", { name: "Aprovar" }) })).toHaveCount(0, { timeout: 45_000 });
    console.log("✅ Beta aprovou Maria com Ricardo");

    await loginComo(page, MARIA);
    await page.goto("/app/notificacoes");
    await page.waitForLoadState("load");
    // `.first()`: execuções anteriores deixam notificações iguais; o que importa é a desta rodada existir, não lida.
    await expect(page.getByTestId("notification-row").filter({ hasText: `Você entrou na ${ESCOLA_2.schoolName}` }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="notification-row"][data-unread="true"]').filter({ hasText: `Você entrou na ${ESCOLA_2.schoolName}` }).first()).toBeVisible();
    await page.goto(`/atleta/${betaId}`);
    await page.waitForLoadState("load");
    await expect(page.getByText(RICARDO_NOME).first()).toBeVisible({ timeout: 30_000 });
    console.log("🎓 Maria está na Beta com Ricardo como professor");

    // 4. Ricardo sai da Beta → Maria é avisada.
    await loginAsSchoolOwner(page, ESCOLA_2);
    expect(await desativarRicardo(page, betaId), "Ricardo deveria estar ativo na Beta para ser desativado").toBe(true);

    await loginComo(page, MARIA);
    await page.goto("/app/notificacoes");
    await page.waitForLoadState("load");
    await expect(page.locator('[data-testid="notification-row"][data-unread="true"]').filter({ hasText: `deixou a ${ESCOLA_2.schoolName}` }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Marcar todas como lidas/ }).click();
    await expect(page.getByText("Tudo lido.")).toBeVisible({ timeout: 30_000 });
    console.log("🔔 Maria avisada da saída de Ricardo; notificações lidas");
  });
});
