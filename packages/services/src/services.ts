import { createHash, randomUUID } from "node:crypto";

export const SERVICE_TIMEZONE = "Asia/Bangkok" as const;
export const SERVICE_STATES = ["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export type ServiceState = (typeof SERVICE_STATES)[number];
export const SERVICE_MODULES = ["STANDARD", "GOLD_PRICE", "PAWNSHOP"] as const;
export type ServiceModule = (typeof SERVICE_MODULES)[number];

export const SYNTHETIC_SERVICE_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const SYNTHETIC_SERVICE_ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
export const SYNTHETIC_SERVICE_PR_ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
export const SYNTHETIC_SERVICE_CITIZEN_LINE_USER_ID = "U11111111111111111111111111111111";

export type ServiceActor = {
  tenantId: string;
  accountId: string;
  role: "STAFF" | "DEPARTMENT_HEAD" | "PR_STAFF" | "TENANT_ADMIN";
  departmentIds?: readonly string[];
};

export type ServiceFeatureFlags = {
  goldPriceEnabled: boolean;
  pawnshopEnabled: boolean;
  rowVersion: number;
};

export type ServiceSource = {
  sourceType: "APPROVED_DOCUMENT" | "ORG_CONFIG" | "MANUAL_APPROVAL";
  reference: string;
  ownerAccountId: string;
  lastReviewedAt: string;
};

export type ServiceContact = {
  phone?: string;
  mapUrl?: string;
  websiteUrl?: string;
  verified: boolean;
};

export type ServiceGoldFacts = {
  priceMinor: number;
  currency: "THB";
  effectiveAt: string;
  source: string;
  staleAfterMinutes: number;
  disclaimer: string;
};

export type ServiceModuleFacts = {
  branchId?: string;
  gold?: ServiceGoldFacts;
};

export type ServiceFacts = {
  steps: readonly string[];
  documents: readonly string[];
  fee: string;
  hours: string;
  location: string;
  contact: ServiceContact;
  requirements: readonly string[];
  source: ServiceSource;
  effectiveFrom: string;
  expiresAt?: string;
  timezone: typeof SERVICE_TIMEZONE;
  moduleFacts?: ServiceModuleFacts;
};

export type ServiceRevision = {
  id: string;
  tenantId: string;
  serviceId: string;
  revision: number;
  title: string;
  summary: string;
  module: ServiceModule;
  departmentId: string;
  facts: ServiceFacts;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
  immutable: boolean;
};

export type ServicePost = {
  id: string;
  tenantId: string;
  slug: string;
  status: ServiceState;
  currentRevisionId: string;
  currentRevision: ServiceRevision;
  revisions: readonly ServiceRevision[];
  approvedBy?: string;
  approvedAt?: string;
  publishedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type ServiceDraftInput = {
  slug: string;
  title: string;
  summary: string;
  module: ServiceModule;
  departmentId: string;
  facts: ServiceFacts;
  reason: string;
  idempotencyKey: string;
  sourceServiceId?: string;
};

export type ServiceAuditEntry = {
  id: string;
  tenantId: string;
  actorAccountId: string;
  action: "DRAFT_CREATED" | "REVISION_CREATED" | "DRAFT_UPDATED" | "SUBMITTED_FOR_REVIEW" | "APPROVED" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED";
  resourceId: string;
  reason: string;
  occurredAt: string;
};

export type ServiceCategory = { id: string; tenantId: string; slug: string; name: string; active: boolean };

export type ServiceSnapshot = {
  items: readonly ServicePost[];
  categories: readonly ServiceCategory[];
  featureFlags: ServiceFeatureFlags;
  audit: readonly ServiceAuditEntry[];
};

export type PublicServiceCard = {
  slug: string;
  title: string;
  summary: string;
  module: ServiceModule;
  departmentId: string;
  hours: string;
  location: string;
  phone?: string;
  mapUrl?: string;
  verified: boolean;
  effectiveFrom: string;
  expiresAt?: string;
  sourceLastReviewedAt: string;
  staleWarning: boolean;
};

export type PublicServiceDetail = PublicServiceCard & {
  steps: readonly string[];
  documents: readonly string[];
  fee: string;
  requirements: readonly string[];
  source: ServiceSource;
  moduleFacts?: ServiceModuleFacts;
};

export type ServiceErrorCode = "VALIDATION_ERROR" | "FORBIDDEN" | "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_STATE" | "IDEMPOTENCY_CONFLICT" | "FEATURE_DISABLED";

export class ServiceError extends Error {
  constructor(public readonly code: ServiceErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ServiceError";
  }
}

const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,80}$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,24}$/u;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowIso = (): string => new Date().toISOString();

