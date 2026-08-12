import { createHash, randomUUID } from "node:crypto";

export const NEWS_TIMEZONE = "Asia/Bangkok" as const;
export const NEWS_STATES = ["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export type NewsState = (typeof NEWS_STATES)[number];

export const SYNTHETIC_NEWS_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const SYNTHETIC_NEWS_ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
export const SYNTHETIC_NEWS_PR_ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
export const SYNTHETIC_NEWS_CITIZEN_LINE_USER_ID = "U11111111111111111111111111111111";

export type NewsActor = {
  tenantId: string;
  accountId: string;
  role: "STAFF" | "PR_STAFF" | "TENANT_ADMIN";
};

export type NewsAttachment = {
  storageKey: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  sizeBytes: number;
  width?: number;
  height?: number;
  sha256: string;
  altText: string;
};

export type NewsCategory = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  active: boolean;
};

export type NewsRevision = {
  id: string;
  tenantId: string;
  postId: string;
  revision: number;
  title: string;
  excerpt: string;
  bodyHtml: string;
  categoryIds: readonly string[];
  tags: readonly string[];
  attachments: readonly NewsAttachment[];
  effectiveFrom: string;
  expiresAt?: string;
  timezone: typeof NEWS_TIMEZONE;
  aiDraft: boolean;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
  immutable: boolean;
};

export type NewsPost = {
  id: string;
  tenantId: string;
  slug: string;
  status: NewsState;
  currentRevisionId: string;
  currentRevision: NewsRevision;
  revisions: readonly NewsRevision[];
  approvedBy?: string;
  approvedAt?: string;
  publishedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type NewsDraftInput = {
  slug: string;
  title: string;
  excerpt: string;
  bodyHtml: string;
  categoryIds: readonly string[];
  tags: readonly string[];
  attachments: readonly NewsAttachment[];
  effectiveFrom: string;
  expiresAt?: string;
  timezone?: typeof NEWS_TIMEZONE;
  aiDraft?: boolean;
  reason: string;
  idempotencyKey: string;
  sourcePostId?: string;
};

export type NewsAuditEntry = {
  id: string;
  tenantId: string;
  actorAccountId: string;
  action: "DRAFT_CREATED" | "REVISION_CREATED" | "DRAFT_UPDATED" | "SUBMITTED_FOR_REVIEW" | "APPROVED" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED" | "BROADCAST_PREVIEWED" | "BROADCAST_QUEUED";
  resourceId: string;
  reason: string;
  occurredAt: string;
};

export type NewsBroadcastRun = {
  id: string;
  tenantId: string;
  postId: string;
  revisionId: string;
  status: "PREVIEWED" | "QUEUED";
  audienceCount: number;
  quotaRemaining: number;
  estimatedCostMinor: number;
  idempotencyKey: string;
  createdAt: string;
};

export type NewsSnapshot = {
  items: readonly NewsPost[];
  categories: readonly NewsCategory[];
  audit: readonly NewsAuditEntry[];
  broadcasts: readonly NewsBroadcastRun[];
};

export type PublicNewsCard = {
  slug: string;
  title: string;
  excerpt: string;
  categoryIds: readonly string[];
  tags: readonly string[];
  publishedAt: string;
  effectiveFrom: string;
  expiresAt?: string;
  attachmentCount: number;
};

export type PublicNewsDetail = PublicNewsCard & {
  bodyHtml: string;
  attachments: readonly NewsAttachment[];
};

export type NewsBroadcastPreview = {
  postId: string;
  revisionId: string;
  previewOnly: true;
  audienceCount: number;
  quotaRemaining: number;
  estimatedCostMinor: number;
  confirmationRequired: true;
};

export type NewsErrorCode = "VALIDATION_ERROR" | "FORBIDDEN" | "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_STATE" | "IDEMPOTENCY_CONFLICT" | "CONFIGURATION_UNAVAILABLE";

export class NewsError extends Error {
  constructor(public readonly code: NewsErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "NewsError";
  }
}

const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,80}$/u;
const SHA_PATTERN = /^[a-f0-9]{64}$/iu;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const STORAGE_KEY_PATTERN = /^private\/tenants\/([0-9a-f-]{36})\/news\/[a-zA-Z0-9._/-]{1,240}$/u;
const UNSAFE_MARKUP_PATTERN = /<(?:script|iframe|object|embed|style|form|input|meta|link)\b|(?:javascript|data):/iu;
const ALLOWED_TAGS = new Set(["p", "strong", "em", "ul", "ol", "li", "br", "h2", "h3", "a"]);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowIso = (): string => new Date().toISOString();

