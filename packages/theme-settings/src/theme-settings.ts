import { createHash, randomUUID } from "node:crypto";

export const THEME_SETTINGS_KEY = "municipality-default";
export const THEME_MODES = ["light", "dark", "high-contrast"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const THEME_FONT_SCALES = ["DEFAULT", "LARGE"] as const;
export type ThemeFontScale = (typeof THEME_FONT_SCALES)[number];
export const THEME_DENSITIES = ["COMFORTABLE", "COMPACT"] as const;
export type ThemeDensity = (typeof THEME_DENSITIES)[number];
export const THEME_RADII = ["STANDARD", "SOFT"] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];

export const SYNTHETIC_THEME_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const SYNTHETIC_THEME_ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
export const SYNTHETIC_THEME_STAFF_ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";

export type ThemeModeTokens = {
  background: string;
  surface: string;
  surfaceSubtle: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  focusRing: string;
  primary: string;
  primaryHover: string;
  primaryContrast: string;
  accent: string;
  accentContrast: string;
  statusInfo: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
  statusNeutral: string;
};

export type ThemeSettingsConfig = {
  brandName: string;
  landmark: string;
  logoAssetPath?: string;
  fontScale: ThemeFontScale;
  density: ThemeDensity;
  radius: ThemeRadius;
  modes: Record<ThemeMode, ThemeModeTokens>;
};

export type ThemeSettingsConfigInput = Partial<Omit<ThemeSettingsConfig, "modes">> & {
  logoAssetPath?: string | null;
  modes?: Partial<Record<ThemeMode, Partial<ThemeModeTokens>>>;
};

export type ThemeSettingsState = "DRAFT" | "UNIT_APPROVED" | "PUBLISHED" | "SUPERSEDED" | "ROLLED_BACK";
export type ThemeCertificationStatus = "UNIT_APPROVED";

export type ThemeSettingsActor = {
  tenantId: string;
  accountId: string;
  role: "STAFF" | "TENANT_ADMIN";
};

