import { describe, expect, it } from "vitest";

import {
  InMemoryNewsRepository,
  SYNTHETIC_NEWS_ADMIN_ACCOUNT_ID,
  SYNTHETIC_NEWS_PR_ACCOUNT_ID,
  SYNTHETIC_NEWS_TENANT_ID,
  sanitizeRichText,
} from "./news";

const admin = { tenantId: SYNTHETIC_NEWS_TENANT_ID, accountId: SYNTHETIC_NEWS_ADMIN_ACCOUNT_ID, role: "TENANT_ADMIN" as const };
const pr = { tenantId: SYNTHETIC_NEWS_TENANT_ID, accountId: SYNTHETIC_NEWS_PR_ACCOUNT_ID, role: "PR_STAFF" as const };
const staff = { tenantId: SYNTHETIC_NEWS_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000002", role: "STAFF" as const };
const categoryIds = ["news-cat-general-001"];
const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 86_400_000).toISOString();
const input = (key: string, overrides: Record<string, unknown> = {}) => ({
  slug: "city-update-001",
  title: "ประกาศข่าวสารเมือง",
  excerpt: "ข่าวสารที่ผ่านการตรวจสอบแล้ว",
  bodyHtml: "<p>รายละเอียด <strong>ประกาศ</strong></p>",
  categoryIds,
  tags: ["ประกาศ"],
  attachments: [],
  effectiveFrom: past,
  timezone: "Asia/Bangkok" as const,
  reason: "news unit test",
  idempotencyKey: key,
  ...overrides,
});