const assertText = (value: unknown, field: string, maxLength: number, allowEmpty = false): string => {
  if (typeof value !== "string" || value.length > maxLength || CONTROL_PATTERN.test(value) || (!allowEmpty && !value.trim())) throw new NewsError("VALIDATION_ERROR", `${field} is invalid`);
  return value.trim();
};

const assertReason = (value: string): string => assertText(value, "reason", 2000);
const assertIdempotencyKey = (value: string): string => {
  if (typeof value !== "string" || value.length < 8 || value.length > 255 || CONTROL_PATTERN.test(value)) throw new NewsError("VALIDATION_ERROR", "idempotencyKey is invalid");
  return value;
};

const assertIsoDate = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new NewsError("VALIDATION_ERROR", `${field} must be an ISO UTC timestamp`);
  return value;
};

export const sanitizeRichText = (value: unknown): string => {
  const input = assertText(value, "bodyHtml", 20_000);
  if (UNSAFE_MARKUP_PATTERN.test(input)) throw new NewsError("VALIDATION_ERROR", "bodyHtml contains unsafe markup or URL scheme");
  const withoutEvents = input.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "");
  return withoutEvents.replace(/<([^>]+)>/gu, (_full, rawTag: string) => {
    const closing = rawTag.trim().startsWith("/");
    const tagName = rawTag.trim().replace(/^\//u, "").split(/\s+/u)[0]?.toLowerCase() ?? "";
    if (!ALLOWED_TAGS.has(tagName)) return "";
    if (tagName !== "a") return `<${closing ? "/" : ""}${tagName}>`;
    if (closing) return "</a>";
    const hrefMatch = rawTag.match(/href\s*=\s*["']([^"']+)["']/iu);
    const href = hrefMatch?.[1];
    if (!href || !/^(?:https?:\/\/|\/)/iu.test(href)) return "<a>";
    const safeHref = href.replace(/["<>]/gu, "");
    return `<a href="${safeHref}" rel="noreferrer noopener">`;
  });
};

const normalizeAttachment = (tenantId: string, value: NewsAttachment): NewsAttachment => {
  if (!value || typeof value !== "object" || !STORAGE_KEY_PATTERN.test(value.storageKey) || !value.storageKey.startsWith(`private/tenants/${tenantId}/news/`)) throw new NewsError("VALIDATION_ERROR", "attachment storageKey must be tenant-scoped");
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(value.contentType)) throw new NewsError("VALIDATION_ERROR", "attachment contentType is not allowed");
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 1 || value.sizeBytes > 10_000_000) throw new NewsError("VALIDATION_ERROR", "attachment size is invalid");
  const width = value.width;
  const height = value.height;
  if (value.contentType.startsWith("image/")) {
    if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new NewsError("VALIDATION_ERROR", "image dimensions are required");
  }
  if (!SHA_PATTERN.test(value.sha256) || !assertText(value.altText, "attachment.altText", 240)) throw new NewsError("VALIDATION_ERROR", "attachment metadata is invalid");
  return { storageKey: value.storageKey, contentType: value.contentType, sizeBytes: value.sizeBytes, ...(width ? { width } : {}), ...(height ? { height } : {}), sha256: value.sha256.toLowerCase(), altText: value.altText.trim() };
};

const normalizeTags = (values: readonly string[]): readonly string[] => {
  if (!Array.isArray(values) || values.length > 12) throw new NewsError("VALIDATION_ERROR", "tags are invalid");
  return values.map((value) => assertText(value, "tag", 40)).filter((value, index, all) => all.indexOf(value) === index);
};

