/**
 * E2E — 68 (SAM-69): construtor de sessões v2.
 *
 * Ricardo monta NAT-PISC-001 na estrutura avançada (piscina de 25 m, séries
 * e 20 s entre as repetições da principal): o total é 1.400 m e a duração é
 * estimada; um título com outro total mostra a divergência. Maria abre a
 * sessão: imprime para a borda (media print) e, no celular, vê o bloco atual.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 420_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

function localPlusHours(hours: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() + hours * 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

test("NAT-PISC-001 com séries e descanso: 1.400 m, divergência do título, impressão e bloco atual", async ({ page, browser }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;

  await page.goto(`/professor/independente/atletas/${mariaId}/treinos/novo`);
  const titulo = `NAT-PISC-001 ${RUN} — 1.400 m`;
  await page.locator('input[name="title"]').fill(titulo);
  const natacao = await page.locator('select[name="sportType"] option').filter({ hasText: /^Natação$/ }).first().getAttribute("value");
  if (natacao) await page.locator('select[name="sportType"]').selectOption(natacao);
  await page.locator('input[name="scheduledAt"]').fill(localPlusHours(26));
  await page.getByTestId("advanced-builder-toggle").getByRole("checkbox").check();
  const editor = page.getByTestId("session-v2-editor");
  await editor.getByLabel("Piscina").selectOption("25m");

  const distancia = async (label: string, value: string) => {
    await editor.getByLabel(`Duração ${label}`).selectOption("DISTANCE");
    await editor.getByLabel(`Valor ${label}`).fill(value);
  };
  const bloco = async (index: number, tipo: string, nome: string) => {
    await editor.getByRole("button", { name: "+ Bloco" }).click();
    await editor.getByLabel(`Tipo do bloco ${index}`).selectOption(tipo);
    await editor.getByLabel(`Nome do bloco ${index}`).fill(nome);
  };
  /** Turns the block's default step into `reps × distance` with an optional rest. */
  const serie = async (index: number, reps: string, value: string, rest: string) => {
    await editor.getByRole("button", { name: `Adicionar série bloco ${index}`, exact: true }).click();
    await editor.getByRole("button", { name: `Remover bloco ${index}.1`, exact: true }).click();
    await editor.getByLabel(`Repetições bloco ${index}.1`, { exact: true }).fill(reps);
    await editor.getByLabel(`Descanso bloco ${index}.1`, { exact: true }).fill(rest);
    await distancia(`bloco ${index}.1.1`, value);
  };

  // Aquecimento: 200 + 100.
  await editor.getByLabel("Nome do bloco 1").fill("Aquecimento");
  await distancia("bloco 1.1", "200");
  await editor.getByRole("button", { name: "Adicionar passo bloco 1", exact: true }).click();
  await distancia("bloco 1.2", "100");
  await bloco(2, "TECHNIQUE", "Técnica");
  await serie(2, "4", "50", "");
  await bloco(3, "MAIN", "Principal");
  await serie(3, "6", "100", "20");
  await bloco(4, "CUSTOM", "Habilidade");
  await serie(4, "4", "50", "");
  await bloco(5, "COOLDOWN", "Soltura");
  await distancia("bloco 5.1", "100");

  const totais = editor.getByTestId("v2-totals");
  await expect(totais.getByTestId("v2-total-distance")).toContainText("1.400 m");
  await expect(totais.getByTestId("v2-total-duration")).toHaveAttribute("data-exact", "false");
  await expect(totais.getByTestId("v2-title-divergence")).toHaveCount(0);
  await page.locator('input[name="title"]').fill(`NAT-PISC-001 ${RUN} — 1.900 m`);
  await expect(totais.getByTestId("v2-title-divergence")).toContainText("O título declara 1.900 m, mas os blocos somam 1.400 m.");
  await page.locator('input[name="title"]').fill(titulo);

  await page.getByRole("button", { name: "Prescrever treino" }).click();
  await page.waitForURL(/\/treinos(\?|$)/, { timeout: 90_000 });
  const sessao = page.getByRole("link", { name: `Abrir treino ${titulo}` });
  await expect(sessao).toBeVisible({ timeout: 60_000 });
  const assignmentId = (await sessao.getAttribute("href"))!.split("/treinos/")[1]!;

  // Maria: celular com o bloco atual; impressão para a borda.
  const mariaContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const maria = await mariaContext.newPage();
  try {
    await loginComo(maria, MARIA);
    await maria.goto(`/app/treinos/${assignmentId}`);
    const roteiro = maria.getByTestId("session-v2-view");
    await expect(roteiro.getByTestId("session-v2-current")).toHaveText("Bloco atual 1 de 5", { timeout: 60_000 });
    await expect(roteiro.getByTestId("session-v2-block").nth(0)).toHaveAttribute("data-current", "true");
    await expect(roteiro.getByTestId("session-v2-block").nth(2)).toBeHidden();
    await roteiro.getByRole("button", { name: "Próximo bloco" }).click();
    await roteiro.getByRole("button", { name: "Próximo bloco" }).click();
    await expect(roteiro.getByTestId("session-v2-current")).toHaveText("Bloco atual 3 de 5");
    await expect(roteiro.getByTestId("session-v2-block").nth(2)).toContainText("6 × 100 m · descanso 0:20 entre repetições");
    await maria.emulateMedia({ media: "print" });
    await expect(roteiro.getByTestId("session-print-title")).toBeVisible();
    await expect(roteiro.getByTestId("session-v2-block").nth(0)).toBeVisible();
  } finally {
    await mariaContext.close();
    await page.request.post(`/api/workout-assignments/${assignmentId}/cancel`, { data: { reason: "limpeza do E2E 68" } });
  }
});
