/**
 * E2E — 65 (SAM-66): resultado do evento e pós-evento — cenário com os atores
 * do ambiente de testes (Maria e o professor Ricardo no papel de Samuel e Carlos).
 *
 * Requer a migração 0074_participation_result aplicada.
 *
 * Maria registra uma travessia de hoje (Ricardo assume o acompanhamento) e
 * outra prova do mesmo dia. Ela registra a travessia como concluída com tempo
 * relatado e a sua percepção; a outra fica "não largou". Ricardo vê o
 * resultado, registra o parecer pós-evento e encerra a preparação.
 */
import { test, expect, type Page } from "@playwright/test";
import { ALUNOS, PROFESSOR_3 } from "./fixtures";
import { completeOnboarding, login } from "./helpers";

const MARIA = ALUNOS[1]!;
const RUN = Date.now().toString(36);

test.describe.configure({ timeout: 360_000 });

async function loginComo(page: Page, user: { name: string; email: string; password: string }) {
  await login(page, user.email, user.password);
  if (page.url().includes("/onboarding")) await completeOnboarding(page, user.name);
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

test("travessia concluída com tempo relatado, parecer e encerramento; outra prova DNS", async ({ page, browser }) => {
  const mariaContext = await browser.newContext();
  const maria = await mariaContext.newPage();
  await loginComo(maria, MARIA);

  async function registrar(nome: string, tipo: string, esporte: string) {
    const criada = await maria.request.post("/api/events", {
      data: { confirmDistinct: true, event: { name: `${nome} ${RUN}`, type: tipo, sportType: esporte, startLocalDate: today(), timeZone: "America/Sao_Paulo" }, participation: { goalText: "concluir com controle e boa orientação" } },
    });
    expect(criada.status(), await criada.text()).toBe(201);
    return (await criada.json()) as { id: string; preparation: { id: string; status: string } | null };
  }
  const travessia = await registrar("Travessia E2E", "ORGANIZED_CROSSING", "open-water");
  const outra = await registrar("Torneio E2E", "COMPETITION", "swim");

  // Ricardo assume o acompanhamento da travessia.
  await loginComo(page, PROFESSOR_3);
  const preps = (await (await page.request.get("/api/preparations")).json()) as Array<{ id: string; version: number; role: string }>;
  const prep = preps.find((item) => item.id === travessia.preparation?.id);
  expect(prep, "depende do acompanhamento Ricardo ↔ Maria").toBeTruthy();
  const assumida = await page.request.post(`/api/preparations/${prep!.id}`, { data: { action: "assume", expectedVersion: prep!.version } });
  expect(assumida.ok(), await assumida.text()).toBe(true);

  // Maria registra o resultado da travessia pela aba Resultados; a outra prova: não largou.
  await maria.goto(`/app/eventos/${travessia.id}?aba=resultados`);
  const form = maria.getByTestId("participation-result-form");
  await form.getByLabel("Situação do resultado").selectOption("FINISHED");
  await form.getByLabel("Tempo relatado").fill("1:02:30");
  await form.getByLabel("Sua percepção").fill(`boa orientação nas boias ${RUN}`);
  await form.getByRole("button", { name: "Salvar resultado" }).click();
  await expect(form.getByRole("status")).toContainText("Resultado salvo", { timeout: 30_000 });
  await maria.reload();
  await expect(maria.getByTestId("result-status")).toHaveAttribute("data-status", "FINISHED");
  await expect(maria.getByTestId("result-reported")).toContainText("1:02:30");
  await expect(maria.getByTestId("goal-vs-result")).toContainText("Concluiu em 1:02:30 (relatado)");
  const dns = await maria.request.put(`/api/events/participations/${outra.id}/result`, { data: { status: "DNS" } });
  expect(dns.ok(), await dns.text()).toBe(true);
  await mariaContext.close();

  // Ricardo: vê o resultado e a percepção da aluna, registra o parecer e encerra.
  const mariaId = ((await (await page.request.get("/api/preparations")).json()) as Array<{ id: string; participation: { athleteId: string } }>)
    .find((item) => item.id === prep!.id)?.participation.athleteId;
  expect(mariaId).toBeTruthy();
  const base = `/professor/independente/atletas/${mariaId}/eventos`;
  await page.goto(`${base}/${travessia.id}`);
  await expect(page.getByTestId("coach-event-preparation")).toHaveAttribute("data-status", "REVIEW_PENDING", { timeout: 30_000 });
  await expect(page.getByTestId("result-reported")).toContainText("1:02:30");
  await expect(page.getByTestId("result-perception")).toContainText(`boa orientação nas boias ${RUN}`);
  const pareceres = page.getByTestId("preparation-reviews");
  await pareceres.getByRole("button", { name: "Revisar" }).click();
  const revisao = page.getByTestId("coach-review-form");
  await revisao.getByLabel("Observação técnica").fill(`Navegação consistente; manter foco na saída ${RUN}`);
  await revisao.getByLabel("Decisão").selectOption("KEEP");
  await revisao.getByRole("button", { name: "Salvar revisão" }).click();
  await expect(pareceres.getByTestId("coach-review-observation")).toContainText(`Navegação consistente; manter foco na saída ${RUN}`, { timeout: 30_000 });
  await pareceres.getByRole("button", { name: "Encerrar preparação" }).click();
  await page.getByRole("button", { name: "Confirmar encerramento" }).click();
  await expect(page.getByTestId("coach-event-preparation")).toHaveAttribute("data-status", "CLOSED", { timeout: 30_000 });

  // Lista de eventos: a outra prova mostra "Não largou".
  await page.goto(base);
  await expect(page.getByRole("link", { name: `Abrir evento Torneio E2E ${RUN}` })).toContainText("Não largou", { timeout: 30_000 });
});
