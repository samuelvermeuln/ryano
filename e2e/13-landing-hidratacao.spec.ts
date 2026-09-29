import { expect, test } from "@playwright/test";

// Regressão: com `prefers-reduced-motion: reduce` a landing hidratava com um
// valor diferente do HTML do servidor ("Hydration failed because the server
// rendered HTML didn't match the client") e, ao corrigir isso, o telefone da
// demo não pode ficar preso no estado inicial (opacity 0).
test.use({ reducedMotion: "reduce" });

test("landing hidrata sem divergência e mostra o telefone com movimento reduzido", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("tablist", { name: "Selecionar modalidade" })).toBeVisible();

  // Com movimento reduzido o carrossel não mostra os indicadores de progresso.
  await expect(page.getByRole("button", { name: /^Mostrar / })).toHaveCount(0);

  const composer = page.locator("div.border-t.mb-5").first();
  await composer.scrollIntoViewIfNeeded();
  await expect(composer).toHaveCSS("opacity", "1");
  await expect(
    composer.locator("xpath=ancestor::div[contains(@class,'w-[min(100%,378px)]')]"),
  ).toHaveCSS("opacity", "1");

  expect(problems.filter((text) => /hydrat/i.test(text))).toEqual([]);
});
