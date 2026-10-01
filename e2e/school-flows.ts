/**
 * Fluxos de vínculo atleta ↔ escola compartilhados entre specs (10, 32).
 *
 * Cada função converge para um estado e devolve `false` só quando não
 * conseguiu — nunca "passa" silenciosamente: o spec decide se isso é falha.
 */
import { expect, type Page } from "@playwright/test";

import { completeOnboarding, login } from "./helpers";

type Aluno = { name: string; email: string; password: string };

/**
 * Garante que o aluno não tem vínculo ativo com a escola, para que haja o que
 * solicitar. A tela de atletas lista o histórico: um mesmo atleta pode ter
 * linhas "Desligado" e uma ativa, então o alvo é a linha com "Gerenciar".
 * Precisa de uma sessão de dono da escola já aberta na `page`.
 */
export async function garantirAlunoForaDaEscola(page: Page, schoolId: string, aluno: Aluno): Promise<boolean> {
  const sobrenome = aluno.name.split(" ")[1]!;

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    await page.goto(`/escola/${schoolId}/atletas`);
    await page.waitForLoadState("load");
    await page.getByLabel("Buscar atleta").fill(sobrenome);
    await page.waitForTimeout(1_000);

    const linhaAtiva = page
      .locator("tbody tr")
      .filter({ hasText: new RegExp(sobrenome, "i") })
      .filter({ has: page.locator('button:has-text("Gerenciar")') })
      .first();

    if (!(await linhaAtiva.isVisible({ timeout: 4_000 }).catch(() => false))) return true;

    // A UI protege a ação destrutiva em três passos.
    await linhaAtiva.locator('button:has-text("Gerenciar")').click();
    const desligar = page.locator('button:has-text("Desligar da escola")').first();
    if (!(await desligar.isVisible({ timeout: 5_000 }).catch(() => false))) return false;
    await desligar.click();
    await page.locator('button:has-text("Confirmar")').first().click();
    await page.waitForTimeout(3_000);
  }
  return false;
}

/** Há um pedido pendente deste aluno na fila do dono? (sessão de dono na `page`) */
export async function temPedidoPendente(page: Page, schoolId: string, aluno: Aluno): Promise<boolean> {
  const sobrenome = aluno.name.split(" ")[1]!;
  await page.goto(`/escola/${schoolId}/solicitacoes`);
  await page.waitForLoadState("load");
  return page
    .locator("li")
    .filter({ hasText: new RegExp(sobrenome, "i") })
    .locator('button:has-text("Aprovar")')
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
}

/** Abre `/app/escola`, busca pelo nome e devolve o card da escola (SAM-24). */
export async function buscarEscolaNoAtleta(page: Page, schoolName: string) {
  await page.goto("/app/escola");
  await page.waitForLoadState("load");
  await page.getByLabel("Buscar escola").fill(schoolName);
  await page.waitForTimeout(2_500); // busca é debounced
  return page.getByTestId("school-card").filter({ hasText: schoolName }).first();
}

/**
 * O aluno pede vínculo pela descoberta do contexto Atleta (SAM-24):
 * `/app/escola` → busca → "Ver escola" → modal → "Associar-se à escola".
 * Mantém o checkbox de histórico no padrão (marcado).
 */
export async function alunoSolicitaEntradaPelaBusca(page: Page, aluno: Aluno, schoolName: string): Promise<boolean> {
  await login(page, aluno.email, aluno.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, aluno.name);

  const cartao = await buscarEscolaNoAtleta(page, schoolName);
  if (!(await cartao.isVisible({ timeout: 10_000 }).catch(() => false))) return false;

  // Já vinculado ou já solicitado: o card diz isso e o modal não oferece o botão.
  if (await cartao.getByText(/Aguardando aprovação|Vinculado/).isVisible({ timeout: 1_000 }).catch(() => false)) return false;

  await cartao.getByRole("button", { name: "Ver escola" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // O perfil é carregado da API depois que o modal abre; no dev server a
  // primeira chamada ainda compila a rota, então o esqueleto pode demorar.
  await expect(dialog.getByLabel("Carregando perfil da escola")).toHaveCount(0, { timeout: 30_000 });

  const botao = dialog.getByRole("button", { name: /Associar-se à escola/ });
  if (!(await botao.isVisible({ timeout: 10_000 }).catch(() => false))) {
    console.log(`⚠️  Modal sem "Associar-se": ${(await dialog.textContent())?.replace(/\s+/g, " ").trim().slice(0, 200)}`);
    return false;
  }
  await botao.click();

  // Sucesso vira "Aguardando aprovação" dentro do modal; a recusa explícita da
  // API aparece em `.text-destructive`. Observar os dois evita timeout opaco.
  const sucesso = dialog.getByTestId("school-request-pending");
  const erro = dialog.locator(".text-destructive");
  await expect(sucesso.or(erro)).toBeVisible({ timeout: 15_000 });

  if (await erro.isVisible().catch(() => false)) {
    console.log(`⚠️  Escola recusou o pedido: ${(await erro.textContent())?.trim()}`);
    return false;
  }
  return true;
}
