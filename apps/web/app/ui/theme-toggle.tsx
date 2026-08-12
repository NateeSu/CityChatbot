"use client";

import { useTheme, themeAriaLabel } from "./theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, cycleTheme } = useTheme();
  const icon = theme === "light" ? "☾" : theme === "dark" ? "◐" : "☼";
  return (
    <button aria-label={themeAriaLabel(theme)} className={`cc-theme-toggle ${className}`.trim()} data-theme-control="true" onClick={cycleTheme} type="button">
      <span aria-hidden="true">{icon}</span>
      <span className="cc-sr-only">ธีมปัจจุบัน: {theme === "light" ? "สว่าง" : theme === "dark" ? "มืด" : "คอนทราสต์สูง"}</span>
    </button>
  );
}