const normalizeDraft = (tenantId: string, input: NewsDraftInput, categories: readonly NewsCategory[], current?: NewsRevision): Omit<NewsRevision, "id" | "tenantId" | "postId" | "revision" | "createdBy" | "createdAt" | "immutable" | "publishedAt"> => {
  const slug = assertText(input.slug, "slug", 81).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) throw new NewsError("VALIDATION_ERROR", "slug is invalid");
  const categoryIds = Array.isArray(input.categoryIds) ? input.categoryIds.map((value) => assertText(value, "categoryId", 80)) : [];
  if (categoryIds.length < 1 || categoryIds.some((id) => !categories.some((category) => category.id === id && category.active))) throw new NewsError("VALIDATION_ERROR", "at least one active category is required");
  const effectiveFrom = assertIsoDate(input.effectiveFrom, "effectiveFrom");
  const expiresAt = input.expiresAt === undefined || input.expiresAt === "" ? undefined : assertIsoDate(input.expiresAt, "expiresAt");
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(effectiveFrom)) throw new NewsError("VALIDATION_ERROR", "expiresAt must be after effectiveFrom");
  return {
    title: assertText(input.title, "title", 160),
    excerpt: assertText(input.excerpt, "excerpt", 300),
    bodyHtml: sanitizeRichText(input.bodyHtml),
    categoryIds,
    tags: normalizeTags(input.tags),
    attachments: (input.attachments ?? []).map((attachment) => normalizeAttachment(tenantId, attachment)),
    effectiveFrom,
    ...(expiresAt ? { expiresAt } : {}),
    timezone: input.timezone === undefined ? NEWS_TIMEZONE : input.timezone === NEWS_TIMEZONE ? NEWS_TIMEZONE : (() => { throw new NewsError("VALIDATION_ERROR", "timezone must be Asia/Bangkok"); })(),
    aiDraft: input.aiDraft === true,
  };
};

