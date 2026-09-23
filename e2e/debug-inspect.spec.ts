import { test } from "@playwright/test";
import { login, ensureUser, completeOnboarding } from "./helpers";

test("DEBUG — ensureUser owner.alpha + onboarding", async ({ page }) => {
  const email = "owner.alpha@ryvano-e2e.test";
  const password = "Teste123!";
  const name = "Dono Escola Alpha";

  await ensureUser(page, name, email, password);
  console.log("URL após ensureUser:", page.url());
});

test("DEBUG — criar conta e completar onboarding", async ({ page }) => {
  const email = "debug.test2@ryvano-e2e.test";
  const password = "Teste123!";
  const name = "Debug Test User2";

  await page.goto("/entrar");
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);

  // Step 1: seleciona role
  const roleBtn = page.locator('button').filter({ hasText: "Sou Aluno" }).first();
  await roleBtn.waitFor({ state: "visible", timeout: 10000 });
  await roleBtn.click();
  await page.waitForTimeout(800);

  console.log("URL após role:", page.url());

  // Step 2: muda para signup
  const criarContaBtn = page.locator('button').filter({ hasText: "Criar conta" }).first();
  const hasCriarConta = await criarContaBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log("Criar conta visível:", hasCriarConta);
  if (hasCriarConta) {
    await criarContaBtn.click();
    await page.waitForTimeout(800);
  }

  // Step 3: preenche form de signup
  const allInputs = await page.$$eval("input", (els) => els.map(e => ({ name: e.name, type: e.type, placeholder: e.placeholder })));
  console.log("INPUTS SIGNUP:", JSON.stringify(allInputs));

  const nameInput = page.locator('input[name="name"]');
  const nameVisible = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);
  console.log("Name visível:", nameVisible);
  
  if (nameVisible) {
    await nameInput.fill(name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    
    const allButtons = await page.$$eval("button", (els) => els.map(e => ({ text: e.textContent?.trim(), type: e.type })));
    console.log("BUTTONS antes submit:", JSON.stringify(allButtons));
    
    // Clica no submit "Criar minha conta"
    const submitBtn = page.locator('button').filter({ hasText: /Criar minha conta/i }).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.locator('button[type="submit"]').last().click();
    }
    await page.waitForTimeout(3000);
    
    console.log("URL após submit signup:", page.url());
    await page.screenshot({ path: "/tmp/after-signup.png" });

    // Aguarda onboarding
    if (page.url().includes("/onboarding")) {
      // Step 1 do onboarding
      const oInputs1 = await page.$$eval("input", (els) => els.map(e => ({ name: e.name, type: e.type, placeholder: e.placeholder })));
      console.log("ONBOARDING INPUTS:", JSON.stringify(oInputs1));
      
      const oButtons = await page.$$eval("button", (els) => els.map(e => ({ text: e.textContent?.trim().slice(0, 40), type: e.type })));
      console.log("ONBOARDING BUTTONS:", JSON.stringify(oButtons));
    }
  }
});

test.skip("DEBUG — inspecionar DOM de /entrar", async ({ page }) => {
  await page.goto("/entrar?modo=cadastro");
  await page.waitForLoadState("load");
  await page.waitForTimeout(3000);

  await page.screenshot({ path: "/tmp/step1-before-role.png" });

  const buttons = await page.$$eval("button", (els) =>
    els.map((e) => ({ text: e.textContent?.trim().slice(0, 60) })),
  );
  console.log("BUTTONS_BEFORE:", JSON.stringify(buttons));

  const inputs = await page.$$eval("input", (els) =>
    els.map((e) => ({
      type: e.type,
      name: e.name,
      placeholder: e.placeholder,
      autocomplete: e.autocomplete,
      id: e.id,
    })),
  );
  console.log("INPUTS_BEFORE:", JSON.stringify(inputs));

  // Tenta clicar no primeiro botão que contém "Sou"
  const allButtons = await page.$$("button");
  for (const btn of allButtons) {
    const txt = await btn.textContent();
    if (txt?.includes("Sou Aluno")) {
      await btn.click();
      await page.waitForTimeout(1500);
      break;
    }
  }

  await page.screenshot({ path: "/tmp/step2-after-role.png" });

  const inputs2 = await page.$$eval("input", (els) =>
    els.map((e) => ({
      type: e.type,
      name: e.name,
      placeholder: e.placeholder,
      autocomplete: e.autocomplete,
      id: e.id,
    })),
  );
  console.log("INPUTS_AFTER_ROLE:", JSON.stringify(inputs2));

  const buttons2 = await page.$$eval("button", (els) =>
    els.map((e) => ({ text: e.textContent?.trim().slice(0, 60) })),
  );
  console.log("BUTTONS_AFTER_ROLE:", JSON.stringify(buttons2));

  // Clica em "Criar conta" para mudar para modo signup
  const allButtons2 = await page.$$("button");
  for (const btn of allButtons2) {
    const txt = await btn.textContent();
    if (txt?.includes("Criar conta")) {
      await btn.click();
      await page.waitForTimeout(1000);
      break;
    }
  }

  await page.screenshot({ path: "/tmp/step3-signup-mode.png" });

  const inputs3 = await page.$$eval("input", (els) =>
    els.map((e) => ({
      type: e.type,
      name: e.name,
      placeholder: e.placeholder,
      autocomplete: e.autocomplete,
    })),
  );
  console.log("INPUTS_SIGNUP_MODE:", JSON.stringify(inputs3));
});
