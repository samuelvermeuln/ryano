import type { NavigationItem } from "@/lib/navigation";

/**
 * SAM-14 — fonte única de contexto do usuário.
 *
 * Três conceitos separados, de propósito:
 *
 * - **Identidade** (`User`): a conta autenticada. Não muda durante a navegação.
 * - **Contextos disponíveis**: derivados das relações reais do domínio
 *   (`SchoolMembership` OWNER/ADMIN → Escola; `CoachProfile` → Professor;
 *   Atleta é a experiência pessoal de qualquer conta). Nunca do `enum Role`
 *   de autenticação nem do pathname.
 * - **Contexto ativo**: qual experiência (shell, navegação, header, dock) está
 *   sendo renderizada agora. Persistido em cookie e REVALIDADO a cada request
 *   contra os contextos disponíveis — um contexto salvo que deixou de existir
 *   é ignorado, nunca herdado.
 *
 * Este módulo é puro (sem Prisma, sem `next/headers`) para ser testável; a
 * leitura do banco e do cookie vive em `server/user-context.ts`.
 *
 * Regra fundamental: **a rota não define quem o usuário é**. A rota define o
 * recurso acessado; quando o recurso pertence a um contexto (ex.: `/escola/<id>`)
 * ele *implica* esse contexto, mas páginas compartilhadas (`/app/perfil`,
 * `/app/seguranca`, `/app/integracoes`) são renderizadas dentro do contexto
 * ativo, sem trocar a persona.
 */

export type UserContextType = "ATHLETE" | "PROFESSOR" | "SCHOOL";

export type AthleteContext = { type: "ATHLETE"; key: "athlete" };
export type ProfessorContext = {
  type: "PROFESSOR";
  key: "professor";
  coachId: string;
  displayName: string;
  status: string;
};
export type SchoolContext = {
  type: "SCHOOL";
  key: `school:${string}`;
  schoolId: string;
  schoolName: string;
};

export type UserContext = AthleteContext | ProfessorContext | SchoolContext;
export type UserContextKey = UserContext["key"];

/** Nome do cookie que lembra o último contexto escolhido. Preferência, nunca autorização. */
export const USER_CONTEXT_COOKIE = "ryvano-context";

export const ATHLETE_CONTEXT: AthleteContext = { type: "ATHLETE", key: "athlete" };

export function schoolContextKey(schoolId: string): SchoolContext["key"] {
  return `school:${schoolId}`;
}

/**
 * Valida a forma de uma chave vinda de fora (cookie, form). Só a forma: se o
 * contexto realmente pertence ao usuário é decidido por `resolveActiveContext`.
 */
export function parseUserContextKey(raw: string | null | undefined): UserContextKey | null {
  if (!raw) return null;
  if (raw === "athlete" || raw === "professor") return raw;
  if (raw.startsWith("school:") && /^school:[A-Za-z0-9_-]+$/.test(raw)) {
    return raw as SchoolContext["key"];
  }
  return null;
}

/**
 * Preferência persistida = contexto + escopo opcional. O professor é UM
 * contexto (CoachProfile é 1:1 com User), mas trabalha dentro de uma escola
 * por vez; lembrar a última escola mantém a sidebar do painel dela nas páginas
 * compartilhadas ("Professor com múltiplas escolas mantém escola correta").
 *
 * Formas aceitas: `athlete` | `professor` | `professor:<schoolId>` | `school:<schoolId>`.
 */
export type ContextPreference = { key: UserContextKey; professorSchoolId: string | null };

export function parseContextPreference(raw: string | null | undefined): ContextPreference | null {
  if (!raw) return null;
  const professorScoped = /^professor:([A-Za-z0-9_-]+)$/.exec(raw);
  if (professorScoped) return { key: "professor", professorSchoolId: professorScoped[1] };
  const key = parseUserContextKey(raw);
  return key ? { key, professorSchoolId: null } : null;
}

export function serializeContextPreference(preference: ContextPreference): string {
  return preference.key === "professor" && preference.professorSchoolId
    ? `professor:${preference.professorSchoolId}`
    : preference.key;
}

export function findContext(contexts: readonly UserContext[], key: string | null | undefined) {
  if (!key) return null;
  return contexts.find((context) => context.key === key) ?? null;
}

/** Ordem de desempate quando nada foi escolhido: Escola > Professor > Atleta. */
const CONTEXT_PRIORITY: Record<UserContextType, number> = { SCHOOL: 0, PROFESSOR: 1, ATHLETE: 2 };

export function sortContexts(contexts: readonly UserContext[]): UserContext[] {
  return [...contexts].sort((a, b) => {
    const byType = CONTEXT_PRIORITY[a.type] - CONTEXT_PRIORITY[b.type];
    return byType !== 0 ? byType : contextLabel(a).localeCompare(contextLabel(b), "pt-BR");
  });
}

