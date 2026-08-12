import { beforeEach, describe, expect, it } from "vitest";

import {
  InMemoryLineRichMenuProvider,
  InMemoryRichMenuStore,
  RichMenuError,
  RichMenuService,
  type RichMenuAreaInput,
  type RichMenuDraftInput,
  type RichMenuActor,
} from "./rich-menu";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
const ACTOR: RichMenuActor = { tenantId: TENANT_ID, accountId: ACCOUNT_ID, role: "TENANT_ADMIN" };
const SHA = "a".repeat(64);

const area = (input: Omit<RichMenuAreaInput, "action"> & { action?: RichMenuAreaInput["action"] }): RichMenuAreaInput => ({
  ...input,
  action: input.action ?? { type: "URI", label: input.label, uri: `https://liff.line.me/${input.label}` },
});

const defaultAreas = (): readonly RichMenuAreaInput[] => [
  area({ x: 0, y: 0, width: 1667, height: 1000, label: "แจ้งปัญหา", sortOrder: 0 }),
  area({ x: 1667, y: 0, width: 833, height: 1000, label: "ติดตามสถานะ", sortOrder: 1 }),
  area({ x: 0, y: 1000, width: 833, height: 686, label: "ข่าวสาร", sortOrder: 2 }),
  area({ x: 833, y: 1000, width: 834, height: 686, label: "บริการ", sortOrder: 3 }),
  area({ x: 1667, y: 1000, width: 833, height: 686, label: "ติดต่อ", sortOrder: 4 }),
];

const draft = (overrides: Partial<RichMenuDraftInput> = {}): RichMenuDraftInput => ({
  tenantId: TENANT_ID,
  chatBarText: "เมนู",
  image: { contentType: "image/png", width: 2500, height: 1686, sizeBytes: 67_829, sha256: SHA, storageKey: `private/tenants/${TENANT_ID}/rich-menu/RM-01-main.png` },
  areas: defaultAreas(),
  ...overrides,
});

