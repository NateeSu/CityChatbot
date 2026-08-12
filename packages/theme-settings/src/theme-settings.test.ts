import { describe, expect, it } from "vitest";

import {
  InMemoryThemeSettingsRepository,
  SYNTHETIC_THEME_ADMIN_ACCOUNT_ID,
  SYNTHETIC_THEME_STAFF_ACCOUNT_ID,
  SYNTHETIC_THEME_TENANT_ID,
  chooseReadableForeground,
  contrastRatio,
  safeDefaultThemeSettings,
  validateThemeConfig,
} from "./theme-settings";

const admin = { tenantId: SYNTHETIC_THEME_TENANT_ID, accountId: SYNTHETIC_THEME_ADMIN_ACCOUNT_ID, role: "TENANT_ADMIN" as const };
const staff = { tenantId: SYNTHETIC_THEME_TENANT_ID, accountId: SYNTHETIC_THEME_STAFF_ACCOUNT_ID, role: "STAFF" as const };

describe("theme settings", () => {
  it("passes the default contrast gate for every canonical mode", () => {
    const result = validateThemeConfig(safeDefaultThemeSettings());
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(15);
    expect(result.failures).toEqual([]);
  });

  it("chooses a readable foreground for on-brand controls", () => {
    expect(chooseReadableForeground("#000000")).toBe("#ffffff");
    expect(chooseReadableForeground("#ffffff")).toBe("#000000");
    expect(contrastRatio("#ffffff", "#006b73")).toBeGreaterThan(4.5);
  });

  it("rejects an unsafe external/data asset path", () => {
    const result = validateThemeConfig({ ...safeDefaultThemeSettings(), logoAssetPath: "data:text/html,unsafe" });
    expect(result.passed).toBe(false);
    expect(result.failures.join(" ")).toContain("logoAssetPath");
  });

  it("blocks publish when a text or control pair fails the contrast gate", () => {
    const config = safeDefaultThemeSettings();
    config.modes.light.textPrimary = "#ffffff";
    expect(validateThemeConfig(config).passed).toBe(false);
    const repository = new InMemoryThemeSettingsRepository();
    const draft = repository.createDraft(admin, { config, reason: "contrast negative case", idempotencyKey: "contrast-draft-001" });
    expect(() => repository.publish(admin, draft.id, "contrast-publish-001", "must block invalid contrast")).toThrow(/CONTRAST_GATE_FAILED/u);
  });

  it("publishes atomically and restores a prior version without cross-tenant reads", () => {
    const repository = new InMemoryThemeSettingsRepository();
    const draft = repository.createDraft(admin, { config: { brandName: "CityChatbot A" }, reason: "new brand", idempotencyKey: "theme-draft-001" });
    const published = repository.publish(admin, draft.id, "theme-publish-001", "publish new brand");
    expect(published.state).toBe("PUBLISHED");
    expect(repository.snapshot(admin).versions.some((item) => item.state === "SUPERSEDED")).toBe(true);
    const prior = repository.snapshot(admin).versions.find((item) => item.version === 1);
    expect(prior).toBeDefined();
    const restored = repository.rollback(admin, prior!.id, "theme-rollback-001", "restore certified safe default");
    expect(restored.version).toBe(1);
    expect(restored.state).toBe("PUBLISHED");
    expect(() => repository.snapshot({ ...admin, tenantId: "00000000-0000-4000-8000-000000000002" })).toThrow(/FORBIDDEN/u);
  });

  it("permits staff read but denies staff mutation", () => {
    const repository = new InMemoryThemeSettingsRepository();
    expect(repository.snapshot(staff).published?.state).toBe("PUBLISHED");
    expect(() => repository.createDraft(staff, { config: {}, reason: "not allowed", idempotencyKey: "staff-theme-001" })).toThrow(/FORBIDDEN/u);
  });
});
