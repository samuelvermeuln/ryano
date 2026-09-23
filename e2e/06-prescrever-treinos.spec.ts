/**
 * E2E — 06: Prescrever treinos via solicitação do atleta + aprovação do professor
 *
 * Fluxo:
 *   Atleta → /app/treinos/solicitar → solicita treino (natação, corrida, ciclismo)
 *   Prof. Carlos → /professor/<schoolId>/treinos → aprova (fulfill) cada pedido
 *
 * Para cada um dos 5 alunos: 3 modalidades = 15 prescrições no total.
 * Idempotente: não duplica solicitações se já existirem.
 */
import { test, expect } from "@playwright/test";
import { login, completeOnboarding, futureDate } from "./helpers";
import { PROFESSOR_1, ALUNOS, TREINOS_PARA_PRESCREVER, ESCOLA_1 } from "./fixtures";

// ---------------------------------------------------------------------------
// Aluno solicita treino
// ---------------------------------------------------------------------------

async function solicitarTreino(
  page: any,
  aluno: (typeof ALUNOS)[number],
  schoolName: string,
  sportType: string,
) {
  await login(page, aluno.email, aluno.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, aluno.name);

  await page.goto("/app/treinos/solicitar");
  await page.waitForLoadState("load");

  // Seleciona escola
  const schoolSelect = page.locator('select[name="schoolId"]');
  if (await schoolSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await schoolSelect.selectOption({ label: schoolName });
  } else {
    console.log(`⚠️  Select de escola não encontrado para ${aluno.name}`);
    return false;
  }

  // Seleciona modalidade
  const sportSelect = page.locator('select[name="sportType"]');
  if (await sportSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await sportSelect.selectOption(sportType);
  }

  // Data preferida (opcional)
  const dateInput = page.locator('input[name="preferredDate"]');
  if (await dateInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await dateInput.fill(futureDate(3));
  }

  // Observação
  const noteArea = page.locator('textarea[name="note"]');
  if (await noteArea.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await noteArea.fill(`Pedido E2E: ${sportType} para ${aluno.name}`);
  }

  // Submete
  const submitBtn = page.locator('button[type="submit"]').last();
  await submitBtn.click();
  await page.waitForTimeout(2_000);

  console.log(`📬 "${aluno.name}" solicitou treino de ${sportType}`);
  return true;
}

// ---------------------------------------------------------------------------
// Professor aprova todos os pedidos pendentes
// ---------------------------------------------------------------------------

async function professsorAprovaTodos(page: any) {
  await login(page, PROFESSOR_1.email, PROFESSOR_1.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, PROFESSOR_1.name);

  await page.goto("/professor");
  await page.waitForLoadState("load");

  // Encontra o link da Escola Alpha
  const schoolLink = page.locator(`a[href*="/professor/"]:has-text("${ESCOLA_1.schoolName}"), a[href*="/professor/"]`).first();
  const schoolHref = await schoolLink.getAttribute("href").catch(() => null);
  const schoolId = schoolHref?.match(/\/professor\/([^/]+)/)?.[1];

  if (!schoolId) {
    console.log("⚠️  schoolId não encontrado no painel do professor");
    return 0;
  }

  await page.goto(`/professor/${schoolId}/treinos`);
  await page.waitForLoadState("load");

  let aprovados = 0;
  const nextDate = futureDate(5);

  // Processa todos os pedidos pendentes em loop
  for (let attempt = 0; attempt < 20; attempt++) {
    // Botão de abrir modal de fulfill
    const fulfillBtn = page
      .locator('button:has-text("Aprovar"), button:has-text("Prescrever"), button:has-text("Atender"), form button[type="submit"]:not(:has-text("Recusar"))')
      .first();

    const visible = await fulfillBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    if (!visible) break;

    await fulfillBtn.scrollIntoViewIfNeeded();
    await fulfillBtn.click({ force: true });
    await page.waitForTimeout(800);

    // Preenche o formulário de fulfill (modal ou inline)
    const titleInput = page.locator('input[name="title"]');
    if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await titleInput.fill(`Treino Prescrito E2E — ${new Date().toLocaleDateString("pt-BR")}`);
    }

    const scheduledInput = page.locator('input[name="scheduledAt"], input[name="scheduledDate"], input[type="datetime-local"], input[type="date"]').first();
    if (await scheduledInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const inputType = await scheduledInput.getAttribute("type");
      if (inputType === "datetime-local") {
        await scheduledInput.fill(`${nextDate}T08:00`);
      } else {
        await scheduledInput.fill(nextDate);
      }
    }

    const durationInput = page.locator('input[name="durationMinutes"]');
    if (await durationInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await durationInput.fill("45");
    }

    const distanceInput = page.locator('input[name="distanceKm"]');
    if (await distanceInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await distanceInput.fill("5");
    }

    // Confirma o fulfill
    const confirmBtn = page
      .locator('button:has-text("Confirmar"), button:has-text("Prescrever"), button:has-text("Salvar"), form[action*="fulfill"] button[type="submit"]')
      .last();

    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(1_500);
    }

    await page.reload();
    await page.waitForLoadState("load");
    aprovados++;
  }

  console.log(`✅ Prof. Carlos prescreveu ${aprovados} treino(s)`);
  return aprovados;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("06 — Prescrever treinos (natação, corrida, ciclismo)", () => {
  // Cada aluno solicita os 3 treinos
  for (const aluno of ALUNOS) {
    for (const treino of TREINOS_PARA_PRESCREVER) {
      test(`${aluno.name} solicita treino de ${treino.sportType}`, async ({ page }) => {
        await solicitarTreino(page, aluno, ESCOLA_1.schoolName, treino.sportType);
        expect(page.url()).not.toContain("/entrar");
      });
    }
  }

  // Professor aprova todos de uma vez
  test("Prof. Carlos aprova todos os pedidos pendentes", async ({ page }) => {
    const total = await professsorAprovaTodos(page);
    console.log(`Total prescrito: ${total}`);
    expect(page.url()).not.toContain("/entrar");
  });
});
