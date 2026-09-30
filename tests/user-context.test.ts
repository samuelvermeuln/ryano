import { describe, expect, it } from "vitest";

import { resolveActiveRouteIndex } from "@/lib/navigation";
import {
  ATHLETE_CONTEXT,
  buildAccountMenuItems,
  buildContextNavigation,
  contextLandingRoute,
  parseContextPreference,
  parseUserContextKey,
  resolveActiveContext,
  resolveLandingRoute,
  schoolContextKey,
  serializeContextPreference,
  sortContexts,
  summarizeContext,
  type UserContext,
} from "@/lib/user-context";

// SAM-14 — regras centrais de contexto: quais contextos existem, qual está
// ativo, para onde cada um leva e qual navegação recebe. Cobre combinações, não
// só o caminho feliz.

const alpha: UserContext = { type: "SCHOOL", key: schoolContextKey("alpha"), schoolId: "alpha", schoolName: "Escola Alpha" };
const beta: UserContext = { type: "SCHOOL", key: schoolContextKey("beta"), schoolId: "beta", schoolName: "Escola Beta" };
const professor: UserContext = { type: "PROFESSOR", key: "professor", coachId: "coach_1", displayName: "Carlos", status: "ACTIVE" };

const allFlags = { schoolEnabled: true, marketplaceEnabled: true };

describe("parseUserContextKey", () => {
  it("accepts only well-formed keys", () => {
    expect(parseUserContextKey("athlete")).toBe("athlete");
    expect(parseUserContextKey("professor")).toBe("professor");
    expect(parseUserContextKey("school:cmue80z3v003kod8dpb6yt51b")).toBe("school:cmue80z3v003kod8dpb6yt51b");
  });

  it("rejects garbage, injection-looking values and unknown types", () => {
    expect(parseUserContextKey(null)).toBeNull();
    expect(parseUserContextKey("")).toBeNull();
    expect(parseUserContextKey("admin")).toBeNull();
    expect(parseUserContextKey("school:")).toBeNull();
    expect(parseUserContextKey("school:a/b")).toBeNull();
    expect(parseUserContextKey("school:<script>")).toBeNull();
  });
});

describe("parseContextPreference / serializeContextPreference", () => {
  it("round-trips the professor school scope and plain keys", () => {
    expect(parseContextPreference("professor:alpha")).toEqual({ key: "professor", professorSchoolId: "alpha" });
    expect(parseContextPreference("professor")).toEqual({ key: "professor", professorSchoolId: null });
    expect(parseContextPreference("school:alpha")).toEqual({ key: "school:alpha", professorSchoolId: null });
    expect(serializeContextPreference({ key: "professor", professorSchoolId: "alpha" })).toBe("professor:alpha");
    expect(serializeContextPreference({ key: "athlete", professorSchoolId: "alpha" })).toBe("athlete");
  });

  it("rejects malformed scopes", () => {
    expect(parseContextPreference("professor:")).toBeNull();
    expect(parseContextPreference("professor:a/b")).toBeNull();
    expect(parseContextPreference("athlete:alpha")).toBeNull();
  });
});

describe("resolveActiveContext", () => {
  const contexts = [ATHLETE_CONTEXT, professor, alpha, beta];

  it("prefers the context implied by the route resource", () => {
    expect(resolveActiveContext(contexts, { impliedKey: "school:beta", preferredKey: "professor" })).toBe(beta);
  });

  it("falls back to the saved preference when the route is shared", () => {
    expect(resolveActiveContext(contexts, { preferredKey: "professor" })).toBe(professor);
  });

  it("ignores an implied or saved key the user does not own (revoked/foreign school)", () => {
    expect(resolveActiveContext(contexts, { impliedKey: "school:gamma", preferredKey: "school:delta" })).toBe(alpha);
  });

  it("uses the priority order Escola > Professor > Atleta with no hints", () => {
    expect(resolveActiveContext([ATHLETE_CONTEXT, professor])).toBe(professor);
    expect(resolveActiveContext([ATHLETE_CONTEXT, professor, beta])).toBe(beta);
    expect(resolveActiveContext([ATHLETE_CONTEXT])).toBe(ATHLETE_CONTEXT);
  });

  it("returns null only for an empty list", () => {
    expect(resolveActiveContext([])).toBeNull();
  });
});

describe("sortContexts", () => {
  it("orders by type and then by label, without mutating the input", () => {
    const input = [ATHLETE_CONTEXT, beta, professor, alpha];
    const sorted = sortContexts(input);
    expect(sorted.map((context) => context.key)).toEqual(["school:alpha", "school:beta", "professor", "athlete"]);
    expect(input[0]).toBe(ATHLETE_CONTEXT);
  });
});

describe("resolveLandingRoute", () => {
  it("enters directly with a single context", () => {
    expect(resolveLandingRoute([ATHLETE_CONTEXT])).toBe("/app/dashboard");
    expect(resolveLandingRoute([professor])).toBe("/professor");
    expect(resolveLandingRoute([alpha])).toBe("/escola/alpha");
  });

  it("reuses a valid preference when there are several contexts", () => {
    expect(resolveLandingRoute([ATHLETE_CONTEXT, alpha], "athlete")).toBe("/app/dashboard");
    expect(resolveLandingRoute([ATHLETE_CONTEXT, alpha], "school:alpha")).toBe("/escola/alpha");
  });

  it("shows the picker when there are several contexts and no valid preference", () => {
    expect(resolveLandingRoute([ATHLETE_CONTEXT, alpha])).toBe("/contexto");
    expect(resolveLandingRoute([ATHLETE_CONTEXT, alpha], "school:revoked")).toBe("/contexto");
  });

  it("never leaves the user without a destination", () => {
    expect(resolveLandingRoute([])).toBe("/app/dashboard");
  });
});