describe("rich menu lifecycle", () => {
  let provider: InMemoryLineRichMenuProvider;
  let service: RichMenuService;

  beforeEach(() => {
    provider = new InMemoryLineRichMenuProvider();
    service = new RichMenuService({ provider, store: new InMemoryRichMenuStore(), policy: { tenantId: TENANT_ID, allowedUriPrefixes: ["https://liff.line.me/"], enabledFeatures: ["complaints", "tracking", "news", "services", "contact"] } });
  });

  const createValidated = (): ReturnType<RichMenuService["validate"]> => {
    const created = service.create(draft(), ACTOR, "สร้างฉบับร่าง Rich Menu", "create-key-001");
    return service.validate(TENANT_ID, created.id, ACTOR, created.rowVersion, "ตรวจสอบ geometry และ action", "validate-key-001");
  };

  it("accepts the canonical 2500x1686 five-area design", () => {
    const created = service.create(draft(), ACTOR, "สร้างฉบับร่าง Rich Menu", "create-key-002");
    expect(created.state).toBe("DRAFT");
    expect(created.areas).toHaveLength(5);
    expect(created.areas.map((item) => item.label)).toEqual(["แจ้งปัญหา", "ติดตามสถานะ", "ข่าวสาร", "บริการ", "ติดต่อ"]);
  });

  it("rejects overlaps, unintended gaps, invalid URLs and unsafe storage paths", () => {
    expect(() => service.create(draft({ areas: [area({ x: 0, y: 0, width: 1800, height: 1000, label: "A", sortOrder: 0 }), area({ x: 1700, y: 0, width: 800, height: 1000, label: "B", sortOrder: 1 })] }), ACTOR, "ทดสอบพื้นที่", "create-key-003")).toThrowError(new RichMenuError("VALIDATION_ERROR", "Rich Menu tap areas must not overlap"));
    expect(() => service.create(draft({ areas: [area({ x: 0, y: 0, width: 1000, height: 1000, label: "A", sortOrder: 0 })] }), ACTOR, "ทดสอบช่องว่าง", "create-key-004")).toThrow("Rich Menu tap areas leave an unintended gap");
    expect(() => service.create(draft({ areas: defaultAreas().map((item) => ({ ...item, action: { ...item.action, uri: "https://evil.example/path" } })) }), ACTOR, "ทดสอบ URL", "create-key-005")).toThrow("outside the tenant URL allowlist");
    expect(() => service.create(draft({ image: { ...draft().image, storageKey: `public/${TENANT_ID}/rich-menu.png` } }), ACTOR, "ทดสอบ storage", "create-key-006")).toThrow("private tenant-scoped path");
  });

  it("enforces tenant and role isolation before reading or mutating", () => {
    expect(() => service.create(draft({ tenantId: OTHER_TENANT_ID }), ACTOR, "ผิด tenant", "create-key-007")).toThrow("tenant scope");
    expect(() => service.list(TENANT_ID, { ...ACTOR, role: "SUPER_ADMIN", tenantId: OTHER_TENANT_ID })).toThrow("tenant scope");
    expect(() => service.list(TENANT_ID, { ...ACTOR, role: "TENANT_ADMIN", accountId: "10000000-0000-4000-8000-000000000004" })).not.toThrow();
  });

  it("deduplicates create and validate operations by tenant-scoped idempotency key", () => {
    const first = service.create(draft(), ACTOR, "สร้างฉบับร่าง", "create-key-008");
    const replay = service.create(draft(), ACTOR, "สร้างฉบับร่าง", "create-key-008");
    expect(replay.id).toBe(first.id);
    const validated = service.validate(TENANT_ID, first.id, ACTOR, first.rowVersion, "ตรวจสอบ", "validate-key-008");
    expect(service.validate(TENANT_ID, first.id, ACTOR, first.rowVersion, "ตรวจสอบ", "validate-key-008").id).toBe(validated.id);
  });

  it("requires the expected row version and canonical validate before publish", async () => {
    const created = service.create(draft(), ACTOR, "สร้าง", "create-key-009");
    expect(() => service.validate(TENANT_ID, created.id, ACTOR, created.rowVersion + 1, "ตรวจสอบ", "validate-key-009")).toThrow("changed");
    await expect(service.publish(TENANT_ID, created.id, ACTOR, created.rowVersion, "เผยแพร่", "publish-key-009")).rejects.toThrow("validated");
  });

  it("publishes a new provider object atomically and supersedes the previous version", async () => {
    const first = createValidated();
    const publishedFirst = await service.publish(TENANT_ID, first.id, ACTOR, first.rowVersion, "เผยแพร่ครั้งแรก", "publish-key-010");
    const secondDraft = service.create(draft({ chatBarText: "เมนูใหม่" }), ACTOR, "สร้างเวอร์ชันใหม่", "create-key-011");
    const second = service.validate(TENANT_ID, secondDraft.id, ACTOR, secondDraft.rowVersion, "ตรวจสอบเวอร์ชันใหม่", "validate-key-011");
    const publishedSecond = await service.publish(TENANT_ID, second.id, ACTOR, second.rowVersion, "เผยแพร่เวอร์ชันใหม่", "publish-key-011");
    expect(publishedFirst.state).toBe("PUBLISHED");
    expect(publishedSecond.state).toBe("PUBLISHED");
    expect(service.store.get(TENANT_ID, first.id)?.state).toBe("SUPERSEDED");
    expect(provider.calls).toEqual(["create:local-rich-menu-1", "upload:local-rich-menu-1", "default:local-rich-menu-1", "create:local-rich-menu-2", "upload:local-rich-menu-2", "default:local-rich-menu-2"]);
    expect(service.store.audit(TENANT_ID).map((entry) => entry.action)).toContain("RICH_MENU_PUBLISHED");
  });

  it("keeps last-known-good active when provider publish fails", async () => {
    const first = createValidated();
    await service.publish(TENANT_ID, first.id, ACTOR, first.rowVersion, "เผยแพร่", "publish-key-012");
    const secondDraft = service.create(draft({ chatBarText: "ล้มเหลว" }), ACTOR, "สร้างเวอร์ชันล้มเหลว", "create-key-013");
    const second = service.validate(TENANT_ID, secondDraft.id, ACTOR, secondDraft.rowVersion, "ตรวจสอบ", "validate-key-013");
    provider.failNext = true;
    await expect(service.publish(TENANT_ID, second.id, ACTOR, second.rowVersion, "ทดสอบ provider ล้มเหลว", "publish-key-013")).rejects.toThrow("last-known-good");
    expect(service.store.get(TENANT_ID, first.id)?.state).toBe("PUBLISHED");
    expect(service.store.get(TENANT_ID, second.id)?.state).toBe("FAILED");
  });

  it("restores a superseded version with one rollback operation", async () => {
    const first = createValidated();
    const firstPublished = await service.publish(TENANT_ID, first.id, ACTOR, first.rowVersion, "เผยแพร่", "publish-key-014");
    const secondDraft = service.create(draft(), ACTOR, "สร้างเวอร์ชันสอง", "create-key-015");
    const second = service.validate(TENANT_ID, secondDraft.id, ACTOR, secondDraft.rowVersion, "ตรวจสอบ", "validate-key-015");
    const secondPublished = await service.publish(TENANT_ID, second.id, ACTOR, second.rowVersion, "เผยแพร่เวอร์ชันสอง", "publish-key-015");
    const firstSuperseded = service.store.get(TENANT_ID, first.id)!;
    const restored = await service.rollback(TENANT_ID, first.id, ACTOR, firstSuperseded.rowVersion, "ย้อนกลับฉบับล่าสุดที่ผ่านการรับรอง", "rollback-key-015");
    expect(restored.state).toBe("PUBLISHED");
    expect(service.store.get(TENANT_ID, second.id)?.state).toBe("SUPERSEDED");
    expect(provider.calls.at(-1)).toBe(`default:${firstPublished.providerMenuId}`);
    expect(secondPublished.providerMenuId).not.toBe(firstPublished.providerMenuId);
  });

  it("blocks unavailable feature dependencies and unsupported image metadata", () => {
    expect(() => service.create(draft({ areas: defaultAreas().map((item, index) => index === 0 ? { ...item, action: { ...item.action, featureKey: "not-enabled" } } : item) }), ACTOR, "ทดสอบ feature", "create-key-016")).toThrow("feature dependency");
    expect(() => service.create(draft({ image: { ...draft().image, contentType: "image/jpeg", width: 800, height: 800 } }), ACTOR, "ทดสอบอัตราส่วน", "create-key-017")).toThrow("aspect ratio");
    expect(() => service.create(draft({ chatBarText: "ข้อความยาวเกินสิบสี่ตัวอักษร" }), ACTOR, "ทดสอบ chat bar", "create-key-018")).toThrow("chatBarText");
  });
});