const assertText = (value: unknown, field: string, maxLength: number, allowEmpty = false): string => {
  if (typeof value !== "string" || value.length > maxLength || CONTROL_PATTERN.test(value) || (!allowEmpty && !value.trim())) throw new ServiceError("VALIDATION_ERROR", `${field} is invalid`);
  return value.trim();
};

const assertReason = (value: string): string => assertText(value, "reason", 2000);
const assertIdempotencyKey = (value: string): string => {
  if (typeof value !== "string" || value.length < 8 || value.length > 255 || CONTROL_PATTERN.test(value)) throw new ServiceError("VALIDATION_ERROR", "idempotencyKey is invalid");
  return value;
};
const assertIsoDate = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new ServiceError("VALIDATION_ERROR", `${field} must be an ISO UTC timestamp`);
  return value;
};
const assertList = (value: unknown, field: string, maxItems: number, maxItemLength: number, required = true): readonly string[] => {
  if (!Array.isArray(value) || value.length > maxItems || (required && value.length < 1)) throw new ServiceError("VALIDATION_ERROR", `${field} is invalid`);
  return value.map((item) => assertText(item, field, maxItemLength));
};
const assertUrl = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === "") return undefined;
  const url = assertText(value, field, 500);
  if (!/^https:\/\//u.test(url)) throw new ServiceError("VALIDATION_ERROR", `${field} must use https`);
  return url;
};

const normalizeGoldFacts = (value: unknown): ServiceGoldFacts => {
  if (!value || typeof value !== "object") throw new ServiceError("VALIDATION_ERROR", "gold facts are required");
  const input = value as Partial<ServiceGoldFacts>;
  const priceMinor = input.priceMinor;
  const staleAfterMinutes = input.staleAfterMinutes;
  if (typeof priceMinor !== "number" || !Number.isSafeInteger(priceMinor) || priceMinor < 0) throw new ServiceError("VALIDATION_ERROR", "gold price is invalid");
  const effectiveAt = assertIsoDate(input.effectiveAt, "gold.effectiveAt");
  if (input.currency !== "THB") throw new ServiceError("VALIDATION_ERROR", "gold currency must be THB");
  if (typeof staleAfterMinutes !== "number" || !Number.isSafeInteger(staleAfterMinutes) || staleAfterMinutes < 1 || staleAfterMinutes > 10080) throw new ServiceError("VALIDATION_ERROR", "gold stale policy is invalid");
  return { priceMinor, currency: "THB", effectiveAt, source: assertText(input.source, "gold.source", 240), staleAfterMinutes, disclaimer: assertText(input.disclaimer, "gold.disclaimer", 500) };
};

