import { randomUUID } from "node:crypto";

export const RICH_MENU_CANVAS = { width: 2500, height: 1686 } as const;
export const RICH_MENU_DEFAULT_ACTION_LABELS = ["แจ้งปัญหา", "ติดตามสถานะ", "ข่าวสาร", "บริการ", "ติดต่อ"] as const;

export type RichMenuState = "DRAFT" | "VALIDATED" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "SUPERSEDED";
export type RichMenuActionType = "URI" | "POSTBACK" | "MESSAGE";
export type RichMenuActorRole = "TENANT_ADMIN" | "SUPER_ADMIN";

export type RichMenuAction = {
  type: RichMenuActionType;
  label: string;
  uri?: string;
  data?: string;
  displayText?: string;
  text?: string;
  featureKey?: string;
};

export type RichMenuAreaInput = {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sortOrder: number;
  action: RichMenuAction;
};

export type RichMenuImageMetadata = {
  contentType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
};

export type RichMenuDraftInput = {
  tenantId: string;
  chatBarText: string;
  image: RichMenuImageMetadata;
  areas: readonly RichMenuAreaInput[];
};

export type RichMenuDraftPatch = Partial<Pick<RichMenuDraftInput, "chatBarText" | "image" | "areas">>;

export type RichMenuPolicy = {
  tenantId: string;
  allowedUriPrefixes: readonly string[];
  enabledFeatures?: readonly string[] | ReadonlySet<string>;
  requireFullCoverage?: boolean;
};

export type RichMenuActor = {
  tenantId: string;
  accountId: string;
  role: RichMenuActorRole;
};

