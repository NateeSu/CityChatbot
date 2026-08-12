import { describe, expect, it } from "vitest";

import {
  InMemoryUploadReplayGuard,
  buildPrivateObjectTarget,
  canTransitionIngestionState,
  consumeSignedUploadToken,
  createSignedUploadTarget,
  finalizeUpload,
  getPrivateBucketPolicy,
  sha256Hex,
  validateUpload,
  type MalwareScanner,
  type UploadValidationInput,
} from "./storage";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const RESOURCE_A = "33333333-3333-4333-8333-333333333333";
const ATTACHMENT_A = "44444444-4444-4444-8444-444444444444";
const SIGNING_SECRET = "storage-signing-secret-with-at-least-32-bytes";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const baseInput = (overrides: Partial<UploadValidationInput> = {}): UploadValidationInput => {
  const bytes = overrides.bytes ?? JPEG;
  const fileName = overrides.fileName ?? "photo.jpg";
  const target = buildPrivateObjectTarget("test", {
    tenantId: TENANT_A,
    resourceType: "complaint-draft",
    resourceId: RESOURCE_A,
    attachmentId: ATTACHMENT_A,
  }, fileName);
  return {
    tenantId: TENANT_A,
    resourceType: "complaint-draft",
    resourceId: RESOURCE_A,
    attachmentId: ATTACHMENT_A,
    environment: "test",
    fileName,
    contentType: "image/jpeg",
    declaredSize: bytes.byteLength,
    bytes,
    expectedSha256: sha256Hex(bytes),
    objectKey: target.objectKey,
    ...overrides,
  };
};

const cleanScanner: MalwareScanner = { scan: async () => "CLEAN" };

