import assert from "node:assert/strict";

const base = process.env.NEWS_SMOKE_BASE_URL ?? "http://127.0.0.1:3223";
const tenant = "00000000-0000-4000-8000-000000000001";
const otherTenant = "00000000-0000-4000-8000-000000000002";
const admin = "10000000-0000-4000-8000-000000000003";
const pr = "10000000-0000-4000-8000-000000000001";
const lineUserId = "U11111111111111111111111111111111";
const adminQuery = `?tenantId=${tenant}&role=TENANT_ADMIN&accountId=${admin}`;
const prQuery = `?tenantId=${tenant}&role=PR_STAFF&accountId=${pr}`;
const staffQuery = `?tenantId=${tenant}&role=STAFF&accountId=${pr}`;
const citizenQuery = `?tenantId=${tenant}&lineUserId=${lineUserId}`;

const request = async (method, path, body) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: response.status, json, text };
};

const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const sha256 = "a".repeat(64);

const health = await request("GET", "/api/health");
assert.equal(health.status, 200);
const initial = await request("GET", `/api/v1/admin/news${adminQuery}`);
assert.equal(initial.status, 200);

const unsafe = await request("POST", `/api/v1/admin/news${prQuery}`, {
  slug: "smoke-news-xss-final-001",
  title: "unsafe",
  excerpt: "unsafe",
  bodyHtml: "<script>alert(1)</script>",
  categoryIds: ["news-cat-general-001"],
  tags: ["smoke"],
  attachments: [],
  effectiveFrom: past,
  reason: "xss rejection",
  idempotencyKey: "news-smoke-xss-final-001",
});
assert.equal(unsafe.status, 400);
assert.equal(unsafe.json?.error?.reasonCode, "VALIDATION_ERROR");

const created = await request("POST", `/api/v1/admin/news${prQuery}`, {
  slug: "smoke-news-final-002",
  title: "ข่าวทดสอบระบบ",
  excerpt: "ข่าวสำหรับตรวจสอบเส้นทาง publish",
  bodyHtml: '<p>เนื้อหา <strong>ผ่านการ sanitize</strong> <a href="https://example.com">ลิงก์</a></p>',
  categoryIds: ["news-cat-general-001"],
  tags: ["smoke", "ข่าว"],
  attachments: [{
    storageKey: `private/tenants/${tenant}/news/smoke.png`,
    contentType: "image/png",
    sizeBytes: 1024,
    width: 800,
    height: 600,
    sha256,
    altText: "ภาพประกอบข่าวทดสอบ",
  }],
  effectiveFrom: past,
  reason: "news smoke create",
  idempotencyKey: "news-smoke-create-final-002",
  aiDraft: true,
});
assert.equal(created.status, 201);
const post = created.json.post;
const id = post.id;

const review = await request("POST", `/api/v1/admin/news/${id}/submit-review${prQuery}`, {
  expectedVersion: post.rowVersion,
  reason: "submit smoke review",
  idempotencyKey: "news-smoke-review-final-002",
});
assert.equal(review.status, 200);
assert.equal(review.json.post.status, "IN_REVIEW");

const approveBody = {
  expectedVersion: review.json.post.rowVersion,
  reason: "approve smoke news",
  idempotencyKey: "news-smoke-approve-final-002",
};
const approvePr = await request("POST", `/api/v1/admin/news/${id}/approve${prQuery}`, approveBody);
assert.equal(approvePr.status, 403);
const approve = await request("POST", `/api/v1/admin/news/${id}/approve${adminQuery}`, approveBody);
assert.equal(approve.status, 200);
assert.equal(approve.json.post.status, "APPROVED");

const publish = await request("POST", `/api/v1/admin/news/${id}/publish${prQuery}`, {
  expectedVersion: approve.json.post.rowVersion,
  reason: "publish smoke news",
  idempotencyKey: "news-smoke-publish-final-002",
});
assert.equal(publish.status, 200);
assert.equal(publish.json.post.status, "PUBLISHED");

const citizen = await request("GET", `/api/v1/citizen/news${citizenQuery}`);
assert.equal(citizen.status, 200);
assert.equal(citizen.json.items.some((item) => item.slug === post.slug), true);
const detail = await request("GET", `/api/v1/citizen/news/${post.slug}${citizenQuery}`);
assert.equal(detail.status, 200);
assert.match(detail.json.item.bodyHtml, /<strong>ผ่านการ sanitize<\/strong>/u);

