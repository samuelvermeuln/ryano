// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_THEME, THEME_STORAGE_KEY, getThemeInitScript } from "@/lib/theme";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

// Requisito 5.1: DEFAULT_THEME precisa ser "light".
describe("DEFAULT_THEME", () => {
  it('é "light"', () => {
    expect(DEFAULT_THEME).toBe("light");
  });
});

// Requisitos 5.2, 5.3, 5.4: a lógica de prioridade do Inicializador de Tema
// (Preferência de Tema Salva > DEFAULT_THEME) não deve mudar com a troca do
// valor da constante — só o padrão final deve virar "light". O script
// gerado por `getThemeInitScript` é executado de fato (via `new Function`)
// contra um `document`/`localStorage` reais do jsdom, em vez de apenas
// inspecionar a string, para exercitar o mesmo código que roda no
// navegador.
function runThemeInitScript() {
  const script = getThemeInitScript();
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(script)();
}

describe("getThemeInitScript — prioridade entre Preferência de Tema Salva e DEFAULT_THEME", () => {
  it("aplica DEFAULT_THEME (light) quando não há Preferência de Tema Salva", () => {
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    runThemeInitScript();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it('aplica "dark" quando a Preferência de Tema Salva é "dark", mesmo com DEFAULT_THEME = "light"', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    runThemeInitScript();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it('aplica "light" quando a Preferência de Tema Salva é "light"', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    runThemeInitScript();

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("cai em DEFAULT_THEME (light) quando o valor salvo é inválido", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "not-a-theme");

    runThemeInitScript();

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
