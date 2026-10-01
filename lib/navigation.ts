import type { MobileDockItem } from "@/components/mobile-dock-client";

export type NavIconName =
  | "dashboard"
  | "activities"
  | "integrations"
  | "reports"
  | "profile"
  | "security"
  | "overview"
  | "users"
  | "whatsapp"
  | "onboarding"
  // Escola module
  | "school"
  | "team"
  | "workout"
  | "calendar"
  | "requests"
  | "invites";

export type NavigationItem = {
  href: string;
  label: string;
  subtitle?: string;
  icon: NavIconName;
  /** Pending items behind this entry (SAM-26); omitted when there is nothing waiting. */
  badge?: number;
};

/**
 * Deriva os itens do mobile dock a partir da MESMA navegação usada na
 * sidebar do `AppShell`, para que dock e sidebar nunca fiquem
 * dessincronizados. `NavIconName` é um subconjunto de `MobileDockIconName`
 * (definido em `mobile-dock-client.tsx`), então o ícone é reaproveitado sem
 * cast.
 *
 * Vive em `lib/navigation.ts` (módulo plano, sem "use client") em vez de
 * `components/app-shell.tsx` porque Next.js trata todo export de um arquivo
 * "use client" como client reference — mesmo funções puras sem JSX/hooks não
 * podem ser chamadas diretamente de dentro de um Server Component (só
 * passadas como prop/renderizadas como componente). Como os layouts
 * (`app/app/layout.tsx`, `app/admin/layout.tsx`) são Server Components e
 * precisam CHAMAR esta função diretamente no corpo do componente, ela
 * precisa estar em um módulo sem essa diretiva.
 */
export function buildMobileDockItemsFromNavigation(navigation: readonly NavigationItem[]): MobileDockItem[] {
  return navigation.map((item) => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    matchPrefixes: [item.href],
    ...(item.badge ? { badge: item.badge } : {}),
  }));
}

export type RouteMatchable = {
  href: string;
  matchPrefixes?: readonly string[];
};

export function matchesRoutePrefix(pathname: string, candidate: string) {
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

/**
 * Index of the navigation item that owns `pathname`, or -1.
 *
 * Resolves by longest matching prefix so that a section base route cannot
 * also claim its children: on `/escola/<id>/membros` both `/escola/<id>`
 * (Painel) and `/escola/<id>/membros` match by prefix, and only the longer
 * one wins. Returning a single index — rather than letting each item decide
 * on its own — is what guarantees at most one active item.
 */
export function resolveActiveRouteIndex<T extends RouteMatchable>(
  pathname: string,
  items: readonly T[],
  isEligible?: (item: T, index: number) => boolean,
): number {
  let bestIndex = -1;
  let bestLength = -1;

  items.forEach((item, index) => {
    if (isEligible && !isEligible(item, index)) {
      return;
    }

    const candidates = item.matchPrefixes?.length ? item.matchPrefixes : [item.href];

    for (const candidate of candidates) {
      if (matchesRoutePrefix(pathname, candidate) && candidate.length > bestLength) {
        bestLength = candidate.length;
        bestIndex = index;
      }
    }
  });

  return bestIndex;
}
