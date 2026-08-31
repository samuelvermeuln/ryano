export const THEME_STORAGE_KEY = "ryvano-theme";
export const DEFAULT_THEME = "light" as const;
export const AVAILABLE_THEMES = ["dark", "light"] as const;

export type ThemeName = (typeof AVAILABLE_THEMES)[number];

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && AVAILABLE_THEMES.includes(value as ThemeName);
}

export function getThemeInitScript() {
  return `(() => {
    const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
    const defaultTheme = ${JSON.stringify(DEFAULT_THEME)};
    const isValidTheme = (value) => value === 'dark' || value === 'light';

    try {
      const stored = window.localStorage.getItem(storageKey);
      const theme = isValidTheme(stored) ? stored : defaultTheme;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      document.documentElement.dataset.theme = defaultTheme;
      document.documentElement.style.colorScheme = defaultTheme;
    }
  })();`;
}