export type RichMenuVersion = RichMenuDraftInput & {
  id: string;
  version: number;
  state: RichMenuState;
  rowVersion: number;
  providerMenuId?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RichMenuAuditEntry = {
  id: string;
  tenantId: string;
  accountId: string;
  action: string;
  resourceId: string;
  fromState?: RichMenuState;
  toState?: RichMenuState;
  reason: string;
  correlationId: string;
  occurredAt: string;
};

export type LineRichMenuProvider = {
  createRichMenu(input: { tenantId: string; width: number; height: number; chatBarText: string; areas: readonly RichMenuAreaInput[] }): Promise<{ providerMenuId: string }>;
  uploadRichMenuImage(input: { providerMenuId: string; contentType: RichMenuImageMetadata["contentType"]; storageKey: string }): Promise<void>;
  setDefaultRichMenu(input: { tenantId: string; providerMenuId: string }): Promise<void>;
};

export class RichMenuError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "EXTERNAL_DEPENDENCY_FAILED", message: string) {
    super(`${code}: ${message}`);
    this.name = "RichMenuError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_IMAGE_BYTES = 1_000_000;
const MAX_AREAS = 20;

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new RichMenuError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const assertText = (value: string, field: string, min: number, max: number): string => {
  if (typeof value !== "string" || SAFE_TEXT_PATTERN.test(value) || value.trim().length < min || value.trim().length > max) {
    throw new RichMenuError("VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
};

const assertInteger = (value: number, field: string, min: number, max: number): number => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RichMenuError("VALIDATION_ERROR", `${field} is invalid`);
  return value;
};

const cloneAction = (action: RichMenuAction): RichMenuAction => ({ ...action });
const cloneArea = (area: RichMenuAreaInput): RichMenuAreaInput => ({ ...area, action: cloneAction(area.action) });
const cloneImage = (image: RichMenuImageMetadata): RichMenuImageMetadata => ({ ...image });
const cloneVersion = (version: RichMenuVersion): RichMenuVersion => ({ ...version, image: cloneImage(version.image), areas: version.areas.map(cloneArea) });

const normalizeEnabledFeatures = (features: RichMenuPolicy["enabledFeatures"]): ReadonlySet<string> => features instanceof Set ? features : new Set(features ?? []);

const validateUri = (uri: string, allowedUriPrefixes: readonly string[]): string => {
  const normalized = assertText(uri, "action.uri", 1, 1000);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new RichMenuError("VALIDATION_ERROR", "action.uri must be an absolute URL");
  }
  if (parsed.protocol !== "https:" || !allowedUriPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    throw new RichMenuError("VALIDATION_ERROR", "action.uri is outside the tenant URL allowlist");
  }
  return normalized;
};

const validateAction = (action: RichMenuAction, policy: RichMenuPolicy): RichMenuAction => {
  if (!action || !["URI", "POSTBACK", "MESSAGE"].includes(action.type)) throw new RichMenuError("VALIDATION_ERROR", "action.type is invalid");
  const normalized: RichMenuAction = { type: action.type, label: assertText(action.label, "action.label", 1, 40) };
  if (action.featureKey !== undefined) {
    const featureKey = assertText(action.featureKey, "action.featureKey", 1, 128);
    if (!normalizeEnabledFeatures(policy.enabledFeatures).has(featureKey)) throw new RichMenuError("VALIDATION_ERROR", "action feature dependency is not enabled");
    normalized.featureKey = featureKey;
  }
  if (action.type === "URI") normalized.uri = validateUri(action.uri ?? "", policy.allowedUriPrefixes);
  if (action.type === "POSTBACK") {
    normalized.data = assertText(action.data ?? "", "action.data", 1, 300);
    if (action.displayText !== undefined) normalized.displayText = assertText(action.displayText, "action.displayText", 1, 300);
  }
  if (action.type === "MESSAGE") normalized.text = assertText(action.text ?? "", "action.text", 1, 300);
  return normalized;
};

const validateImage = (tenantId: string, image: RichMenuImageMetadata): RichMenuImageMetadata => {
  if (image.contentType !== "image/jpeg" && image.contentType !== "image/png") throw new RichMenuError("VALIDATION_ERROR", "Rich Menu image MIME type is invalid");
  assertInteger(image.width, "image.width", 800, 2500);
  assertInteger(image.height, "image.height", 250, 10000);
  assertInteger(image.sizeBytes, "image.sizeBytes", 1, MAX_IMAGE_BYTES);
  if (image.width / image.height < 1.45) throw new RichMenuError("VALIDATION_ERROR", "Rich Menu image aspect ratio is below 1.45");
  if (!SHA256_PATTERN.test(image.sha256)) throw new RichMenuError("VALIDATION_ERROR", "image.sha256 must be a lowercase SHA-256 digest");
  const expectedPrefix = `private/tenants/${tenantId}/rich-menu/`;
  if (!image.storageKey.startsWith(expectedPrefix) || image.storageKey.includes("..") || SAFE_TEXT_PATTERN.test(image.storageKey)) {
    throw new RichMenuError("VALIDATION_ERROR", "image.storageKey must be a private tenant-scoped path");
  }
  return cloneImage(image);
};

const overlap = (first: RichMenuAreaInput, second: RichMenuAreaInput): boolean => first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y;

const coversCanvas = (areas: readonly RichMenuAreaInput[], width: number, height: number): boolean => {
  const xPoints = [...new Set([0, width, ...areas.flatMap((area) => [area.x, area.x + area.width])])].sort((a, b) => a - b);
  const yPoints = [...new Set([0, height, ...areas.flatMap((area) => [area.y, area.y + area.height])])].sort((a, b) => a - b);
  for (let xIndex = 0; xIndex < xPoints.length - 1; xIndex += 1) {
    for (let yIndex = 0; yIndex < yPoints.length - 1; yIndex += 1) {
      const x = xPoints[xIndex]!;
      const y = yPoints[yIndex]!;
      if (!areas.some((area) => area.x <= x && area.x + area.width >= xPoints[xIndex + 1]! && area.y <= y && area.y + area.height >= yPoints[yIndex + 1]!)) return false;
    }
  }
  return true;
};

export function validateRichMenuDraft(input: RichMenuDraftInput, policy: RichMenuPolicy): RichMenuDraftInput {
  assertUuid(input.tenantId, "tenantId");
  if (input.tenantId !== policy.tenantId) throw new RichMenuError("FORBIDDEN", "tenant scope does not match the active policy");
  const chatBarText = assertText(input.chatBarText, "chatBarText", 1, 14);
  const image = validateImage(input.tenantId, input.image);
  if (!Array.isArray(input.areas) || input.areas.length === 0 || input.areas.length > MAX_AREAS) throw new RichMenuError("VALIDATION_ERROR", "areas count is invalid");
  const areas = input.areas.map((area, index) => {
    const x = assertInteger(area.x, `areas[${index}].x`, 0, image.width);
    const y = assertInteger(area.y, `areas[${index}].y`, 0, image.height);
    const width = assertInteger(area.width, `areas[${index}].width`, 1, image.width);
    const height = assertInteger(area.height, `areas[${index}].height`, 1, image.height);
    if (x + width > image.width || y + height > image.height) throw new RichMenuError("VALIDATION_ERROR", `areas[${index}] is outside the image canvas`);
    return { id: area.id ?? randomUUID(), x, y, width, height, label: assertText(area.label, `areas[${index}].label`, 1, 40), sortOrder: assertInteger(area.sortOrder, `areas[${index}].sortOrder`, 0, MAX_AREAS - 1), action: validateAction(area.action, policy) } satisfies RichMenuAreaInput;
  });
  if (new Set(areas.map((area) => area.sortOrder)).size !== areas.length) throw new RichMenuError("VALIDATION_ERROR", "area sortOrder values must be unique");
  for (let first = 0; first < areas.length; first += 1) for (let second = first + 1; second < areas.length; second += 1) if (overlap(areas[first]!, areas[second]!)) throw new RichMenuError("VALIDATION_ERROR", "Rich Menu tap areas must not overlap");
  if (policy.requireFullCoverage !== false && !coversCanvas(areas, image.width, image.height)) throw new RichMenuError("VALIDATION_ERROR", "Rich Menu tap areas leave an unintended gap");
  return { tenantId: input.tenantId, chatBarText, image, areas: areas.sort((first, second) => first.sortOrder - second.sortOrder) };
}

const nowIso = (clock: () => Date): string => clock().toISOString();

export class InMemoryRichMenuStore {
  private readonly records = new Map<string, RichMenuVersion>();
  private readonly audits: RichMenuAuditEntry[] = [];
  private readonly idempotency = new Map<string, RichMenuVersion>();

