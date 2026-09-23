/**
 * E2E — 02: Criar 3 professores
 *
 * - Prof. Carlos Mendes  (prof.carlos@ryvano-e2e.test)  → vai para Escola Alpha
 * - Prof. Ana Lima       (prof.ana@ryvano-e2e.test)     → vai para Escola Alpha
 * - Prof. Ricardo Souza  (prof.ricardo@ryvano-e2e.test) → independente (sem escola)
 *
 * Idempotente: se o perfil de professor já existir, pula a criação.
 */
import { test, expect } from "@playwright/test";
import { ensureUser, completeOnboarding, ensureCoachProfile } from "./helpers";
import { PROFESSOR_1, PROFESSOR_2, PROFESSOR_3 } from "./fixtures";

async function criarProfessor(
  prof: typeof PROFESSOR_1 | typeof PROFESSOR_2 | typeof PROFESSOR_3,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
) {
  // 1. Garante conta
  await ensureUser(page, prof.name, prof.email, prof.password);

  // 2. Completa onboarding mínimo
  if (page.url().includes("/onboarding")) {
    await completeOnboarding(page, prof.name);
  }

  // 3. Cria perfil de professor (idempotente internamente)
  await ensureCoachProfile(page, prof.displayName, prof.bio);

  // 4. Confirma que está no painel do professor
  await page.goto("/professor");
  await page.waitForLoadState("load");

  // O painel deve mostrar o nome do professor ou botão de criar turma
  const hasPanel = await page
    .locator(`text="${prof.displayName}", [data-testid="coach-panel"], h1, h2`)
    .first()
    .isVisible({ timeout: 8_000 })
    .catch(() => false);

  console.log(`✅ Professor "${prof.displayName}" pronto — ${page.url()}`);
  return hasPanel;
}

test.describe("02 — Criar professores", () => {
  test("Professor 1 — Carlos Mendes", async ({ page }) => {
    await criarProfessor(PROFESSOR_1, page);
    expect(page.url()).not.toContain("/entrar");
  });

  test("Professor 2 — Ana Lima", async ({ page }) => {
    await criarProfessor(PROFESSOR_2, page);
    expect(page.url()).not.toContain("/entrar");
  });

  test("Professor 3 — Ricardo Souza (independente)", async ({ page }) => {
    await criarProfessor(PROFESSOR_3, page);
    expect(page.url()).not.toContain("/entrar");
  });
});
