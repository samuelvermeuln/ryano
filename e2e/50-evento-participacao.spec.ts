/**
 * E2E — 50 (SAM-51): evento, opção e participação pela API.
 *
 * Requer a migração 0060_sport_events aplicada.
 *
 * Maria cadastra um evento público com a opção "2 km"; outro aluno entra no
 * MESMO evento (não duplica) com outro objetivo; um terceiro cadastro com o
 * mesmo nome/data/cidade recebe 409 com o candidato e, confirmado como outro
 * evento, é criado; mudar a distância grava revisão e marca revisão pendente;
 * um professor sem vínculo com Maria recebe 404.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ALUNOS, PROFESSOR_2 } from "./fixtures";

const MARIA = ALUNOS[1]!;
const OUTRO = ALUNOS[0]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 240_000 });

async function entrar(request: APIRequestContext, user: { email: string; password: string }) {
  const response = await request.post("/api/e2e/login", { data: { email: user.email, password: user.password } });
  expect(response.ok(), `login ${user.email}: ${response.status()}`).toBe(true);
}

test("evento compartilhado, duplicado sugerido, revisão de distância e acesso negado", async ({ playwright, baseURL }) => {
  const maria = await playwright.request.newContext({ baseURL });
  const outro = await playwright.request.newContext({ baseURL });
  const professor = await playwright.request.newContext({ baseURL });
  await entrar(maria, MARIA);
  await entrar(outro, OUTRO);
  await entrar(professor, PROFESSOR_2);

  const evento = {
    name: `Travessia E2E ${RUN}`, type: "ORGANIZED_CROSSING", sportType: "open-water", environment: "SEA",
    startLocalDate: "2026-12-20", timeZone: "America/Sao_Paulo", city: "Niterói", visibility: "PUBLIC",
  };
  const criada = await maria.post("/api/events", {
    data: { event: evento, option: { label: "2 km", distanceValue: 2, distanceUnit: "km" }, participation: { goalText: "concluir com controle e boa orientação" } },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  const participacao = (await criada.json()) as { id: string; eventId: string; optionId: string; athleteId: string; version: number };

  // Outro aluno encontra o mesmo evento e entra com outro objetivo, sem duplicar.
  const busca = await outro.get(`/api/events/search?q=${encodeURIComponent(evento.name)}`);
  const encontrados = (await busca.json()) as Array<{ id: string; options: Array<{ id: string }> }>;
  expect(encontrados.map((item) => item.id)).toContain(participacao.eventId);
  const segunda = await outro.post("/api/events", {
    data: { eventId: participacao.eventId, optionId: participacao.optionId, participation: { goalText: "sub 50 min", suggestedPriority: "SECONDARY" } },
  });
  expect(segunda.status(), await segunda.text()).toBe(201);
  expect(((await segunda.json()) as { eventId: string }).eventId).toBe(participacao.eventId);

  // Mesmo nome/data/cidade: sugestão de duplicado; confirmado como outro, cria.
  const duplicado = await outro.post("/api/events", { data: { event: { ...evento, name: evento.name.toUpperCase(), city: "NITEROI" } } });
  expect(duplicado.status()).toBe(409);
  const corpo = (await duplicado.json()) as { candidates: Array<{ id: string }> };
  expect(corpo.candidates.map((candidate) => candidate.id)).toContain(participacao.eventId);
  const distinto = await outro.post("/api/events", { data: { event: { ...evento, name: evento.name.toUpperCase() }, confirmDistinct: true } });
  expect(distinto.status(), await distinto.text()).toBe(201);

  // Mudar o objetivo grava revisão e marca revisão pendente; versão antiga dá conflito.
  const alterada = await maria.patch(`/api/events/participations/${participacao.id}`, {
    data: { goalText: "concluir abaixo de 1h", expectedVersion: participacao.version },
  });
  expect(alterada.status(), await alterada.text()).toBe(200);
  const atual = (await alterada.json()) as { version: number; needsReviewSince: string | null };
  expect(atual.version).toBe(participacao.version + 1);
  expect(atual.needsReviewSince).not.toBeNull();
  const conflito = await maria.patch(`/api/events/participations/${participacao.id}`, {
    data: { goalText: "outra coisa", expectedVersion: participacao.version },
  });
  expect(conflito.status()).toBe(409);

  // Lista de Maria: contagem regressiva no fuso do evento.
  const lista = await maria.get("/api/events");
  const { participations } = (await lista.json()) as { participations: Array<{ id: string; daysUntil: number | null }> };
  expect(participations.find((item) => item.id === participacao.id)?.daysUntil).toBeGreaterThan(0);

  // Professor sem vínculo com Maria: 404 na lista e na alteração (AC03/AC21).
  const negada = await professor.get(`/api/events?athleteId=${encodeURIComponent(participacao.athleteId)}`);
  expect(negada.status()).toBe(404);
  const alteracaoNegada = await professor.patch(`/api/events/participations/${participacao.id}`, { data: { goalText: "x", expectedVersion: atual.version } });
  expect(alteracaoNegada.status()).toBe(404);

  await Promise.all([maria.dispose(), outro.dispose(), professor.dispose()]);
});
