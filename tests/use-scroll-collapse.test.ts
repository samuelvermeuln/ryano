// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useScrollCollapse } from "@/components/use-scroll-collapse";

afterEach(() => {
  window.scrollY = 0;
});

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { value, writable: true, configurable: true });
}

// O hook usa `window.requestAnimationFrame` para agrupar a leitura de
// `window.scrollY` — em jsdom o rAF ainda é assíncrono (implementado via
// timer interno), então esperamos o próximo frame explicitamente para que
// o estado do hook já reflita a nova posição de scroll antes de checarmos.
function dispatchScroll() {
  return act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

// `useScrollCollapse` é o hook compartilhado por trás do comportamento
// visual da faixa do WhatsApp/padding do AppHeader e da ocultação do mobile
// dock ao rolar — testado isoladamente aqui (determinístico, sem depender de
// animação em jsdom).
describe("useScrollCollapse", () => {
  it("começa como collapsed=false (scrollY inicial = 0)", () => {
    const { result } = renderHook(() => useScrollCollapse(true));

    expect(result.current).toBe(false);
  });

  it("não escuta o scroll quando enabled=false (fica sempre false)", async () => {
    const { result } = renderHook(() => useScrollCollapse(false));

    setScrollY(80);
    await dispatchScroll();

    expect(result.current).toBe(false);
  });

  it("colapsa (true) ao rolar para baixo além do limiar de 24px", async () => {
    const { result } = renderHook(() => useScrollCollapse(true));

    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();

    expect(result.current).toBe(true);
  });

  it("expande (false) ao rolar para cima depois de ter colapsado", async () => {
    const { result } = renderHook(() => useScrollCollapse(true));

    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();
    expect(result.current).toBe(true);

    setScrollY(50);
    await dispatchScroll();

    expect(result.current).toBe(false);
  });

  it("volta a expandir (false) perto do topo (scrollY < 24px), mesmo tendo colapsado antes", async () => {
    const { result } = renderHook(() => useScrollCollapse(true));

    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();
    expect(result.current).toBe(true);

    setScrollY(10);
    await dispatchScroll();

    expect(result.current).toBe(false);
  });

  // Regressão do bug de tremor/scroll travado no mobile: scroll anchoring do
  // navegador (disparado pela faixa do WhatsApp mudando de altura) gerava
  // pequenas variações de scrollY (jitter) que, sem histerese, faziam o hook
  // alternar collapsed rapidamente entre true/false — o que mudava a altura
  // de novo e realimentava o loop. Com a margem de 6px, deltas pequenos
  // (< 6px) devem ser ignorados e o estado deve ficar estável.
  it("não oscila (flip-flop) com pequenas variações de scrollY dentro da margem de histerese (40 -> 42 -> 39 -> 43)", async () => {
    const { result } = renderHook(() => useScrollCollapse(true));

    // Primeiro estabelece um estado colapsado com uma rolagem real para baixo.
    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();
    expect(result.current).toBe(true);

    // Agora simula o jitter: variações de poucos pixels, todas dentro da
    // margem de histerese (6px), a partir de scrollY = 80.
    setScrollY(82);
    await dispatchScroll();
    expect(result.current).toBe(true);

    setScrollY(79);
    await dispatchScroll();
    expect(result.current).toBe(true);

    setScrollY(83);
    await dispatchScroll();
    expect(result.current).toBe(true);

    setScrollY(80);
    await dispatchScroll();
    expect(result.current).toBe(true);
  });

  // Regressão do bug "quebra o scroll e a mobile dock" no carregamento de
  // /app/perfil: como `AppHeader`/`MobileDockClient` nunca desmontam entre
  // navegações, um colapso induzido por scroll-anchoring durante o
  // carregamento de uma página ficava "preso" indefinidamente na página
  // seguinte. `resetKey` (ex.: pathname) permite que os consumidores forcem
  // o reset do estado ao trocar de rota, sem depender de um novo evento de
  // scroll.
  it("reseta collapsed para false imediatamente quando resetKey muda (ex.: navegação de rota)", async () => {
    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) => useScrollCollapse(true, { resetKey }),
      { initialProps: { resetKey: "/pagina-a" } },
    );

    setScrollY(40);
    await dispatchScroll();
    setScrollY(80);
    await dispatchScroll();
    expect(result.current).toBe(true);

    rerender({ resetKey: "/pagina-b" });

    expect(result.current).toBe(false);
  });

  // Defesa em profundidade (Parte 2 da correção do bug de scroll travado em
  // /app/perfil): mesmo que `overflow-anchor: none` no seletor universal já
  // deva eliminar a causa raiz, um salto implausível de scrollY em um único
  // frame (> 150px) não deve ser interpretado como rolagem real do usuário.
  it("ignora um salto implausível de scrollY (> 150px em um único frame) e não colapsa", async () => {
    const { result } = renderHook(() => useScrollCollapse(true));

    // Estabelece um lastScrollY inicial baixo, abaixo do threshold (24px),
    // então collapsed permanece false.
    setScrollY(10);
    await dispatchScroll();
    expect(result.current).toBe(false);

    // Salto implausível: delta de 390px (400 - 10), muito acima do limite.
    setScrollY(400);
    await dispatchScroll();

    expect(result.current).toBe(false);

    // Depois do salto ignorado, uma rolagem real e gradual a partir do novo
    // scrollY (delta de 30px, dentro do plausível) deve voltar a funcionar
    // normalmente e colapsar.
    setScrollY(430);
    await dispatchScroll();

    expect(result.current).toBe(true);
  });

  it("aceita threshold/hysteresis customizados", async () => {
    const { result } = renderHook(() => useScrollCollapse(true, { threshold: 10, hysteresis: 2 }));

    setScrollY(20);
    await dispatchScroll();
    setScrollY(25);
    await dispatchScroll();

    expect(result.current).toBe(true);

    setScrollY(5);
    await dispatchScroll();

    expect(result.current).toBe(false);
  });
});