const preview = await request("POST", `/api/v1/admin/news/${id}/broadcasts${prQuery}`, { action: "preview" });
assert.equal(preview.status, 200);
assert.equal(preview.json.preview.confirmationRequired, true);
const queueBody = { action: "queue", reason: "queue smoke broadcast", idempotencyKey: "news-smoke-broadcast-final-002" };
const queue = await request("POST", `/api/v1/admin/news/${id}/broadcasts${prQuery}`, queueBody);
assert.equal(queue.status, 202);
assert.equal(queue.json.run.status, "QUEUED");
const queueReplay = await request("POST", `/api/v1/admin/news/${id}/broadcasts${prQuery}`, queueBody);
assert.equal(queueReplay.status, 202);
assert.equal(queueReplay.json.run.id, queue.json.run.id);

const archive = await request("POST", `/api/v1/admin/news/${id}/archive${prQuery}`, {
  expectedVersion: publish.json.post.rowVersion,
  reason: "archive smoke news",
  idempotencyKey: "news-smoke-archive-final-002",
});
assert.equal(archive.status, 200);
assert.equal(archive.json.post.status, "ARCHIVED");
const afterArchive = await request("GET", `/api/v1/citizen/news${citizenQuery}`);
assert.equal(afterArchive.status, 200);
assert.equal(afterArchive.json.items.some((item) => item.slug === post.slug), false);

const futureCreated = await request("POST", `/api/v1/admin/news${prQuery}`, {
  slug: "smoke-news-future-final-002",
  title: "ข่าวตั้งเวลา",
  excerpt: "ข่าวในอนาคต",
  bodyHtml: "<p>future</p>",
  categoryIds: ["news-cat-general-001"],
  tags: ["future"],
  attachments: [],
  effectiveFrom: future,
  reason: "future create",
  idempotencyKey: "news-smoke-future-create-final-002",
});
assert.equal(futureCreated.status, 201);
const futurePost = futureCreated.json.post;
const futureReview = await request("POST", `/api/v1/admin/news/${futurePost.id}/submit-review${prQuery}`, {
  expectedVersion: futurePost.rowVersion,
  reason: "future review",
  idempotencyKey: "news-smoke-future-review-final-002",
});
const futureApprove = await request("POST", `/api/v1/admin/news/${futurePost.id}/approve${adminQuery}`, {
  expectedVersion: futureReview.json.post.rowVersion,
  reason: "future approve",
  idempotencyKey: "news-smoke-future-approve-final-002",
});
const futurePublish = await request("POST", `/api/v1/admin/news/${futurePost.id}/publish${prQuery}`, {
  expectedVersion: futureApprove.json.post.rowVersion,
  reason: "future publish",
  idempotencyKey: "news-smoke-future-publish-final-002",
});
assert.equal(futurePublish.status, 200);
assert.equal(futurePublish.json.post.status, "SCHEDULED");
const futureVisible = await request("GET", `/api/v1/citizen/news${citizenQuery}`);
assert.equal(futureVisible.json.items.some((item) => item.slug === futurePost.slug), false);

const staffMutation = await request("POST", `/api/v1/admin/news${staffQuery}`, {
  slug: "smoke-news-staff-denied-001",
  title: "denied",
  excerpt: "denied",
  bodyHtml: "<p>denied</p>",
  categoryIds: ["news-cat-general-001"],
  tags: [],
  attachments: [],
  effectiveFrom: past,
  reason: "staff permission check",
  idempotencyKey: "news-smoke-staff-denied-001",
});
assert.equal(staffMutation.status, 403);
const crossTenant = await request("GET", `/api/v1/admin/news?tenantId=${otherTenant}&role=TENANT_ADMIN&accountId=${admin}`);
assert.equal(crossTenant.status, 404);

const adminPage = await request("GET", "/admin/news?role=TENANT_ADMIN");
const editorPage = await request("GET", `/admin/news/${id}/edit?role=TENANT_ADMIN`);
const citizenPage = await request("GET", "/liff/news");
assert.equal(adminPage.status, 200);
assert.equal(editorPage.status, 200);
assert.equal(citizenPage.status, 200);

console.log(`health=${health.status} initial=${initial.status} bad_xss=${unsafe.status}:${unsafe.json.error.reasonCode} draft=${created.status} review=${review.status} approve_pr=${approvePr.status} approve=${approve.status} publish=${publish.status}:${publish.json.post.status} citizen=${citizen.status}:${citizen.json.items.length} detail=${detail.status} preview=${preview.status}:${preview.json.preview.confirmationRequired} queue=${queue.status}:${queue.json.run.status} queue_replay=${queueReplay.status}:${queueReplay.json.run.id === queue.json.run.id} archive=${archive.status} after_archive=${afterArchive.json.items.length} future=${futurePublish.status}:${futurePublish.json.post.status} future_visible=${futureVisible.json.items.length} staff_mutation=${staffMutation.status}:${staffMutation.json.error.reasonCode} other_tenant=${crossTenant.status} admin_page=${adminPage.status} editor_page=${editorPage.status} citizen_page=${citizenPage.status}`);
console.log(`ids=published:${id} queued:${queue.json.run.id} future:${futurePost.id}`);
