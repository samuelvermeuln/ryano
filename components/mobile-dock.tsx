import { getAuthenticatedRedirectPath, getPublicSession } from "@/server/auth-guards";

import { MobileDockClient, type MobileDockItem } from "@/components/mobile-dock-client";

type MobileDockProps =
  | {
      variant: "public";
    }
  | {
      variant: "custom";
      items: readonly MobileDockItem[];
      user?: {
        name?: string | null;
        image?: string | null;
      } | null;
    };

export async function MobileDock(props: MobileDockProps) {
  if (props.variant === "custom") {
    return <MobileDockClient items={props.items} user={props.user} />;
  }

  const session = await getPublicSession();
  const appHref = getAuthenticatedRedirectPath(session);

  let items: readonly MobileDockItem[];

  if (appHref === "/admin") {
    // Replica os itens da sidebar de `app/admin/layout.tsx` (navigation) —
    // mantidos sincronizados manualmente aqui porque este componente roda
    // fora do `AppShell` (sem acesso direto ao array `navigation` do layout).
    items = [
      { href: "/admin", label: "Painel", icon: "overview", matchPrefixes: ["/admin"] },
      { href: "/admin/usuarios", label: "Usuários", icon: "users", matchPrefixes: ["/admin/usuarios"] },
      { href: "/admin/whatsapp", label: "WhatsApp", icon: "whatsapp", matchPrefixes: ["/admin/whatsapp"] },
      { href: "/admin/integracoes", label: "Integrações", icon: "integrations", matchPrefixes: ["/admin/integracoes"] },
    ] as const;
  } else if (appHref === "/onboarding") {
    items = [
      { href: "/onboarding", label: "Config.", icon: "onboarding", matchPrefixes: ["/onboarding"] },
      { href: "#veja-na-pratica", label: "Demo", icon: "activities", kind: "anchor" },
      { href: "#modalidades", label: "Modalidades", icon: "evolution", kind: "anchor" },
      { href: "/entrar?modo=cadastro", label: "Conta", icon: "profile" },
    ] as const;
  } else if (appHref?.startsWith("/app/") || appHref === "/app/dashboard") {
    // Replica os itens da sidebar de `app/app/layout.tsx` (navigation) — ver
    // nota acima sobre a duplicação intencional dos dados estáticos.
    items = [
      { href: "/app/dashboard", label: "Dashboard", icon: "dashboard", matchPrefixes: ["/app", "/app/dashboard"] },
      { href: "/app/atividades", label: "Atividades", icon: "activities", matchPrefixes: ["/app/atividades"] },
      { href: "/app/integracoes", label: "Integrações", icon: "integrations", matchPrefixes: ["/app/integracoes"] },
      { href: "/app/perfil", label: "Perfil", icon: "profile", matchPrefixes: ["/app/perfil"] },
      { href: "/app/seguranca", label: "Segurança", icon: "security", matchPrefixes: ["/app/seguranca"] },
    ] as const;
  } else {
    items = [
      { href: "#top", label: "Home", icon: "home", kind: "anchor" },
      { href: "#veja-na-pratica", label: "Exemplo", icon: "activities", kind: "anchor" },
      { href: "#modalidades", label: "Evolução", icon: "evolution", kind: "anchor" },
      { href: "/entrar?modo=cadastro", label: "Perfil", icon: "profile" },
    ] as const;
  }

  return <MobileDockClient items={items} user={session?.user ?? null} />;
}