describe("contextLandingRoute / summarizeContext", () => {
  it("maps each context to its landing and a serializable summary", () => {
    expect(contextLandingRoute(alpha)).toBe("/escola/alpha");
    expect(summarizeContext(alpha)).toEqual({
      key: "school:alpha",
      type: "SCHOOL",
      label: "Escola Alpha",
      kind: "Escola",
      landing: "/escola/alpha",
    });
    expect(summarizeContext(professor).label).toBe("Professor");
    expect(summarizeContext(ATHLETE_CONTEXT).kind).toBe("Atleta");
  });
});

describe("buildContextNavigation", () => {
  it("gives the athlete only athlete modules — no school/professor administration", () => {
    const labels = buildContextNavigation(ATHLETE_CONTEXT, allFlags).map((item) => item.label);
    expect(labels).toEqual([
      "Dashboard",
      "Atividades",
      "Treinos",
      "Escolas",
      "Professores",
      "Meus planos",
      "Integrações",
      "Perfil",
      "Segurança",
    ]);
    expect(labels).not.toContain("Minha escola");
    expect(labels).not.toContain("Painel do professor");
  });

  it("hides flag-gated athlete modules when the flags are off", () => {
    const labels = buildContextNavigation(ATHLETE_CONTEXT, { schoolEnabled: false, marketplaceEnabled: false }).map(
      (item) => item.label,
    );
    expect(labels).toEqual(["Dashboard", "Atividades", "Integrações", "Perfil", "Segurança"]);
  });

  it("gives the school only school modules, scoped to that school", () => {
    const items = buildContextNavigation(alpha, allFlags);
    expect(items.map((item) => item.label)).toEqual([
      "Painel",
      "Membros",
      "Professores",
      "Organograma",
      "Atletas",
      "Turmas",
      "Solicitações",
      "Convites",
      "Marketplace",
    ]);
    expect(items.every((item) => item.href.startsWith("/escola/alpha"))).toBe(true);
    expect(items.map((item) => item.label)).not.toContain("Dashboard");
  });

  it("does not put personal pages (Perfil/Segurança/Integrações) in the professor or school sidebar", () => {
    for (const context of [alpha, professor]) {
      const labels = buildContextNavigation(context, allFlags).map((item) => item.label);
      expect(labels).not.toContain("Perfil");
      expect(labels).not.toContain("Segurança");
      expect(labels).not.toContain("Integrações");
    }
  });

  it("scopes the professor navigation to the school panel and keeps a way back to the hub", () => {
    const items = buildContextNavigation(professor, allFlags, { kind: "professor-school", schoolId: "alpha" });
    expect(items.map((item) => item.label)).toEqual([
      "Dashboard",
      "Meus atletas",
      "Treinos",
      "Turmas",
      "Minhas vendas",
      "Minhas escolas",
    ]);
    expect(items.find((item) => item.label === "Minhas escolas")?.href).toBe("/professor");
  });

  it("gives the professor hub its own modules, gated by the marketplace flag", () => {
    const withMarketplace = buildContextNavigation(professor, allFlags).map((item) => item.label);
    expect(withMarketplace).toEqual([
      "Painel do professor",
      "Meus produtos",
      "Acompanhamentos",
      "Vincular escola",
      "Coach independente",
    ]);

    const without = buildContextNavigation(professor, { schoolEnabled: true, marketplaceEnabled: false }).map(
      (item) => item.label,
    );
    expect(without).toEqual(["Painel do professor", "Vincular escola", "Coach independente"]);
  });

  it("scopes the athlete navigation to a school panel under /atleta/<id>", () => {
    const items = buildContextNavigation(ATHLETE_CONTEXT, allFlags, { kind: "athlete-school", schoolId: "alpha" });
    expect(items.map((item) => item.href)).toEqual(["/atleta/alpha", "/atleta/alpha/calendario", "/atleta/alpha/historico"]);
  });

  it("keeps a single active item on shared and child routes (route matching)", () => {
    const school = buildContextNavigation(alpha, allFlags);
    expect(school[resolveActiveRouteIndex("/escola/alpha/membros/m1", school)].label).toBe("Membros");
    expect(school[resolveActiveRouteIndex("/escola/alpha", school)].label).toBe("Painel");
    // Página compartilhada dentro do shell da escola: nenhum item principal ativo,
    // e o shell continua sendo o da escola (a navegação não muda).
    expect(resolveActiveRouteIndex("/app/perfil", school)).toBe(-1);

    const athlete = buildContextNavigation(ATHLETE_CONTEXT, allFlags);
    expect(athlete[resolveActiveRouteIndex("/app/perfil", athlete)].label).toBe("Perfil");
  });
});

describe("buildAccountMenuItems", () => {
  it("exposes the identity pages in every context", () => {
    expect(buildAccountMenuItems().map((item) => item.href)).toEqual([
      "/app/perfil",
      "/app/seguranca",
      "/app/integracoes",
    ]);
  });
});