/**
 * Decide o contexto ativo. Precedência:
 *
 * 1. `impliedKey` — o recurso da rota pertence a um contexto (`/escola/<id>`
 *    implica `school:<id>`); só vale se o usuário realmente o possui.
 * 2. `preferredKey` — cookie/preferência persistida, revalidada aqui.
 * 3. prioridade Escola > Professor > Atleta.
 *
 * Retorna `null` apenas quando a lista está vazia, o que o resolver do servidor
 * nunca produz (Atleta está sempre disponível).
 */
export function resolveActiveContext(
  contexts: readonly UserContext[],
  options: { impliedKey?: string | null; preferredKey?: string | null } = {},
): UserContext | null {
  return (
    findContext(contexts, options.impliedKey) ??
    findContext(contexts, options.preferredKey) ??
    sortContexts(contexts)[0] ??
    null
  );
}

export function contextLandingRoute(context: UserContext): string {
  switch (context.type) {
    case "SCHOOL":
      return `/escola/${context.schoolId}`;
    case "PROFESSOR":
      return "/professor";
    case "ATHLETE":
      return "/app/dashboard";
  }
}

/** Rota da tela de escolha de contexto (usuário multi-contexto sem preferência válida). */
export const CONTEXT_PICKER_ROUTE = "/contexto";

/**
 * Landing pós-login/pós-onboarding — uma regra só, no lugar dos redirects
 * independentes que existiam em `/entrar`, no dashboard e nos layouts.
 *
 * - um único contexto → entra direto;
 * - vários e preferência válida → reutiliza;
 * - vários sem preferência → seletor de contexto (decisão de produto: o
 *   usuário multi-contexto escolhe explicitamente).
 */
export function resolveLandingRoute(
  contexts: readonly UserContext[],
  preferredKey?: string | null,
): string {
  if (contexts.length === 1) return contextLandingRoute(contexts[0]);
  const preferred = findContext(contexts, preferredKey);
  if (preferred) return contextLandingRoute(preferred);
  if (contexts.length === 0) return "/app/dashboard";
  return CONTEXT_PICKER_ROUTE;
}

export function contextLabel(context: UserContext): string {
  switch (context.type) {
    case "SCHOOL":
      return context.schoolName;
    case "PROFESSOR":
      return "Professor";
    case "ATHLETE":
      return "Atleta";
  }
}

export function contextKindLabel(context: UserContext): string {
  switch (context.type) {
    case "SCHOOL":
      return "Escola";
    case "PROFESSOR":
      return "Professor";
    case "ATHLETE":
      return "Atleta";
  }
}

/** Resumo serializável do contexto para o shell (client component). */
export type UserContextSummary = {
  key: UserContextKey;
  type: UserContextType;
  label: string;
  kind: string;
  landing: string;
};

export function summarizeContext(context: UserContext): UserContextSummary {
  return {
    key: context.key,
    type: context.type,
    label: contextLabel(context),
    kind: contextKindLabel(context),
    landing: contextLandingRoute(context),
  };
}

export type NavigationFlags = {
  schoolEnabled: boolean;
  marketplaceEnabled: boolean;
};

/**
 * Escopo do recurso dentro do contexto. O contexto diz "quem"; o escopo diz
 * "qual recurso": o painel do professor em uma escola, ou o painel do atleta
 * em uma escola, têm navegação própria sem deixarem de ser o mesmo contexto.
 */
export type NavigationScope =
  | { kind: "default" }
  | { kind: "professor-school"; schoolId: string }
  | { kind: "athlete-school"; schoolId: string };

const DEFAULT_SCOPE: NavigationScope = { kind: "default" };

/**
 * Configuração central de navegação por contexto. Alimenta sidebar desktop,
 * mobile dock e links do header — a mesma lista, sem cópias.
 *
 * Perfil/Segurança/Integrações são da *pessoa* (pendem de `User`): entram na
 * sidebar só do Atleta e, nos demais contextos, ficam no menu do usuário
 * (`buildAccountMenuItems`). Os nomes abaixo são inventário das rotas que
 * existem — nada aqui aponta para tela inexistente.
 */
