import { describe, expect, it } from "vitest";

import {
  InMemoryServicesRepository,
  SERVICE_TIMEZONE,
  SYNTHETIC_SERVICE_ADMIN_ACCOUNT_ID,
  SYNTHETIC_SERVICE_PR_ACCOUNT_ID,
  SYNTHETIC_SERVICE_TENANT_ID,
  type ServiceFacts,
} from "./services";

const admin = { tenantId: SYNTHETIC_SERVICE_TENANT_ID, accountId: SYNTHETIC_SERVICE_ADMIN_ACCOUNT_ID, role: "TENANT_ADMIN" as const };
const pr = { tenantId: SYNTHETIC_SERVICE_TENANT_ID, accountId: SYNTHETIC_SERVICE_PR_ACCOUNT_ID, role: "PR_STAFF" as const };
const staff = { tenantId: SYNTHETIC_SERVICE_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000002", role: "STAFF" as const };
const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();

const facts = (overrides: Partial<ServiceFacts> = {}): ServiceFacts => ({
  steps: ["ยื่นคำขอ", "รอเจ้าหน้าที่ตรวจสอบ"],
  documents: ["บัตรประชาชน"],
  fee: "ไม่มีค่าธรรมเนียม",
  hours: "จันทร์–ศุกร์ 08:30–16:30 น.",
  location: "ศูนย์บริการเทศบาล ชั้น 1",
  contact: { phone: "038-000-101", mapUrl: "https://maps.example.test/service", websiteUrl: "https://city.example.test/service", verified: true },
  requirements: ["ผู้ยื่นคำขอต้องมีอายุ 18 ปีขึ้นไป"],
  source: { sourceType: "APPROVED_DOCUMENT", reference: "service-handbook-v1", ownerAccountId: SYNTHETIC_SERVICE_PR_ACCOUNT_ID, lastReviewedAt: past },
  effectiveFrom: past,
  timezone: SERVICE_TIMEZONE,
  ...overrides,
});

const input = (key: string, overrides: Record<string, unknown> = {}) => ({
  slug: "permit-service-001",
  title: "ขออนุญาตบริการทดสอบ",
  summary: "บริการที่มีข้อมูลโครงสร้างและแหล่งที่มาชัดเจน",
  module: "STANDARD" as const,
  departmentId: "department-a-001",
  facts: facts(),
  reason: "service unit test",
  idempotencyKey: key,
  ...overrides,
});

describe("service directory workflow", () => {
  it("validates exact structured facts and safe contact links", () => {
    const repository = new InMemoryServicesRepository();
    const draft = repository.createDraft(admin, input("service-facts-001"));
    expect(draft.currentRevision.facts.source.ownerAccountId).toBe(admin.accountId);
    expect(draft.currentRevision.facts.timezone).toBe(SERVICE_TIMEZONE);
    expect(() => repository.createDraft(admin, input("service-bad-phone-001", { slug: "bad-phone-001", facts: facts({ contact: { phone: "javascript:bad", verified: false } }) }))).toThrow(/VALIDATION_ERROR/u);
    expect(() => repository.createDraft(admin, input("service-bad-map-001", { slug: "bad-map-001", facts: facts({ contact: { mapUrl: "http://unsafe.example", verified: false } }) }))).toThrow(/VALIDATION_ERROR/u);
  });

  it("runs review, approval, publish and exposes only approved public facts", () => {
    const repository = new InMemoryServicesRepository();
    const draft = repository.createDraft(pr, input("service-flow-001"));
    const review = repository.submitReview(pr, draft.id, draft.rowVersion, "service-flow-review-001", "ส่งให้เจ้าของตรวจ");
    const approved = repository.approve(admin, draft.id, review.rowVersion, "service-flow-approve-001", "อนุมัติข้อมูลบริการ");
    const published = repository.publish(pr, draft.id, approved.rowVersion, "service-flow-publish-001", "เผยแพร่ข้อมูลที่อนุมัติ");
    expect(published.status).toBe("PUBLISHED");
    const cards = repository.listPublished(SYNTHETIC_SERVICE_TENANT_ID, "อนุญาต");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.phone).toBe("038-000-101");
    expect(repository.getPublishedBySlug(SYNTHETIC_SERVICE_TENANT_ID, "permit-service-001").steps).toHaveLength(2);
  });

  it("hides future and expired facts and supports deterministic search", () => {
    const repository = new InMemoryServicesRepository();
    const scheduled = repository.createDraft(admin, input("service-future-001", { slug: "future-service-001", title: "บริการอนาคต", facts: facts({ effectiveFrom: future }) }));
    const reviewed = repository.submitReview(admin, scheduled.id, scheduled.rowVersion, "service-future-review-001", "submit");
    const approved = repository.approve(admin, scheduled.id, reviewed.rowVersion, "service-future-approve-001", "approve");
    expect(repository.publish(admin, scheduled.id, approved.rowVersion, "service-future-publish-001", "schedule").status).toBe("SCHEDULED");
    expect(repository.listPublished(SYNTHETIC_SERVICE_TENANT_ID)).toHaveLength(0);

    const expired = repository.createDraft(admin, input("service-expired-001", { slug: "expired-service-001", facts: facts({ expiresAt: new Date(Date.now() - 1_000).toISOString() }) }));
    const expiredReview = repository.submitReview(admin, expired.id, expired.rowVersion, "service-expired-review-001", "submit");
    const expiredApprove = repository.approve(admin, expired.id, expiredReview.rowVersion, "service-expired-approve-001", "approve");
    repository.publish(admin, expired.id, expiredApprove.rowVersion, "service-expired-publish-001", "publish");
    expect(repository.listPublished(SYNTHETIC_SERVICE_TENANT_ID, "expired")).toHaveLength(0);
  });

  it("enforces role, tenant and optimistic-concurrency boundaries", () => {
    const repository = new InMemoryServicesRepository();
    const draft = repository.createDraft(pr, input("service-permission-001"));
    expect(repository.createDraft(pr, input("service-permission-001"),).id).toBe(draft.id);
    expect(() => repository.updateDraft(staff, draft.id, draft.rowVersion, input("service-staff-update-001"))).toThrow(/FORBIDDEN/u);
    expect(() => repository.updateDraft(pr, draft.id, draft.rowVersion - 1, input("service-stale-update-001"))).toThrow(/VERSION_CONFLICT/u);
    expect(() => repository.approve(pr, draft.id, draft.rowVersion, "service-pr-approve-001", "not allowed")).toThrow(/FORBIDDEN/u);
    expect(() => repository.get({ ...admin, tenantId: "00000000-0000-4000-8000-000000000002" }, draft.id)).toThrow(/FORBIDDEN/u);
  });

  it("keeps published revisions immutable and restores through a new draft", () => {
    const repository = new InMemoryServicesRepository();
    const draft = repository.createDraft(admin, input("service-revision-001"));
    const review = repository.submitReview(admin, draft.id, draft.rowVersion, "service-revision-review-001", "submit");
    const approved = repository.approve(admin, draft.id, review.rowVersion, "service-revision-approve-001", "approve");
    const published = repository.publish(admin, draft.id, approved.rowVersion, "service-revision-publish-001", "publish");
    expect(published.currentRevision.immutable).toBe(true);
    const next = repository.createDraft(admin, input("service-revision-restore-001", { sourceServiceId: published.id, slug: published.slug }));
    expect(next.status).toBe("DRAFT");
    expect(next.revisions).toHaveLength(2);
    expect(next.revisions[0]?.immutable).toBe(true);
  });

  it("keeps gold module behind a tenant feature flag and reports stale data", () => {
    const repository = new InMemoryServicesRepository({ goldPriceEnabled: true });
    const draft = repository.createDraft(admin, input("service-gold-001", { slug: "gold-service-001", module: "GOLD_PRICE", facts: facts({ moduleFacts: { gold: { priceMinor: 3210000, currency: "THB", effectiveAt: new Date(Date.now() - 3_600_000).toISOString(), source: "approved-gold-feed-v1", staleAfterMinutes: 30, disclaimer: "ราคาอ้างอิง ต้องตรวจสอบก่อนทำธุรกรรม" } } }) }));
    const review = repository.submitReview(admin, draft.id, draft.rowVersion, "service-gold-review-001", "submit");
    const approved = repository.approve(admin, draft.id, review.rowVersion, "service-gold-approve-001", "approve");
    repository.publish(admin, draft.id, approved.rowVersion, "service-gold-publish-001", "publish");
    expect(repository.listPublished(SYNTHETIC_SERVICE_TENANT_ID)[0]?.staleWarning).toBe(true);
    expect(() => new InMemoryServicesRepository().createDraft(admin, input("service-gold-disabled-001", { slug: "gold-disabled-001", module: "GOLD_PRICE", facts: facts({ moduleFacts: { gold: { priceMinor: 1, currency: "THB", effectiveAt: past, source: "source", staleAfterMinutes: 30, disclaimer: "disclaimer" } } }) }))).toThrow(/FEATURE_DISABLED/u);
  });
});
