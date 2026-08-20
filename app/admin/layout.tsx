import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { buildNoIndexMetadata } from "@/server/seo";
import { requireAdmin } from "@/server/auth-guards";

export const metadata = buildNoIndexMetadata({
  title: "Admin",
  description: "Área administrativa da RYANO.",
  path: "/admin",
});

const navigation = [
  { href: "/admin", label: "Overview", subtitle: "KPIs e visão geral", icon: "overview" as const },
  { href: "/admin/usuarios", label: "Usuários", subtitle: "Onboarding e status", icon: "users" as const },
  { href: "/admin/whatsapp", label: "WhatsApp", subtitle: "Evolution e QR", icon: "whatsapp" as const },
  { href: "/admin/integracoes", label: "Integrações", subtitle: "Saúde e erros", icon: "integrations" as const },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();

  return (
    <AppShell mode="admin" navigation={navigation} userName={user.name ?? user.email}>
      {children}
    </AppShell>
  );
}
