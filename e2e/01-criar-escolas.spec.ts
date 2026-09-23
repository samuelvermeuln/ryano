/**
 * E2E — 01: Criar 2 escolas
 *
 * Idempotente: se a escola já existir (owner já tem escola), pula a criação.
 * Escolas criadas:
 *   - Escola Alpha de Natação (dono: owner.alpha@ryvano-e2e.test)
 *   - Escola Beta de Ciclismo (dono: owner.beta@ryvano-e2e.test)
 */
import { test, expect } from "@playwright/test";
import { ensureUser, completeOnboarding, login } from "./helpers";
import { ESCOLA_1, ESCOLA_2 } from "./fixtures";

async function criarEscola(
  escola: typeof ESCOLA_1 | typeof ESCOLA_2,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
) {
  // 1. Garante que o dono existe (com onboarding completo)
  await ensureUser(page, escola.ownerName, escola.ownerEmail, escola.ownerPassword);

  // 2. Vai para o painel da escola
  await page.goto("/escola");
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);

  const currentUrl = page.url();

  // 3. Se já tem escola (não redirecionou para /criar, /buscar ou /entrar)
  const hasSchool =
    currentUrl.includes("/escola/") &&
    !currentUrl.includes("/escola/criar") &&
    !currentUrl.includes("/escola/buscar") &&
    !currentUrl.includes("/onboarding") &&
    !currentUrl.includes("/entrar");

  if (hasSchool) {
    console.log(`✅ Escola "${escola.schoolName}" já existe para ${escola.ownerEmail}`);
    return;
  }

  // 4. Navega para o formulário de criação
  await page.goto("/escola/criar");
  await page.waitForLoadState("load");

  // ── STEP 0: Dados básicos da escola ────────────────────────────────────────
  await page.locator('input[name="schoolName"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('input[name="schoolName"]').fill(escola.schoolName);
  await page.locator('input[name="schoolEmail"]').fill(escola.schoolEmail);
  await page.locator('input[name="schoolPhone"]').fill(escola.schoolPhone);
  await page.locator('input[name="cnpj"]').fill(escola.cnpj);

  // Política de adesão (select visível no step 0)
  await page.locator('select[name="joinPolicy"]').selectOption(escola.joinPolicy);

  // Avança para step 1
  await page.locator('button').filter({ hasText: /Próximo/i }).first().click();
  await page.waitForTimeout(500);

  // ── STEP 1: Endereço ────────────────────────────────────────────────────────
  // O input de CEP tem id="postalCode" (não name, pois é controlado por state)
  const cepInput = page.locator('input[id="postalCode"]');
  await cepInput.waitFor({ state: "visible", timeout: 10_000 });
  await cepInput.fill(escola.postalCode);
  await cepInput.blur(); // dispara ViaCEP
  await page.waitForTimeout(3_000); // aguarda autocomplete

  await page.locator('input[name="addressNumber"]').fill(escola.addressNumber);

  // Avança para step 2
  await page.locator('button').filter({ hasText: /Próximo/i }).last().click();
  await page.waitForTimeout(500);

  // ── STEP 2: Modalidades ─────────────────────────────────────────────────────
  // Os botões de modalidade são <button type="button"> com texto do label
  const sportLabels: Record<string, string> = {
    swim: "Natação",
    bike: "Ciclismo",
    run: "Corrida",
    "trail-run": "Trail Run",
  };

  for (const sport of escola.sportTypes) {
    const label = sportLabels[sport] ?? sport;
    await page.locator('button').filter({ hasText: label }).first().click();
    await page.waitForTimeout(200);
  }

  // Avança para step 3 (professores + submit)
  await page.locator('button').filter({ hasText: /Próximo/i }).last().click();
  await page.waitForTimeout(500);

  // ── STEP 3: Submit ──────────────────────────────────────────────────────────
  await page.locator('button[type="submit"]').waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('button[type="submit"]').click();

  // Aguarda redirect para o painel da escola (ID com 25+ chars, não "criar" nem "buscar")
  await page.waitForURL(
    (url) => {
      const path = url.pathname;
      return (
        path.startsWith("/escola/") &&
        path !== "/escola/criar" &&
        path !== "/escola/buscar" &&
        path.split("/")[2]!.length > 6
      );
    },
    { timeout: 30_000 },
  );
  console.log(`✅ Escola "${escola.schoolName}" criada — ${page.url()}`);
}

test.describe("01 — Criar escolas", () => {
  test("Criar Escola Alpha de Natação", async ({ page }) => {
    await criarEscola(ESCOLA_1, page);
    // Escola criada → URL é /escola/<id> ou /escola/<id>/...
    expect(page.url()).toMatch(/\/escola/);
    expect(page.url()).not.toContain("/entrar");
  });

  test("Criar Escola Beta de Ciclismo", async ({ page }) => {
    await criarEscola(ESCOLA_2, page);
    expect(page.url()).toMatch(/\/escola/);
    expect(page.url()).not.toContain("/entrar");
  });
});
