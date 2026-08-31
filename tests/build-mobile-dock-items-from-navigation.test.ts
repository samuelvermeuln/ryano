import { describe, expect, it } from "vitest";

import { buildMobileDockItemsFromNavigation, type NavigationItem } from "@/lib/navigation";

// Garante que o dock derive automaticamente da mesma navegação usada na
// sidebar (`AppShell`), sem lista duplicada — regressão do bug em que a
// sidebar e o dock tinham quantidades de itens diferentes.
describe("buildMobileDockItemsFromNavigation", () => {
  it("mapeia cada NavigationItem para um MobileDockItem, preservando ordem, href, label e icon", () => {
    const navigation: readonly NavigationItem[] = [
      { href: "/app/dashboard", label: "Dashboard", subtitle: "Resumo e alertas", icon: "dashboard" },
      { href: "/app/atividades", label: "Atividades", subtitle: "Histórico e detalhe", icon: "activities" },
      { href: "/app/integracoes", label: "Integrações", subtitle: "Garmin e WhatsApp", icon: "integrations" },
      { href: "/app/perfil", label: "Perfil", subtitle: "Dados pessoais", icon: "profile" },
      { href: "/app/seguranca", label: "Segurança", subtitle: "Senha e sessão", icon: "security" },
    ];

    const items = buildMobileDockItemsFromNavigation(navigation);

    expect(items).toHaveLength(navigation.length);
    items.forEach((item, index) => {
      const source = navigation[index];
      expect(item.href).toBe(source.href);
      expect(item.label).toBe(source.label);
      expect(item.icon).toBe(source.icon);
      expect(item.matchPrefixes).toEqual([source.href]);
    });
  });

  it("retorna array vazio para navegação vazia", () => {
    expect(buildMobileDockItemsFromNavigation([])).toEqual([]);
  });
});