const normalizeFacts = (actor: ServiceActor, module: ServiceModule, value: ServiceFacts, flags: ServiceFeatureFlags): ServiceFacts => {
  if (!value || typeof value !== "object") throw new ServiceError("VALIDATION_ERROR", "facts are required");
  if (module === "GOLD_PRICE" && !flags.goldPriceEnabled) throw new ServiceError("FEATURE_DISABLED", "gold price module is disabled for this tenant");
  if (module === "PAWNSHOP" && !flags.pawnshopEnabled) throw new ServiceError("FEATURE_DISABLED", "pawnshop module is disabled for this tenant");
  const contact = value.contact;
  if (!contact || typeof contact !== "object") throw new ServiceError("VALIDATION_ERROR", "contact facts are required");
  const phone = contact.phone === undefined || contact.phone === "" ? undefined : assertText(contact.phone, "contact.phone", 30);
  if (phone && !PHONE_PATTERN.test(phone)) throw new ServiceError("VALIDATION_ERROR", "contact.phone is invalid");
  const facts: ServiceFacts = {
    steps: assertList(value.steps, "steps", 20, 300),
    documents: assertList(value.documents, "documents", 20, 200, false),
    fee: assertText(value.fee, "fee", 240),
    hours: assertText(value.hours, "hours", 240),
    location: assertText(value.location, "location", 240),
    contact: { ...(phone ? { phone } : {}), ...(assertUrl(contact.mapUrl, "contact.mapUrl") ? { mapUrl: assertUrl(contact.mapUrl, "contact.mapUrl") } : {}), ...(assertUrl(contact.websiteUrl, "contact.websiteUrl") ? { websiteUrl: assertUrl(contact.websiteUrl, "contact.websiteUrl") } : {}), verified: contact.verified === true },
    requirements: assertList(value.requirements, "requirements", 20, 240, false),
    source: {
      sourceType: value.source?.sourceType === "APPROVED_DOCUMENT" || value.source?.sourceType === "ORG_CONFIG" || value.source?.sourceType === "MANUAL_APPROVAL" ? value.source.sourceType : (() => { throw new ServiceError("VALIDATION_ERROR", "source.sourceType is invalid"); })(),
      reference: assertText(value.source?.reference, "source.reference", 500),
      ownerAccountId: actor.accountId,
      lastReviewedAt: assertIsoDate(value.source?.lastReviewedAt, "source.lastReviewedAt"),
    },
    effectiveFrom: assertIsoDate(value.effectiveFrom, "effectiveFrom"),
    ...(value.expiresAt ? { expiresAt: assertIsoDate(value.expiresAt, "expiresAt") } : {}),
    timezone: value.timezone === undefined || value.timezone === SERVICE_TIMEZONE ? SERVICE_TIMEZONE : (() => { throw new ServiceError("VALIDATION_ERROR", "timezone must be Asia/Bangkok"); })(),
  };
  if (facts.expiresAt && Date.parse(facts.expiresAt) <= Date.parse(facts.effectiveFrom)) throw new ServiceError("VALIDATION_ERROR", "expiresAt must be after effectiveFrom");
  const moduleFacts = value.moduleFacts;
  if (module === "PAWNSHOP") {
    const branchId = assertText(moduleFacts?.branchId, "moduleFacts.branchId", 80);
    facts.moduleFacts = { branchId };
  } else if (module === "GOLD_PRICE") {
    facts.moduleFacts = { gold: normalizeGoldFacts(moduleFacts?.gold) };
  }
  return facts;
};

