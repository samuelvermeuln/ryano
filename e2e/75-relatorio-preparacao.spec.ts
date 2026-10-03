/**
 * E2E — 75 (SAM-76): relatório de evolução da preparação.
 *
 * Ricardo (no papel de Carlos) assume a travessia de Maria (no de Samuel),
 * pactua um objetivo, cria três marcos (um já decidido como atingido, um
 * vencido sem evidência e um com evidência aguardando avaliação) e liga uma
 * sessão-chave. O relatório mostra os estados objetivos e "1 de 3 marco(s)
 * concluído(s) — conclusão administrativa, não aptidão", sem percentual de
 * prontidão. Maria vê a versão dela na aba Relatório.
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
function localMinusHours(hours: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() - hours * 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

test("relatório com três marcos em estados objetivos, sessão-chave e contador administrativo; aluno vê a própria versão", async ({ page, browser }) => {
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);
  const nome = `Travessia E2E 75 ${RUN}`;
  const criada = await maria.request.post("/api/events", {
    data: { confirmDistinct: true, event: { name: nome, type: "COMPETITION", sportType: "open-water", startLocalDate: localDate(40), timeZone: "America/Sao_Paulo" }, participation: { goalText: "completar a travessia" } },
  });
  expect(criada.status(), await criada.text()).toBe(201);
  const participation = (await criada.json()) as { id: string; preparation: { id: string } };
  const prepId = participation.preparation.id;

  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const base = `/professor/independente/atletas/${mariaId}`;
  let sessao: string | null = null;

  try {
    // 1. Assumir, pactuar.
    const prep = await page.request.get(`/api/preparations/${prepId}`);
    const { version } = (await prep.json()) as { version: number };
    const assumir = await page.request.post(`/api/preparations/${prepId}`, { data: { action: "assume", expectedVersion: version, firstReviewLocalDate: localDate(5), analysisNotes: null } });
    expect(assumir.ok(), await assumir.text()).toBe(true);
    const meta = await page.request.post("/api/goals", { data: { athleteId: mariaId, participationId: participation.id, origin: "COACH_AGREED", desiredGoalId: null, type: "RESULT", description: `Terminar abaixo de 1h10 ${RUN}`, dueLocalDate: null } });
    expect(meta.ok(), await meta.text()).toBe(true);

    // 2. Três marcos.
    const marco = async (title: string, due: string) => {
      const response = await page.request.post(`/api/preparations/${prepId}/milestones`, { data: { milestone: { title, criterion: "Nadar o percurso de referência e relatar", dueLocalDate: due, evidenceType: "MANUAL" } } });
      expect(response.ok(), await response.text()).toBe(true);
      return ((await response.json()) as { id: string }).id;
    };
    const atingido = await marco(`Técnica de respiração ${RUN}`, localDate(-10));
    await marco(`Simulado de 2 km ${RUN}`, localDate(-3)); // vencido sem evidência
    const aguardando = await marco(`Travessia de 1 km ${RUN}`, localDate(10));
    expect((await page.request.post(`/api/preparation-milestones/${atingido}`, { data: { decision: "ACHIEVED", observation: "Respiração bilateral consolidada", isVisible: true } })).ok()).toBe(true);

    // 3. Sessão-chave executada e ligada ao marco "aguardando": evidência recebida.
    const lote = await page.request.post("/api/assignment-batches", {
      data: { scope: { kind: "independent" }, idempotencyKey: `e2e-75-${RUN}`, prescription: { title: `Nado contínuo ${RUN}`, sportType: "open-water", scheduledAtLocal: localMinusHours(3), blocks: [{ blockType: "STEADY", distanceM: 1000 }] }, recipients: [{ athleteId: mariaId }] },
    });
    expect(lote.status(), await lote.text()).toBe(201);
    sessao = ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;
    expect((await page.request.post(`/api/preparations/${prepId}/session-links`, { data: { assignmentId: sessao, milestoneId: aguardando } })).ok()).toBe(true);
    const fixture = await maria.request.post("/api/e2e/activity-fixture", { data: { athleteEmail: MARIA.email, assignmentId: sessao, laps: [{ durationSeconds: 1500, distanceMeters: 1000, averageHeartRate: 145 }] } });
    expect(fixture.ok(), await fixture.text()).toBe(true);

    // 4. Relatório do professor.
    await page.goto(`${base}/eventos/${participation.id}`);
    await page.getByTestId("open-preparation-report").click();
    const relatorio = page.getByTestId("preparation-report");
    await expect(relatorio).toBeVisible({ timeout: 90_000 });
    await expect(relatorio.getByTestId("report-completion")).toHaveText("1 de 3 marco(s) concluído(s) — conclusão administrativa, não aptidão.");
    const estado = async (titulo: string) => relatorio.getByTestId("report-milestone").filter({ hasText: titulo }).getAttribute("data-state");
    expect(await estado(`Técnica de respiração ${RUN}`)).toBe("ACHIEVED");
    expect(await estado(`Simulado de 2 km ${RUN}`)).toBe("MISSING_EVIDENCE");
    expect(await estado(`Travessia de 1 km ${RUN}`)).toBe("AWAITING_ASSESSMENT");
    await expect(relatorio.getByTestId("report-goals")).toContainText(`Terminar abaixo de 1h10 ${RUN}`);
    await expect(relatorio.getByTestId("report-session")).toContainText(`Nado contínuo ${RUN}`);
    await expect(relatorio.getByTestId("report-session")).toContainText("realizada");
    const texto = await relatorio.innerText();
    expect(texto).not.toMatch(/\d+\s?%\s*pront/i);
    expect(texto).not.toMatch(/pronto para a prova/i);

    // 5. Maria: a aba Relatório.
    await maria.goto(`/app/eventos/${participation.id}?aba=relatorio`);
    const meu = maria.getByTestId("preparation-report");
    await expect(meu).toBeVisible({ timeout: 90_000 });
    await expect(meu.getByTestId("report-completion")).toContainText("1 de 3");
    await expect(meu.getByTestId("report-milestone")).toHaveCount(3);
  } finally {
    await mariaContext.close();
    if (sessao) await page.request.post(`/api/workout-assignments/${sessao}/cancel`, { data: { reason: "limpeza do E2E 75" } });
  }
});
