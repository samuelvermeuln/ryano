import { cache } from "react";
import { cookies } from "next/headers";

import { prisma } from "@/server/db";
import { isSchoolModuleEnabled } from "@/modules/school/config/feature-flag";
import { isMarketplaceEnabled } from "@/modules/school/config/marketplace-feature-flag";
import {
  ATHLETE_CONTEXT,
  USER_CONTEXT_COOKIE,
  parseContextPreference,
  resolveActiveContext,
  resolveLandingRoute,
  schoolContextKey,
  sortContexts,
  type ContextPreference,
  type NavigationFlags,
  type NavigationScope,
  type UserContext,
} from "@/lib/user-context";

/**
 * SAM-14 — resolução de contexto no servidor.
 *
 * Os contextos vêm das relações que já existem no domínio; nada aqui cria um
 * segundo sistema de roles. O cookie é só preferência: é lido aqui e
 * confrontado com a lista real a cada request (`resolveActiveContext`).
 * Visibilidade de menu continua sendo UX — toda rota/ação protegida mantém a
 * própria validação de membership/ownership no backend.
 */

/**
 * Contextos que a conta realmente possui.
 *
 * - Atleta: sempre. É a experiência pessoal (dashboard, atividades, wearables)
 *   de qualquer conta — decisão registrada em SAM-14.
 * - Professor: existe `CoachProfile` (1:1 com `User`). O status (PENDING,
 *   ACTIVE, SUSPENDED) é tratado pelas próprias telas do professor.
 * - Escola: uma entrada por `SchoolMembership` ACTIVE com papel OWNER/ADMIN em
 *   escola ACTIVE.
 */
export const listUserContexts = cache(async (userId: string): Promise<UserContext[]> => {
  if (!isSchoolModuleEnabled()) return [ATHLETE_CONTEXT];

  const [adminMemberships, coachProfile] = await Promise.all([
    prisma.schoolMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
        school: { status: "ACTIVE" },
        roles: { some: { role: { in: ["OWNER", "ADMIN"] } } },
      },
      select: { schoolId: true, school: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.coachProfile.findUnique({
      where: { userId },
      select: { id: true, displayName: true, status: true },
    }),
  ]);

  const contexts: UserContext[] = [ATHLETE_CONTEXT];

  if (coachProfile) {
    contexts.push({
      type: "PROFESSOR",
      key: "professor",
      coachId: coachProfile.id,
      displayName: coachProfile.displayName,
      status: coachProfile.status,
    });
  }

  for (const membership of adminMemberships) {
    contexts.push({
      type: "SCHOOL",
      key: schoolContextKey(membership.schoolId),
      schoolId: membership.schoolId,
      schoolName: membership.school.name,
    });
  }

  return sortContexts(contexts);
});

export async function readContextPreference(): Promise<ContextPreference | null> {
  const store = await cookies();
  const raw = store.get(USER_CONTEXT_COOKIE)?.value;
  // `cookies().set` percent-encoda o valor (`school:x` → `school%3Ax`); a
  // leitura nem sempre desfaz. Decodificar é seguro: valores sem `%` ficam iguais.
  return parseContextPreference(safeDecode(raw));
}

function safeDecode(value: string | undefined) {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type UserContextState = {
  contexts: UserContext[];
  active: UserContext;
  /** Preferência salva no cookie (validada só na forma). `null` quando não há. */
  preference: ContextPreference | null;
};

/**
 * Estado completo para um layout: contextos disponíveis + contexto ativo.
 * `impliedKey` é o contexto implicado pelo recurso da rota (ex.: layout de
 * `/escola/<id>` passa `school:<id>`); se o usuário não o possui, cai no
 * cookie/prioridade — quem nega o acesso ao recurso continua sendo o layout.
 */
export async function getUserContextState(
  userId: string,
  impliedKey?: string | null,
): Promise<UserContextState> {
  const [contexts, preference] = await Promise.all([listUserContexts(userId), readContextPreference()]);
  const active = resolveActiveContext(contexts, { impliedKey, preferredKey: preference?.key });
  // `contexts` nunca é vazio (Atleta sempre entra), então `active` nunca é null.
  return { contexts, active: active ?? ATHLETE_CONTEXT, preference };
}

/**
 * Escopo lembrado do professor (última escola aberta), para que as páginas
 * compartilhadas mantenham a sidebar do painel daquela escola. Revalidado: se
 * o vínculo acabou, volta ao hub. Só navegação — o layout de
 * `/professor/<id>` continua sendo quem autoriza o acesso.
 */
export async function resolveRememberedProfessorScope(
  context: UserContext,
  preference: ContextPreference | null,
): Promise<{ scope: NavigationScope; scopeLabel: string | null }> {
  if (context.type !== "PROFESSOR" || !preference?.professorSchoolId) {
    return { scope: { kind: "default" }, scopeLabel: null };
  }

  const membership = await prisma.coachSchoolMembership.findFirst({
    where: {
      coachId: context.coachId,
      schoolId: preference.professorSchoolId,
      status: "ACTIVE",
      endedAt: null,
      school: { status: "ACTIVE" },
    },
    select: { schoolId: true, school: { select: { name: true } } },
  });
  if (!membership) return { scope: { kind: "default" }, scopeLabel: null };

  return { scope: { kind: "professor-school", schoolId: membership.schoolId }, scopeLabel: membership.school.name };
}

/** Landing pós-login/fallback seguro para a conta, respeitando a preferência válida. */
export async function resolveUserLandingRoute(userId: string): Promise<string> {
  const [contexts, preference] = await Promise.all([listUserContexts(userId), readContextPreference()]);
  return resolveLandingRoute(contexts, preference?.key);
}

export function getNavigationFlags(): NavigationFlags {
  return { schoolEnabled: isSchoolModuleEnabled(), marketplaceEnabled: isMarketplaceEnabled() };
}
