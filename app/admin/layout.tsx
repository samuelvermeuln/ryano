import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/server/auth-guards";

const navigation = [
  { href: "/admin", label: "Overview", subtitle: "KPIs e visão geral" },
  { href: "/admin/usuarios", label: "Usuários", subtitle: "Onboarding e status" },
  { href: "/admin/whatsapp", label: "WhatsApp", subtitle: "Evolution e QR" },
  { href: "/admin/integracoes", label: "Integrações", subtitle: "Saúde e erros" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();

  return (
    <AppShell mode="admin" navigation={navigation} userName={user.name ?? user.email}>
      {children}
    </AppShell>
  );
}
