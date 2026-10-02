// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { AthleteHubShell, athleteHubHref } from "@/app/professor/_athlete-hub/athlete-hub-shell";
import { hubCrumb, INDEPENDENT_SCOPE, schoolScope } from "@/app/professor/_athlete-hub/hub-scope";

/**
 * SAM-11 — the athlete hub's chrome.
 *
 * What is under test is the navigation contract, since the tabs are how the whole
 * feature is reached: each section keeps its own address (so a screen can be
 * shared and the back button works), the active one is marked for assistive
 * technology, and the header states who is responsible — an administrator must not
 * be led to believe they can prescribe.
 *
 * No `next/navigation` mock is needed: the shell takes the active section as a
 * prop instead of reading the pathname, which is also what keeps it a Server
 * Component.
 */
const ATHLETE = { id: "athlete-1", name: "Ana Souza", email: "ana@example.com", image: null };

afterEach(() => {
  cleanup();
});

function renderShell(overrides: Record<string, unknown> = {}) {
  return render(
    <AthleteHubShell
      scope={schoolScope("school-1")}
      athlete={ATHLETE}
      teams={["Turma A"]}
      currentCoach={{ coachId: "coach-1", name: "Prof. Carlos" }}
      isResponsibleCoach
      active="resumo"
      {...overrides}
    >
      <p>conteúdo</p>
    </AthleteHubShell>,
  );
}

describe("athleteHubHref", () => {
  it("builds the address of each section from the ids, never a hard-coded path", () => {
    const s1 = schoolScope("s1");
    expect(athleteHubHref(s1, "a1", "resumo")).toBe("/professor/s1/atletas/a1");
    expect(athleteHubHref(s1, "a1", "treinos")).toBe("/professor/s1/atletas/a1/treinos");
    expect(athleteHubHref(s1, "a1", "atividades")).toBe("/professor/s1/atletas/a1/atividades");
    expect(athleteHubHref(s1, "a1", "analise")).toBe("/professor/s1/atletas/a1/analise");
    expect(athleteHubHref(s1, "a1", "ficha-tecnica")).toBe("/professor/s1/atletas/a1/ficha-tecnica");
    expect(athleteHubHref(s1, "a1", "historico")).toBe("/professor/s1/atletas/a1/historico");
  });

  // SAM-30 — the independent hub is the same chrome under its own prefix.
  it("addresses the independent hub under /professor/independente", () => {
    expect(athleteHubHref(INDEPENDENT_SCOPE, "a1", "resumo")).toBe("/professor/independente/atletas/a1");
    expect(athleteHubHref(INDEPENDENT_SCOPE, "a1", "treinos")).toBe("/professor/independente/atletas/a1/treinos");
    expect(hubCrumb(INDEPENDENT_SCOPE)).toEqual({ href: "/professor/independente/atletas", label: "Meus atletas" });
    expect(hubCrumb(schoolScope("s1"))).toEqual({ href: "/professor/s1/atletas", label: "Meus atletas" });
  });
});

describe("AthleteHubShell — navegação entre seções", () => {
  it("offers every section as a real link, so each screen has its own address", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Seções do atleta" });

    for (const [label, href] of [
      ["Resumo", "/professor/school-1/atletas/athlete-1"],
      ["Treinos", "/professor/school-1/atletas/athlete-1/treinos"],
      ["Atividades", "/professor/school-1/atletas/athlete-1/atividades"],
      ["Análise", "/professor/school-1/atletas/athlete-1/analise"],
      ["Ficha técnica", "/professor/school-1/atletas/athlete-1/ficha-tecnica"],
      ["Histórico", "/professor/school-1/atletas/athlete-1/historico"],
    ] as const) {
      expect(within(nav).getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    }
  });

  it("marks only the active section with aria-current", () => {
    renderShell({ active: "analise" });
    const nav = screen.getByRole("navigation", { name: "Seções do atleta" });

    expect(within(nav).getByRole("link", { name: "Análise" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Resumo" }).getAttribute("aria-current")).toBeNull();
  });

  it("links back to the roster of the same school", () => {
    renderShell();
    const breadcrumb = screen.getByRole("navigation", { name: "Trilha de navegação" });

    expect(within(breadcrumb).getByRole("link", { name: "Meus atletas" }).getAttribute("href"))
      .toBe("/professor/school-1/atletas");
  });
});

describe("AthleteHubShell — quem é o responsável", () => {
  it("tells the responsible coach that they are", () => {
    renderShell();

    expect(screen.getByText("Você é o professor responsável")).toBeTruthy();
  });

  it("names the responsible coach when the reader is somebody else", () => {
    renderShell({ isResponsibleCoach: false });

    expect(screen.getByText("Responsável: Prof. Carlos")).toBeTruthy();
    expect(screen.queryByText("Você é o professor responsável")).toBeNull();
  });

  it("says so when nobody is responsible, instead of leaving the question open", () => {
    renderShell({ isResponsibleCoach: false, currentCoach: null });

    expect(screen.getByText("Sem professor responsável")).toBeTruthy();
  });

  it("shows the actions it is given and omits the area entirely when there are none", () => {
    const { container } = renderShell({ actions: <button type="button">Prescrever treino</button> });
    expect(screen.getByRole("button", { name: "Prescrever treino" })).toBeTruthy();

    cleanup();
    renderShell({ actions: undefined });
    expect(screen.queryByRole("button", { name: "Prescrever treino" })).toBeNull();
    expect(container).toBeTruthy();
  });
});

describe("AthleteHubShell — identidade do atleta", () => {
  it("falls back to the email when the athlete has no name", () => {
    renderShell({ athlete: { ...ATHLETE, name: null } });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ana@example.com");
  });

  it("states the absence of a team rather than rendering an empty row", () => {
    renderShell({ teams: [] });

    expect(screen.getByText("Sem turma")).toBeTruthy();
  });

  it("labels the independent hub instead of talking about teams, and links back to it", () => {
    renderShell({ scope: INDEPENDENT_SCOPE, teams: [] });

    expect(screen.getByText("Acompanhamento independente")).toBeTruthy();
    expect(screen.queryByText("Sem turma")).toBeNull();
    // SAM-35 — the independent roster is its own "Meus atletas" list.
    const breadcrumb = screen.getByRole("navigation", { name: "Trilha de navegação" });
    expect(within(breadcrumb).getByRole("link", { name: "Meus atletas" }).getAttribute("href"))
      .toBe("/professor/independente/atletas");
  });

  it("lists every team the athlete belongs to", () => {
    renderShell({ teams: ["Turma A", "Turma B"] });

    expect(screen.getByText("Turma A")).toBeTruthy();
    expect(screen.getByText("Turma B")).toBeTruthy();
  });
});
