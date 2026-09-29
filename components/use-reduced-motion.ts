import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// jsdom (testes) não implementa `matchMedia`; sem ele a preferência é "sem redução".
function getMedia() {
  return typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
}

function subscribe(onChange: () => void) {
  const media = getMedia();
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

function getSnapshot() {
  return getMedia()?.matches ?? false;
}

// O servidor não conhece a preferência do usuário e sempre renderiza `false`.
function getServerSnapshot() {
  return false;
}

/**
 * `prefers-reduced-motion` seguro para hidratação. O `useReducedMotion` do
 * `motion/react` lê a preferência já no primeiro render do cliente; quem tem a
 * opção ligada hidrata com `true` contra um HTML gerado com `false`, e todo
 * `initial`/`style`/bloco condicional derivado dele diverge. Aqui a hidratação
 * usa o snapshot do servidor (`false`) e o React re-renderiza com o valor real
 * logo depois — quem consome precisa tolerar essa troca (props que só valem no
 * mount, como `initial`, não podem ser a única forma de chegar ao estado final).
 */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
