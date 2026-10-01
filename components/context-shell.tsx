import type { ReactNode } from "react";

import { ActiveContextSync } from "@/components/active-context-sync";
import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { NotificationsBell } from "@/components/notifications-bell";
import { NotificationService } from "@/modules/shared/notifications";
import { prisma } from "@/server/db";
import { buildMobileDockItemsFromNavigation } from "@/lib/navigation";
import {
  buildAccountMenuItems,
  buildContextNavigation,
  serializeContextPreference,
  summarizeContext,
  type NavigationScope,
  type UserContext,
} from "@/lib/user-context";
import {
  getNavigationCounts,
  getNavigationFlags,
  getUserContextState,
  resolveRememberedProfessorScope,
} from "@/server/user-context";

type ContextShellProps = {
  user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  /**
   * Contexto implicado pelo recurso da rota (`school:<id>` em `/escola/<id>`,
   * `professor` em `/professor/*`, `athlete` em rotas do atleta). Omitido nas
   * páginas compartilhadas, que herdam o contexto ativo (cookie/prioridade).
   */
  impliedKey?: UserContext["key"] | null;
  /**
   * Escopo do recurso dentro do contexto (painel de uma escola). Omitido nas
   * páginas compartilhadas: aí o escopo lembrado do professor é reaproveitado.
   */
  scope?: NavigationScope;
  /** Rótulo do recurso dentro do contexto (nome da escola no painel do professor). */
  scopeLabel?: string | null;
  children: ReactNode;
};

/**
 * SAM-14 — o único ponto que monta shell + sidebar + dock + header a partir do
 * contexto. Todos os layouts autenticados (Atleta, Professor, Escola e as
 * páginas compartilhadas de `/app`) passam por aqui, então não existem três
 * cópias de navegação nem um shell "genérico" que trate todo mundo como atleta.
 *
 * Autorização NÃO acontece aqui: cada layout continua validando membership/
 * ownership antes de renderizar este componente.
 */
export async function ContextShell({ user, impliedKey, scope, scopeLabel, children }: ContextShellProps) {
  const { contexts, active, preference } = await getUserContextState(user.id, impliedKey);

  const resolvedScope = scope
    ? { scope, scopeLabel: scopeLabel ?? null }
    : await resolveRememberedProfessorScope(active, preference);

  // SAM-26 — pendências do contexto ativo viram badge no item que as resolve.
  // SAM-29 — notificações são da conta, não do contexto: o sino soma todas.
  // A falha ao contar (banco sem a tabela ainda, hiccup de rede) não pode
  // derrubar o shell de todas as telas: o sino só fica sem badge.
  const [counts, unreadNotifications] = await Promise.all([
    getNavigationCounts(active, resolvedScope.scope),
    new NotificationService(prisma).countUnread(user.id).catch(() => 0),
  ]);
  const navigation = buildContextNavigation(active, getNavigationFlags(), resolvedScope.scope, counts);
  const userName = user.name ?? user.email ?? "Usuário";

  // O que fica lembrado: o contexto ativo e, para o professor, a escola aberta.
  const preferenceToRemember = serializeContextPreference({
    key: active.key,
    professorSchoolId:
      active.type === "PROFESSOR" && resolvedScope.scope.kind === "professor-school"
        ? resolvedScope.scope.schoolId
        : null,
  });
  const savedPreference = preference ? serializeContextPreference(preference) : null;

  return (
    <AppShell
      mode="app"
      navigation={navigation}
      userName={userName}
      userImage={user.image}
      context={{
        active: summarizeContext(active),
        available: contexts.map(summarizeContext),
        scopeLabel: resolvedScope.scopeLabel,
      }}
      accountMenuItems={buildAccountMenuItems()}
      headerExtra={<NotificationsBell initialUnread={unreadNotifications} />}
      mobileDock={
        <MobileDock
          variant="custom"
          items={buildMobileDockItemsFromNavigation(navigation)}
          user={{ name: user.name ?? user.email, image: user.image }}
        />
      }
    >
      <ActiveContextSync contextKey={preferenceToRemember} savedKey={savedPreference} />
      {children}
    </AppShell>
  );
}
