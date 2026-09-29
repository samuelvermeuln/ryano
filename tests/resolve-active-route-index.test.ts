import { describe, expect, it } from "vitest";

import { resolveActiveRouteIndex, type NavigationItem } from "@/lib/navigation";

// SAM-7: na sidebar da Escola, "Painel" (`/escola/<id>`) e "Membros"
// (`/escola/<id>/membros`) casavam os dois por prefixo, destacando dois itens
// ao mesmo tempo. A regra é: só o prefixo mais longo vence.
const schoolId = "cmue80z3v003kod8dpb6yt51b";

const schoolNavigation: NavigationItem[] = [
  { href: `/escola/${schoolId}`, label: "Painel", icon: "overview" },
  { href: `/escola/${schoolId}/membros`, label: "Membros", icon: "users" },
  { href: `/escola/${schoolId}/professores`, label: "Professores", icon: "team" },
  { href: `/escola/${schoolId}/organograma`, label: "Organograma", icon: "overview" },
  { href: `/escola/${schoolId}/atletas`, label: "Atletas", icon: "school" },
  { href: `/escola/${schoolId}/turmas`, label: "Turmas", icon: "team" },
  { href: `/escola/${schoolId}/solicitacoes`, label: "Solicitações", icon: "requests" },
  { href: `/escola/${schoolId}/convites`, label: "Convites", icon: "invites" },
  { href: `/escola/${schoolId}/marketplace`, label: "Marketplace", icon: "workout" },
];

function activeLabel(pathname: string, navigation: NavigationItem[] = schoolNavigation) {
  const index = resolveActiveRouteIndex(pathname, navigation);
  return index === -1 ? null : navigation[index].label;
}

describe("resolveActiveRouteIndex", () => {
  it("marca Painel na rota-base da escola", () => {
    expect(activeLabel(`/escola/${schoolId}`)).toBe("Painel");
  });

  it("marca a seção, e não o Painel, em cada subseção da escola", () => {
    for (const item of schoolNavigation.slice(1)) {
      expect(activeLabel(item.href)).toBe(item.label);
    }
  });

  it("mantém a seção ativa em rotas filhas", () => {
    expect(activeLabel(`/escola/${schoolId}/membros/abc123`)).toBe("Membros");
    expect(activeLabel(`/escola/${schoolId}/membros/abc123/editar`)).toBe("Membros");
    expect(activeLabel(`/escola/${schoolId}/atletas/xyz/treinos`)).toBe("Atletas");
  });

  it("nunca resolve mais de um item ativo", () => {
    const pathnames = [
      `/escola/${schoolId}`,
      ...schoolNavigation.slice(1).map((item) => item.href),
      `/escola/${schoolId}/membros/abc123/editar`,
    ];

    for (const pathname of pathnames) {
      const matching = schoolNavigation.filter((_, index) => index === resolveActiveRouteIndex(pathname, schoolNavigation));
      expect(matching, pathname).toHaveLength(1);
    }
  });

  it("não deixa prefixo parcial de segmento vazar para outra seção", () => {
    // "/escola/<id>/turmas" não pode ativar um item "/escola/<id>/turma".
    const navigation: NavigationItem[] = [
      { href: "/escola/x/turma", label: "Turma", icon: "team" },
      { href: "/escola/x/turmas", label: "Turmas", icon: "team" },
    ];

    expect(activeLabel("/escola/x/turmas", navigation)).toBe("Turmas");
    expect(activeLabel("/escola/x/turma", navigation)).toBe("Turma");
  });

  it("retorna -1 quando nenhum item corresponde", () => {
    expect(resolveActiveRouteIndex("/app/perfil", schoolNavigation)).toBe(-1);
  });

  it("respeita o filtro de elegibilidade", () => {
    const index = resolveActiveRouteIndex(
      `/escola/${schoolId}/membros`,
      schoolNavigation,
      (item) => !item.href.endsWith("/membros"),
    );

    expect(index).toBe(0);
  });
});
