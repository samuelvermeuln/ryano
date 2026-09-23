import { chromium } from "@playwright/test";

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/entrar?modo=cadastro");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "/tmp/step1-before-role.png" });
  
  const buttons = await page.$$eval("button", (els) => els.map(e => ({ text: e.textContent?.trim().slice(0,40) })));
  console.log("BUTTONS:", JSON.stringify(buttons));
  
  const inputs = await page.$$eval("input", (els) => els.map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder, autocomplete: e.autocomplete })));
  console.log("INPUTS_BEFORE:", JSON.stringify(inputs));
  
  // Clica no primeiro botão de role
  const roleBtn = await page.$('button');
  if (roleBtn) {
    const txt = await roleBtn.textContent();
    console.log("First button text:", txt?.trim());
    await roleBtn.click();
    await page.waitForTimeout(1500);
  }
  
  await page.screenshot({ path: "/tmp/step2-after-role.png" });
  
  const inputs2 = await page.$$eval("input", (els) => els.map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder, autocomplete: e.autocomplete })));
  console.log("INPUTS_AFTER:", JSON.stringify(inputs2));
  
  const buttons2 = await page.$$eval("button", (els) => els.map(e => ({ text: e.textContent?.trim().slice(0,40) })));
  console.log("BUTTONS_AFTER:", JSON.stringify(buttons2));
  
  await browser.close();
})();
