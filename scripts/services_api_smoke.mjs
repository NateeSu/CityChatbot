import assert from "node:assert/strict";

const base = process.env.SERVICES_SMOKE_BASE_URL ?? "http://127.0.0.1:3223";
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
  const response = await fetch(`${base}${path}`, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: response.status, json, text };
};

const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const facts = (effectiveFrom = past, extra = {}) => ({ steps: ["ยื่นคำขอ", "รอเจ้าหน้าที่ตรวจสอบ"], documents: ["บัตรประชาชน"], fee: "ไม่มีค่าธรรมเนียม", hours: "จันทร์–ศุกร์ 08:30–16:30 น.", location: "ศูนย์บริการเทศบาล ชั้น 1", contact: { phone: "038-000-101", mapUrl: "https://maps.example.test/service", verified: true }, requirements: ["ตรวจสอบเอกสารกับเจ้าหน้าที่"], source: { sourceType: "APPROVED_DOCUMENT", reference: "service-handbook-v1", ownerAccountId: "server", lastReviewedAt: past }, effectiveFrom, timezone: "Asia/Bangkok", ...extra });
const draftBody = (slug, key, effectiveFrom = past) => ({ slug, title: "บริการทดสอบ", summary: "ข้อมูลบริการจาก source ที่อนุมัติ", module: "STANDARD", departmentId: "department-a-001", facts: facts(effectiveFrom), reason: "service smoke", idempotencyKey: key });

const health = await request("GET", "/api/health");
assert.equal(health.status, 200);
const initial = await request("GET", `/api/v1/admin/services${adminQuery}`);
assert.equal(initial.status, 200);
const badPhone = await request("POST", `/api/v1/admin/services${prQuery}`, { ...draftBody("service-smoke-bad-phone-001", "service-smoke-bad-phone-001"), facts: facts(past, { contact: { phone: "javascript:bad", verified: false } }) });
assert.equal(badPhone.status, 400);
assert.equal(badPhone.json?.error?.reasonCode, "VALIDATION_ERROR");
const goldDisabled = await request("POST", `/api/v1/admin/services${prQuery}`, { ...draftBody("service-smoke-gold-disabled-001", "service-smoke-gold-disabled-001"), module: "GOLD_PRICE", facts: facts(past, { moduleFacts: { gold: { priceMinor: 1, currency: "THB", effectiveAt: past, source: "feed", staleAfterMinutes: 30, disclaimer: "ตรวจสอบก่อนทำธุรกรรม" } } }) });
assert.equal(goldDisabled.status, 409);
assert.equal(goldDisabled.json?.error?.reasonCode, "FEATURE_DISABLED");

const created = await request("POST", `/api/v1/admin/services${prQuery}`, draftBody("service-smoke-final-001", "service-smoke-create-final-001"));
assert.equal(created.status, 201);
const service = created.json.service;
const id = service.id;
const review = await request("POST", `/api/v1/admin/services/${id}/submit-review${prQuery}`, { expectedVersion: service.rowVersion, reason: "submit smoke service", idempotencyKey: "service-smoke-review-final-001" });
assert.equal(review.status, 200);
const approveBody = { expectedVersion: review.json.service.rowVersion, reason: "approve smoke service", idempotencyKey: "service-smoke-approve-final-001" };
const approvePr = await request("POST", `/api/v1/admin/services/${id}/approve${prQuery}`, approveBody);
assert.equal(approvePr.status, 403);
const approve = await request("POST", `/api/v1/admin/services/${id}/approve${adminQuery}`, approveBody);
assert.equal(approve.status, 200);
const publish = await request("POST", `/api/v1/admin/services/${id}/publish${prQuery}`, { expectedVersion: approve.json.service.rowVersion, reason: "publish smoke service", idempotencyKey: "service-smoke-publish-final-001" });
assert.equal(publish.status, 200);
assert.equal(publish.json.service.status, "PUBLISHED");
const citizen = await request("GET", `/api/v1/citizen/services${citizenQuery}&q=ทดสอบ`);
assert.equal(citizen.status, 200);
assert.equal(citizen.json.items.some((item) => item.slug === service.slug), true);
const detail = await request("GET", `/api/v1/citizen/services/${service.slug}${citizenQuery}`);
assert.equal(detail.status, 200);
assert.equal(detail.json.item.source.reference, "service-handbook-v1");

