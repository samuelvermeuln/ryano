"use client";

import { useEffect, useState } from "react";
import { IconMoonStars, IconSunHigh } from "@tabler/icons-react";

import { DEFAULT_THEME, THEME_STORAGE_KEY, type ThemeName, isThemeName } from "@/lib/theme";

const THEME_EVENT_NAME = "ryvano-theme-change";

function getCurrentTheme(): ThemeName {
  if (typeof document === "undefined") {
    return DEFAULT_THEME;
  }

  const theme = document.documentElement.dataset.theme;
  return isThemeName(theme) ? theme : DEFAULT_THEME;
}

export function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}

  window.dispatchEvent(new CustomEvent(THEME_EVENT_NAME, { detail: theme }));
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const syncTheme = () => {
      setTheme(getCurrentTheme());
    };

    syncTheme();
    window.addEventListener(THEME_EVENT_NAME, syncTheme as EventListener);
    window.addEventListener("storage", syncTheme);

    return () => {
      window.removeEventListener(THEME_EVENT_NAME, syncTheme as EventListener);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={() => {
        const next = isLight ? "dark" : "light";
        applyTheme(next);
        setTheme(next);
      }}
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 text-foreground/84 transition hover:bg-white/10 hover:text-foreground ${compact ? "h-12 w-12 justify-center p-0" : "px-3.5 py-2.5 text-sm font-semibold"}`}
      aria-label={isLight ? "Ativar tema escuro" : "Ativar tema claro"}
      title={isLight ? "Ativar tema escuro" : "Ativar tema claro"}
    >
      {isLight ? <IconMoonStars size={20} /> : <IconSunHigh size={20} />}
      {!compact ? <span>{isLight ? "Escuro" : "Claro"}</span> : null}
    </button>
  );
}

export function ThemedWordmark({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const syncTheme = () => {
      setTheme(getCurrentTheme());
    };

    syncTheme();
    window.addEventListener(THEME_EVENT_NAME, syncTheme as EventListener);
    window.addEventListener("storage", syncTheme);

    return () => {
      window.removeEventListener(THEME_EVENT_NAME, syncTheme as EventListener);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  return (
    <img
      src={theme === "light" ? "/logo-principal.png" : "/logo-principal-branco.png"}
      alt="RYVANO"
      className={`${compact ? "h-8" : "h-10"} w-auto`}
      draggable={false}
    />
  );
}