describe("private storage and upload validation", () => {
  it("uses a private, non-listable bucket and tenant-scoped opaque object path", () => {
    const policy = getPrivateBucketPolicy("production");
    const target = buildPrivateObjectTarget("production", {
      tenantId: TENANT_A,
      resourceType: "complaint-draft",
      resourceId: RESOURCE_A,
      attachmentId: ATTACHMENT_A,
    }, "citizen-photo.jpg");
    expect(policy).toMatchObject({ public: false, publicListing: false, signedUrlTtlSeconds: 300 });
    expect(target).toMatchObject({ bucket: "citychatbot-production-private", isPublic: false });
    expect(target.objectKey).toBe(`attachments/${TENANT_A}/complaint-draft/${RESOURCE_A}/${ATTACHMENT_A}.jpg`);
    expect(target.objectKey).not.toContain("citizen-photo");
  });

  it("accepts a valid image only after checksum and canonical path validation", async () => {
    const result = await finalizeUpload(baseInput(), cleanScanner);
    expect(result.state).toBe("READY");
    if (result.state === "READY") expect(result.upload.sha256).toBe(sha256Hex(JPEG));
  });

  it("rejects spoofed extension and MIME mismatch", () => {
    expect(() => validateUpload(baseInput({ fileName: "photo.png" }))).toThrowError(/MIME|magic|extension/i);
    expect(() => validateUpload(baseInput({ contentType: "image/png" }))).toThrowError(/MIME/);
  });

  it("rejects oversized and checksum-mismatched uploads", () => {
    expect(() => validateUpload(baseInput({ policy: { maxBytes: 4 } }))).toThrowError(/size/i);
    expect(() => validateUpload(baseInput({ expectedSha256: "0".repeat(64) }))).toThrowError(/checksum/i);
  });

  it("rejects traversal, executable and public/cross-tenant object keys", () => {
    expect(() => buildPrivateObjectTarget("test", {
      tenantId: TENANT_A,
      resourceType: "complaint-draft",
      resourceId: RESOURCE_A,
      attachmentId: ATTACHMENT_A,
    }, "../../run.exe")).toThrowError(/filename|extension/i);
    expect(() => validateUpload(baseInput({ fileName: "run.exe", contentType: "application/octet-stream" }))).toThrowError(/extension/i);
    expect(() => validateUpload(baseInput({ objectKey: `public/${TENANT_A}/photo.jpg` }))).toThrowError(/object key/i);
    const otherTenantKey = buildPrivateObjectTarget("test", {
      tenantId: TENANT_B,
      resourceType: "complaint-draft",
      resourceId: RESOURCE_A,
      attachmentId: ATTACHMENT_A,
    }, "photo.jpg").objectKey;
    expect(() => validateUpload(baseInput({ objectKey: otherTenantKey }))).toThrowError(/tenant|binding/i);
  });

  it("rejects image polyglots containing executable or archive signatures", () => {
    const polyglot = new Uint8Array([...JPEG, 0x4d, 0x5a, 0x90, 0x00]);
    expect(() => validateUpload(baseInput({ bytes: polyglot, declaredSize: polyglot.byteLength, expectedSha256: sha256Hex(polyglot) }))).toThrowError(/polyglot/i);
    const scriptPolyglot = new Uint8Array([...PNG, ...new TextEncoder().encode("<script>alert(1)</script>")]);
    expect(() => validateUpload(baseInput({
      bytes: scriptPolyglot,
      fileName: "photo.png",
      contentType: "image/png",
      declaredSize: scriptPolyglot.byteLength,
      expectedSha256: sha256Hex(scriptPolyglot),
    }))).toThrowError(/polyglot/i);
  });

  it("keeps uploads quarantined when malware scanning is unavailable or suspicious", async () => {
    const unavailable: MalwareScanner = { scan: async () => "UNAVAILABLE" };
    const suspicious: MalwareScanner = { scan: async () => "SUSPICIOUS" };
    await expect(finalizeUpload(baseInput(), unavailable)).resolves.toMatchObject({ state: "QUARANTINED", reasonCode: "SCANNER_UNAVAILABLE" });
    await expect(finalizeUpload(baseInput(), suspicious)).resolves.toMatchObject({ state: "QUARANTINED", reasonCode: "MALWARE_SUSPECTED" });
  });

  it("rejects an OOXML archive with an expansion bomb before parsing", () => {
    const bytes = new Uint8Array(80);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint32(18, 1, true);
    view.setUint32(22, 0xffffffff, true);
    view.setUint16(26, 16, true);
    new TextEncoder().encodeInto("[Content_Types].xml", bytes.subarray(30));
    expect(() => validateUpload(baseInput({
      fileName: "document.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes,
      declaredSize: bytes.byteLength,
      expectedSha256: sha256Hex(bytes),
    }))).toThrowError(/archive|expanded|size/i);
  });

  it("creates short-lived single-use signed targets bound to tenant/resource/object", () => {
    const now = 1_700_000_000_000;
    const target = createSignedUploadTarget({
      tenantId: TENANT_A,
      resourceType: "complaint-draft",
      resourceId: RESOURCE_A,
      attachmentId: ATTACHMENT_A,
      environment: "test",
      fileName: "photo.jpg",
      secret: SIGNING_SECRET,
      now,
    });
    expect(target).toMatchObject({ method: "PUT", isPublic: false, maxBytes: 20 * 1024 * 1024 });
    expect(target.expiresAt).toBe(now + 300_000);
    const guard = new InMemoryUploadReplayGuard();
    const consumed = consumeSignedUploadToken(target.token, SIGNING_SECRET, {
      tenantId: TENANT_A,
      resourceType: "complaint-draft",
      resourceId: RESOURCE_A,
      attachmentId: ATTACHMENT_A,
      objectKey: target.objectKey,
    }, guard, now + 1);
    expect(consumed.objectKey).toBe(target.objectKey);
    expect(() => consumeSignedUploadToken(target.token, SIGNING_SECRET, {
      tenantId: TENANT_A,
      resourceType: "complaint-draft",
      resourceId: RESOURCE_A,
      attachmentId: ATTACHMENT_A,
      objectKey: target.objectKey,
    }, guard, now + 2)).toThrowError(/replay/i);
  });

  it("rejects expired, tampered and cross-tenant signed targets", () => {
    const now = 1_700_000_000_000;
    const target = createSignedUploadTarget({
      tenantId: TENANT_A,
      resourceType: "complaint-draft",
      resourceId: RESOURCE_A,
      attachmentId: ATTACHMENT_A,
      environment: "test",
      fileName: "photo.jpg",
      secret: SIGNING_SECRET,
      now,
      ttlSeconds: 30,
    });
    const expected = {
      tenantId: TENANT_A,
      resourceType: "complaint-draft" as const,
      resourceId: RESOURCE_A,
      attachmentId: ATTACHMENT_A,
      objectKey: target.objectKey,
    };
    expect(() => consumeSignedUploadToken(`${target.token}x`, SIGNING_SECRET, expected, new InMemoryUploadReplayGuard(), now + 1)).toThrowError(/signature/i);
    expect(() => consumeSignedUploadToken(target.token, SIGNING_SECRET, expected, new InMemoryUploadReplayGuard(), now + 30_000)).toThrowError(/expired/i);
    expect(() => consumeSignedUploadToken(target.token, SIGNING_SECRET, { ...expected, tenantId: TENANT_B }, new InMemoryUploadReplayGuard(), now + 1)).toThrowError(/binding/i);
  });

  it("models the canonical ingestion lifecycle and rejects unsafe skips", () => {
    expect(canTransitionIngestionState("QUARANTINED", "VALIDATING")).toBe(true);
    expect(canTransitionIngestionState("MALWARE_SCANNING", "PARSING")).toBe(true);
    expect(canTransitionIngestionState("QUARANTINED", "ACTIVE")).toBe(false);
    expect(canTransitionIngestionState("ACTIVE", "RETIRED")).toBe(true);
  });
});
