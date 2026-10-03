/**
 * E2E — 59 (SAM-60): atribuição em lote com prévia e individualização.
 *
 * Requer a migração 0068_assignment_batches aplicada.
 *
 * Ricardo (independente) acompanha Maria e Lucas. A partir de um modelo de
 * ciclismo ele seleciona os dois (nomes e contagem visíveis), vê a prévia
 * com uma linha por aluno, individualiza a data de Lucas, publica e lê o
 * resultado por destinatário. Um modelo "88–94% do FTP" fica bloqueado para
 * Lucas, que não tem FTP na ficha — sem valor inventado (AC07).
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const LUCAS = ALUNOS[4]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 360_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

async function entrar(request: APIRequestContext, user: { email: string; password: string }) {
  const response = await request.post("/api/e2e/login", { data: { email: user.email, password: user.password } });
  expect(response.ok(), `login ${user.email}`).toBe(true);
}

function localDatePlus(days: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + days * 86_400_000));
}

test("lote independente com prévia, individualização, resultado e bloqueio por FTP ausente", async ({ page, playwright, baseURL }) => {
  // 0. Garante Ricardo ↔ Lucas (o E2E 53 encerra esse vínculo ao final).
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  if (!(await page.getByTestId("independent-athlete").filter({ hasText: LUCAS.name }).first().isVisible({ timeout: 5_000 }).catch(() => false))) {
    const lucas = await playwright.request.newContext({ baseURL });
    await entrar(lucas, LUCAS);
    const { items } = (await (await lucas.get(`/api/coaches/search?q=${encodeURIComponent(PROFESSOR_3.email)}`)).json()) as { items: Array<{ id: string }> };
    const pedido = await lucas.post(`/api/coaches/${items[0]!.id}/athlete-requests`, { data: {} });
    expect(pedido.status(), await pedido.text()).toBe(201);
    const { id } = (await pedido.json()) as { id: string };
    const aceite = await page.request.post(`/api/coaches/me/athlete-requests/${id}/accept`, { data: {} });
    expect(aceite.ok(), await aceite.text()).toBe(true);
    await lucas.dispose();
  }

  // 1. Modelo de ciclismo (alvos absolutos) e modelo relativo ao FTP.
  const meta = { title: `CIC-001 ${RUN}`, code: "CIC-001", sportType: "bike", tags: ["ciclismo"] };
  const blocos = [
    { blockType: "WARMUP", durationS: 900, target: { rpe: 3 } },
    { blockType: "INTERVAL", durationS: 300, repetitions: 4, restDurationS: 180, target: { rpe: 7 } },
    { blockType: "COOLDOWN", durationS: 600, target: { rpe: 2 } },
  ];
  const criado = await page.request.post("/api/workout-catalog", { data: { scope: { kind: "coach" }, meta, content: { blocks: blocos } } });
  expect(criado.status(), await criado.text()).toBe(201);
  const { template } = (await criado.json()) as { template: { id: string } };

  // 2. Selecionar Maria e Lucas, prévia, individualizar Lucas, publicar.
  await page.goto(`/professor/estudio/treinos/${template.id}/atribuir`);
  const lista = page.getByTestId("batch-athletes");
  await lista.getByLabel(new RegExp(MARIA.name)).first().check();
  await lista.getByLabel(new RegExp(LUCAS.name)).first().check();
  await expect(page.getByTestId("batch-selected-count")).toContainText("2 selecionado");
  await page.getByLabel("Data e hora", { exact: true }).fill(`${localDatePlus(10)}T07:00`);
  await page.getByTestId("batch-preview").click();
  const linhas = page.getByTestId("batch-preview-row");
  await expect(linhas).toHaveCount(2, { timeout: 60_000 });
  await expect(linhas.filter({ hasText: MARIA.name })).toHaveAttribute("data-status", "READY");
  await page.getByLabel(`Data de ${LUCAS.name}`).fill(`${localDatePlus(11)}T07:00`);
  await page.getByTestId("batch-publish").click();
  await expect(page.getByTestId("batch-counts")).toContainText("2 publicados", { timeout: 120_000 });
  await expect(page.getByTestId("batch-result").filter({ hasText: LUCAS.name })).toHaveAttribute("data-status", "OK");

  // 3. Alvo relativo ao FTP: Lucas não tem FTP → linha bloqueada com o motivo.
  const relativo = {
    title: `CIC-FTP ${RUN}`, sportType: "bike", scheduledAtLocal: `${localDatePlus(12)}T07:00`,
    blocks: [{ blockType: "INTERVAL", durationS: 1200, target: { relative: { reference: "FTP", minPct: 88, maxPct: 94 } } }],
  };
  await page.goto("/professor/independente");
  const linhaLucas = page.getByTestId("independent-athlete").filter({ hasText: LUCAS.name }).first();
  const lucasHref = (await linhaLucas.getByRole("link", { name: new RegExp(`Abrir a central de ${LUCAS.name}`) }).getAttribute("href"))!;
  const lucasId = lucasHref.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const previa = await page.request.post("/api/assignment-batches/preview", { data: { scope: { kind: "independent" }, athleteIds: [lucasId], prescription: relativo } });
  expect(previa.ok(), await previa.text()).toBe(true);
  const [linha] = (await previa.json()) as Array<{ status: string; reason: string }>;
  expect(linha).toMatchObject({ status: "BLOCKED" });
  expect(linha!.reason).toContain("Sem FTP");
});
