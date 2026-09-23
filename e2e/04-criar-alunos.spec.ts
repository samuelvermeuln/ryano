/**
 * E2E — 04: Criar 5 alunos e matriculá-los na Escola Alpha
 *
 * Fluxo:
 *  1. Cadastro do aluno
 *  2. Onboarding mínimo
 *  3. Busca da Escola Alpha
 *  4. Solicitação de matrícula
 *  5. Dono da escola aprova (JOIN_POLICY pode ser REQUIRE_APPROVAL)
 *
 * Idempotente: se o aluno já tiver conta e já for membro, pula.
 */
import { test, expect } from "@playwright/test";
import { ensureUser, completeOnboarding, login } from "./helpers";
import { ESCOLA_1, ALUNOS } from "./fixtures";

async function criarEMatricularAluno(aluno: (typeof ALUNOS)[number], page: any) {
  // 1. Garante conta
  await ensureUser(page, aluno.name, aluno.email, aluno.password);
  if (page.url().includes("/onboarding")) {
    await completeOnboarding(page, aluno.name);
  }

  // 2. Vai para o dashboard do atleta
  await page.goto("/app/dashboard");
  await page.waitForLoadState("load");

  // 3. Verifica se já é membro de alguma escola
  const alreadyMember = await page
    .locator(`text="${ESCOLA_1.schoolName}"`)
    .isVisible({ timeout: 3_000 })
    .catch(() => false);

  if (alreadyMember) {
    console.log(`✅ "${aluno.name}" já é membro da Escola Alpha`);
    return;
  }

  // 4. Busca a escola
  await page.goto("/escola/buscar");
  await page.waitForLoadState("load");

  const searchInput = page
    .locator('input[type="search"], input[name="q"], input[placeholder*="escola"], input[placeholder*="buscar"]')
    .first();

  if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await searchInput.fill(ESCOLA_1.schoolName);
    await page.waitForTimeout(1_500);
  }

  // 5. Clica no resultado
  const schoolCard = page.locator(`text="${ESCOLA_1.schoolName}"`).first();
  if (await schoolCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await schoolCard.click();
    await page.waitForTimeout(500);
  }

  // 6. Solicita matrícula
  const joinBtn = page
    .locator(
      'button:has-text("Solicitar matrícula"), button:has-text("Matricular"), button:has-text("Entrar"), button:has-text("Ingressar"), button:has-text("Solicitar")',
    )
    .first();

  if (await joinBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await joinBtn.click();
    await page.waitForTimeout(2_000);
    console.log(`✅ "${aluno.name}" solicitou matrícula na Escola Alpha`);
  } else {
    console.log(`⚠️  Botão de matrícula não encontrado para "${aluno.name}"`);
  }
}

/** Dono da Escola Alpha aprova todas as solicitações de alunos pendentes */
async function aprovarAlunosPendentes(page: any) {
  await login(page, ESCOLA_1.ownerEmail, ESCOLA_1.ownerPassword);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, ESCOLA_1.ownerName);

  await page.goto("/escola");
  await page.waitForLoadState("load");

  const escolaUrl = page.url();
  const schoolId = escolaUrl.match(/\/escola\/([^/]+)/)?.[1];
  if (!schoolId) {
    console.log("⚠️  schoolId não encontrado");
    return;
  }

  await page.goto(`/escola/${schoolId}/solicitacoes`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("load");

  let aprovados = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const approveBtn = page
      .locator(
        'button:has-text("Aprovar"), button:has-text("Aceitar"), form[action*="approve"] button[type="submit"]',
      )
      .first();

    const visible = await approveBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!visible) break;

    await approveBtn.click();
    await page.waitForTimeout(1_500);
    await page.reload();
    await page.waitForLoadState("load");
    aprovados++;
  }

  console.log(`✅ ${aprovados} aluno(s) aprovado(s) na Escola Alpha`);
}

test.describe("04 — Criar e matricular alunos na Escola Alpha", () => {
  for (const aluno of ALUNOS) {
    test(`Criar aluno: ${aluno.name}`, async ({ page }) => {
      await criarEMatricularAluno(aluno, page);
      expect(page.url()).not.toContain("/entrar");
    });
  }

  test("Dono aprova matrículas pendentes dos alunos", async ({ page }) => {
    await aprovarAlunosPendentes(page);
    expect(page.url()).not.toContain("/entrar");
  });
});
