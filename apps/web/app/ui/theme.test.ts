import { describe, expect, it } from "vitest";

import { getThemeStorageKey, nextTheme, parseThemeName, sanitizeTenantTheme, themeAriaLabel } from "./theme";

describe("shared theme contract", () => {
  it("accepts only the canonical three theme names", () => {
    expect(parseThemeName("light")).toBe("light");
    expect(parseThemeName("dark")).toBe("dark");
    expect(parseThemeName("high-contrast")).toBe("high-contrast");
    expect(parseThemeName("neon")).toBe("light");
    expect(parseThemeName(undefined, "dark")).toBe("dark");
  });

  it("cycles themes in the canonical order", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("high-contrast");
    expect(nextTheme("high-contrast")).toBe("light");
  });

  it("scopes persisted previews and exposes Thai accessible labels", () => {
    expect(getThemeStorageKey("tenant:demo")).toBe("citychatbot:theme:v1:tenant%3Ademo");
    expect(getThemeStorageKey("tenant/demo")).toBe("citychatbot:theme:v1:global");
    expect(themeAriaLabel("light")).toContain("มืด");
    expect(themeAriaLabel("dark")).toContain("คอนทราสต์");
  });

  it("allows only safe tenant color token overrides", () => {
    expect(sanitizeTenantTheme({ primary: "#075da6", accent: "#0d8068", primaryHover: "red", accentContrast: "url(javascript:alert(1))" })).toEqual({
      "--cc-primary": "#075da6",
      "--cc-accent": "#0d8068",
    });
  });
});
