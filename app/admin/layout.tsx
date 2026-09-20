import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { MobileDock } from "@/components/mobile-dock";
import { buildMobileDockItemsFromNavigation } from "@/lib/navigation";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireAdmin } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Painel",
  description: "Painel de administração da ryvano.",
  path: "/admin",
});

const navigation = [
  { href: "/admin", label: "Painel", subtitle: "Resumo geral", icon: "overview" as const },
  { href: "/admin/usuarios", label: "Usuários", subtitle: "Configuração e status", icon: "users" as const },
  { href: "/admin/escolas", label: "Escolas", subtitle: "Gerenciar escolas", icon: "school" as const },
  { href: "/admin/professores", label: "Professores", subtitle: "Perfis de coach", icon: "team" as const },
  { href: "/admin/whatsapp", label: "WhatsApp", subtitle: "Conexão e QR Code", icon: "whatsapp" as const },
  { href: "/admin/integracoes", label: "Integrações", subtitle: "Conexões e eventos", icon: "integrations" as const },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();

  return (
    <AppShell
      mode="admin"
      navigation={navigation}
      userName={user.name ?? user.email}
      userImage={user.image}
      mobileDock={
        <MobileDock
          variant="custom"
          items={buildMobileDockItemsFromNavigation(navigation)}
          user={{ name: user.name ?? user.email, image: user.image }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