  get(tenantId: string, id: string): RichMenuVersion | undefined {
    const record = this.records.get(id);
    return record && record.tenantId === tenantId ? cloneVersion(record) : undefined;
  }

  list(tenantId: string): readonly RichMenuVersion[] {
    return [...this.records.values()].filter((record) => record.tenantId === tenantId).sort((first, second) => second.version - first.version).map(cloneVersion);
  }

  put(record: RichMenuVersion): void {
    this.records.set(record.id, cloneVersion(record));
  }

  findIdempotent(tenantId: string, operation: string, key: string): RichMenuVersion | undefined {
    const record = this.idempotency.get(`${tenantId}:${operation}:${key}`);
    return record ? cloneVersion(record) : undefined;
  }

  rememberIdempotency(tenantId: string, operation: string, key: string, record: RichMenuVersion): void {
    this.idempotency.set(`${tenantId}:${operation}:${key}`, cloneVersion(record));
  }

  appendAudit(entry: RichMenuAuditEntry): void {
    this.audits.push({ ...entry });
  }

  audit(tenantId: string): readonly RichMenuAuditEntry[] {
    return this.audits.filter((entry) => entry.tenantId === tenantId).map((entry) => ({ ...entry }));
  }
}

export class InMemoryLineRichMenuProvider implements LineRichMenuProvider {
  readonly calls: string[] = [];
  private nextId = 1;
  failNext = false;

  async createRichMenu(): Promise<{ providerMenuId: string }> {
    if (this.failNext) { this.failNext = false; throw new Error("provider create failed"); }
    const providerMenuId = `local-rich-menu-${this.nextId++}`;
    this.calls.push(`create:${providerMenuId}`);
    return { providerMenuId };
  }

  async uploadRichMenuImage(input: { providerMenuId: string }): Promise<void> {
    if (this.failNext) { this.failNext = false; throw new Error("provider image upload failed"); }
    this.calls.push(`upload:${input.providerMenuId}`);
  }

  async setDefaultRichMenu(input: { providerMenuId: string }): Promise<void> {
    if (this.failNext) { this.failNext = false; throw new Error("provider default switch failed"); }
    this.calls.push(`default:${input.providerMenuId}`);
  }
}

type RichMenuServiceOptions = {
  policy: RichMenuPolicy;
  store?: InMemoryRichMenuStore;
  provider: LineRichMenuProvider;
  clock?: () => Date;
};

const assertIdempotencyKey = (key: string): string => assertText(key, "idempotencyKey", 8, 255);

export class RichMenuService {
  readonly store: InMemoryRichMenuStore;
  private readonly policy: RichMenuPolicy;
  private readonly provider: LineRichMenuProvider;
  private readonly clock: () => Date;

  constructor(options: RichMenuServiceOptions) {
    assertUuid(options.policy.tenantId, "policy.tenantId");
    this.policy = options.policy;
    this.store = options.store ?? new InMemoryRichMenuStore();
    this.provider = options.provider;
    this.clock = options.clock ?? (() => new Date());
  }

  private assertActor(actor: RichMenuActor, tenantId: string): void {
    assertUuid(actor.accountId, "actor.accountId");
    if (actor.tenantId !== tenantId || actor.tenantId !== this.policy.tenantId) throw new RichMenuError("FORBIDDEN", "actor tenant scope is invalid");
    if (actor.role !== "TENANT_ADMIN" && actor.role !== "SUPER_ADMIN") throw new RichMenuError("FORBIDDEN", "Rich Menu management permission is required");
  }

