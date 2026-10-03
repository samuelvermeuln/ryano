/**
 * E2E — 70 (SAM-71): fases e marcos da preparação.
 *
 * Ricardo (professor independente de Maria — o par Carlos/Samuel do documento
 * nas fixtures de E2E) assume o acompanhamento de um evento da Maria, define
 * duas fases sem "base" e sobrepostas, cria o marco "Simulado até 12/11",
 * liga a sessão de referência e move uma sessão futura com prévia. Maria
 * relata a sessão: o marco vai a "evidência recebida". Ricardo decide
 * "atingido" com parecer; Maria vê a decisão na aba Preparação.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 600_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

const localDate = (offsetDays: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offsetDays * 86_400_000));
function localPlusHours(hours: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() + hours * 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

test("fases sem base e sobrepostas, marco com evidência recebida e decisão do professor, bloco movido com prévia", async ({ page, browser }) => {
  // 1. Maria registra o evento.
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);
  const nome = `Corrida E2E 70 ${RUN}`;
  const criada = await maria.request.post("/api/events", {
    data: { confirmDistinct: true, event: { name: nome, type: "PERSONAL_CHALLENGE", sportType: "run", startLocalDate: localDate(30), timeZone: "America/Sao_Paulo" }, participation: { goalText: "completar bem" } },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  const participation = (await criada.json()) as { id: string; preparation: { id: string } };

  // 2. Ricardo: duas sessões da Maria (uma já passada, uma futura).
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const publicar = async (titulo: string, quando: string, chave: string) => {
    const lote = await page.request.post("/api/assignment-batches", {
      data: {
        scope: { kind: "independent" }, idempotencyKey: `e2e-70-${chave}-${RUN}`,
        prescription: { title: titulo, sportType: "run", scheduledAtLocal: quando, blocks: [{ blockType: "STEADY", durationS: 3000 }] },
        recipients: [{ athleteId: mariaId }],
      },
    });
    expect(lote.status(), await lote.text()).toBe(201);
    return ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;
  };
  const simuladoTitulo = `Simulado 10 km ${RUN}`;
  const futuraTitulo = `Rodagem futura ${RUN}`;
  const simulado = await publicar(simuladoTitulo, localPlusHours(-3), "simulado");
  const futura = await publicar(futuraTitulo, localPlusHours(24 * 10), "futura");

  try {
    // 3. Assumir o acompanhamento.
    await page.goto(`/professor/independente/atletas/${mariaId}/eventos/${participation.id}`);
    const assumir = page.getByTestId("assume-preparation");
    await expect(assumir).toBeVisible({ timeout: 90_000 });
    await assumir.getByLabel("Primeira revisão").fill(localDate(5));
    await assumir.getByRole("button", { name: "Assumir acompanhamento" }).click();
    await expect(page.getByTestId("coach-event-preparation")).toHaveAttribute("data-status", "PLANNING", { timeout: 90_000 });

    const plano = page.getByTestId("preparation-plan");
    /** Opens a <details> section of the plan; one already open (it survives the refresh) stays open. */
    const abrir = async (titulo: string) => {
      const secao = plano.locator("details", { has: page.locator("summary", { hasText: titulo }) }).last();
      if (!(await secao.evaluate((element) => (element as HTMLDetailsElement).open))) await secao.locator("summary").first().click();
    };

    // 4. Fases: desenvolvimento e específico sobrepostos, sem "base".
    const novaFase = async (tipo: string, inicio: number, fim: number, finalidade: string) => {
      await abrir("Nova fase");
      const form = plano.getByTestId("phase-form");
      await form.locator('select[name="type"]').selectOption(tipo);
      await form.locator('input[name="startLocalDate"]').fill(localDate(inicio));
      await form.locator('input[name="endLocalDate"]').fill(localDate(fim));
      await form.locator('input[name="purpose"]').fill(finalidade);
      await form.getByRole("button", { name: "Adicionar fase" }).click();
      await expect(form.getByText("Fase criada.")).toBeVisible({ timeout: 60_000 });
    };
    await novaFase("DEVELOPMENT", 0, 20, `Desenvolver ritmo ${RUN}`);
    await novaFase("SPECIFIC", 15, 28, `Aproximar da prova ${RUN}`);
    await expect(plano.getByTestId("preparation-phase")).toHaveCount(2, { timeout: 60_000 });
    await expect(plano.getByTestId("preparation-phase").getByText(/^Fase: Base/)).toHaveCount(0);
    await expect(plano.getByTestId("preparation-phase").getByText(/^Fase: (Desenvolvimento|Específico)/)).toHaveCount(2);

    // 5. Marco verificável.
    const marcoTitulo = `Simulado até 12/11 ${RUN}`;
    await abrir("Novo marco");
    const marcoForm = plano.getByTestId("milestone-form");
    await marcoForm.locator('input[name="title"]').fill(marcoTitulo);
    await marcoForm.locator('input[name="dueLocalDate"]').fill(localDate(20));
    await marcoForm.locator('textarea[name="criterion"]').fill("Realizar o simulado de 10 km, registrar a percepção de esforço e revisar a estabilidade do ritmo");
    await marcoForm.locator('select[name="evidenceType"]').selectOption("MANUAL");
    await marcoForm.getByRole("button", { name: "Adicionar marco" }).click();
    await expect(marcoForm.getByText("Marco criado.")).toBeVisible({ timeout: 60_000 });
    const marco = plano.getByTestId("preparation-milestone").filter({ hasText: marcoTitulo });
    await expect(marco).toHaveAttribute("data-status", "PLANNED", { timeout: 60_000 });

    // 6. Ligar as sessões ao evento (a de referência ao marco).
    const ligar = async (titulo: string, comMarco: boolean) => {
      await abrir("Ligar sessão ao evento");
      const form = plano.getByTestId("link-session");
      const opcao = await form.locator('select[name="assignmentId"] option').filter({ hasText: titulo }).first().getAttribute("value");
      await form.locator('select[name="assignmentId"]').selectOption(opcao!);
      if (comMarco) await form.locator('select[name="milestoneId"]').selectOption({ label: marcoTitulo });
      await form.getByRole("button", { name: "Ligar sessão" }).click();
      await expect(form.getByText("Sessão ligada ao evento.")).toBeVisible({ timeout: 60_000 });
    };
    await ligar(simuladoTitulo, true);
    await ligar(futuraTitulo, false);
    await expect(plano.getByTestId("preparation-session")).toHaveCount(2, { timeout: 60_000 });
    await expect(plano.getByTestId("preparation-totals")).toContainText("Este evento: 2 sessão(ões)");

    // 7. O evento mudou de data: mover a sessão futura uma semana, com prévia e nova versão.
    await abrir("Mover bloco de sessões");
    const mover = plano.getByTestId("move-sessions");
    await mover.getByLabel(new RegExp(futuraTitulo)).check();
    await mover.getByRole("spinbutton").fill("7");
    await mover.getByPlaceholder("evento adiado").fill("evento adiado uma semana");
    await mover.getByRole("button", { name: "Ver prévia" }).click();
    const previa = mover.getByTestId("move-preview-row");
    await expect(previa).toHaveAttribute("data-status", "READY", { timeout: 60_000 });
    const destino = localDate(17);
    await expect(previa).toContainText(`${destino.slice(8, 10)}/${destino.slice(5, 7)}`);
    await mover.getByRole("button", { name: "Mover e criar versões" }).click();
    await expect(mover.getByText("1 sessão(ões) movida(s); cada uma ganhou nova versão.")).toBeVisible({ timeout: 90_000 });
    const planoApi = (await (await page.request.get(`/api/preparations/${participation.preparation.id}/plan`)).json()) as { sessions: Array<{ assignmentId: string; scheduledAt: string }> };
    const movida = planoApi.sessions.find((session) => session.assignmentId === futura)!;
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(movida.scheduledAt))).toBe(destino);
    const detalhe = await page.request.get(`/professor/independente/atletas/${mariaId}/treinos/${futura}`);
    expect(await detalhe.text()).toContain("evento adiado uma semana");

    // 8. Maria relata o simulado: evidência recebida.
    await maria.goto(`/app/treinos/${simulado}`);
    const relato = maria.getByTestId("session-feedback-form");
    await expect(relato).toBeVisible({ timeout: 90_000 });
    await relato.getByLabel("Realizei parcialmente").check();
    await relato.getByLabel("Duração feita (min)").fill("48");
    await relato.getByLabel("Distância feita (m)").fill("9000");
    await relato.getByLabel("Motivo", { exact: true }).selectOption("SAFETY_CONDITIONS");
    await relato.getByLabel("Detalhe do motivo").fill("calor forte no fim");
    await relato.getByTestId("session-feedback-submit").click();
    await expect(relato.getByRole("status")).toContainText("Relato enviado", { timeout: 60_000 });

    await page.reload();
    await expect(marco).toHaveAttribute("data-status", "EVIDENCE_RECEIVED", { timeout: 90_000 });
    const { items } = (await (await page.request.get("/api/notifications?limit=100")).json()) as { items: Array<{ title: string }> };
    expect(items.some((item) => item.title === `Evidência recebida: ${marcoTitulo}`)).toBe(true);

    // 9. Só o professor decide: "atingido" com parecer.
    const decisao = marco.getByTestId("milestone-decision");
    await decisao.locator('select[name="decision"]').selectOption("ACHIEVED");
    await decisao.locator('input[name="observation"]').fill(`Ritmo estável até o km 8; calor explica a queda final ${RUN}`);
    await decisao.getByRole("button", { name: "Registrar decisão" }).click();
    await expect(marco).toHaveAttribute("data-status", "ACHIEVED", { timeout: 90_000 });
    await expect(marco.getByTestId("milestone-review")).toContainText(`calor explica a queda final ${RUN}`);

    // 10. Maria vê a decisão na aba Preparação e as sessões ligadas em Treinos.
    await maria.goto(`/app/eventos/${participation.id}?aba=preparacao`);
    const marcoAluno = maria.getByTestId("preparation-milestone").filter({ hasText: marcoTitulo });
    await expect(marcoAluno).toHaveAttribute("data-status", "ACHIEVED", { timeout: 90_000 });
    await expect(marcoAluno).toContainText("Atingido");
    await expect(marcoAluno.getByTestId("milestone-review")).toContainText(`calor explica a queda final ${RUN}`);
    await expect(maria.getByTestId("milestone-decision")).toHaveCount(0);
    await maria.goto(`/app/eventos/${participation.id}?aba=treinos`);
    await expect(maria.getByTestId("event-linked-sessions")).toContainText(simuladoTitulo, { timeout: 90_000 });
  } finally {
    await mariaContext.close();
    for (const id of [simulado, futura]) {
      await page.request.post(`/api/workout-assignments/${id}/cancel`, { data: { reason: "limpeza do E2E 70" } });
    }
  }
});
