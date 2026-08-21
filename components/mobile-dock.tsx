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
    items = [
      { href: "/app/dashboard", label: "Home", icon: "home", matchPrefixes: ["/app", "/app/dashboard"] },
      { href: "/app/atividades", label: "Atividades", icon: "activities", matchPrefixes: ["/app/atividades"] },
      { href: "/app/relatorios", label: "Evolução", icon: "evolution", matchPrefixes: ["/app/relatorios"] },
      { href: "/app/perfil", label: "Perfil", icon: "profile", matchPrefixes: ["/app/perfil"] },
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
