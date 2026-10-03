/**
 * E2E — 55 (SAM-56): lembretes e prazos.
 *
 * Requer as migrações 0062, 0063 e 0064_follow_up_reminders aplicadas.
 *
 * Maria (atleta de Ricardo) registra um evento a 8 dias. O job, rodado com o
 * relógio no dia do D−7 (rota E2E), envia o aviso D−7 uma única vez (rodar de
 * novo não duplica). Adiar o evento cancela os lembretes antigos e cria os da
 * nova data. A participação mostra a expectativa da primeira análise.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 240_000 });

async function entrar(request: APIRequestContext, user: { email: string; password: string }) {
  const response = await request.post("/api/e2e/login", { data: { email: user.email, password: user.password } });
  expect(response.ok(), `login ${user.email}: ${response.status()}`).toBe(true);
}

function localDatePlus(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + days * 86_400_000));
}

type Reminder = { kind: string; audience: string; status: string; dedupeKey: string };
type JobResult = { summary: { sent: number }; reminders: Reminder[] };

test("D−7 único, reprocessar não duplica, adiar cancela e recria", async ({ playwright, baseURL }) => {
  const maria = await playwright.request.newContext({ baseURL });
  const ricardo = await playwright.request.newContext({ baseURL });
  const job = await playwright.request.newContext({ baseURL });
  await entrar(maria, MARIA);
  await entrar(ricardo, PROFESSOR_3);

  const data = localDatePlus(8);
  const evento = { name: `Prova lembretes ${RUN}`, type: "COMPETITION", sportType: "run", startLocalDate: data, timeZone: "America/Sao_Paulo" };
  const criada = await maria.post("/api/events", { data: { confirmDistinct: true, event: evento } });
  expect(criada.status(), await criada.text()).toBe(201);
  const { id: participationId, eventId } = (await criada.json()) as { id: string; eventId: string };

  // Expectativa de atendimento ao aluno.
  const lista = (await (await maria.get("/api/events")).json()) as { participations: Array<{ id: string; preparation: { statusText: string; firstAnalysisDueLocalDate: string | null } | null }> };
  const minha = lista.participations.find((item) => item.id === participationId)!;
  expect(minha.preparation?.firstAnalysisDueLocalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(minha.preparation?.statusText).toContain("primeira análise prevista até");

  // Relógio no D−7 às 09:05 (local): o aviso sai uma vez.
  const d7 = `${localDatePlus(1)}T12:05:00.000Z`;
  const primeira = (await (await job.post("/api/e2e/follow-up-job", { data: { now: d7, participationId } })).json()) as JobResult;
  expect(primeira.summary.sent).toBe(2); // atleta + responsável
  const segunda = (await (await job.post("/api/e2e/follow-up-job", { data: { now: d7, participationId } })).json()) as JobResult;
  expect(segunda.summary.sent).toBe(0);
  const { items } = (await (await maria.get("/api/notifications?limit=100")).json()) as { items: Array<{ title: string }> };
  expect(items.filter((item) => item.title === `Faltam 7 dias para ${evento.name}`)).toHaveLength(1);

  // Adiar o evento: os pendentes antigos são cancelados e os novos criados.
  const versao = ((await (await maria.get(`/api/events/${eventId}`)).json()) as { version: number }).version;
  const novaData = localDatePlus(22);
  const adiado = await maria.patch(`/api/events/${eventId}`, { data: { expectedVersion: versao, event: { ...evento, startLocalDate: novaData, status: "POSTPONED" } } });
  expect(adiado.status(), await adiado.text()).toBe(200);
  const depois = (await (await job.post("/api/e2e/follow-up-job", { data: { now: new Date().toISOString(), participationId } })).json()) as JobResult;
  const antigos = depois.reminders.filter((row) => row.dedupeKey.includes(`:${data}:`) && row.kind === "EVENT_APPROACHING");
  expect(antigos.find((row) => row.dedupeKey.endsWith(`D1:ATHLETE`))?.status).toBe("CANCELLED");
  expect(antigos.find((row) => row.dedupeKey.endsWith(`D7:ATHLETE`))?.status).toBe("SENT");
  expect(depois.reminders.some((row) => row.dedupeKey.includes(`:${novaData}:D14:ATHLETE`) && row.status === "PENDING")).toBe(true);

  await Promise.all([maria.dispose(), ricardo.dispose(), job.dispose()]);
});
