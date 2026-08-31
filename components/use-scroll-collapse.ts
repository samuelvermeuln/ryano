import { useEffect, useState } from "react";

const DEFAULT_THRESHOLD = 24;
// Margem de tolerância (px) para variações mínimas de scrollY entre frames.
// Evita reagir a jitter de touch scroll no mobile ou a resíduos de
// compensação do navegador (scroll anchoring), que sem histerese causavam
// um loop de feedback: colapsar -> mudar altura -> scroll anchoring ajusta
// scrollY -> hook reage de novo -> expande/colapsa -> repete.
const DEFAULT_HYSTERESIS = 6;

type UseScrollCollapseOptions = {
  threshold?: number;
  hysteresis?: number;
  resetKey?: unknown;
};

/**
 * Observa a direção do scroll da janela e retorna se um elemento "compacto"
 * (header do app, mobile dock, etc.) deve encolher/esconder. Só é ativado
 * quando `enabled` é true — quando desabilitado o listener nem é registrado.
 *
 * Compartilhado entre `components/app-header.tsx` (header do app) e
 * `components/mobile-dock-client.tsx` (dock inferior mobile).
 */
export function useScrollCollapse(enabled: boolean, options?: UseScrollCollapseOptions) {
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const hysteresis = options?.hysteresis ?? DEFAULT_HYSTERESIS;
  const resetKey = options?.resetKey;
  const [collapsed, setCollapsed] = useState(false);

  // Sempre que `resetKey` mudar (ex.: pathname em uma navegação), volta ao
  // estado expandido imediatamente. `AppHeader`/`MobileDockClient` nunca
  // desmontam entre navegações (fazem parte do layout persistente), então
  // sem este reset um colapso induzido por scroll-anchoring durante o
  // carregamento de uma página (ex.: troca de loading.tsx pelo conteúdo
  // real em /app/perfil) ficaria "preso" indefinidamente na página seguinte.
  useEffect(() => {
    setCollapsed(false);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let lastScrollY = window.scrollY;
    let ticking = false;

    const handleScroll = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        const delta = currentScrollY - lastScrollY;

        if (currentScrollY < threshold) {
          setCollapsed(false);
        } else if (delta > hysteresis) {
          setCollapsed(true);
        } else if (delta < -hysteresis) {
          setCollapsed(false);
        }
        // se |delta| <= hysteresis, ignora ruído (não muda o estado).

        lastScrollY = currentScrollY;
        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [enabled, threshold, hysteresis]);

  return enabled ? collapsed : false;
}
