/**
 * E2E — 66 (SAM-67): telas do professor.
 *
 * Maria registra um evento; Ricardo vê o contador "Novos eventos" no
 * Acompanhamento, abre a lista e o acompanhamento (data, prazo, objetivo,
 * contexto), assume com a primeira revisão e, pelo calendário de Maria,
 * atribui um modelo do catálogo sem trocar de tela.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 360_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

const localDate = (offsetDays: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offsetDays * 86_400_000));

test("contador de novo evento → acompanhamento → assumir → atribuir do catálogo pelo calendário", async ({ page, browser }) => {
  // 1. Maria registra o evento.
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);
  const nome = `Trilha E2E ${RUN}`;
  const criada = await maria.request.post("/api/events", {
    data: { confirmDistinct: true, event: { name: nome, type: "PERSONAL_CHALLENGE", sportType: "hiking", startLocalDate: localDate(20), timeZone: "America/Sao_Paulo" }, participation: { goalText: "chegar inteira" } },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  await mariaContext.close();

  // 2. Ricardo: contador com definição → lista → acompanhamento.
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/acompanhar?dias=7");
  const contador = page.getByTestId("counter-novos-eventos");
  await expect(contador).toContainText("Eventos que seus alunos cadastraram no período", { timeout: 30_000 });
  expect(Number(await contador.getAttribute("data-count"))).toBeGreaterThanOrEqual(1);
  await contador.click();
  const item = page.getByTestId("overview-item").filter({ hasText: nome });
  await expect(item).toBeVisible({ timeout: 30_000 });
  await item.click();
  await expect(page.getByTestId("coach-event-countdown")).toContainText("20 dia(s)", { timeout: 60_000 });
  await expect(page.getByText("chegar inteira").first()).toBeVisible();
  await expect(page.getByTestId("coach-event-others")).toBeVisible();
  await expect(page.getByTestId("coach-event-plan")).toBeVisible();
  const assumir = page.getByTestId("assume-preparation");
  await assumir.getByLabel("Primeira revisão").fill(localDate(5));
  await assumir.getByRole("button", { name: "Assumir acompanhamento" }).click();
  // The remote database is slow: assuming and re-rendering may take ~30 s.
  await expect(page.getByTestId("coach-event-preparation")).toHaveAttribute("data-status", "PLANNING", { timeout: 90_000 });
  const mariaId = page.url().split("/atletas/")[1]!.split("/")[0]!;

  // 3. Um modelo no catálogo de Ricardo.
  const titulo = `Caminhada E2E ${RUN}`;
  const modelo = await page.request.post("/api/workout-catalog", {
    data: { scope: { kind: "coach" }, meta: { title: titulo, sportType: "hiking", contentKind: "SESSION", status: "ACTIVE" }, content: { blocks: [{ blockType: "STEADY", durationS: 1800 }] } },
  });
  expect(modelo.ok(), await modelo.text()).toBe(true);

  // 4. Calendário de Maria: atribuir do catálogo sem trocar de tela.
  await page.goto(`/professor/independente/calendario?atleta=${mariaId}`);
  const sobreposicao = page.getByTestId("athlete-calendar-overlay");
  await expect(sobreposicao).toContainText("Calendário de", { timeout: 30_000 });
  await sobreposicao.getByTestId("assign-from-catalog").click();
  const dialogo = page.getByTestId("assign-from-catalog-dialog");
  await dialogo.getByTestId("catalog-option").filter({ hasText: titulo }).click();
  await dialogo.getByLabel("Data da sessão").fill(localDate(1));
  await dialogo.getByRole("button", { name: "Ver prévia" }).click();
  await expect(dialogo.getByTestId("assign-preview")).toContainText("Pronto para publicar", { timeout: 30_000 });
  await dialogo.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Treino atribuído" })).toBeVisible({ timeout: 30_000 });
  expect(page.url()).toContain("/professor/independente/calendario");

  // A sessão existe para Maria (o calendário dela mostra no dia escolhido).
  await page.goto(`/professor/independente/atletas/${mariaId}/treinos`);
  const sessao = page.getByRole("link", { name: `Abrir treino ${titulo}` });
  await expect(sessao).toBeVisible({ timeout: 30_000 });
  const href = (await sessao.getAttribute("href"))!;
  await page.request.post(`/api/workout-assignments/${href.split("/treinos/")[1]}/cancel`, { data: { reason: "limpeza do E2E 66" } });
});