type IdempotencyValue = { requestHash: string; value: unknown };
const requestHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class InMemoryServicesRepository {
  private readonly categoriesByTenant = new Map<string, ServiceCategory[]>();
  private readonly postsByTenant = new Map<string, ServicePost[]>();
  private readonly auditsByTenant = new Map<string, ServiceAuditEntry[]>();
  private readonly idempotency = new Map<string, IdempotencyValue>();
  private readonly featureFlagsByTenant = new Map<string, ServiceFeatureFlags>();

  constructor(flags: Partial<ServiceFeatureFlags> = {}) {
    this.categoriesByTenant.set(SYNTHETIC_SERVICE_TENANT_ID, [
      { id: "service-cat-general-001", tenantId: SYNTHETIC_SERVICE_TENANT_ID, slug: "general", name: "บริการทั่วไป", active: true },
      { id: "service-cat-permit-001", tenantId: SYNTHETIC_SERVICE_TENANT_ID, slug: "permit", name: "งานใบอนุญาต", active: true },
      { id: "service-cat-contact-001", tenantId: SYNTHETIC_SERVICE_TENANT_ID, slug: "contact", name: "ช่องทางติดต่อ", active: true },
    ]);
    this.postsByTenant.set(SYNTHETIC_SERVICE_TENANT_ID, []);
    this.auditsByTenant.set(SYNTHETIC_SERVICE_TENANT_ID, []);
    this.featureFlagsByTenant.set(SYNTHETIC_SERVICE_TENANT_ID, { goldPriceEnabled: flags.goldPriceEnabled === true, pawnshopEnabled: flags.pawnshopEnabled === true, rowVersion: 1 });
  }

  private assertTenant(actor: ServiceActor): void {
    if (actor.tenantId !== SYNTHETIC_SERVICE_TENANT_ID) throw new ServiceError("FORBIDDEN", "tenant scope is invalid");
  }

  private flags(actor: ServiceActor): ServiceFeatureFlags {
    this.assertTenant(actor);
    return this.featureFlagsByTenant.get(actor.tenantId) ?? { goldPriceEnabled: false, pawnshopEnabled: false, rowVersion: 1 };
  }

  private assertManage(actor: ServiceActor, departmentId?: string): void {
    this.assertTenant(actor);
    if (actor.role === "DEPARTMENT_HEAD" && departmentId && !actor.departmentIds?.includes(departmentId)) throw new ServiceError("FORBIDDEN", "department service scope denied");
    if (actor.role !== "TENANT_ADMIN" && actor.role !== "PR_STAFF" && actor.role !== "DEPARTMENT_HEAD") throw new ServiceError("FORBIDDEN", "service edit permission denied");
  }

  private assertPublish(actor: ServiceActor): void {
    this.assertTenant(actor);
    if (actor.role !== "TENANT_ADMIN" && actor.role !== "PR_STAFF") throw new ServiceError("FORBIDDEN", "service publish permission denied");
  }

  private posts(actor: ServiceActor): ServicePost[] {
    this.assertTenant(actor);
    return this.postsByTenant.get(actor.tenantId) ?? [];
  }

  private audit(actor: ServiceActor, action: ServiceAuditEntry["action"], resourceId: string, reason: string): void {
    const entries = this.auditsByTenant.get(actor.tenantId) ?? [];
    entries.push({ id: randomUUID(), tenantId: actor.tenantId, actorAccountId: actor.accountId, action, resourceId, reason: assertReason(reason), occurredAt: nowIso() });
    this.auditsByTenant.set(actor.tenantId, entries);
  }

  private idempotent<T>(actor: ServiceActor, key: string, input: unknown, operation: () => T): T {
    const normalizedKey = assertIdempotencyKey(key);
    const mapKey = `${actor.tenantId}:${normalizedKey}`;
    const hash = requestHash(input);
    const previous = this.idempotency.get(mapKey);
    if (previous) {
      if (previous.requestHash !== hash) throw new ServiceError("IDEMPOTENCY_CONFLICT", "idempotency key was already used for another request");
      return clone(previous.value) as T;
    }
    const value = operation();
    this.idempotency.set(mapKey, { requestHash: hash, value: clone(value) });
    return clone(value);
  }

  snapshot(actor: ServiceActor): ServiceSnapshot {
    this.assertTenant(actor);
    return { items: this.posts(actor).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone), categories: clone(this.categoriesByTenant.get(actor.tenantId) ?? []), featureFlags: clone(this.flags(actor)), audit: clone(this.auditsByTenant.get(actor.tenantId) ?? []) };
  }

  get(actor: ServiceActor, id: string): ServicePost {
    const post = this.posts(actor).find((item) => item.id === id);
    if (!post) throw new ServiceError("NOT_FOUND", "service not found");
    return clone(post);
  }

  createDraft(actor: ServiceActor, input: ServiceDraftInput): ServicePost {
    this.assertManage(actor, input.departmentId);
    return this.idempotent(actor, input.idempotencyKey, input, () => {
      const posts = this.posts(actor);
      const source = input.sourceServiceId ? posts.find((post) => post.id === input.sourceServiceId) : undefined;
      if (input.sourceServiceId && !source) throw new ServiceError("NOT_FOUND", "source service not found");
      const slug = assertText(input.slug, "slug", 81).toLowerCase();
      if (!source && posts.some((post) => post.slug === slug)) throw new ServiceError("VALIDATION_ERROR", "slug already exists");
      const normalizedFacts = normalizeFacts(actor, input.module, input.facts, this.flags(actor));
      const postId = source?.id ?? randomUUID();
      const revisionNumber = (source?.revisions.at(-1)?.revision ?? 0) + 1;
      const timestamp = nowIso();
      const revision: ServiceRevision = { id: randomUUID(), tenantId: actor.tenantId, serviceId: postId, revision: revisionNumber, title: assertText(input.title, "title", 180), summary: assertText(input.summary, "summary", 500), module: input.module, departmentId: assertText(input.departmentId, "departmentId", 100), facts: normalizedFacts, createdBy: actor.accountId, createdAt: timestamp, immutable: false };
      if (source) {
        source.revisions = [...source.revisions, revision]; source.currentRevisionId = revision.id; source.currentRevision = revision; source.status = "DRAFT"; source.updatedAt = timestamp; source.rowVersion += 1; this.audit(actor, "REVISION_CREATED", source.id, input.reason); return source;
      }
      const post: ServicePost = { id: postId, tenantId: actor.tenantId, slug, status: "DRAFT", currentRevisionId: revision.id, currentRevision: revision, revisions: [revision], createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
      posts.push(post); this.postsByTenant.set(actor.tenantId, posts); this.audit(actor, "DRAFT_CREATED", post.id, input.reason); return post;
    });
  }

  updateDraft(actor: ServiceActor, id: string, expectedVersion: number, input: ServiceDraftInput): ServicePost {
    this.assertManage(actor, input.departmentId);
    return this.idempotent(actor, input.idempotencyKey, { id, expectedVersion, input }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new ServiceError("NOT_FOUND", "service not found");
      if (post.status !== "DRAFT" || post.currentRevision.immutable) throw new ServiceError("INVALID_STATE", "only an unpublished draft can be edited");
      if (post.rowVersion !== expectedVersion) throw new ServiceError("VERSION_CONFLICT", "service draft is stale");
      const revision = { ...post.currentRevision, title: assertText(input.title, "title", 180), summary: assertText(input.summary, "summary", 500), module: input.module, departmentId: assertText(input.departmentId, "departmentId", 100), facts: normalizeFacts(actor, input.module, input.facts, this.flags(actor)), immutable: false };
      post.currentRevision = revision; post.currentRevisionId = revision.id; post.revisions = post.revisions.map((item) => item.id === revision.id ? revision : item); post.updatedAt = nowIso(); post.rowVersion += 1; this.audit(actor, "DRAFT_UPDATED", post.id, input.reason); return post;
    });
  }

  submitReview(actor: ServiceActor, id: string, expectedVersion: number, idempotencyKey: string, reason: string): ServicePost {
    this.assertManage(actor);
    return this.idempotent(actor, idempotencyKey, { id, expectedVersion, reason, action: "submit-review" }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new ServiceError("NOT_FOUND", "service not found");
      if (post.status !== "DRAFT" || post.rowVersion !== expectedVersion) throw new ServiceError(post.status !== "DRAFT" ? "INVALID_STATE" : "VERSION_CONFLICT", "service draft is not ready for review");
      post.status = "IN_REVIEW"; post.updatedAt = nowIso(); post.rowVersion += 1; this.audit(actor, "SUBMITTED_FOR_REVIEW", id, reason); return post;
    });
  }

  approve(actor: ServiceActor, id: string, expectedVersion: number, idempotencyKey: string, reason: string): ServicePost {
    this.assertTenant(actor);
    if (actor.role !== "TENANT_ADMIN") throw new ServiceError("FORBIDDEN", "service approval requires tenant admin");
    return this.idempotent(actor, idempotencyKey, { id, expectedVersion, reason, action: "approve" }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new ServiceError("NOT_FOUND", "service not found");
      if (post.status !== "IN_REVIEW" || post.rowVersion !== expectedVersion) throw new ServiceError(post.status !== "IN_REVIEW" ? "INVALID_STATE" : "VERSION_CONFLICT", "service is not ready for approval");
      post.status = "APPROVED"; post.approvedBy = actor.accountId; post.approvedAt = nowIso(); post.updatedAt = nowIso(); post.rowVersion += 1; this.audit(actor, "APPROVED", id, reason); return post;
    });
  }

  publish(actor: ServiceActor, id: string, expectedVersion: number, idempotencyKey: string, reason: string, now = new Date()): ServicePost {
    this.assertPublish(actor);
    return this.idempotent(actor, idempotencyKey, { id, expectedVersion, reason, action: "publish" }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new ServiceError("NOT_FOUND", "service not found");
      if (post.status !== "APPROVED" || post.rowVersion !== expectedVersion) throw new ServiceError(post.status !== "APPROVED" ? "INVALID_STATE" : "VERSION_CONFLICT", "service is not ready for publish");
      const scheduled = Date.parse(post.currentRevision.facts.effectiveFrom) > now.getTime();
      post.status = scheduled ? "SCHEDULED" : "PUBLISHED"; post.publishedAt = scheduled ? undefined : nowIso(); post.currentRevision = { ...post.currentRevision, immutable: true, ...(scheduled ? {} : { publishedAt: post.publishedAt }) }; post.revisions = post.revisions.map((item) => item.id === post.currentRevisionId ? post.currentRevision : item); post.updatedAt = nowIso(); post.rowVersion += 1; this.audit(actor, scheduled ? "SCHEDULED" : "PUBLISHED", id, reason); return post;
    });
  }

  archive(actor: ServiceActor, id: string, expectedVersion: number, idempotencyKey: string, reason: string): ServicePost {
    this.assertPublish(actor);
    return this.idempotent(actor, idempotencyKey, { id, expectedVersion, reason, action: "archive" }, () => {
      const post = this.posts(actor).find((item) => item.id === id);
      if (!post) throw new ServiceError("NOT_FOUND", "service not found");
      if ((post.status !== "PUBLISHED" && post.status !== "SCHEDULED") || post.rowVersion !== expectedVersion) throw new ServiceError(post.status !== "PUBLISHED" && post.status !== "SCHEDULED" ? "INVALID_STATE" : "VERSION_CONFLICT", "service is not ready for archive");
      post.status = "ARCHIVED"; post.archivedAt = nowIso(); post.updatedAt = nowIso(); post.rowVersion += 1; this.audit(actor, "ARCHIVED", id, reason); return post;
    });
  }

  private publicCard(post: ServicePost, now: Date): PublicServiceCard {
    const revision = post.currentRevision;
    const gold = revision.facts.moduleFacts?.gold;
    const staleWarning = revision.module === "GOLD_PRICE" && !!gold && Date.parse(gold.effectiveAt) + gold.staleAfterMinutes * 60_000 <= now.getTime();
    return { slug: post.slug, title: revision.title, summary: revision.summary, module: revision.module, departmentId: revision.departmentId, hours: revision.facts.hours, location: revision.facts.location, ...(revision.facts.contact.phone ? { phone: revision.facts.contact.phone } : {}), ...(revision.facts.contact.mapUrl ? { mapUrl: revision.facts.contact.mapUrl } : {}), verified: revision.facts.contact.verified, effectiveFrom: revision.facts.effectiveFrom, ...(revision.facts.expiresAt ? { expiresAt: revision.facts.expiresAt } : {}), sourceLastReviewedAt: revision.facts.source.lastReviewedAt, staleWarning };
  }

  listPublished(tenantId: string, query = "", now = new Date()): readonly PublicServiceCard[] {
    const flags = this.featureFlagsByTenant.get(tenantId) ?? { goldPriceEnabled: false, pawnshopEnabled: false, rowVersion: 1 };
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    return (this.postsByTenant.get(tenantId) ?? []).filter((post) => {
      const revision = post.currentRevision;
      const moduleEnabled = revision.module === "STANDARD" || (revision.module === "GOLD_PRICE" && flags.goldPriceEnabled) || (revision.module === "PAWNSHOP" && flags.pawnshopEnabled);
      const effective = post.status === "PUBLISHED" && Date.parse(revision.facts.effectiveFrom) <= now.getTime() && (!revision.facts.expiresAt || Date.parse(revision.facts.expiresAt) > now.getTime());
      const matches = !normalizedQuery || `${post.slug} ${revision.title} ${revision.summary} ${revision.facts.location}`.toLocaleLowerCase("th").includes(normalizedQuery);
      return moduleEnabled && effective && matches;
    }).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).map((post) => this.publicCard(post, now));
  }

  getPublishedBySlug(tenantId: string, slug: string, now = new Date()): PublicServiceDetail {
    const post = (this.postsByTenant.get(tenantId) ?? []).find((item) => item.slug === slug && this.listPublished(tenantId, "", now).some((card) => card.slug === slug));
    if (!post) throw new ServiceError("NOT_FOUND", "published service not found");
    const card = this.publicCard(post, now);
    return { ...card, steps: clone(post.currentRevision.facts.steps), documents: clone(post.currentRevision.facts.documents), fee: post.currentRevision.facts.fee, requirements: clone(post.currentRevision.facts.requirements), source: clone(post.currentRevision.facts.source), ...(post.currentRevision.facts.moduleFacts ? { moduleFacts: clone(post.currentRevision.facts.moduleFacts) } : {}) };
  }
}

export const createSyntheticServicesRepository = (flags?: Partial<ServiceFeatureFlags>): InMemoryServicesRepository => new InMemoryServicesRepository(flags);
