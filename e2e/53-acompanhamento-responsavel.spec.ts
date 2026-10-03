/**
 * E2E — 53 (SAM-54): acompanhamento da participação com professor responsável.
 *
 * Requer a migração 0062_event_preparations aplicada.
 *
 * Lucas pede acompanhamento a Ricardo (independente) e Ricardo aceita; Lucas
 * cadastra um evento → a preparação nasce AWAITING_ASSESSMENT com Ricardo, que
 * a vê na lista e assume com data da primeira revisão. O atleta sem vínculo
 * cadastra um evento → "sem professor responsável" e Ricardo não o vê (404).
 * Ricardo encerra o acompanhamento de Lucas → perde o acesso (404) e a
 * preparação volta a "sem professor responsável" para Lucas.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ALUNO_SEM_ESCOLA, ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const LUCAS = ALUNOS[4]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 300_000 });

async function entrar(request: APIRequestContext, user: { email: string; password: string }) {
  const response = await request.post("/api/e2e/login", { data: { email: user.email, password: user.password } });
  expect(response.ok(), `login ${user.email}: ${response.status()}`).toBe(true);
}

async function encerrarAcompanhamento(page: Page, athleteName: string) {
  await page.goto("/professor/independente");
  await page.waitForLoadState("load");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: athleteName }).first();
  if (!(await linha.isVisible({ timeout: 5_000 }).catch(() => false))) return false;
  await linha.getByRole("button", { name: "Encerrar acompanhamento" }).click();
  await linha.getByRole("button", { name: "Confirmar encerramento" }).click();
  await expect(page.getByTestId("independent-athlete").filter({ hasText: athleteName })).toHaveCount(0, { timeout: 30_000 });
  return true;
}

type Preparation = { id: string; status: string; statusText: string; version: number; role: string; transitions: Array<{ toStatus: string; reason: string | null }> };

test("responsável assume; sem vínculo ninguém vê; vínculo encerrado revoga", async ({ playwright, baseURL, page }) => {
  // 0. Converge: Ricardo não acompanha Lucas.
  await login(page, PROFESSOR_3.email, PROFESSOR_3.password);
  await completeOnboarding(page, PROFESSOR_3.name);
  await encerrarAcompanhamento(page, LUCAS.name);

  const lucas = await playwright.request.newContext({ baseURL });
  const ricardo = await playwright.request.newContext({ baseURL });
  const solo = await playwright.request.newContext({ baseURL });
  await entrar(lucas, LUCAS);
  await entrar(ricardo, PROFESSOR_3);
  await entrar(solo, ALUNO_SEM_ESCOLA);

  // 1. Lucas pede, Ricardo aceita.
  const busca = (await (await lucas.get(`/api/coaches/search?q=${encodeURIComponent(PROFESSOR_3.email)}`)).json()) as { items: Array<{ id: string }> };
  const coachId = busca.items[0]!.id;
  const pedido = await lucas.post(`/api/coaches/${coachId}/athlete-requests`, { data: {} });
  expect(pedido.status(), await pedido.text()).toBe(201);
  const { id: assignmentId } = (await pedido.json()) as { id: string };
  const aceite = await ricardo.post(`/api/coaches/me/athlete-requests/${assignmentId}/accept`, { data: {} });
  expect(aceite.ok(), await aceite.text()).toBe(true);

  // 2. Lucas cadastra o evento: aguardando avaliação de Ricardo.
  const criada = await lucas.post("/api/events", {
    data: { confirmDistinct: true, event: { name: `Meia E2E ${RUN}`, type: "COMPETITION", sportType: "run", startLocalDate: "2027-04-11", timeZone: "America/Sao_Paulo" }, participation: { goalText: "completar" } },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  const { preparation } = (await criada.json()) as { preparation: { id: string; status: string } };
  expect(preparation.status).toBe("AWAITING_ASSESSMENT");
  const lista = (await (await lucas.get("/api/events")).json()) as { participations: Array<{ preparation: { id: string; statusText: string } | null }> };
  expect(lista.participations.find((item) => item.preparation?.id === preparation.id)?.preparation?.statusText)
    .toBe(`Evento registrado — aguardando avaliação do professor ${PROFESSOR_3.displayName}`);

  // 3. Ricardo vê e assume com a primeira revisão.
  const doRicardo = (await (await ricardo.get("/api/preparations")).json()) as Preparation[];
  const minha = doRicardo.find((item) => item.id === preparation.id)!;
  expect(minha.role).toBe("responsible");
  const assumida = await ricardo.post(`/api/preparations/${preparation.id}`, { data: { action: "assume", expectedVersion: minha.version, firstReviewLocalDate: "2026-11-01" } });
  expect(assumida.status(), await assumida.text()).toBe(200);
  const depois = (await assumida.json()) as Preparation & { firstReviewLocalDate: string };
  expect(depois.status).toBe("PLANNING");
  expect(depois.firstReviewLocalDate).toBe("2026-11-01");
  expect(depois.transitions.map((transition) => transition.toStatus)).toEqual(["AWAITING_ASSESSMENT", "PLANNING"]);

  // 4. Atleta sem vínculo: sem responsável; Ricardo não vê.
  const soloCriada = await solo.post("/api/events", {
    data: { confirmDistinct: true, event: { name: `Desafio solo ${RUN}`, type: "PERSONAL_CHALLENGE", sportType: "run", startLocalDate: "2027-05-02", timeZone: "America/Sao_Paulo" } },
  });
  expect(soloCriada.status(), await soloCriada.text()).toBe(201);
  const soloPrep = ((await soloCriada.json()) as { preparation: { id: string; status: string } }).preparation;
  expect(soloPrep.status).toBe("UNASSIGNED");
  expect((await ricardo.get(`/api/preparations/${soloPrep.id}`)).status()).toBe(404);
  expect(((await (await ricardo.get("/api/preparations")).json()) as Preparation[]).map((item) => item.id)).not.toContain(soloPrep.id);

  // 5. Ricardo encerra o acompanhamento de Lucas: perde o acesso.
  expect(await encerrarAcompanhamento(page, LUCAS.name)).toBe(true);
  expect((await ricardo.get(`/api/preparations/${preparation.id}`)).status()).toBe(404);
  const doLucas = (await (await lucas.get(`/api/preparations/${preparation.id}`)).json()) as Preparation;
  expect(doLucas.status).toBe("UNASSIGNED");
  expect(doLucas.statusText).toBe("Evento registrado — sem professor responsável");
  expect(doLucas.transitions.at(-1)?.reason).toBe("vínculo com o professor encerrado");

  await Promise.all([lucas.dispose(), ricardo.dispose(), solo.dispose()]);
});