export function buildContextNavigation(
  context: UserContext,
  flags: NavigationFlags,
  scope: NavigationScope = DEFAULT_SCOPE,
): NavigationItem[] {
  switch (context.type) {
    case "SCHOOL": {
      const base = `/escola/${context.schoolId}`;
      return [
        { href: base, label: "Painel", subtitle: "Visão geral", icon: "overview" },
        { href: `${base}/membros`, label: "Membros", subtitle: "Papéis e status", icon: "users" },
        { href: `${base}/professores`, label: "Professores", subtitle: "Equipe de coaching", icon: "team" },
        { href: `${base}/organograma`, label: "Organograma", subtitle: "Estrutura da escola", icon: "overview" },
        { href: `${base}/atletas`, label: "Atletas", subtitle: "Gerenciar atletas", icon: "school" },
        { href: `${base}/turmas`, label: "Turmas", subtitle: "Grupos e equipes", icon: "team" },
        { href: `${base}/solicitacoes`, label: "Solicitações", subtitle: "Pendentes e aprovadas", icon: "requests" },
        { href: `${base}/convites`, label: "Convites", subtitle: "Links de convite", icon: "invites" },
        ...(flags.marketplaceEnabled
          ? [{ href: `${base}/marketplace`, label: "Marketplace", subtitle: "Produtos e vendas", icon: "workout" as const }]
          : []),
      ];
    }

    case "PROFESSOR": {
      if (scope.kind === "professor-school") {
        const base = `/professor/${scope.schoolId}`;
        return [
          { href: base, label: "Dashboard", subtitle: "Visão geral", icon: "overview" },
          { href: `${base}/atletas`, label: "Meus atletas", subtitle: "Acompanhamento", icon: "users" },
          { href: `${base}/treinos`, label: "Treinos", subtitle: "Prescrições", icon: "workout" },
          { href: `${base}/turmas`, label: "Turmas", subtitle: "Grupos", icon: "team" },
          ...(flags.marketplaceEnabled
            ? [{ href: `${base}/marketplace`, label: "Minhas vendas", subtitle: "Marketplace", icon: "workout" as const }]
            : []),
          { href: "/professor", label: "Minhas escolas", subtitle: "Trocar de escola", icon: "school" },
        ];
      }

      return [
        { href: "/professor", label: "Painel do professor", subtitle: "Escolas e contextos", icon: "overview" },
        ...(flags.marketplaceEnabled
          ? [
              { href: "/professor/estudio/produtos", label: "Meus produtos", subtitle: "O que você vende", icon: "workout" as const },
              { href: "/professor/acompanhar/planos", label: "Acompanhamentos", subtitle: "Planos de alunos", icon: "calendar" as const },
            ]
          : []),
        { href: "/professor/buscar-escola", label: "Vincular escola", subtitle: "Encontrar uma escola", icon: "school" },
        { href: "/professor/independente", label: "Coach independente", subtitle: "Convites diretos", icon: "invites" },
      ];
    }

    case "ATHLETE": {
      if (scope.kind === "athlete-school") {
        const base = `/atleta/${scope.schoolId}`;
        return [
          { href: base, label: "Painel", subtitle: "Resumo", icon: "overview" },
          { href: `${base}/calendario`, label: "Calendário", subtitle: "Meus treinos", icon: "workout" },
          { href: `${base}/historico`, label: "Histórico", subtitle: "Compartilhamento", icon: "reports" },
        ];
      }

      return [
        { href: "/app/dashboard", label: "Dashboard", subtitle: "Resumo e alertas", icon: "dashboard" },
        { href: "/app/atividades", label: "Atividades", subtitle: "Histórico e detalhe", icon: "activities" },
        ...(flags.schoolEnabled
          ? [
              { href: "/app/treinos", label: "Treinos", subtitle: "Calendário de treinos", icon: "calendar" as const },
              { href: "/app/escola", label: "Escolas", subtitle: "Encontrar uma escola", icon: "school" as const },
              { href: "/app/professor", label: "Professores", subtitle: "Encontrar um professor", icon: "team" as const },
            ]
          : []),
        ...(flags.marketplaceEnabled
          ? [{ href: "/app/planos", label: "Meus planos", subtitle: "Planos do marketplace", icon: "calendar" as const }]
          : []),
        { href: "/app/integracoes", label: "Integrações", subtitle: "Garmin e WhatsApp", icon: "integrations" },
        { href: "/app/perfil", label: "Perfil", subtitle: "Dados pessoais", icon: "profile" },
        { href: "/app/seguranca", label: "Segurança", subtitle: "Senha e sessão", icon: "security" },
      ];
    }
  }
}

export type AccountMenuItem = { href: string; label: string };

/**
 * Itens do menu do usuário (avatar). Iguais em todo contexto: são funções da
 * identidade, não do papel.
 */
export function buildAccountMenuItems(): AccountMenuItem[] {
  return [
    { href: "/app/perfil", label: "Minha conta" },
    { href: "/app/seguranca", label: "Segurança" },
    { href: "/app/integracoes", label: "Integrações" },
  ];
}
