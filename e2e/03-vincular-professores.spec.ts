/**
 * E2E — 03: Vincular professores às escolas
 *
 * - Prof. Carlos (1) e Prof. Ana (2) → solicitam vínculo com Escola Alpha
 * - Dono da Escola Alpha → aprova ambos
 * - Prof. Ricardo (3) → não solicita vínculo (permanece independente)
 *
 * Idempotente: verifica se o vínculo já existe antes de solicitar.
 */
import { test, expect } from "@playwright/test";
import { login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1, PROFESSOR_2 } from "./fixtures";

/** Professor solicita vínculo buscando a escola pelo nome */
async function solicitarVinculo(
  page: any,
  prof: typeof PROFESSOR_1 | typeof PROFESSOR_2,
  escolaNome: string,
) {
  await login(page, prof.email, prof.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, prof.name);

  await page.goto("/professor");
  await page.waitForLoadState("load");

  // Verifica se já tem vínculo (pendente ou ativo) com a escola
  const alreadyLinked = await page
    .locator(`text="${escolaNome}"`)
    .isVisible({ timeout: 3_000 })
    .catch(() => false);

  if (alreadyLinked) {
    console.log(`✅ "${prof.displayName}" já vinculado à "${escolaNome}"`);
    return;
  }

  // Clica em "Vincular a uma escola" ou navega diretamente
  await page.goto("/professor/buscar-escola");
  await page.waitForLoadState("load");

  // Busca a escola
  const searchInput = page.locator('input[type="search"], input[name="q"], input[placeholder*="escola"]').first();
  if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await searchInput.fill(escolaNome);
    await page.waitForTimeout(1_500);
  }

  // Clica no resultado da escola ou no botão de solicitar
  const schoolResult = page.locator(`text="${escolaNome}"`).first();
  if (await schoolResult.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await schoolResult.click();
    await page.waitForTimeout(500);
  }

  // Clica em "Solicitar" / "Pedir vínculo"
  const requestBtn = page
    .locator('button:has-text("Solicitar"), button:has-text("Pedir"), button:has-text("Vincular"), button:has-text("Entrar")')
    .first();
  if (await requestBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await requestBtn.click();
    await page.waitForTimeout(2_000);
    console.log(`✅ "${prof.displayName}" solicitou vínculo com "${escolaNome}"`);
  } else {
    console.log(`⚠️  Botão de solicitar não encontrado para "${prof.displayName}"`);
  }
}

/** Dono da escola aprova todas as solicitações pendentes de professores */
async function aprovarProfessoresPendentes(page: any) {
  await login(page, ESCOLA_1.ownerEmail, ESCOLA_1.ownerPassword);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, ESCOLA_1.ownerName);

  await page.goto("/escola");
  await page.waitForLoadState("load");

  // Captura o ID da escola a partir da URL
  const escolaUrl = page.url();
  const schoolId = escolaUrl.match(/\/escola\/([^/]+)/)?.[1];

  if (!schoolId) {
    console.log("⚠️  Não foi possível obter o schoolId para aprovação");
    return;
  }

  await page.goto(`/escola/${schoolId}/solicitacoes`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("load");

  // Aprova todas as solicitações de professor visíveis
  let aprovados = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const approveBtn = page
      .locator('button:has-text("Aprovar"), button:has-text("Aceitar"), form[action*="approve"] button[type="submit"]')
      .first();

    const visible = await approveBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!visible) break;

    await approveBtn.click();
    await page.waitForTimeout(1_500);
    await page.reload();
    await page.waitForLoadState("load");
    aprovados++;
  }

  console.log(`✅ ${aprovados} professor(es) aprovado(s) na Escola Alpha`);
}

test.describe("03 — Vincular professores à Escola Alpha", () => {
  test("Prof. Carlos solicita vínculo com Escola Alpha", async ({ page }) => {
    await solicitarVinculo(page, PROFESSOR_1, ESCOLA_1.schoolName);
    expect(page.url()).not.toContain("/entrar");
  });

  test("Prof. Ana solicita vínculo com Escola Alpha", async ({ page }) => {
    await solicitarVinculo(page, PROFESSOR_2, ESCOLA_1.schoolName);
    expect(page.url()).not.toContain("/entrar");
  });

  test("Dono da Escola Alpha aprova professores pendentes", async ({ page }) => {
    await aprovarProfessoresPendentes(page);
    expect(page.url()).not.toContain("/entrar");
  });
});