export type ThemeSettingsVersion = {
  id: string;
  tenantId: string;
  settingsKey: typeof THEME_SETTINGS_KEY;
  version: number;
  state: ThemeSettingsState;
  certificationStatus?: ThemeCertificationStatus;
  config: ThemeSettingsConfig;
  configHash: string;
  createdBy: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type ThemeContrastCheck = {
  id: string;
  mode: ThemeMode;
  foreground: string;
  background: string;
  ratio: number;
  minimum: number;
  passed: boolean;
};

export type ThemeValidationResult = {
  passed: boolean;
  checks: readonly ThemeContrastCheck[];
  failures: readonly string[];
  normalizedConfig?: ThemeSettingsConfig;
};

export type ThemeSettingsAuditEntry = {
  id: string;
  tenantId: string;
  actorAccountId: string;
  action: "DRAFT_CREATED" | "DRAFT_UPDATED" | "VALIDATED" | "UNIT_AUTO_APPROVED" | "PUBLISHED" | "ROLLED_BACK";
  resourceId: string;
  reason: string;
  occurredAt: string;
};

export type ThemeSettingsSnapshot = {
  versions: readonly ThemeSettingsVersion[];
  published?: ThemeSettingsVersion;
  audit: readonly ThemeSettingsAuditEntry[];
};

export type ThemeSettingsInput = {
  config: ThemeSettingsConfigInput;
  reason: string;
  idempotencyKey: string;
};

export type ThemeSettingsErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_STATE"
  | "CONTRAST_GATE_FAILED"
  | "IDEMPOTENCY_CONFLICT";

export class ThemeSettingsError extends Error {
  constructor(public readonly code: ThemeSettingsErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ThemeSettingsError";
  }
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const ASSET_PATH_PATTERN = /^\/(?!\/)[^?#\s]{1,255}$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowIso = (): string => new Date().toISOString();

const assertText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || CONTROL_PATTERN.test(value)) {
    throw new ThemeSettingsError("VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
};

const assertColor = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) throw new ThemeSettingsError("VALIDATION_ERROR", `${field} must be a #RRGGBB color`);
  return value.toLowerCase();
};

const assertEnum = <T extends string>(value: unknown, field: string, values: readonly T[]): T => {
  if (typeof value !== "string" || !values.includes(value as T)) throw new ThemeSettingsError("VALIDATION_ERROR", `${field} is invalid`);
  return value as T;
};

const assertReason = (value: string): string => assertText(value, "reason", 2000);
const assertIdempotencyKey = (value: string): string => {
  if (typeof value !== "string" || value.length < 8 || value.length > 255 || CONTROL_PATTERN.test(value)) throw new ThemeSettingsError("VALIDATION_ERROR", "idempotencyKey is invalid");
  return value;
};

const hexChannel = (value: string): number => parseInt(value.slice(1), 16) / 255;
const linearChannel = (value: number): number => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const luminance = (value: string): number => {
  const red = linearChannel(hexChannel(value.slice(0, 3)) as number);
  const green = linearChannel(hexChannel(`#${value.slice(3, 5)}`));
  const blue = linearChannel(hexChannel(`#${value.slice(5, 7)}`));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

export const contrastRatio = (first: string, second: string): number => {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

export const chooseReadableForeground = (background: string): "#000000" | "#ffffff" => {
  const blackRatio = contrastRatio("#000000", background);
  const whiteRatio = contrastRatio("#ffffff", background);
  return blackRatio >= whiteRatio ? "#000000" : "#ffffff";
};

const defaultModes: Record<ThemeMode, ThemeModeTokens> = {
  light: {
    background: "#ffffff", surface: "#ffffff", surfaceSubtle: "#f4f8fb", surfaceElevated: "#ffffff",
    textPrimary: "#0f2742", textSecondary: "#52657a", border: "#d8e2ea", focusRing: "#0b6fea",
    primary: "#006b73", primaryHover: "#00555b", primaryContrast: "#ffffff", accent: "#0b5cad", accentContrast: "#ffffff",
    statusInfo: "#0b5cad", statusSuccess: "#177a4a", statusWarning: "#9a5700", statusDanger: "#b42318", statusNeutral: "#52657a",
  },
  dark: {
    background: "#071a2b", surface: "#0d253a", surfaceSubtle: "#102d45", surfaceElevated: "#15344d",
    textPrimary: "#f5f8fb", textSecondary: "#b8c7d5", border: "#315069", focusRing: "#ffd166",
    primary: "#82c4ff", primaryHover: "#b0dcff", primaryContrast: "#061521", accent: "#76e0c3", accentContrast: "#06221b",
    statusInfo: "#82c4ff", statusSuccess: "#7de5af", statusWarning: "#ffd27a", statusDanger: "#ff9b91", statusNeutral: "#b8c7d5",
  },
  "high-contrast": {
    background: "#000000", surface: "#000000", surfaceSubtle: "#1a1a1a", surfaceElevated: "#000000",
    textPrimary: "#ffffff", textSecondary: "#ffffff", border: "#ffffff", focusRing: "#00ffff",
    primary: "#ffdf00", primaryHover: "#fff19a", primaryContrast: "#000000", accent: "#72ffc4", accentContrast: "#000000",
    statusInfo: "#72d9ff", statusSuccess: "#72ffc4", statusWarning: "#ffe082", statusDanger: "#ff8a80", statusNeutral: "#ffffff",
  },
};

export const safeDefaultThemeSettings = (): ThemeSettingsConfig => ({
  brandName: "CityChatbot",
  landmark: "ศูนย์บริการประชาชน",
  logoAssetPath: undefined,
  fontScale: "DEFAULT",
  density: "COMFORTABLE",
  radius: "STANDARD",
  modes: clone(defaultModes),
});

const normalizeMode = (input: Partial<ThemeModeTokens> | undefined, current: ThemeModeTokens): ThemeModeTokens => {
  const source = input ?? {};
  const primary = assertColor(source.primary ?? current.primary, "primary");
  const accent = assertColor(source.accent ?? current.accent, "accent");
  return {
    background: assertColor(source.background ?? current.background, "background"),
    surface: assertColor(source.surface ?? current.surface, "surface"),
    surfaceSubtle: assertColor(source.surfaceSubtle ?? current.surfaceSubtle, "surfaceSubtle"),
    surfaceElevated: assertColor(source.surfaceElevated ?? current.surfaceElevated, "surfaceElevated"),
    textPrimary: assertColor(source.textPrimary ?? current.textPrimary, "textPrimary"),
    textSecondary: assertColor(source.textSecondary ?? current.textSecondary, "textSecondary"),
    border: assertColor(source.border ?? current.border, "border"),
    focusRing: assertColor(source.focusRing ?? current.focusRing, "focusRing"),
    primary,
    primaryHover: assertColor(source.primaryHover ?? current.primaryHover, "primaryHover"),
    primaryContrast: source.primaryContrast === undefined ? chooseReadableForeground(primary) : assertColor(source.primaryContrast, "primaryContrast"),
    accent,
    accentContrast: source.accentContrast === undefined ? chooseReadableForeground(accent) : assertColor(source.accentContrast, "accentContrast"),
    statusInfo: assertColor(source.statusInfo ?? current.statusInfo, "statusInfo"),
    statusSuccess: assertColor(source.statusSuccess ?? current.statusSuccess, "statusSuccess"),
    statusWarning: assertColor(source.statusWarning ?? current.statusWarning, "statusWarning"),
    statusDanger: assertColor(source.statusDanger ?? current.statusDanger, "statusDanger"),
    statusNeutral: assertColor(source.statusNeutral ?? current.statusNeutral, "statusNeutral"),
  };
};

export const normalizeThemeConfig = (input: ThemeSettingsConfigInput, current: ThemeSettingsConfig = safeDefaultThemeSettings()): ThemeSettingsConfig => {
  if (!input || typeof input !== "object") throw new ThemeSettingsError("VALIDATION_ERROR", "config is required");
  const logoAssetPath = input.logoAssetPath === null ? undefined : input.logoAssetPath === undefined ? current.logoAssetPath : input.logoAssetPath;
  if (logoAssetPath !== undefined && (typeof logoAssetPath !== "string" || !ASSET_PATH_PATTERN.test(logoAssetPath))) throw new ThemeSettingsError("VALIDATION_ERROR", "logoAssetPath must be a tenant-scoped relative asset path");
  const modes = {} as Record<ThemeMode, ThemeModeTokens>;
  for (const mode of THEME_MODES) modes[mode] = normalizeMode(input.modes?.[mode], current.modes[mode]);
  return {
    brandName: input.brandName === undefined ? current.brandName : assertText(input.brandName, "brandName", 80),
    landmark: input.landmark === undefined ? current.landmark : assertText(input.landmark, "landmark", 120),
    ...(logoAssetPath === undefined ? {} : { logoAssetPath }),
    fontScale: input.fontScale === undefined ? current.fontScale : assertEnum(input.fontScale, "fontScale", THEME_FONT_SCALES),
    density: input.density === undefined ? current.density : assertEnum(input.density, "density", THEME_DENSITIES),
    radius: input.radius === undefined ? current.radius : assertEnum(input.radius, "radius", THEME_RADII),
    modes,
  };
};

const checksForMode = (mode: ThemeMode, tokens: ThemeModeTokens): ThemeContrastCheck[] => [
  { id: "text-primary", mode, foreground: tokens.textPrimary, background: tokens.background, ratio: contrastRatio(tokens.textPrimary, tokens.background), minimum: 4.5, passed: contrastRatio(tokens.textPrimary, tokens.background) >= 4.5 },
  { id: "text-secondary", mode, foreground: tokens.textSecondary, background: tokens.background, ratio: contrastRatio(tokens.textSecondary, tokens.background), minimum: 4.5, passed: contrastRatio(tokens.textSecondary, tokens.background) >= 4.5 },
  { id: "primary-control", mode, foreground: tokens.primaryContrast, background: tokens.primary, ratio: contrastRatio(tokens.primaryContrast, tokens.primary), minimum: 4.5, passed: contrastRatio(tokens.primaryContrast, tokens.primary) >= 4.5 },
  { id: "accent-control", mode, foreground: tokens.accentContrast, background: tokens.accent, ratio: contrastRatio(tokens.accentContrast, tokens.accent), minimum: 4.5, passed: contrastRatio(tokens.accentContrast, tokens.accent) >= 4.5 },
  { id: "focus-ring", mode, foreground: tokens.focusRing, background: tokens.background, ratio: contrastRatio(tokens.focusRing, tokens.background), minimum: 3, passed: contrastRatio(tokens.focusRing, tokens.background) >= 3 },
];

export const validateThemeConfig = (input: ThemeSettingsConfigInput): ThemeValidationResult => {
  try {
    const normalizedConfig = normalizeThemeConfig(input);
    const checks = THEME_MODES.flatMap((mode) => checksForMode(mode, normalizedConfig.modes[mode]));
    const failures = checks.filter((check) => !check.passed).map((check) => `${check.mode}:${check.id} ratio ${check.ratio.toFixed(2)} < ${check.minimum.toFixed(1)}`);
    return { passed: failures.length === 0, checks, failures, normalizedConfig };
  } catch (error) {
    const message = error instanceof ThemeSettingsError ? error.message : "theme validation failed";
    return { passed: false, checks: [], failures: [message.replace(/^VALIDATION_ERROR:\s*/u, "")] };
  }
};

export type ThemeUnitGateResult = { passed: true; checks: readonly string[]; validation: ThemeValidationResult };

export const verifyThemeSettingsUnitGate = (config: ThemeSettingsConfig): ThemeUnitGateResult => {
  const validation = validateThemeConfig(config);
  if (!validation.passed || !validation.normalizedConfig) throw new ThemeSettingsError("CONTRAST_GATE_FAILED", validation.failures.join("; ") || "contrast gate failed");
  return { passed: true, checks: ["asset-scope", "semantic-tokens", "wcag-aa-text", "wcag-aa-controls", "all-theme-modes"], validation };
};

const hashConfig = (config: ThemeSettingsConfig): string => createHash("sha256").update(JSON.stringify(config)).digest("hex");

const requestHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

type IdempotencyValue = { requestHash: string; value: unknown };

export class InMemoryThemeSettingsRepository {
  private readonly versions = new Map<string, ThemeSettingsVersion[]>();
  private readonly audits = new Map<string, ThemeSettingsAuditEntry[]>();
  private readonly idempotency = new Map<string, IdempotencyValue>();

  constructor() {
    const config = safeDefaultThemeSettings();
    const timestamp = nowIso();
    const seed: ThemeSettingsVersion = { id: randomUUID(), tenantId: SYNTHETIC_THEME_TENANT_ID, settingsKey: THEME_SETTINGS_KEY, version: 1, state: "PUBLISHED", certificationStatus: "UNIT_APPROVED", config, configHash: hashConfig(config), createdBy: SYNTHETIC_THEME_ADMIN_ACCOUNT_ID, publishedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
    this.versions.set(SYNTHETIC_THEME_TENANT_ID, [seed]);
    this.audits.set(SYNTHETIC_THEME_TENANT_ID, [{ id: randomUUID(), tenantId: SYNTHETIC_THEME_TENANT_ID, actorAccountId: SYNTHETIC_THEME_ADMIN_ACCOUNT_ID, action: "PUBLISHED", resourceId: seed.id, reason: "safe default theme seed", occurredAt: timestamp }]);
  }

  private assertTenant(actor: ThemeSettingsActor): void {
    if (!actor.tenantId || actor.tenantId !== SYNTHETIC_THEME_TENANT_ID) throw new ThemeSettingsError("FORBIDDEN", "tenant scope is invalid");
  }

  private assertMutation(actor: ThemeSettingsActor): void {
    this.assertTenant(actor);
    if (actor.role !== "TENANT_ADMIN") throw new ThemeSettingsError("FORBIDDEN", "theme mutation requires tenant admin");
  }

  private listFor(actor: ThemeSettingsActor): ThemeSettingsVersion[] {
    this.assertTenant(actor);
    return this.versions.get(actor.tenantId) ?? [];
  }

  private audit(actor: ThemeSettingsActor, action: ThemeSettingsAuditEntry["action"], resourceId: string, reason: string): void {
    const entries = this.audits.get(actor.tenantId) ?? [];
    entries.push({ id: randomUUID(), tenantId: actor.tenantId, actorAccountId: actor.accountId, action, resourceId, reason, occurredAt: nowIso() });
    this.audits.set(actor.tenantId, entries);
  }

  private idempotent<T>(actor: ThemeSettingsActor, key: string, input: unknown, operation: () => T): T {
    const normalizedKey = assertIdempotencyKey(key);
    const id = `${actor.tenantId}:${normalizedKey}`;
    const hash = requestHash(input);
    const existing = this.idempotency.get(id);
    if (existing) {
      if (existing.requestHash !== hash) throw new ThemeSettingsError("IDEMPOTENCY_CONFLICT", "idempotency key was already used for another request");
      return clone(existing.value) as T;
    }
    const value = operation();
    this.idempotency.set(id, { requestHash: hash, value: clone(value) });
    return clone(value);
  }

  snapshot(actor: ThemeSettingsActor): ThemeSettingsSnapshot {
    const versions = this.listFor(actor).slice().sort((a, b) => b.version - a.version).map(clone);
    return { versions, published: versions.find((item) => item.state === "PUBLISHED"), audit: clone(this.audits.get(actor.tenantId) ?? []) };
  }

  createDraft(actor: ThemeSettingsActor, input: ThemeSettingsInput): ThemeSettingsVersion {
    this.assertMutation(actor);
    return this.idempotent(actor, input.idempotencyKey, input, () => {
      const previous = this.listFor(actor).at(-1);
      const config = normalizeThemeConfig(input.config, previous?.config ?? safeDefaultThemeSettings());
      const versions = this.listFor(actor);
      const version: ThemeSettingsVersion = { id: randomUUID(), tenantId: actor.tenantId, settingsKey: THEME_SETTINGS_KEY, version: (versions.at(-1)?.version ?? 0) + 1, state: "DRAFT", config, configHash: hashConfig(config), createdBy: actor.accountId, createdAt: nowIso(), updatedAt: nowIso(), rowVersion: 1 };
      versions.push(version);
      this.versions.set(actor.tenantId, versions);
      this.audit(actor, "DRAFT_CREATED", version.id, assertReason(input.reason));
      return version;
    });
  }

  get(actor: ThemeSettingsActor, id: string): ThemeSettingsVersion {
    const version = this.listFor(actor).find((item) => item.id === id);
    if (!version) throw new ThemeSettingsError("NOT_FOUND", "theme version not found");
    return clone(version);
  }

  updateDraft(actor: ThemeSettingsActor, id: string, expectedVersion: number, input: ThemeSettingsInput): ThemeSettingsVersion {
    this.assertMutation(actor);
    return this.idempotent(actor, input.idempotencyKey, { id, expectedVersion, input }, () => {
      const version = this.listFor(actor).find((item) => item.id === id);
      if (!version) throw new ThemeSettingsError("NOT_FOUND", "theme version not found");
      if (version.state !== "DRAFT") throw new ThemeSettingsError("INVALID_STATE", "only draft theme versions can be edited");
      if (version.rowVersion !== expectedVersion) throw new ThemeSettingsError("VERSION_CONFLICT", "theme version is stale");
      version.config = normalizeThemeConfig(input.config, version.config);
      version.configHash = hashConfig(version.config);
      version.rowVersion += 1;
      version.updatedAt = nowIso();
      this.audit(actor, "DRAFT_UPDATED", version.id, assertReason(input.reason));
      return version;
    });
  }

  validate(actor: ThemeSettingsActor, id: string): ThemeValidationResult {
    const version = this.get(actor, id);
    const validation = validateThemeConfig(version.config);
    this.audit(actor, "VALIDATED", version.id, "theme contrast and asset validation");
    return clone(validation);
  }

  publish(actor: ThemeSettingsActor, id: string, idempotencyKey: string, reason: string): ThemeSettingsVersion {
    this.assertMutation(actor);
    return this.idempotent(actor, idempotencyKey, { id, reason, operation: "publish" }, () => {
      const version = this.listFor(actor).find((item) => item.id === id);
      if (!version) throw new ThemeSettingsError("NOT_FOUND", "theme version not found");
      if (version.state !== "DRAFT") throw new ThemeSettingsError("INVALID_STATE", "only draft theme versions can be published");
      const gate = verifyThemeSettingsUnitGate(version.config);
      version.config = gate.validation.normalizedConfig!;
      version.configHash = hashConfig(version.config);
      this.audit(actor, "UNIT_AUTO_APPROVED", version.id, `${assertReason(reason)}; ${gate.checks.join(",")}`);
      for (const candidate of this.listFor(actor)) if (candidate.settingsKey === version.settingsKey && candidate.state === "PUBLISHED") { candidate.state = "SUPERSEDED"; candidate.updatedAt = nowIso(); candidate.rowVersion += 1; }
      version.state = "PUBLISHED";
      version.certificationStatus = "UNIT_APPROVED";
      version.publishedAt = nowIso();
      version.updatedAt = nowIso();
      version.rowVersion += 1;
      this.audit(actor, "PUBLISHED", version.id, assertReason(reason));
      return version;
    });
  }

  rollback(actor: ThemeSettingsActor, id: string, idempotencyKey: string, reason: string): ThemeSettingsVersion {
    this.assertMutation(actor);
    return this.idempotent(actor, idempotencyKey, { id, reason, operation: "rollback" }, () => {
      const version = this.listFor(actor).find((item) => item.id === id);
      if (!version) throw new ThemeSettingsError("NOT_FOUND", "theme version not found");
      if (version.state !== "SUPERSEDED" && version.state !== "ROLLED_BACK") throw new ThemeSettingsError("INVALID_STATE", "rollback requires a retained prior theme version");
      for (const candidate of this.listFor(actor)) if (candidate.state === "PUBLISHED") { candidate.state = "ROLLED_BACK"; candidate.updatedAt = nowIso(); candidate.rowVersion += 1; }
      version.state = "PUBLISHED";
      version.certificationStatus = "UNIT_APPROVED";
      version.publishedAt = nowIso();
      version.updatedAt = nowIso();
      version.rowVersion += 1;
      this.audit(actor, "ROLLED_BACK", version.id, assertReason(reason));
      return version;
    });
  }
}

export const createSyntheticThemeSettingsRepository = (): InMemoryThemeSettingsRepository => new InMemoryThemeSettingsRepository();
