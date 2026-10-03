/**
 * E2E — 52 (SAM-53): objetivo desejado × pactuado com histórico.
 *
 * Requer as migrações 0060_sport_events e 0061_athlete_goals aplicadas.
 *
 * Maria (atleta independente de Ricardo) registra "10 km abaixo de 50 min";
 * Ricardo pactua "concluir com controle" apontando o desejo; Maria vê os dois
 * lado a lado, tenta alterar o pactuado (403) e altera o próprio alvo (revisão
 * com antes/depois); Ricardo vê o par na ficha técnica.
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

type Goal = { id: string; version: number; description: string; revisions: Array<{ changes: Record<string, { from: unknown; to: unknown }> }> };
type Pair = { desired: Goal | null; agreed: Goal[] };

test("aluno deseja, professor pactua, aluno vê os dois e o histórico", async ({ playwright, baseURL, page }) => {
  const maria = await playwright.request.newContext({ baseURL });
  const ricardo = await playwright.request.newContext({ baseURL });
  await entrar(maria, MARIA);
  await entrar(ricardo, PROFESSOR_3);

  const desejo = await maria.post("/api/goals", { data: { type: "RESULT", description: `10 km abaixo de 50 min ${RUN}`, unit: "min", targetValue: 50 } });
  expect(desejo.status(), await desejo.text()).toBe(201);
  const wish = (await desejo.json()) as { id: string; athleteId: string; version: number };

  const pacto = await ricardo.post("/api/goals", {
    data: { athleteId: wish.athleteId, type: "PROCESS", description: `concluir com controle ${RUN}`, origin: "COACH_AGREED", desiredGoalId: wish.id },
  });
  expect(pacto.status(), await pacto.text()).toBe(201);
  const agreed = (await pacto.json()) as { id: string; version: number };

  // Aluno não altera o pactuado.
  expect((await maria.patch(`/api/goals/${agreed.id}`, { data: { description: "outra", expectedVersion: agreed.version } })).status()).toBe(403);

  // Aluno altera o próprio alvo: revisão com antes/depois.
  const alterado = await maria.patch(`/api/goals/${wish.id}`, { data: { targetValue: 48, expectedVersion: wish.version, reason: "treinei mais" } });
  expect(alterado.status(), await alterado.text()).toBe(200);

  const pares = (await (await maria.get("/api/goals")).json()) as Pair[];
  const par = pares.find((item) => item.desired?.id === wish.id)!;
  expect(par.agreed.map((goal) => goal.id)).toEqual([agreed.id]);
  expect(par.desired!.revisions[0]!.changes.targetValue).toEqual({ from: 50, to: 48 });

  // Ricardo vê o par na ficha técnica do hub independente.
  await login(page, PROFESSOR_3.email, PROFESSOR_3.password);
  await completeOnboarding(page, PROFESSOR_3.name);
  await page.goto(`/professor/independente/atletas/${wish.athleteId}/ficha-tecnica`);
  const pair = page.getByTestId("goal-pair").filter({ hasText: RUN }).first();
  await expect(pair.getByTestId("goal-desired")).toContainText(`10 km abaixo de 50 min ${RUN}`);
  await expect(pair.getByTestId("goal-desired")).toContainText("revisão pendente");
  await expect(pair.getByTestId("goal-agreed")).toContainText(`concluir com controle ${RUN}`);

  await Promise.all([maria.dispose(), ricardo.dispose()]);
});