const futureCreated = await request("POST", `/api/v1/admin/services${prQuery}`, draftBody("service-smoke-future-001", "service-smoke-future-create-001", future));
assert.equal(futureCreated.status, 201);
const futureReview = await request("POST", `/api/v1/admin/services/${futureCreated.json.service.id}/submit-review${prQuery}`, { expectedVersion: futureCreated.json.service.rowVersion, reason: "future review", idempotencyKey: "service-smoke-future-review-001" });
const futureApprove = await request("POST", `/api/v1/admin/services/${futureCreated.json.service.id}/approve${adminQuery}`, { expectedVersion: futureReview.json.service.rowVersion, reason: "future approve", idempotencyKey: "service-smoke-future-approve-001" });
const futurePublish = await request("POST", `/api/v1/admin/services/${futureCreated.json.service.id}/publish${prQuery}`, { expectedVersion: futureApprove.json.service.rowVersion, reason: "future publish", idempotencyKey: "service-smoke-future-publish-001" });
assert.equal(futurePublish.status, 200);
assert.equal(futurePublish.json.service.status, "SCHEDULED");
const futureCitizen = await request("GET", `/api/v1/citizen/services${citizenQuery}`);
assert.equal(futureCitizen.json.items.some((item) => item.slug === "service-smoke-future-001"), false);

const archive = await request("POST", `/api/v1/admin/services/${id}/archive${prQuery}`, { expectedVersion: publish.json.service.rowVersion, reason: "archive smoke service", idempotencyKey: "service-smoke-archive-final-001" });
assert.equal(archive.status, 200);
const afterArchive = await request("GET", `/api/v1/citizen/services${citizenQuery}`);
assert.equal(afterArchive.json.items.some((item) => item.slug === service.slug), false);
const staffMutation = await request("POST", `/api/v1/admin/services${staffQuery}`, draftBody("service-smoke-staff-denied-001", "service-smoke-staff-denied-001"));
assert.equal(staffMutation.status, 403);
assert.equal((await request("GET", `/api/v1/admin/services?tenantId=${otherTenant}&role=TENANT_ADMIN&accountId=${admin}`)).status, 404);
const adminPage = await request("GET", "/admin/services?role=TENANT_ADMIN");
const editorPage = await request("GET", `/admin/services/${id}/edit?role=TENANT_ADMIN`);
const citizenPage = await request("GET", "/liff/services");
const detailPage = await request("GET", `/liff/services/${service.slug}`);
const contactPage = await request("GET", "/liff/contact");
assert.equal(adminPage.status, 200); assert.equal(editorPage.status, 200); assert.equal(citizenPage.status, 200); assert.equal(detailPage.status, 200); assert.equal(contactPage.status, 200);

console.log(`health=${health.status} initial=${initial.status} bad_phone=${badPhone.status}:${badPhone.json.error.reasonCode} gold_disabled=${goldDisabled.status}:${goldDisabled.json.error.reasonCode} draft=${created.status} review=${review.status} approve_pr=${approvePr.status} approve=${approve.status} publish=${publish.status}:${publish.json.service.status} citizen=${citizen.status}:${citizen.json.items.length} detail=${detail.status} future=${futurePublish.status}:${futurePublish.json.service.status} future_hidden=${!futureCitizen.json.items.some((item) => item.slug === "service-smoke-future-001")} archive=${archive.status} after_archive=${afterArchive.json.items.length} staff_mutation=${staffMutation.status} other_tenant=404 admin_page=${adminPage.status} editor_page=${editorPage.status} citizen_page=${citizenPage.status} detail_page=${detailPage.status} contact_page=${contactPage.status}`);
console.log(`ids=published:${id} future:${futureCreated.json.service.id}`);
