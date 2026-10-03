/**
 * E2E — 69 (SAM-70): avaliações com protocolo e perfis de zona versionados.
 *
 * Ricardo publica uma sessão de natação para Maria; depois registra uma
 * avaliação de CSS com protocolo e a leva à ficha, cria um perfil de 3 zonas
 * de natação e o aplica. A sessão publicada antes continua com a referência
 * da época (a nova avaliação aparece só em "Ver com as zonas atuais"); a
 * sessão publicada depois cita a avaliação; o construtor oferece as 3 zonas.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);
// A CSS no formato m:ss, única por execução, para não confundir com execuções anteriores.
const CSS_SECONDS = 100 + (Date.now() % 50);
const CSS_TEXT = `${Math.floor(CSS_SECONDS / 60)}:${String(CSS_SECONDS % 60).padStart(2, "0")}`;

test.describe.configure({ timeout: 480_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

function localPlusHours(hours: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(Date.now() + hours * 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

test("CSS avaliada e promovida, perfil de 3 zonas de natação aplicado, prescrição anterior inalterada", async ({ page }) => {
  await loginComo(page, PROFESSOR_3);
  await page.goto("/professor/independente");
  const linha = page.getByTestId("independent-athlete").filter({ hasText: MARIA.name }).first();
  await expect(linha, "depende do acompanhamento Ricardo ↔ Maria").toBeVisible({ timeout: 30_000 });
  const href = (await linha.getByRole("link", { name: new RegExp(`Abrir a central de ${MARIA.name}`) }).getAttribute("href"))!;
  const mariaId = href.split("/atletas/")[1]!.split(/[/?#]/)[0]!;
  const base = `/professor/independente/atletas/${mariaId}`;

  const publicar = async (titulo: string, chave: string) => {
    const lote = await page.request.post("/api/assignment-batches", {
      data: {
        scope: { kind: "independent" }, idempotencyKey: `e2e-69-${chave}-${RUN}`,
        prescription: { title: titulo, sportType: "swim", scheduledAtLocal: localPlusHours(30), blocks: [{ blockType: "STEADY", distanceM: 1500 }] },
        recipients: [{ athleteId: mariaId }],
      },
    });
    expect(lote.status(), await lote.text()).toBe(201);
    return ((await lote.json()) as { recipients: Array<{ assignmentId: string }> }).recipients[0]!.assignmentId;
  };
  const citacao = new RegExp(`CSS ${CSS_TEXT}/100 m \\(avaliação de`);

  // 1. Sessão publicada ANTES da avaliação.
  const antes = await publicar(`E2E 69 antes ${RUN}`, "antes");
  let depois: string | null = null;

  try {
    // 2. Avaliação de CSS com protocolo, levada à ficha.
    await page.goto(`${base}/ficha-tecnica`);
    const avaliacoes = page.locator("section").filter({ has: page.getByRole("heading", { name: "Avaliações" }) }).first();
    await expect(avaliacoes).toBeVisible({ timeout: 90_000 });
    await avaliacoes.locator("summary").filter({ hasText: "Registrar avaliação" }).click();
    const form = avaliacoes.getByTestId("assessment-form");
    const natacao = form.locator('select[name="sportType"] option[value="swim"]');
    if (await natacao.count()) await form.locator('select[name="sportType"]').selectOption("swim");
    await form.locator('input[name="environment"]').fill("piscina 25 m");
    await form.locator('input[name="assessedLocalDate"]').fill("2026-09-10");
    await form.locator('input[name="protocol"]').fill("CSS 400/200");
    await form.locator('input[name="assessorName"]').fill("Ricardo");
    await form.locator('select[name="reference"]').selectOption("CSS");
    await form.locator('input[name="resultValue"]').fill(CSS_TEXT);
    await form.locator('select[name="source"]').selectOption("IN_PERSON");
    await form.locator('input[name="conditions"]').fill(`água 27 °C ${RUN}`);
    await form.locator('input[name="limitations"]').fill("primeira avaliação do ciclo");
    await form.getByRole("button", { name: "Registrar avaliação" }).click();
    await expect(form.getByText("Avaliação registrada.")).toBeVisible({ timeout: 60_000 });

    const item = avaliacoes.getByTestId("assessment").filter({ hasText: `água 27 °C ${RUN}` });
    await expect(item).toContainText(`CSS ${CSS_TEXT}/100 m · CSS 400/200 · 10/09/2026`, { timeout: 60_000 });
    await expect(item).toContainText("Teste presencial");
    await item.getByRole("button", { name: "Levar à ficha" }).click();
    await expect(item.getByText(/Na ficha desde/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("parameter-revision").first()).toContainText(`CSS`);

    // 3. Perfil de 3 zonas de natação, aplicado à Maria.
    const perfis = page.locator("section").filter({ has: page.getByRole("heading", { name: "Perfis de zona" }) }).first();
    await perfis.locator("summary").filter({ hasText: "Novo perfil de zonas" }).click();
    const perfil = perfis.getByTestId("zone-profile-form");
    const nome = `Natação 3 zonas ${RUN}`;
    await perfil.locator('input[name="name"]').fill(nome);
    await perfil.locator('select[name="family"]').selectOption("swim");
    await perfil.locator('select[name="reference"]').selectOption("CSS");
    await perfil.locator('input[name="method"]').fill("Modelo do professor por % do CSS");
    await perfil.locator('input[name="bounds"]').fill("0, 85, 100");
    await perfil.locator('input[name="labels"]').fill("Leve, Moderado, Forte");
    await perfil.getByRole("button", { name: "Salvar perfil" }).click();
    await expect(perfil.getByText("Perfil salvo.")).toBeVisible({ timeout: 60_000 });

    const associar = perfis.getByTestId("assign-zone-profile-swim");
    await expect(associar).toBeVisible({ timeout: 60_000 });
    await associar.getByRole("combobox").selectOption({ label: `${nome} (v1, 3 zonas)` });
    await associar.getByRole("button", { name: "Aplicar" }).click();
    await expect(associar.getByText("Aplicado às próximas prescrições.")).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await expect(page.getByTestId("zones-swim").locator("li")).toHaveCount(3, { timeout: 90_000 });
    await expect(page.locator("section").filter({ has: page.getByTestId("zones-swim") })).toContainText(`Perfil "${nome}" v1`);

    // 4. O construtor oferece as 3 zonas do perfil para natação.
    await page.goto(`${base}/treinos/novo`);
    const esporte = page.locator('select[name="sportType"]');
    await expect(esporte).toBeVisible({ timeout: 90_000 });
    await esporte.selectOption("swim");
    const zona = page.getByLabel(new RegExp(`^Zona \\(${nome}`)).first();
    await expect(zona).toBeVisible({ timeout: 30_000 });
    await expect(zona.locator("option").filter({ hasText: /^Z\d/ })).toHaveCount(3);

    // 5. Sessão publicada DEPOIS: cita a avaliação; a de antes não muda.
    depois = await publicar(`E2E 69 depois ${RUN}`, "depois");
    await page.goto(`${base}/treinos/${depois}`);
    await expect(page.getByTestId("frozen-reference")).toContainText(citacao, { timeout: 90_000 });
    await expect(page.getByTestId("frozen-reference")).toContainText(`perfil "${nome}" v1`);

    await page.goto(`${base}/treinos/${antes}`);
    const referencia = page.getByTestId("prescription-reference");
    await expect(page.getByRole("heading", { name: `E2E 69 antes ${RUN}` }).or(referencia).first()).toBeVisible({ timeout: 90_000 });
    // A Maria pode não ter tido ficha antes: sem referência congelada, o cartão não aparece — e nunca com a avaliação nova.
    if (await referencia.count()) {
      await expect(page.getByTestId("frozen-reference")).not.toContainText(citacao);
      await expect(page.getByTestId("frozen-reference")).not.toContainText(nome);
      await referencia.getByText("Ver com as zonas atuais").click();
      await expect(page.getByTestId("current-reference")).toContainText(citacao);
    }
  } finally {
    // Volta a natação da Maria ao padrão derivado e limpa as sessões.
    await page.goto(`${base}/ficha-tecnica`);
    const associar = page.getByTestId("assign-zone-profile-swim");
    if (await associar.isVisible({ timeout: 60_000 }).catch(() => false)) {
      await associar.getByRole("combobox").selectOption("");
      await associar.getByRole("button", { name: "Aplicar" }).click();
      await expect(associar.getByText("Aplicado às próximas prescrições.")).toBeVisible({ timeout: 60_000 });
    }
    for (const id of [antes, depois].filter((value): value is string => Boolean(value))) {
      await page.request.post(`/api/workout-assignments/${id}/cancel`, { data: { reason: "limpeza do E2E 69" } });
    }
  }
});
