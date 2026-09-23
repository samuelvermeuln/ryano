import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Role card selector
// ---------------------------------------------------------------------------

/**
 * A tela /entrar mostra 3 cards de role antes de exibir o form.
 * Seleciona o card "Sou Aluno" por padrão (funciona para todos os usuários,
 * pois todos compartilham a mesma conta Ryvano).
 */
async function selectRoleCard(page: Page) {
  // Aguarda qualquer card de role estar visível (contém emoji + texto)
  const firstRoleBtn = page.locator('button').filter({ hasText: "Sou Aluno" }).first();
  const hasRoleCards = await firstRoleBtn.isVisible({ timeout: 8_000 }).catch(() => false);
  if (hasRoleCards) {
    await firstRoleBtn.click();
    await page.waitForTimeout(600);
  }
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Cria conta nova.
 * Fluxo: seleciona role → clica "Criar conta" para entrar em signup mode
 *        → preenche nome/email/senha → submete
 */
export async function signup(page: Page, name: string, email: string, password: string) {
  await page.goto("/entrar");
  await page.waitForLoadState("load");
  await page.waitForTimeout(1_000);

  // Seleciona role para revelar o form
  await selectRoleCard(page);

  // Muda para modo de cadastro clicando em "Criar conta"
  const criarContaBtn = page.locator('button').filter({ hasText: "Criar conta" }).first();
  if (await criarContaBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await criarContaBtn.click();
    await page.waitForTimeout(600);
  }

  // Preenche formulário de cadastro (name/email/password com name attribute)
  const nameInput = page.locator('input[name="name"]');
  await nameInput.waitFor({ state: "visible", timeout: 15_000 });
  await nameInput.fill(name);

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);

  // Submit — botão "Criar minha conta" (não "Entrar" nem "←Voltar")
  const submitSignup =
    page.locator('button').filter({ hasText: /Criar minha conta/i }).first();
  if (await submitSignup.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await submitSignup.click();
  } else {
    await page.locator('button[type="submit"]').last().click();
  }

  // Aguarda redirect pós-cadastro
  await page.waitForURL(/\/(onboarding|app\/dashboard|professor|escola)/, { timeout: 20_000 });
}

/**
 * Login via endpoint E2E (/api/e2e/login).
 *
 * Por que não usar signIn("credentials") do next-auth/react:
 *   O next-auth v4 com strategy:"database" + CredentialsProvider cria um JWT
 *   no cookie em vez de um token opaco de banco; o getServerSession lê o token
 *   opaco do banco e não encontra o JWT → redireciona de volta para /entrar.
 *   O endpoint E2E chama createDatabaseSession diretamente, criando um token
 *   opaco correto no banco e setando o cookie next-auth.session-token.
 */
export async function login(page: Page, email: string, password: string) {
  // POST direto para o endpoint E2E — o server seta o cookie de sessão
  const response = await page.request.post("/api/e2e/login", {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`E2E login failed for ${email}: ${response.status()} ${await response.text()}`);
  }

  // Navega para o dashboard depois de logar
  await page.goto("/app/dashboard");
  await page.waitForLoadState("load");

  // Se acabou no onboarding, retorna para o caller completar
  if (page.url().includes("/entrar")) {
    throw new Error(`Login succeeded but was redirected back to /entrar for ${email}`);
  }
}

/**
 * Completa o onboarding mínimo: preenche CPF, telefone, altura, peso,
 * CEP (ViaCEP autocompleta endereço) e número. Clica em "Salvar e continuar".
 *
 * Idempotente: se o step-2 (perfil) já estiver completo (input CPF não visível),
 * pula o preenchimento. Só age se o formulário de perfil estiver visível.
 *
 * isOnboardingComplete requer: cpfEncrypted, phoneE164, heightCm, weightKg,
 * postalCode, street, number, district, city, state, country.
 */