  private recordAudit(actor: RichMenuActor, record: RichMenuVersion, action: string, reason: string, fromState?: RichMenuState, toState?: RichMenuState): void {
    this.store.appendAudit({ id: randomUUID(), tenantId: record.tenantId, accountId: actor.accountId, action, resourceId: record.id, ...(fromState ? { fromState } : {}), ...(toState ? { toState } : {}), reason: assertText(reason, "reason", 3, 2000), correlationId: randomUUID(), occurredAt: nowIso(this.clock) });
  }

  private requireRecord(tenantId: string, id: string): RichMenuVersion {
    const record = this.store.get(tenantId, id);
    if (!record) throw new RichMenuError("NOT_FOUND", "Rich Menu version was not found");
    return record;
  }

  private assertVersion(record: RichMenuVersion, expectedVersion: number): void {
    if (!Number.isSafeInteger(expectedVersion) || record.rowVersion !== expectedVersion) throw new RichMenuError("CONFLICT", "Rich Menu version changed; reload before updating");
  }

  list(tenantId: string, actor: RichMenuActor): readonly RichMenuVersion[] {
    this.assertActor(actor, tenantId);
    return this.store.list(tenantId);
  }

  create(input: RichMenuDraftInput, actor: RichMenuActor, reason: string, idempotencyKey: string): RichMenuVersion {
    this.assertActor(actor, input.tenantId);
    const key = assertIdempotencyKey(idempotencyKey);
    const existing = this.store.findIdempotent(input.tenantId, "create", key);
    if (existing) return existing;
    const normalized = validateRichMenuDraft(input, this.policy);
    const version = this.store.list(input.tenantId).reduce((highest, record) => Math.max(highest, record.version), 0) + 1;
    const timestamp = nowIso(this.clock);
    const record: RichMenuVersion = { ...normalized, id: randomUUID(), version, state: "DRAFT", rowVersion: 1, createdAt: timestamp, updatedAt: timestamp };
    this.store.put(record);
    this.recordAudit(actor, record, "RICH_MENU_CREATED", reason, undefined, "DRAFT");
    this.store.rememberIdempotency(input.tenantId, "create", key, record);
    return cloneVersion(record);
  }

  update(tenantId: string, id: string, patch: RichMenuDraftPatch, actor: RichMenuActor, expectedVersion: number, reason: string, idempotencyKey: string): RichMenuVersion {
    this.assertActor(actor, tenantId);
    const key = assertIdempotencyKey(idempotencyKey);
    const existingOperation = this.store.findIdempotent(tenantId, "update", key);
    if (existingOperation) return existingOperation;
    const current = this.requireRecord(tenantId, id);
    this.assertVersion(current, expectedVersion);
    if (current.state !== "DRAFT" && current.state !== "FAILED") throw new RichMenuError("CONFLICT", "Only draft or failed Rich Menu versions can be edited");
    const normalized = validateRichMenuDraft({ tenantId, chatBarText: patch.chatBarText ?? current.chatBarText, image: patch.image ?? current.image, areas: patch.areas ?? current.areas }, this.policy);
    const next: RichMenuVersion = { ...current, ...normalized, rowVersion: current.rowVersion + 1, updatedAt: nowIso(this.clock) };
    this.store.put(next);
    this.recordAudit(actor, next, "RICH_MENU_UPDATED", reason, current.state, next.state);
    this.store.rememberIdempotency(tenantId, "update", key, next);
    return cloneVersion(next);
  }

  validate(tenantId: string, id: string, actor: RichMenuActor, expectedVersion: number, reason: string, idempotencyKey: string): RichMenuVersion {
    this.assertActor(actor, tenantId);
    const key = assertIdempotencyKey(idempotencyKey);
    const existingOperation = this.store.findIdempotent(tenantId, "validate", key);
    if (existingOperation) return existingOperation;
    const current = this.requireRecord(tenantId, id);
    this.assertVersion(current, expectedVersion);
    if (current.state !== "DRAFT" && current.state !== "FAILED") throw new RichMenuError("CONFLICT", "Only draft or failed Rich Menu versions can be validated");
    const normalized = validateRichMenuDraft(current, this.policy);
    const next: RichMenuVersion = { ...current, ...normalized, state: "VALIDATED", rowVersion: current.rowVersion + 1, updatedAt: nowIso(this.clock) };
    this.store.put(next);
    this.recordAudit(actor, next, current.state === "FAILED" ? "RICH_MENU_VALIDATE_RETRY" : "RICH_MENU_VALIDATED", reason, current.state, "VALIDATED");
    this.store.rememberIdempotency(tenantId, "validate", key, next);
    return cloneVersion(next);
  }