describe("news workflow", () => {
  it("sanitizes allowed rich text and rejects active markup/URLs", () => {
    expect(sanitizeRichText('<p onclick="alert(1)">safe <strong>text</strong></p>')).toBe("<p>safe <strong>text</strong></p>");
    expect(() => sanitizeRichText("<script>alert(1)</script>")).toThrow(/VALIDATION_ERROR/u);
    expect(() => sanitizeRichText('<a href="javascript:alert(1)">bad</a>')).toThrow(/VALIDATION_ERROR/u);
  });

  it("runs draft, review, approval and immediate publish with public read filtering", () => {
    const repository = new InMemoryNewsRepository();
    const draft = repository.createDraft(admin, input("news-create-001"));
    expect(draft.status).toBe("DRAFT");
    const review = repository.submitReview(pr, draft.id, draft.rowVersion, "news-review-001", "submit for owner review");
    const approved = repository.approve(admin, draft.id, review.rowVersion, "news-approve-001", "owner approved source");
    const published = repository.publish(pr, draft.id, approved.rowVersion, "news-publish-001", "publish approved news");
    expect(published.status).toBe("PUBLISHED");
    expect(repository.listPublished(SYNTHETIC_NEWS_TENANT_ID)).toHaveLength(1);
    expect(repository.getPublishedBySlug(SYNTHETIC_NEWS_TENANT_ID, "city-update-001").bodyHtml).toContain("<strong>");
  });

  it("keeps future and expired news out of the citizen list", () => {
    const repository = new InMemoryNewsRepository();
    const scheduled = repository.createDraft(admin, input("news-future-001", { slug: "future-news-001", effectiveFrom: future }));
    const review = repository.submitReview(admin, scheduled.id, scheduled.rowVersion, "news-future-review-001", "submit");
    const approved = repository.approve(admin, scheduled.id, review.rowVersion, "news-future-approve-001", "approve");
    expect(repository.publish(admin, scheduled.id, approved.rowVersion, "news-future-publish-001", "schedule").status).toBe("SCHEDULED");
    expect(repository.listPublished(SYNTHETIC_NEWS_TENANT_ID)).toHaveLength(0);

    const expired = repository.createDraft(admin, input("news-expired-001", { slug: "expired-news-001", effectiveFrom: past, expiresAt: new Date(Date.now() - 1_000).toISOString() }));
    const expiredReview = repository.submitReview(admin, expired.id, expired.rowVersion, "news-expired-review-001", "submit");
    const expiredApproved = repository.approve(admin, expired.id, expiredReview.rowVersion, "news-expired-approve-001", "approve");
    expect(repository.publish(admin, expired.id, expiredApproved.rowVersion, "news-expired-publish-001", "expired").status).toBe("PUBLISHED");
    expect(repository.listPublished(SYNTHETIC_NEWS_TENANT_ID)).toHaveLength(0);
  });

  it("separates edit/publish permissions, detects stale writes and preserves idempotency", () => {
    const repository = new InMemoryNewsRepository();
    const draft = repository.createDraft(pr, input("news-idempotent-001"));
    const replay = repository.createDraft(pr, input("news-idempotent-001"));
    expect(replay.id).toBe(draft.id);
    expect(() => repository.updateDraft(staff, draft.id, draft.rowVersion, input("news-staff-update-001"))).toThrow(/FORBIDDEN/u);
    expect(() => repository.updateDraft(pr, draft.id, draft.rowVersion - 1, input("news-stale-update-001"))).toThrow(/VERSION_CONFLICT/u);
    expect(() => repository.approve(pr, draft.id, draft.rowVersion, "news-pr-approve-001", "not allowed")).toThrow(/FORBIDDEN/u);
  });

  it("requires tenant-scoped media metadata and supports revision restore through a new draft", () => {
    const repository = new InMemoryNewsRepository();
    const original = repository.createDraft(admin, input("news-revision-create-001", { attachments: [{ storageKey: `private/tenants/${SYNTHETIC_NEWS_TENANT_ID}/news/image.png`, contentType: "image/png", sizeBytes: 20_000, width: 1200, height: 800, sha256: "a".repeat(64), altText: "ภาพประกาศ" }] }));
    const review = repository.submitReview(admin, original.id, original.rowVersion, "news-revision-review-001", "submit");
    const approved = repository.approve(admin, original.id, review.rowVersion, "news-revision-approve-001", "approve");
    const published = repository.publish(admin, original.id, approved.rowVersion, "news-revision-publish-001", "publish");
    expect(published.currentRevision.immutable).toBe(true);
    expect(() => repository.createDraft(admin, input("news-bad-asset-001", { slug: "bad-asset-001", attachments: [{ storageKey: "private/tenants/other/news/bad.png", contentType: "image/png", sizeBytes: 20, width: 1, height: 1, sha256: "b".repeat(64), altText: "bad" }] }))).toThrow(/VALIDATION_ERROR/u);
    const revision = repository.createDraft(admin, input("news-revision-new-draft-001", { sourcePostId: published.id }));
    expect(revision.status).toBe("DRAFT");
    expect(revision.revisions[0]?.immutable).toBe(true);
    expect(revision.revisions).toHaveLength(2);
  });

  it("previews and queues a broadcast once with audience confirmation", () => {
    const repository = new InMemoryNewsRepository();
    const draft = repository.createDraft(admin, input("news-broadcast-create-001", { slug: "broadcast-news-001" }));
    const review = repository.submitReview(admin, draft.id, draft.rowVersion, "news-broadcast-review-001", "submit");
    const approved = repository.approve(admin, draft.id, review.rowVersion, "news-broadcast-approve-001", "approve");
    const published = repository.publish(admin, draft.id, approved.rowVersion, "news-broadcast-publish-001", "publish");
    const preview = repository.previewBroadcast(admin, published.id);
    expect(preview.previewOnly).toBe(true);
    expect(preview.confirmationRequired).toBe(true);
    const run = repository.queueBroadcast(admin, published.id, "news-broadcast-queue-001", "confirmed synthetic local delivery");
    expect(run.status).toBe("QUEUED");
    expect(repository.queueBroadcast(admin, published.id, "news-broadcast-queue-001", "confirmed synthetic local delivery").id).toBe(run.id);
  });
});
