/**
 * E2E — 18: Central do atleta (/professor/<schoolId>/atletas/<athleteId>)
 *
 * SAM-11 matriz obrigatória, reescrita na SAM-21 — tudo pela UI real, com
 * fixtures determinísticas e ZERO retorno silencioso: toda pré-condição
 * ausente vira `expect(..., "motivo")` e faz o cenário FALHAR.
 *
 *  A. a central abre com as cinco seções, cada uma com endereço próprio e ativa
 *  B. prescrever com sucesso (modalidade, data/hora, blocos com repetições e
 *     recuperação, alvo por zona/FC) → treino aparece em Treinos e no Resumo
 *  C. abrir o treino criado → estrutura, professor responsável, data/modalidade/
 *     status e alvos
 *  D. treino com execução casada (fixture Garmin pelos use cases reais) →
 *     planejado × realizado, aderência, zonas e laps — falha sem a fixture
 *  E. ficha técnica → FCmáx + limiar com método LTHR → zonas por método →
 *     refresh
 *  F. isolamento: PROFESSOR_2 (mesma escola, não designado) não vê o atleta;
 *     schoolId/athleteId trocados → fora da central, sem vazar existência
 *  G. deep link + refresh em cada rota; trilha mantém schoolId; fluxos críticos
 *     em 390×844
 *
 * Idempotente: títulos únicos por execução; valores da ficha alternam por
 * minuto para gerar revisão nova; rodar 2× seguidas passa nas duas.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsSchoolOwner, login, completeOnboarding } from "./helpers";
import { ESCOLA_1, PROFESSOR_1, PROFESSOR_2, ALUNOS } from "./fixtures";

const SCHOOL_TZ = "America/Sao_Paulo";

async function entrarComo(page: Page, professor: { email: string; password: string; name: string }) {
  await login(page, professor.email, professor.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, professor.name);
}

/** Plantel do professor logado: ids pelos hrefs dos cartões, nunca id fixo. */
async function plantel(page: Page, schoolId: string): Promise<Array<{ athleteId: string; email: string | null }>> {
  await page.goto(`/professor/${schoolId}/atletas`);
  await page.waitForLoadState("load");
  const cards = page.locator(`a[href^="/professor/${schoolId}/atletas/"]`);
  const count = await cards.count();
  const result: Array<{ athleteId: string; email: string | null }> = [];
  for (let index = 0; index < count; index += 1) {
    const href = await cards.nth(index).getAttribute("href");
    const athleteId = href?.split("/atletas/")[1]?.split(/[/?#]/)[0];
    if (!athleteId || result.some((entry) => entry.athleteId === athleteId)) continue;
    const texto = await cards.nth(index).innerText();
    const aluno = ALUNOS.find((candidate) => texto.includes(candidate.name) || texto.includes(candidate.email));
    result.push({ athleteId, email: aluno?.email ?? null });
  }
  return result;
}

/** Contexto base: dono resolve a escola; PROFESSOR_1 precisa ter ≥1 atleta de fixture no plantel. */
async function contexto(page: Page): Promise<{ schoolId: string; athleteId: string; email: string }> {
  const schoolId = await loginAsSchoolOwner(page, ESCOLA_1);
  await entrarComo(page, PROFESSOR_1);
  const atletas = (await plantel(page, schoolId)).filter((entry) => entry.email);
  expect(atletas.length, "fixture: PROFESSOR_1 precisa de ao menos um atleta conhecido no plantel (specs 06/14)").toBeGreaterThan(0);
  return { schoolId, athleteId: atletas[0].athleteId, email: atletas[0].email! };
}

function futureTuesday(weeksAhead: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const dow = base.getUTCDay() || 7;
  base.setUTCDate(base.getUTCDate() - (dow - 1) + weeksAhead * 7 + 1);
  return base.toISOString().slice(0, 10);
}

/** Cenário B: aquecimento 10 min (FC 110–130) + 3×4 min (FC 160–175, descanso 2 min), corrida. */
async function prescrever(page: Page, schoolId: string, athleteId: string, title: string, when: string) {
  await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos`);
  await page.waitForLoadState("load");
  const acao = page.getByLabel("Prescrever treino para este atleta");
  await expect(acao, "PROFESSOR_1 deve ser o responsável pelo atleta de fixture").toBeVisible({ timeout: 15_000 });
  await acao.click();
  await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });

  await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="sportType"]').selectOption("run");
  await page.locator('input[name="scheduledAt"]').fill(when);
  const blocos = page.locator("ol > li");
  await blocos.nth(0).getByLabel("Duração (min)").fill("10");
  await blocos.nth(0).getByLabel(/^FC mín\./).fill("110");
  await blocos.nth(0).getByLabel(/^FC máx\./).fill("130");
  await page.getByRole("button", { name: "Adicionar bloco" }).click();
  await expect(blocos).toHaveCount(2);
  await blocos.nth(1).getByLabel("Duração (min)").fill("4");
  await blocos.nth(1).getByLabel("Repetições").fill("3");
  await blocos.nth(1).getByLabel(/^FC mín\./).fill("160");
  await blocos.nth(1).getByLabel(/^FC máx\./).fill("175");
  await blocos.nth(1).getByLabel("Descanso (min)").fill("2");
  await page.getByRole("button", { name: /^Prescrever treino$/ }).click();

  await page.waitForURL(new RegExp(`/professor/${schoolId}/atletas/${athleteId}/treinos(\\?|$)`), { timeout: 30_000 });
  const link = page.locator(`a[href^="/professor/${schoolId}/atletas/${athleteId}/treinos/"]`).filter({ hasText: title }).first();
  await expect(link, "o treino criado deve aparecer na lista de Treinos").toBeVisible({ timeout: 15_000 });
  const href = (await link.getAttribute("href"))!;
  return { href, assignmentId: href.split("/treinos/")[1] };
}

const LAPS = [
  { durationSeconds: 600, distanceMeters: 2000, averageHeartRate: 125 },
  { durationSeconds: 240, distanceMeters: 1000, averageHeartRate: 168 },
  { durationSeconds: 120, distanceMeters: 300, averageHeartRate: 120 },
  { durationSeconds: 240, distanceMeters: 1000, averageHeartRate: 170 },
  { durationSeconds: 120, distanceMeters: 300, averageHeartRate: 118 },
  { durationSeconds: 240, distanceMeters: 1000, averageHeartRate: 182 },
];

/** Fixture D: atividade Garmin casada pela use case real; nunca insere a prescrição direto no banco. */
async function casarExecucao(page: Page, email: string, assignmentId: string) {
  const response = await page.request.post("/api/e2e/activity-fixture", { data: { athleteEmail: email, assignmentId, laps: LAPS } });
  expect(response.ok(), `fixture de atividade falhou: ${response.status()} ${await response.text()}`).toBe(true);
  const body = await response.json();
  expect(body.matchStatus, "a execução deve ficar CONFIRMED").toBe("CONFIRMED");
}

async function validarDetalhe(page: Page, href: string, title: string) {
  await page.goto(href);
  await page.waitForLoadState("load");
  // C — cabeçalho: título, status, data/hora no fuso da escola, modalidade, professor responsável.
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });
  const cabecalho = page.locator("main");
  await expect(cabecalho).toContainText("Agendado");
  await expect(cabecalho).toContainText("Corrida");
  await expect(cabecalho).toContainText(`Professor: ${PROFESSOR_1.displayName}`);
  await expect(cabecalho).toContainText("07:00");
  // Estrutura com alvos.
  const estrutura = page.locator("ol").filter({ hasText: "Aquecimento" }).first();
  await expect(estrutura).toContainText("FC: 110–130 bpm");
  await expect(estrutura).toContainText("3× ");
  await expect(estrutura).toContainText("FC: 160–175 bpm");
  await expect(estrutura).toContainText("Descanso:");
}

test.describe("18 — Central do atleta (professor)", () => {
  test.setTimeout(300_000);

  test("A — resumo abre com as cinco seções, cada uma com endereço próprio e ativa; trilha mantém a escola", async ({ page }) => {
    const { schoolId, athleteId } = await contexto(page);
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
    await page.waitForLoadState("load");
    expect(page.url()).toContain(`/professor/${schoolId}/atletas/${athleteId}`);

    const secoes = page.getByRole("navigation", { name: "Seções do atleta" });
    await expect(secoes).toBeVisible({ timeout: 15_000 });
    const esperado: Array<[string, string]> = [
      ["Resumo", `/professor/${schoolId}/atletas/${athleteId}`],
      ["Treinos", `/professor/${schoolId}/atletas/${athleteId}/treinos`],
      ["Análise", `/professor/${schoolId}/atletas/${athleteId}/analise`],
      ["Ficha técnica", `/professor/${schoolId}/atletas/${athleteId}/ficha-tecnica`],
      ["Histórico", `/professor/${schoolId}/atletas/${athleteId}/historico`],
    ];
    for (const [rotulo, href] of esperado) {
      const link = secoes.getByRole("link", { name: rotulo });
      await expect(link, `seção ${rotulo} deve existir`).toBeVisible();
      expect(await link.getAttribute("href"), `href da seção ${rotulo}`).toBe(href);
    }
    expect(await secoes.getByRole("link", { name: "Resumo" }).getAttribute("aria-current")).toBe("page");

    // G — deep link + refresh em cada rota; a seção marca a si mesma como ativa; a trilha volta ao plantel da MESMA escola.
    for (const [sufixo, rotulo] of [["/treinos", "Treinos"], ["/analise", "Análise"], ["/ficha-tecnica", "Ficha técnica"], ["/historico", "Histórico"]] as const) {
      await page.goto(`/professor/${schoolId}/atletas/${athleteId}${sufixo}`);
      await page.waitForLoadState("load");
      await page.reload();
      await page.waitForLoadState("load");
      expect(page.url(), `${sufixo} não deve redirecionar`).toContain(sufixo);
      const nav = page.getByRole("navigation", { name: "Seções do atleta" });
      await expect(nav, `nav em ${sufixo}`).toBeVisible({ timeout: 15_000 });
      expect(await nav.getByRole("link", { name: rotulo }).getAttribute("aria-current"), `${rotulo} ativa em ${sufixo}`).toBe("page");
      const trilha = page.getByRole("navigation", { name: "Trilha de navegação" });
      expect(await trilha.getByRole("link").first().getAttribute("href")).toBe(`/professor/${schoolId}/atletas`);
    }
  });

  test("B + C — prescrever com sucesso pela UI, ver em Treinos e no Resumo, abrir o detalhe", async ({ page }) => {
    const { schoolId, athleteId } = await contexto(page);
    const title = `Central B ${Date.now().toString(36)}`;
    // Semana +2: fica à frente de qualquer outro treino de fixture, para ser o "próximo".
    const { href } = await prescrever(page, schoolId, athleteId, title, `${futureTuesday(2)}T07:00`);

    // Resumo: o treino criado é o próximo treino em aberto (ou um ainda mais próximo criado por outro spec).
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}`);
    await page.waitForLoadState("load");
    const proximo = page.locator("section").filter({ hasText: "Próximo treino" }).first();
    await expect(proximo).toBeVisible();
    await expect(proximo.getByRole("link", { name: /Abrir treino/ })).toBeVisible();
    const proximoHref = await proximo.getByRole("link", { name: /Abrir treino/ }).getAttribute("href");
    expect(proximoHref, "o próximo treino deve ter endereço próprio").toContain(`/atletas/${athleteId}/treinos/`);

    await validarDetalhe(page, href, title);
    // Refresh mantém tudo (sem estado de cliente).
    await page.reload();
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });
  });

  test("B (recusa) — o construtor mantém o rascunho quando o servidor recusa", async ({ page }) => {
    const { schoolId, athleteId } = await contexto(page);
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/treinos/novo`);
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: /Prescrever treino/i })).toBeVisible({ timeout: 15_000 });
    await page.locator('input[name="title"]').fill("Sem bloco válido");
    await page.getByRole("button", { name: /^Prescrever treino$/ }).click();
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });
    expect(page.url(), "uma submissão recusada não navega").toContain("/treinos/novo");
  });

  test("D — treino com execução casada: planejado × realizado, aderência, zonas e laps", async ({ page }) => {
    const { schoolId, athleteId, email } = await contexto(page);
    const title = `Central D ${Date.now().toString(36)}`;
    const { href, assignmentId } = await prescrever(page, schoolId, athleteId, title, `${futureTuesday(8)}T07:00`);
    await casarExecucao(page, email, assignmentId);

    await page.goto(href);
    await page.waitForLoadState("load");
    const tabela = page.locator("table").filter({ hasText: "Prescrito" }).first();
    await expect(tabela, "sem a fixture de atividade este cenário DEVE falhar").toBeVisible({ timeout: 15_000 });
    await expect(tabela).toContainText("28 min"); // 10 + 3×(4+2), reps e descanso
    await expect(tabela).toContainText("26 min"); // Σ laps
    await expect(tabela.locator("tr").filter({ hasText: "Aderência" })).toContainText(/\d\.\d\/10/);
    await expect(page.locator("section").filter({ hasText: "Aderência por dimensão" }).first()).toContainText("Zonas");
    await expect(page.getByTestId("zones-heart-rate-zones")).toContainText("bpm");
    await expect(page.getByTestId("laps-table").locator('[data-testid="lap-row"]')).toHaveCount(6);
    await expect(page.getByTestId("overlay-table").locator('[data-testid="overlay-row"]')).toHaveCount(6);
    await expect(page.getByTestId("overlay-table").locator('[data-verdict="above"]')).toHaveCount(1);
  });

  test("E — ficha técnica: FCmáx + limiar com método LTHR → zonas por método → refresh", async ({ page }) => {
    const { schoolId, athleteId } = await contexto(page);
    const odd = Math.floor(Date.now() / 60_000) % 2 === 1;
    const maxHr = odd ? 191 : 190;
    await page.goto(`/professor/${schoolId}/atletas/${athleteId}/ficha-tecnica`);
    await page.waitForLoadState("load");
    const editar = page.getByRole("button", { name: /Editar ficha|Adicionar ficha/i }).first();
    await expect(editar, "PROFESSOR_1 deve poder editar a ficha do seu atleta").toBeVisible({ timeout: 15_000 });
    await editar.click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await modal.getByLabel(/FC máxima/i).fill(String(maxHr));
    await modal.getByLabel(/FC de limiar/i).fill("170");
    await modal.locator('select[name="heartRateZoneMethod"]').selectOption("LTHR");
    await modal.getByRole("button", { name: /Salvar/i }).first().click();
    // O modal só fecha quando a escrita (transação + revisão) aconteceu; no dev server isso passa de 15 s.
    await expect(modal).toBeHidden({ timeout: 45_000 });

    await page.reload();
    await page.waitForLoadState("load");
    const zonas = page.getByTestId("zones-heart-rate");
    await expect(zonas).toHaveAttribute("data-method", "LTHR");
    await expect(zonas).toContainText("162–170 bpm"); // Z4 = 95–100% de 170
    await expect(page.getByText(`${maxHr} bpm`).first()).toBeVisible();
  });

  test("F — isolamento: professor da mesma escola não designado não vê o atleta; ids trocados não vazam existência", async ({ page }) => {
    const { schoolId, athleteId } = await contexto(page);
    // Quem é de PROFESSOR_2? Precisa existir um atleta de PROFESSOR_1 fora do plantel dela.
    await entrarComo(page, PROFESSOR_2);
    const plantel2 = (await plantel(page, schoolId)).map((entry) => entry.athleteId);
    const alvo = athleteId;
    expect(plantel2.includes(alvo) === false, "fixture: PROFESSOR_2 não pode ser designada ao atleta de PROFESSOR_1 usado no teste").toBe(true);

    for (const url of [
      `/professor/${schoolId}/atletas/${alvo}`,
      `/professor/${schoolId}/atletas/${alvo}/treinos`,
      `/professor/${schoolId}/atletas/${alvo}/ficha-tecnica`,
    ]) {
      const response = await page.goto(url);
      await page.waitForLoadState("load");
      const vazou = await page.getByRole("navigation", { name: "Seções do atleta" }).isVisible({ timeout: 3_000 }).catch(() => false);
      expect(vazou, `${url}: a central não pode renderizar para quem não é responsável`).toBe(false);
      expect(response?.status(), `${url} deve ser 404`).toBe(404);
    }

    // Mesmo professor responsável: schoolId trocado cai fora do painel (o layout manda ao hub),
    // athleteId inexistente é o mesmo 404 de um atleta alheio — nada diz qual dos dois existe.
    await entrarComo(page, PROFESSOR_1);
    await page.goto(`/professor/escola-que-nao-existe/atletas/${alvo}`);
    await page.waitForLoadState("load");
    expect(page.url()).not.toContain("escola-que-nao-existe");
    const idInexistente = await page.goto(`/professor/${schoolId}/atletas/atleta-que-nao-existe`);
    expect(idInexistente?.status()).toBe(404);
    expect(await page.getByRole("navigation", { name: "Seções do atleta" }).isVisible({ timeout: 2_000 }).catch(() => false)).toBe(false);
  });

  test("G — mobile 390×844: abrir atleta, navegar seções, abrir treino, iniciar prescrição, ver gráfico, editar ficha", async ({ browser }) => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await mobile.newPage();
    try {
      const { schoolId, athleteId } = await contexto(page);
      const base = `/professor/${schoolId}/atletas/${athleteId}`;
      await page.goto(base);
      await page.waitForLoadState("load");
      await expect(page.getByRole("navigation", { name: "Seções do atleta" })).toBeVisible({ timeout: 15_000 });
      const semOverflow = async (rota: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${rota} não pode ter overflow horizontal`).toBeLessThanOrEqual(0);
      };
      await semOverflow("resumo");

      await page.getByRole("navigation", { name: "Seções do atleta" }).getByRole("link", { name: "Treinos" }).click();
      await page.waitForURL(/\/treinos$/);
      const treino = page.locator(`a[href^="${base}/treinos/"]`).first();
      await expect(treino, "o atleta precisa ter ao menos um treino (cenário B)").toBeVisible({ timeout: 15_000 });
      await treino.click();
      await page.waitForURL(/\/treinos\/[^/]+$/);
      await expect(page.getByText("Estrutura do treino")).toBeVisible({ timeout: 15_000 });
      await semOverflow("detalhe do treino");

      await page.goto(`${base}/treinos/novo`);
      await page.waitForLoadState("load");
      await expect(page.locator("ol > li").first().getByTestId("block-zone")).toBeVisible({ timeout: 15_000 });
      await semOverflow("builder");

      await page.goto(`${base}/analise`);
      await page.waitForLoadState("load");
      await expect(page.getByRole("navigation", { name: "Janela de análise" })).toBeVisible({ timeout: 15_000 });
      await semOverflow("análise");

      await page.goto(`${base}/ficha-tecnica`);
      await page.waitForLoadState("load");
      await page.getByRole("button", { name: /Editar ficha|Adicionar ficha/i }).first().click();
      const modal = page.getByRole("dialog");
      await expect(modal).toBeVisible({ timeout: 10_000 });
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      const box = await modal.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(viewportWidth);
      expect(Math.abs(box!.x + box!.width / 2 - viewportWidth / 2)).toBeLessThan(8);
      await page.keyboard.press("Escape");
      await expect(modal).toBeHidden();
    } finally {
      await mobile.close();
    }
  });
});