export async function completeOnboarding(page: Page, name: string) {
  if (!page.url().includes("/onboarding")) return;

  await page.waitForLoadState("load");

  // Verifica se o input CPF está visível (step-2 ainda não completo)
  const cpfInput = page.locator('input[name="cpf"]');
  const cpfVisible = await cpfInput.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!cpfVisible) {
    // step-2 já concluído → nada a fazer
    return;
  }

  // Gera CPF e telefone únicos por nome (hash determinístico)
  const nameHash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const cpfBase = String(nameHash % 100000000).padStart(8, "0");
  // CPF formato: 000.000.000-00 (11 dígitos)
  const cpfFormatted = `${cpfBase.slice(0,3)}.${cpfBase.slice(3,6)}.${cpfBase.slice(6,8)}1-01`;
  const phoneNum = String(90000 + (nameHash % 9999)).padStart(5, "0");
  const phone = `(11) 9${phoneNum.slice(0,4)}-0001`;

  // Preenche CPF (11 dígitos formatados)
  await cpfInput.fill(cpfFormatted);
  await cpfInput.blur();
  await page.waitForTimeout(800);

  // Telefone
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('input[name="phone"]').blur();
  await page.waitForTimeout(500);

  // Altura e peso
  await page.locator('input[name="heightCm"]').fill("175");
  await page.locator('input[name="weightKg"]').fill("70");

  // CEP — blur dispara ViaCEP
  const postalCodeInput = page.locator('input[name="postalCode"]');
  await postalCodeInput.fill("01310-100");
  await postalCodeInput.blur();
  await page.waitForTimeout(3_500); // aguarda ViaCEP

  // Número
  await page.locator('input[name="number"]').fill("100");

  // Submit: "Salvar e continuar"
  await page.locator('button').filter({ hasText: /Salvar e continuar/i }).first().click();
  await page.waitForTimeout(3_000);

  // Aguarda sair do onboarding (redireciona para next= ou /app/dashboard)
  await page.waitForURL(/\/(app\/dashboard|professor|escola)/, { timeout: 20_000 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Idempotency helpers
// ---------------------------------------------------------------------------

/** Retorna true se o usuário já existe (tenta login via endpoint E2E) */
export async function userExists(page: Page, email: string, password: string): Promise<boolean> {
  const response = await page.request.post("/api/e2e/login", {
    data: { email, password },
  });
  return response.ok();
}

/**
 * Garante que o usuário existe e está autenticado.
 * Tenta login via endpoint E2E; se não existir, cadastra via signup form.
 * Após login/signup: se acabar em /onboarding, completa o onboarding mínimo.
 */
export async function ensureUser(page: Page, name: string, email: string, password: string) {
  const exists = await userExists(page, email, password);
  if (exists) {
    // Login já foi feito por userExists (cookie setado) → ir para dashboard
    await page.goto("/app/dashboard");
    await page.waitForLoadState("load");
  } else {
    await signup(page, name, email, password);
  }
  // Completa onboarding se necessário (novo usuário aterrissa em /onboarding)
  if (page.url().includes("/onboarding")) {
    await completeOnboarding(page, name);
  }
}

// ---------------------------------------------------------------------------
// School helpers
// ---------------------------------------------------------------------------

export async function schoolExists(page: Page): Promise<boolean> {
  await page.goto("/escola");
  await page.waitForLoadState("load");
  // Se redirectar para /escola/criar → não tem escola ainda
  return !page.url().includes("/escola/criar") && !page.url().includes("/escola/buscar");
}

// ---------------------------------------------------------------------------
// Coach profile helpers
// ---------------------------------------------------------------------------

export async function coachProfileExists(page: Page): Promise<boolean> {
  await page.goto("/professor");
  await page.waitForLoadState("load");
  const createForm = page.locator('input[name="displayName"]');
  return !(await createForm.isVisible({ timeout: 3_000 }).catch(() => false));
}

export async function ensureCoachProfile(
  page: Page,
  displayName: string,
  bio: string,
) {
  await page.goto("/professor");
  await page.waitForLoadState("load");

  const createForm = page.locator('input[name="displayName"]');
  if (await createForm.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await createForm.fill(displayName);
    const bioArea = page.locator('textarea[name="bio"]');
    if (await bioArea.isVisible()) await bioArea.fill(bio);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2_000);
    await page.reload();
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Retorna data futura no formato YYYY-MM-DD (offset em dias a partir de hoje UTC) */
export function futureDate(offsetDays = 3): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
