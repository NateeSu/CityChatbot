"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const THEME_NAMES = ["light", "dark", "high-contrast"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const DEFAULT_THEME: ThemeName = "light";
export const THEME_STORAGE_PREFIX = "citychatbot:theme:v1";

export type TenantThemeTokens = Partial<{
  primary: string;
  primaryHover: string;
  accent: string;
  accentContrast: string;
}>;

const TENANT_TOKEN_PROPERTIES: Record<keyof TenantThemeTokens, string> = {
  primary: "--cc-primary",
  primaryHover: "--cc-primary-hover",
  accent: "--cc-accent",
  accentContrast: "--cc-accent-contrast",
};

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

export function parseThemeName(value: unknown, fallback: ThemeName = DEFAULT_THEME): ThemeName {
  return isThemeName(value) ? value : fallback;
}

export function nextTheme(theme: ThemeName): ThemeName {
  const index = THEME_NAMES.indexOf(theme);
  return THEME_NAMES[(index + 1) % THEME_NAMES.length] ?? DEFAULT_THEME;
}

export function getThemeStorageKey(scope = "global"): string {
  const safeScope = /^[a-zA-Z0-9._:-]{1,128}$/.test(scope) ? scope : "global";
  return `${THEME_STORAGE_PREFIX}:${encodeURIComponent(safeScope)}`;
}

export function themeAriaLabel(theme: ThemeName): string {
  if (theme === "light") return "เปลี่ยนเป็นโหมดมืด";
  if (theme === "dark") return "เปลี่ยนเป็นโหมดคอนทราสต์สูง";
  return "เปลี่ยนเป็นโหมดสว่าง";
}

export function isSafeTenantColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

export function sanitizeTenantTheme(tokens?: TenantThemeTokens): Record<string, string> {
  const safeTokens: Record<string, string> = {};
  if (!tokens) return safeTokens;

  for (const [token, property] of Object.entries(TENANT_TOKEN_PROPERTIES) as [keyof TenantThemeTokens, string][]) {
    const value = tokens[token];
    if (isSafeTenantColor(value)) safeTokens[property] = value;
  }
  return safeTokens;
}

type ThemeContextValue = {
  theme: ThemeName;
  hydrated: boolean;
  setTheme: (theme: ThemeName) => void;
  cycleTheme: () => void;
};

const defaultContext: ThemeContextValue = {
  theme: DEFAULT_THEME,
  hydrated: false,
  setTheme: () => undefined,
  cycleTheme: () => undefined,
};

const ThemeContext = createContext<ThemeContextValue>(defaultContext);

export function ThemeProvider({ children, storageScope = "global", tenantTokens }: { children: ReactNode; storageScope?: string; tenantTokens?: TenantThemeTokens }) {
  const storageKey = getThemeStorageKey(storageScope);
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        setThemeState(parseThemeName(window.localStorage.getItem(storageKey)));
      } catch {
        setThemeState(DEFAULT_THEME);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, [storageKey]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    document.body.dataset.theme = theme;

    const safeTokens = sanitizeTenantTheme(tenantTokens);
    for (const [property, value] of Object.entries(safeTokens)) root.style.setProperty(property, value);

    return () => {
      for (const property of Object.keys(safeTokens)) root.style.removeProperty(property);
    };
  }, [tenantTokens, theme]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // Private browsing and embedded webviews may deny storage. The in-memory
      // theme still remains usable for the current session.
    }
  }, [hydrated, storageKey, theme]);

  const setTheme = useCallback((next: ThemeName) => setThemeState(parseThemeName(next)), []);
  const cycleTheme = useCallback(() => setThemeState((current) => nextTheme(current)), []);
  const value = useMemo(() => ({ theme, hydrated, setTheme, cycleTheme }), [cycleTheme, hydrated, setTheme, theme]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
