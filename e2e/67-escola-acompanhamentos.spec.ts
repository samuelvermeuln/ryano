/**
 * E2E — 67 (SAM-68): escola/assessoria — acompanhamentos.
 *
 * Requer a migração 0075_collaborator_discipline aplicada.
 *
 * A escola Alpha publica um evento para a escola com João; Fernanda e Pedro
 * se inscrevem com objetivos próprios. Pedro está sem professor na escola
 * (preparado pela rota de apoio do E2E), então o acompanhamento dele cai na
 * fila. O dono vê o evento com os três participantes e objetivos distintos,
 * atribui Carlos ao acompanhamento sem responsável e coloca Ana como
 * colaboradora de natação — Carlos continua o responsável pelo planejamento.
 */
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { ALUNOS, ESCOLA_1 } from "./fixtures";
import { loginAsSchoolOwner } from "./helpers";

const [JOAO, , PEDRO, FERNANDA] = ALUNOS;
const RUN = Date.now().toString(36);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe.configure({ timeout: 420_000 });

const inDays = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + days * 86_400_000));

async function asAthlete(user: { email: string; password: string }) {
  const context = await playwrightRequest.newContext({ baseURL: BASE_URL });
  const response = await context.post("/api/e2e/login", { data: { email: user.email, password: user.password } });
  expect(response.ok(), `login ${user.email}`).toBe(true);
  return context;
}

test("dono vê o evento com participantes, atribui Carlos à fila e define Ana como colaboradora de natação", async ({ page }) => {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);

  // Pedro sem professor na escola: o acompanhamento dele vai para a fila.
  const semProfessor = await page.request.post("/api/e2e/end-coach-links", { data: { athleteEmail: PEDRO!.email, schoolId } });
  expect(semProfessor.ok(), await semProfessor.text()).toBe(true);

  // A escola publica o evento para a escola, com João.
  await page.goto(`/escola/${schoolId}/acompanhamentos`);
  const joaoId = await page.getByTestId("collaborator-form").getByLabel("Aluno").locator("option").filter({ hasText: JOAO!.name }).first().getAttribute("value", { timeout: 60_000 });
  expect(joaoId).toBeTruthy();
  const nome = `Travessia da escola ${RUN}`;
  const criada = await page.request.post("/api/events", {
    data: {
      athleteId: joaoId, confirmDistinct: true,
      event: { name: nome, type: "ORGANIZED_CROSSING", sportType: "open-water", startLocalDate: inDays(30), timeZone: "America/Sao_Paulo", visibility: "SCHOOL" },
      participation: { goalText: "concluir com controle" },
    },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  const { eventId } = (await criada.json()) as { eventId: string };

  for (const [aluno, objetivo] of [[FERNANDA!, "baixar 3 minutos"], [PEDRO!, "primeira travessia"]] as const) {
    const contexto = await asAthlete(aluno);
    const inscricao = await contexto.post("/api/events", { data: { eventId, participation: { goalText: objetivo } } });
    expect(inscricao.status(), await inscricao.text()).toBe(201);
    await contexto.dispose();
  }

  // Painel: o evento com três participantes e objetivos distintos.
  await page.goto(`/escola/${schoolId}/acompanhamentos`);
  const evento = page.getByTestId("school-event").filter({ hasText: nome });
  await expect(evento.getByTestId("school-participant")).toHaveCount(3, { timeout: 60_000 });
  await expect(evento).toContainText("concluir com controle");
  await expect(evento).toContainText("baixar 3 minutos");
  await expect(evento).toContainText("primeira travessia");

  // Fila: Pedro sem responsável → atribuir Carlos.
  const pedro = evento.getByTestId("school-participant").filter({ hasText: PEDRO!.name });
  await expect(pedro.getByTestId("school-participant-state")).toHaveAttribute("data-status", "UNASSIGNED");
  const carlos = await pedro.locator("select option").filter({ hasText: "Carlos" }).first().getAttribute("value");
  await pedro.getByLabel(`Professor para ${PEDRO!.name}`).selectOption(carlos!);
  await pedro.getByRole("button", { name: "Atribuir professor" }).click();
  await expect(pedro.getByTestId("school-participant-state")).toHaveAttribute("data-status", "AWAITING_ASSESSMENT", { timeout: 90_000 });
  await expect(pedro.getByTestId("school-participant-state")).toContainText("Carlos");

  // Ana como colaboradora de natação; Carlos continua responsável pelo planejamento.
  const form = page.getByTestId("collaborator-form");
  const pedroOption = await form.getByLabel("Aluno").locator("option").filter({ hasText: PEDRO!.name }).first().getAttribute("value");
  await form.getByLabel("Aluno").selectOption(pedroOption!);
  const ana = await form.getByLabel("Professor colaborador").locator("option").filter({ hasText: "Ana" }).first().getAttribute("value");
  await form.getByLabel("Professor colaborador").selectOption(ana!);
  await form.getByLabel("Disciplina").fill("natação");
  await form.getByRole("button", { name: "Adicionar colaborador" }).click();
  await expect(form.getByRole("status")).toContainText("Colaborador adicionado", { timeout: 60_000 });
  await page.reload();
  const equipe = page.getByTestId("school-event").filter({ hasText: nome }).getByTestId("school-participant").filter({ hasText: PEDRO!.name }).getByTestId("school-participant-team");
  await expect(equipe).toContainText("Carlos Mendes (responsável pelo planejamento)", { timeout: 60_000 });
  await expect(equipe).toContainText("Ana Lima (colaborador — natação)");
});