  async publish(tenantId: string, id: string, actor: RichMenuActor, expectedVersion: number, reason: string, idempotencyKey: string): Promise<RichMenuVersion> {
    this.assertActor(actor, tenantId);
    const key = assertIdempotencyKey(idempotencyKey);
    const existingOperation = this.store.findIdempotent(tenantId, "publish", key);
    if (existingOperation) return existingOperation;
    const current = this.requireRecord(tenantId, id);
    this.assertVersion(current, expectedVersion);
    if (current.state !== "VALIDATED") throw new RichMenuError("CONFLICT", "Only a validated Rich Menu version can be published");
    const publishing: RichMenuVersion = { ...current, state: "PUBLISHING", rowVersion: current.rowVersion + 1, updatedAt: nowIso(this.clock) };
    this.store.put(publishing);
    this.recordAudit(actor, publishing, "RICH_MENU_PUBLISH_STARTED", reason, "VALIDATED", "PUBLISHING");
    try {
      const providerMenu = await this.provider.createRichMenu({ tenantId, width: current.image.width, height: current.image.height, chatBarText: current.chatBarText, areas: current.areas });
      await this.provider.uploadRichMenuImage({ providerMenuId: providerMenu.providerMenuId, contentType: current.image.contentType, storageKey: current.image.storageKey });
      await this.provider.setDefaultRichMenu({ tenantId, providerMenuId: providerMenu.providerMenuId });
      const previous = this.store.list(tenantId).find((record) => record.state === "PUBLISHED" && record.id !== id);
      if (previous) this.store.put({ ...previous, state: "SUPERSEDED", rowVersion: previous.rowVersion + 1, updatedAt: nowIso(this.clock) });
      const published: RichMenuVersion = { ...publishing, state: "PUBLISHED", providerMenuId: providerMenu.providerMenuId, publishedAt: nowIso(this.clock), rowVersion: publishing.rowVersion + 1, updatedAt: nowIso(this.clock) };
      this.store.put(published);
      this.recordAudit(actor, published, "RICH_MENU_PUBLISHED", reason, "PUBLISHING", "PUBLISHED");
      this.store.rememberIdempotency(tenantId, "publish", key, published);
      return cloneVersion(published);
    } catch {
      const failed: RichMenuVersion = { ...publishing, state: "FAILED", rowVersion: publishing.rowVersion + 1, updatedAt: nowIso(this.clock) };
      this.store.put(failed);
      this.recordAudit(actor, failed, "RICH_MENU_PUBLISH_FAILED", reason, "PUBLISHING", "FAILED");
      throw new RichMenuError("EXTERNAL_DEPENDENCY_FAILED", "Rich Menu publish failed; last-known-good remains active");
    }
  }

  async rollback(tenantId: string, id: string, actor: RichMenuActor, expectedVersion: number, reason: string, idempotencyKey: string): Promise<RichMenuVersion> {
    this.assertActor(actor, tenantId);
    const key = assertIdempotencyKey(idempotencyKey);
    const existingOperation = this.store.findIdempotent(tenantId, "rollback", key);
    if (existingOperation) return existingOperation;
    const target = this.requireRecord(tenantId, id);
    this.assertVersion(target, expectedVersion);
    if (target.state !== "SUPERSEDED" && target.state !== "PUBLISHED") throw new RichMenuError("CONFLICT", "Only a known-good Rich Menu version can be restored");
    if (!target.providerMenuId) throw new RichMenuError("CONFLICT", "Rich Menu version has no provider object to restore");
    await this.provider.setDefaultRichMenu({ tenantId, providerMenuId: target.providerMenuId });
    for (const record of this.store.list(tenantId)) {
      if (record.id !== id && record.state === "PUBLISHED") this.store.put({ ...record, state: "SUPERSEDED", rowVersion: record.rowVersion + 1, updatedAt: nowIso(this.clock) });
    }
    const restored: RichMenuVersion = { ...target, state: "PUBLISHED", rowVersion: target.rowVersion + 1, updatedAt: nowIso(this.clock) };
    this.store.put(restored);
    this.recordAudit(actor, restored, "RICH_MENU_ROLLED_BACK", reason, target.state, "PUBLISHED");
    this.store.rememberIdempotency(tenantId, "rollback", key, restored);
    return cloneVersion(restored);
  }
}
