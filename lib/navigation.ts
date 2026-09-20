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
  }));
}
