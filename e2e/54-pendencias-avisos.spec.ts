/**
 * E2E — 54 (SAM-55): pendências e avisos com estado.
 *
 * Requer as migrações 0062_event_preparations e 0063_follow_up_tasks aplicadas.
 *
 * Maria (atleta independente de Ricardo) registra um evento e reenvia o mesmo
 * cadastro → a participação é a mesma e Ricardo recebe UM aviso e UMA
 * pendência. Na tela de pendências Ricardo marca como visto, assume e resolve;
 * ler o aviso não resolve nada.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 240_000 });

async function entrar(request: APIRequestContext, user: { email: string; password: string }) {
  const response = await request.post("/api/e2e/login", { data: { email: user.email, password: user.password } });
  expect(response.ok(), `login ${user.email}: ${response.status()}`).toBe(true);
}

type Notice = { title: string; href: string | null; readAt: string | null; createdAt: string };
type Task = { id: string; sourceId: string; status: string };

test("um aviso e uma pendência; visto ≠ resolvido; assumir e resolver", async ({ playwright, baseURL, page }) => {
  const maria = await playwright.request.newContext({ baseURL });
  const ricardo = await playwright.request.newContext({ baseURL });
  await entrar(maria, MARIA);
  await entrar(ricardo, PROFESSOR_3);
  const started = new Date(Date.now() - 5_000);

  // 1. Maria registra; o reenvio do mesmo cadastro não cria outra participação.
  const primeiro = await maria.post("/api/events", {
    data: {
      confirmDistinct: true,
      event: { name: `Prova pendências ${RUN}`, type: "COMPETITION", sportType: "run", startLocalDate: "2027-02-14", timeZone: "America/Sao_Paulo" },
      option: { label: "10 km", distanceValue: 10, distanceUnit: "km" },
    },
  });
  expect(primeiro.status(), await primeiro.text()).toBe(201);
  const criada = (await primeiro.json()) as { id: string; eventId: string; optionId: string; preparation: { id: string; status: string } };
  expect(criada.preparation.status).toBe("AWAITING_ASSESSMENT");
  const reenvio = await maria.post("/api/events", { data: { eventId: criada.eventId, optionId: criada.optionId } });
  expect(reenvio.status(), await reenvio.text()).toBe(201);
  expect(((await reenvio.json()) as { id: string }).id).toBe(criada.id);

  // 2. Ricardo: um aviso, sem conteúdo sensível, e uma pendência.
  const { items } = (await (await ricardo.get("/api/notifications?limit=100")).json()) as { items: Notice[] };
  const avisos = items.filter((item) => item.title === `Novo evento de ${MARIA.name}` && new Date(item.createdAt) >= started);
  expect(avisos).toHaveLength(1);
  // SAM-67 — the notice opens the follow-up screen of that event (§6 step 6).
  expect(avisos[0]!.href).toMatch(new RegExp(`^/professor/independente/atletas/[^/]+/eventos/${criada.id}$`));
  const { tasks } = (await (await ricardo.get("/api/follow-ups")).json()) as { tasks: Task[] };
  const minhas = tasks.filter((task) => task.sourceId === criada.preparation.id);
  expect(minhas).toHaveLength(1);
  const taskId = minhas[0]!.id;

  // 3. Ler o aviso não resolve a pendência.
  await ricardo.post("/api/notifications/read-all", { data: {} });
  const aindaAberta = (await (await ricardo.get("/api/follow-ups")).json()) as { tasks: Task[] };
  expect(aindaAberta.tasks.find((task) => task.id === taskId)?.status).toBe("NEW");

  // 4. Na tela: visto → em tratamento → resolvido.
  await login(page, PROFESSOR_3.email, PROFESSOR_3.password);
  await completeOnboarding(page, PROFESSOR_3.name);
  await page.goto("/professor/acompanhar/pendencias");
  const item = page.locator(`[data-task-id="${taskId}"]`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item.getByTestId("follow-up-status")).toHaveText("Novo");
  await item.getByRole("button", { name: "Marcar como visto" }).click();
  await expect(item.getByTestId("follow-up-status")).toHaveText("Visto", { timeout: 30_000 });
  await item.getByRole("button", { name: "Assumir" }).click();
  await expect(item.getByTestId("follow-up-status")).toHaveText("Em tratamento", { timeout: 30_000 });
  await item.getByRole("button", { name: "Resolver" }).click();
  await expect(page.locator(`[data-task-id="${taskId}"]`)).toHaveCount(0, { timeout: 30_000 });

  // 5. Histórico completo na lista que inclui as resolvidas.
  await page.goto("/professor/acompanhar/pendencias?status=all");
  const resolvida = page.locator(`[data-task-id="${taskId}"]`);
  await expect(resolvida.getByTestId("follow-up-status")).toHaveText("Resolvido");
  await resolvida.getByRole("button", { name: /Histórico/ }).click();
  await expect(resolvida.getByTestId("follow-up-history").locator("li")).toHaveCount(4);

  await Promise.all([maria.dispose(), ricardo.dispose()]);
});