type IdempotencyValue = { requestHash: string; value: unknown };
const requestHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class InMemoryNewsRepository {
  private readonly categoriesByTenant = new Map<string, NewsCategory[]>();
  private readonly postsByTenant = new Map<string, NewsPost[]>();
  private readonly auditsByTenant = new Map<string, NewsAuditEntry[]>();
  private readonly broadcastsByTenant = new Map<string, NewsBroadcastRun[]>();
  private readonly idempotency = new Map<string, IdempotencyValue>();

  constructor() {
    this.categoriesByTenant.set(SYNTHETIC_NEWS_TENANT_ID, [
      { id: "news-cat-general-001", tenantId: SYNTHETIC_NEWS_TENANT_ID, slug: "general", name: "ข่าวประชาสัมพันธ์", active: true },
      { id: "news-cat-service-001", tenantId: SYNTHETIC_NEWS_TENANT_ID, slug: "services", name: "บริการประชาชน", active: true },
      { id: "news-cat-urgent-001", tenantId: SYNTHETIC_NEWS_TENANT_ID, slug: "urgent", name: "ประกาศสำคัญ", active: true },
    ]);
    this.postsByTenant.set(SYNTHETIC_NEWS_TENANT_ID, []);
    this.auditsByTenant.set(SYNTHETIC_NEWS_TENANT_ID, []);
    this.broadcastsByTenant.set(SYNTHETIC_NEWS_TENANT_ID, []);
  }

  private assertTenant(actor: NewsActor): void {
    if (actor.tenantId !== SYNTHETIC_NEWS_TENANT_ID) throw new NewsError("FORBIDDEN", "tenant scope is invalid");
  }

  private assertEdit(actor: NewsActor): void {
    this.assertTenant(actor);
    if (actor.role !== "TENANT_ADMIN" && actor.role !== "PR_STAFF") throw new NewsError("FORBIDDEN", "news edit permission denied");
  }

  private assertPublish(actor: NewsActor): void {
    this.assertTenant(actor);
    if (actor.role !== "TENANT_ADMIN" && actor.role !== "PR_STAFF") throw new NewsError("FORBIDDEN", "news publish permission denied");
  }

  private categories(actor: NewsActor): NewsCategory[] {
    this.assertTenant(actor);
    return this.categoriesByTenant.get(actor.tenantId) ?? [];
  }

  private posts(actor: NewsActor): NewsPost[] {
    this.assertTenant(actor);
    return this.postsByTenant.get(actor.tenantId) ?? [];
  }

  private audit(actor: NewsActor, action: NewsAuditEntry["action"], resourceId: string, reason: string): void {
    const entries = this.auditsByTenant.get(actor.tenantId) ?? [];
    entries.push({ id: randomUUID(), tenantId: actor.tenantId, actorAccountId: actor.accountId, action, resourceId, reason: assertReason(reason), occurredAt: nowIso() });
    this.auditsByTenant.set(actor.tenantId, entries);
  }

  private idempotent<T>(actor: NewsActor, key: string, input: unknown, operation: () => T): T {
    const normalizedKey = assertIdempotencyKey(key);
    const mapKey = `${actor.tenantId}:${normalizedKey}`;
    const hash = requestHash(input);
    const previous = this.idempotency.get(mapKey);
    if (previous) {
      if (previous.requestHash !== hash) throw new NewsError("IDEMPOTENCY_CONFLICT", "idempotency key was already used for another request");
      return clone(previous.value) as T;
    }
    const value = operation();
    this.idempotency.set(mapKey, { requestHash: hash, value: clone(value) });
    return clone(value);
  }

  snapshot(actor: NewsActor): NewsSnapshot {
    this.assertTenant(actor);
    return { items: this.posts(actor).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone), categories: clone(this.categories(actor)), audit: clone(this.auditsByTenant.get(actor.tenantId) ?? []), broadcasts: clone(this.broadcastsByTenant.get(actor.tenantId) ?? []) };
  }

  get(actor: NewsActor, id: string): NewsPost {
    const item = this.posts(actor).find((post) => post.id === id);
    if (!item) throw new NewsError("NOT_FOUND", "news post not found");
    return clone(item);
  }

  createDraft(actor: NewsActor, input: NewsDraftInput): NewsPost {
    this.assertEdit(actor);
    return this.idempotent(actor, input.idempotencyKey, input, () => {
      const posts = this.posts(actor);
      const source = input.sourcePostId ? posts.find((post) => post.id === input.sourcePostId) : undefined;
      if (input.sourcePostId && !source) throw new NewsError("NOT_FOUND", "source news post not found");
      const slug = assertText(input.slug, "slug", 81).toLowerCase();
      if (!source && posts.some((post) => post.slug === slug)) throw new NewsError("VALIDATION_ERROR", "slug already exists");
      const previous = source?.currentRevision;
      const normalized = normalizeDraft(actor.tenantId, input, this.categories(actor), previous);
      const postId = source?.id ?? randomUUID();
      const revisionNumber = (source?.revisions.at(-1)?.revision ?? 0) + 1;
      const timestamp = nowIso();
      const revision: NewsRevision = { id: randomUUID(), tenantId: actor.tenantId, postId, revision: revisionNumber, ...normalized, createdBy: actor.accountId, createdAt: timestamp, immutable: false };
      if (source) {
        source.revisions = [...source.revisions, revision];
        source.currentRevisionId = revision.id;
        source.currentRevision = revision;
        source.status = "DRAFT";
        source.updatedAt = timestamp;
        source.rowVersion += 1;
        this.audit(actor, "REVISION_CREATED", source.id, input.reason);
        return source;
      }
      const post: NewsPost = { id: postId, tenantId: actor.tenantId, slug, status: "DRAFT", currentRevisionId: revision.id, currentRevision: revision, revisions: [revision], createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
      posts.push(post);
      this.postsByTenant.set(actor.tenantId, posts);
      this.audit(actor, "DRAFT_CREATED", post.id, input.reason);
      return post;
    });
  }

  updateDraft(actor: NewsActor, id: string, expectedVersion: number, input: NewsDraftInput): NewsPost {
    this.assertEdit(actor);
    return this.idempotent(actor, input.idempotencyKey, { id, expectedVersion, input }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new NewsError("NOT_FOUND", "news post not found");
      if (post.status !== "DRAFT" || post.currentRevision.immutable) throw new NewsError("INVALID_STATE", "only an unpublished draft can be edited");
      if (post.rowVersion !== expectedVersion) throw new NewsError("VERSION_CONFLICT", "news draft is stale");
      const normalized = normalizeDraft(actor.tenantId, { ...input, slug: post.slug }, this.categories(actor), post.currentRevision);
      const updated: NewsRevision = { ...post.currentRevision, ...normalized, immutable: false };
      post.currentRevision = updated;
      post.currentRevisionId = updated.id;
      post.revisions = post.revisions.map((revision) => revision.id === updated.id ? updated : revision);
      post.updatedAt = nowIso();
      post.rowVersion += 1;
      this.audit(actor, "DRAFT_UPDATED", post.id, input.reason);
      return post;
    });
  }

  submitReview(actor: NewsActor, id: string, expectedVersion: number, idempotencyKey: string, reason: string): NewsPost {
    this.assertEdit(actor);
    return this.idempotent(actor, idempotencyKey, { id, expectedVersion, reason, action: "submit-review" }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new NewsError("NOT_FOUND", "news post not found");
      if (post.status !== "DRAFT") throw new NewsError("INVALID_STATE", "only draft news can be submitted");
      if (post.rowVersion !== expectedVersion) throw new NewsError("VERSION_CONFLICT", "news draft is stale");
      post.status = "IN_REVIEW"; post.updatedAt = nowIso(); post.rowVersion += 1;
      this.audit(actor, "SUBMITTED_FOR_REVIEW", post.id, reason);
      return post;
    });
  }

  approve(actor: NewsActor, id: string, expectedVersion: number, idempotencyKey: string, reason: string): NewsPost {
    this.assertTenant(actor);
    if (actor.role !== "TENANT_ADMIN") throw new NewsError("FORBIDDEN", "news approval requires tenant admin");
    return this.idempotent(actor, idempotencyKey, { id, expectedVersion, reason, action: "approve" }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new NewsError("NOT_FOUND", "news post not found");
      if (post.status !== "IN_REVIEW") throw new NewsError("INVALID_STATE", "only news in review can be approved");
      if (post.rowVersion !== expectedVersion) throw new NewsError("VERSION_CONFLICT", "news draft is stale");
      post.status = "APPROVED"; post.approvedBy = actor.accountId; post.approvedAt = nowIso(); post.updatedAt = nowIso(); post.rowVersion += 1;
      this.audit(actor, "APPROVED", post.id, reason);
      return post;
    });
  }

  publish(actor: NewsActor, id: string, expectedVersion: number, idempotencyKey: string, reason: string, now = new Date()): NewsPost {
    this.assertPublish(actor);
    return this.idempotent(actor, idempotencyKey, { id, expectedVersion, reason, action: "publish" }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new NewsError("NOT_FOUND", "news post not found");
      if (post.status !== "APPROVED") throw new NewsError("INVALID_STATE", "only approved news can be published");
      if (post.rowVersion !== expectedVersion) throw new NewsError("VERSION_CONFLICT", "news draft is stale");
      const scheduled = Date.parse(post.currentRevision.effectiveFrom) > now.getTime();
      post.status = scheduled ? "SCHEDULED" : "PUBLISHED";
      post.publishedAt = scheduled ? undefined : nowIso();
      post.currentRevision = { ...post.currentRevision, immutable: true, ...(scheduled ? {} : { publishedAt: post.publishedAt }) };
      post.revisions = post.revisions.map((revision) => revision.id === post.currentRevisionId ? post.currentRevision : revision);
      post.updatedAt = nowIso(); post.rowVersion += 1;
      this.audit(actor, scheduled ? "SCHEDULED" : "PUBLISHED", post.id, reason);
      return post;
    });
  }

  archive(actor: NewsActor, id: string, expectedVersion: number, idempotencyKey: string, reason: string): NewsPost {
    this.assertPublish(actor);
    return this.idempotent(actor, idempotencyKey, { id, expectedVersion, reason, action: "archive" }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new NewsError("NOT_FOUND", "news post not found");
      if (post.status !== "PUBLISHED" && post.status !== "SCHEDULED") throw new NewsError("INVALID_STATE", "only published or scheduled news can be archived");
      if (post.rowVersion !== expectedVersion) throw new NewsError("VERSION_CONFLICT", "news post is stale");
      post.status = "ARCHIVED"; post.archivedAt = nowIso(); post.updatedAt = nowIso(); post.rowVersion += 1;
      this.audit(actor, "ARCHIVED", post.id, reason);
      return post;
    });
  }

  previewBroadcast(actor: NewsActor, id: string): NewsBroadcastPreview {
    this.assertPublish(actor);
    const post = this.posts(actor).find((item) => item.id === id);
    if (!post) throw new NewsError("NOT_FOUND", "news post not found");
    if (post.status !== "PUBLISHED") throw new NewsError("INVALID_STATE", "only published news can be broadcast");
    const preview: NewsBroadcastPreview = { postId: post.id, revisionId: post.currentRevisionId, previewOnly: true, audienceCount: 100, quotaRemaining: 900, estimatedCostMinor: 0, confirmationRequired: true };
    this.audit(actor, "BROADCAST_PREVIEWED", post.id, "synthetic audience/quota preview; confirmation required");
    return preview;
  }

  queueBroadcast(actor: NewsActor, id: string, idempotencyKey: string, reason: string): NewsBroadcastRun {
    this.assertPublish(actor);
    return this.idempotent(actor, idempotencyKey, { id, reason, action: "broadcast" }, () => {
      const preview = this.previewBroadcast(actor, id);
      const run: NewsBroadcastRun = { id: randomUUID(), tenantId: actor.tenantId, postId: id, revisionId: preview.revisionId, status: "QUEUED", audienceCount: preview.audienceCount, quotaRemaining: preview.quotaRemaining, estimatedCostMinor: preview.estimatedCostMinor, idempotencyKey, createdAt: nowIso() };
      const runs = this.broadcastsByTenant.get(actor.tenantId) ?? [];
      runs.push(run); this.broadcastsByTenant.set(actor.tenantId, runs);
      this.audit(actor, "BROADCAST_QUEUED", id, reason);
      return run;
    });
  }

  listPublished(tenantId: string, now = new Date()): readonly PublicNewsCard[] {
    const posts = this.postsByTenant.get(tenantId) ?? [];
    return posts.filter((post) => post.status === "PUBLISHED" && Date.parse(post.currentRevision.effectiveFrom) <= now.getTime() && (!post.currentRevision.expiresAt || Date.parse(post.currentRevision.expiresAt) > now.getTime())).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).map((post) => ({ slug: post.slug, title: post.currentRevision.title, excerpt: post.currentRevision.excerpt, categoryIds: post.currentRevision.categoryIds, tags: post.currentRevision.tags, publishedAt: post.publishedAt ?? post.currentRevision.publishedAt ?? post.currentRevision.effectiveFrom, effectiveFrom: post.currentRevision.effectiveFrom, ...(post.currentRevision.expiresAt ? { expiresAt: post.currentRevision.expiresAt } : {}), attachmentCount: post.currentRevision.attachments.length }));
  }

  getPublishedBySlug(tenantId: string, slug: string, now = new Date()): PublicNewsDetail {
    const post = (this.postsByTenant.get(tenantId) ?? []).find((item) => item.slug === slug && item.status === "PUBLISHED" && Date.parse(item.currentRevision.effectiveFrom) <= now.getTime() && (!item.currentRevision.expiresAt || Date.parse(item.currentRevision.expiresAt) > now.getTime()));
    if (!post) throw new NewsError("NOT_FOUND", "published news not found");
    return { slug: post.slug, title: post.currentRevision.title, excerpt: post.currentRevision.excerpt, bodyHtml: post.currentRevision.bodyHtml, categoryIds: post.currentRevision.categoryIds, tags: post.currentRevision.tags, publishedAt: post.publishedAt ?? post.currentRevision.publishedAt ?? post.currentRevision.effectiveFrom, effectiveFrom: post.currentRevision.effectiveFrom, ...(post.currentRevision.expiresAt ? { expiresAt: post.currentRevision.expiresAt } : {}), attachmentCount: post.currentRevision.attachments.length, attachments: clone(post.currentRevision.attachments) };
  }
}

export const createSyntheticNewsRepository = (): InMemoryNewsRepository => new InMemoryNewsRepository();
