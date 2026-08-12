import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type StorageEnvironment = "local" | "test" | "staging" | "production";
export type StorageResourceType = "complaint-draft" | "complaint-message" | "knowledge-document";

export type UploadBinding = {
  tenantId: string;
  resourceType: StorageResourceType;
  resourceId: string;
  attachmentId: string;
};

export type UploadPolicy = {
  maxBytes: number;
  maxArchiveUncompressedBytes: number;
  maxArchiveEntries: number;
  signedUrlTtlSeconds: number;
};

export const DEFAULT_UPLOAD_POLICY: Readonly<UploadPolicy> = {
  maxBytes: 20 * 1024 * 1024,
  maxArchiveUncompressedBytes: 50 * 1024 * 1024,
  maxArchiveEntries: 1000,
  signedUrlTtlSeconds: 5 * 60,
};

export const INGESTION_STATES = [
  "QUARANTINED",
  "VALIDATING",
  "MALWARE_SCANNING",
  "PARSING",
  "NORMALIZING",
  "EXTRACTING_FACTS",
  "NEEDS_REVIEW",
  "CONFLICT_CHECK",
  "INDEXING",
  "EVALUATING",
  "APPROVED",
  "ACTIVE",
  "FAILED",
  "RETIRED",
] as const;

export type IngestionState = (typeof INGESTION_STATES)[number];

export type UploadErrorCode =
  | "FILENAME_INVALID"
  | "UNSUPPORTED_EXTENSION"
  | "CONTENT_TYPE_MISMATCH"
  | "MAGIC_MISMATCH"
  | "SIZE_LIMIT_EXCEEDED"
  | "SIZE_MISMATCH"
  | "CHECKSUM_MISMATCH"
  | "OBJECT_KEY_INVALID"
  | "TENANT_BOUNDARY"
  | "POLYGLOT_DETECTED"
  | "ARCHIVE_UNSAFE"
  | "INVALID_SIGNATURE"
  | "TOKEN_EXPIRED"
  | "TOKEN_REPLAYED"
  | "TOKEN_BINDING_MISMATCH"
  | "SCANNER_UNAVAILABLE"
  | "MALWARE_SUSPECTED";

export class StorageUploadError extends Error {
  constructor(public readonly code: UploadErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "StorageUploadError";
  }
}

export type PrivateStorageTarget = {
  bucket: string;
  objectKey: string;
  isPublic: false;
};

export type UploadValidationInput = UploadBinding & {
  environment: StorageEnvironment;
  fileName: string;
  contentType: string;
  declaredSize: number;
  bytes: Uint8Array;
  expectedSha256: string;
  objectKey?: string;
  policy?: Partial<UploadPolicy>;
};

export type ValidatedUpload = {
  binding: UploadBinding;
  bucket: string;
  objectKey: string;
  contentType: string;
  extension: string;
  byteLength: number;
  sha256: string;
  isPublic: false;
};

export type MalwareScanVerdict = "CLEAN" | "SUSPICIOUS" | "UNAVAILABLE";

export type MalwareScanner = {
  scan(input: {
    bytes: Uint8Array;
    sha256: string;
    tenantId: string;
    objectKey: string;
  }): Promise<MalwareScanVerdict>;
};

export type FinalizeUploadResult =
  | { state: "READY"; upload: ValidatedUpload }
  | { state: "QUARANTINED"; reasonCode: UploadErrorCode };

type FileRule = {
  contentType: string;
  magic: (bytes: Uint8Array) => boolean;
  archiveType?: "docx" | "xlsx";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const PRIVATE_BUCKET_PREFIX = "citychatbot-";
const PRIVATE_BUCKET_SUFFIX = "-private";
const MAX_SECRET_BYTES = 32;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_MAX_COMPRESSION_RATIO = 1000;

const ASCII = (value: string): Uint8Array => new TextEncoder().encode(value);

const startsWithBytes = (bytes: Uint8Array, signature: Uint8Array): boolean =>
  signature.every((value, index) => bytes[index] === value);

const containsBytes = (bytes: Uint8Array, needle: Uint8Array, startAt = 0): boolean => {
  if (needle.length === 0) return true;
  for (let index = Math.max(0, startAt); index <= bytes.length - needle.length; index += 1) {
    let matched = true;
    for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
      if (bytes[index + needleIndex] !== needle[needleIndex]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
};

const readLittleEndianUint16 = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! | (bytes[offset + 1]! << 8);

const readLittleEndianUint32 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;

const decodeAscii = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const assertBindingIds = (binding: UploadBinding): void => {
  if (!isUuid(binding.tenantId) || !isUuid(binding.resourceId) || !isUuid(binding.attachmentId)) {
    throw new StorageUploadError("TENANT_BOUNDARY", "Upload binding identifiers are invalid");
  }
};

const assertSafeFileName = (fileName: string): void => {
  if (
    !fileName ||
    fileName.length > 255 ||
    CONTROL_CHARACTER_PATTERN.test(fileName) ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("..") ||
    fileName.startsWith(".") ||
    fileName.endsWith(".")
  ) {
    throw new StorageUploadError("FILENAME_INVALID", "Upload filename is not safe");
  }
};

const extensionOf = (fileName: string): string => {
  const separator = fileName.lastIndexOf(".");
  if (separator <= 0 || separator === fileName.length - 1) {
    throw new StorageUploadError("UNSUPPORTED_EXTENSION", "Upload extension is required");
  }
  return fileName.slice(separator + 1).toLowerCase();
};

const isJpeg = (bytes: Uint8Array): boolean => startsWithBytes(bytes, new Uint8Array([0xff, 0xd8, 0xff]));
const isPng = (bytes: Uint8Array): boolean =>
  startsWithBytes(bytes, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const isWebp = (bytes: Uint8Array): boolean =>
  startsWithBytes(bytes, ASCII("RIFF")) && bytes.length >= 12 && startsWithBytes(bytes.slice(8), ASCII("WEBP"));
const isPdf = (bytes: Uint8Array): boolean => startsWithBytes(bytes, ASCII("%PDF-"));
const isText = (bytes: Uint8Array): boolean => {
  if (containsBytes(bytes, new Uint8Array([0x00]))) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
};

const isZip = (bytes: Uint8Array): boolean => startsWithBytes(bytes, new Uint8Array([0x50, 0x4b, 0x03, 0x04]));

const FILE_RULES: Readonly<Record<string, FileRule>> = {
  jpg: { contentType: "image/jpeg", magic: isJpeg },
  jpeg: { contentType: "image/jpeg", magic: isJpeg },
  png: { contentType: "image/png", magic: isPng },
  webp: { contentType: "image/webp", magic: isWebp },
  pdf: { contentType: "application/pdf", magic: isPdf },
  txt: { contentType: "text/plain", magic: isText },
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: isZip,
    archiveType: "docx",
  },
  xlsx: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    magic: isZip,
    archiveType: "xlsx",
  },
};

const resolvedPolicy = (policy: Partial<UploadPolicy> | undefined): UploadPolicy => {
  const result = { ...DEFAULT_UPLOAD_POLICY, ...policy };
  if (
    !Number.isSafeInteger(result.maxBytes) ||
    result.maxBytes <= 0 ||
    !Number.isSafeInteger(result.maxArchiveUncompressedBytes) ||
    result.maxArchiveUncompressedBytes <= 0 ||
    !Number.isSafeInteger(result.maxArchiveEntries) ||
    result.maxArchiveEntries <= 0 ||
    !Number.isSafeInteger(result.signedUrlTtlSeconds) ||
    result.signedUrlTtlSeconds <= 0 ||
    result.signedUrlTtlSeconds > DEFAULT_UPLOAD_POLICY.signedUrlTtlSeconds
  ) {
    throw new StorageUploadError("SIZE_LIMIT_EXCEEDED", "Upload policy is invalid");
  }
  return result;
};

export const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export const getPrivateBucketName = (environment: StorageEnvironment): string =>
  `${PRIVATE_BUCKET_PREFIX}${environment}${PRIVATE_BUCKET_SUFFIX}`;

export const getPrivateBucketPolicy = (environment: StorageEnvironment): {
  name: string;
  public: false;
  publicListing: false;
  signedUrlTtlSeconds: number;
} => ({
  name: getPrivateBucketName(environment),
  public: false,
  publicListing: false,
  signedUrlTtlSeconds: DEFAULT_UPLOAD_POLICY.signedUrlTtlSeconds,
});

const parseObjectKey = (objectKey: string): UploadBinding & { extension: string } => {
  const parts = objectKey.split("/");
  if (parts.length !== 5 || parts[0] !== "attachments" || !parts[4]) {
    throw new StorageUploadError("OBJECT_KEY_INVALID", "Private object key shape is invalid");
  }
  const [prefix, tenantId, resourceType, resourceId, filePart] = parts;
  if (prefix !== "attachments" || !tenantId || !resourceType || !resourceId || !filePart) {
    throw new StorageUploadError("OBJECT_KEY_INVALID", "Private object key shape is invalid");
  }
  if (
    !isUuid(tenantId) ||
    !isUuid(resourceId) ||
    !isUuid(filePart.slice(0, filePart.lastIndexOf("."))) ||
    !["complaint-draft", "complaint-message", "knowledge-document"].includes(resourceType)
  ) {
    throw new StorageUploadError("OBJECT_KEY_INVALID", "Private object key identifiers are invalid");
  }
  const extension = filePart.slice(filePart.lastIndexOf(".") + 1).toLowerCase();
  if (!FILE_RULES[extension]) throw new StorageUploadError("OBJECT_KEY_INVALID", "Private object key extension is invalid");
  return {
    tenantId,
    resourceType: resourceType as StorageResourceType,
    resourceId,
    attachmentId: filePart.slice(0, filePart.lastIndexOf(".")),
    extension,
  };
};

const assertObjectKeyBinding = (objectKey: string, binding: UploadBinding): void => {
  const parsed = parseObjectKey(objectKey);
  if (
    parsed.tenantId !== binding.tenantId ||
    parsed.resourceType !== binding.resourceType ||
    parsed.resourceId !== binding.resourceId ||
    parsed.attachmentId !== binding.attachmentId
  ) {
    throw new StorageUploadError("TENANT_BOUNDARY", "Object key is outside the verified upload binding");
  }
};

export const buildPrivateObjectTarget = (
  environment: StorageEnvironment,
  binding: UploadBinding,
  fileName: string,
): PrivateStorageTarget => {
  assertBindingIds(binding);
  assertSafeFileName(fileName);
  const extension = extensionOf(fileName);
  if (!FILE_RULES[extension]) throw new StorageUploadError("UNSUPPORTED_EXTENSION", "Upload extension is not allowed");
  return {
    bucket: getPrivateBucketName(environment),
    objectKey: `attachments/${binding.tenantId}/${binding.resourceType}/${binding.resourceId}/${binding.attachmentId}.${extension}`,
    isPublic: false,
  };
};

const isSuspiciousPolyglot = (bytes: Uint8Array, extension: string): boolean => {
  if (!["jpg", "jpeg", "png", "webp", "pdf"].includes(extension)) return false;
  return (
    containsBytes(bytes, ASCII("MZ"), 2) ||
    containsBytes(bytes, ASCII("<script"), 1) ||
    containsBytes(bytes, ASCII("<?php"), 1) ||
    containsBytes(bytes, new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 8)
  );
};

const assertSafeArchive = (bytes: Uint8Array, archiveType: "docx" | "xlsx", policy: UploadPolicy): void => {
  let offset = 0;
  let entries = 0;
  let totalUncompressed = 0;
  let foundContentTypes = false;
  let foundRootDocument = false;

  while (offset + 4 <= bytes.length && readLittleEndianUint32(bytes, offset) === ZIP_LOCAL_FILE_SIGNATURE) {
    if (offset + 30 > bytes.length) throw new StorageUploadError("ARCHIVE_UNSAFE", "ZIP local header is truncated");
    const flags = readLittleEndianUint16(bytes, offset + 6);
    const compressionMethod = readLittleEndianUint16(bytes, offset + 8);
    const compressedSize = readLittleEndianUint32(bytes, offset + 18);
    const uncompressedSize = readLittleEndianUint32(bytes, offset + 22);
    const fileNameLength = readLittleEndianUint16(bytes, offset + 26);
    const extraLength = readLittleEndianUint16(bytes, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length || dataStart < nameStart) {
      throw new StorageUploadError("ARCHIVE_UNSAFE", "ZIP entry exceeds upload bounds");
    }
    if ((flags & 0x08) !== 0 || ![0, 8].includes(compressionMethod)) {
      throw new StorageUploadError("ARCHIVE_UNSAFE", "ZIP data descriptor or compression is not allowed");
    }
    const name = decodeAscii(bytes.slice(nameStart, nameStart + fileNameLength)).replaceAll("\\", "/");
    const nameParts = name.split("/");
    if (!name || name.startsWith("/") || nameParts.includes("..") || name.includes("\u0000")) {
      throw new StorageUploadError("ARCHIVE_UNSAFE", "ZIP path traversal is not allowed");
    }
    if (
      name === "word/vbaProject.bin" ||
      name === "xl/vbaProject.bin" ||
      name.startsWith("word/embeddings/") ||
      name.startsWith("xl/embeddings/") ||
      name.startsWith("word/activeX/") ||
      name.startsWith("xl/externalLinks/")
    ) {
      throw new StorageUploadError("ARCHIVE_UNSAFE", "Macros, embedded objects and external links are not allowed");
    }
    if (uncompressedSize > policy.maxArchiveUncompressedBytes) {
      throw new StorageUploadError("ARCHIVE_UNSAFE", "ZIP expanded size exceeds the configured limit");
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > ZIP_MAX_COMPRESSION_RATIO) {
      throw new StorageUploadError("ARCHIVE_UNSAFE", "ZIP compression ratio exceeds the configured limit");
    }
    entries += 1;
    totalUncompressed += uncompressedSize;
    if (entries > policy.maxArchiveEntries || totalUncompressed > policy.maxArchiveUncompressedBytes) {
      throw new StorageUploadError("ARCHIVE_UNSAFE", "ZIP entry count or expanded size exceeds the configured limit");
    }
    if (name === "[Content_Types].xml") foundContentTypes = true;
    if ((archiveType === "docx" && name === "word/document.xml") || (archiveType === "xlsx" && name === "xl/workbook.xml")) {
      foundRootDocument = true;
    }
    offset = dataEnd;
  }

  const terminalSignature = readLittleEndianUint32(bytes, offset);
  if (entries === 0 || !foundContentTypes || !foundRootDocument) {
    throw new StorageUploadError("ARCHIVE_UNSAFE", "OOXML required parts are missing");
  }
  if (![ZIP_CENTRAL_DIRECTORY_SIGNATURE, ZIP_END_SIGNATURE].includes(terminalSignature)) {
    throw new StorageUploadError("ARCHIVE_UNSAFE", "ZIP directory is missing or malformed");
  }
};

export const validateUpload = (input: UploadValidationInput): ValidatedUpload => {
  assertBindingIds(input);
  assertSafeFileName(input.fileName);
  const extension = extensionOf(input.fileName);
  const rule = FILE_RULES[extension];
  if (!rule) throw new StorageUploadError("UNSUPPORTED_EXTENSION", "Upload extension is not allowed");
  const policy = resolvedPolicy(input.policy);
  if (!Number.isSafeInteger(input.declaredSize) || input.declaredSize !== input.bytes.byteLength) {
    throw new StorageUploadError("SIZE_MISMATCH", "Declared upload size does not match received bytes");
  }
  if (input.bytes.byteLength > policy.maxBytes) {
    throw new StorageUploadError("SIZE_LIMIT_EXCEEDED", "Upload exceeds the configured size limit");
  }
  if (input.contentType !== rule.contentType) {
    throw new StorageUploadError("CONTENT_TYPE_MISMATCH", "Declared MIME type does not match the extension policy");
  }
  if (!rule.magic(input.bytes)) throw new StorageUploadError("MAGIC_MISMATCH", "File magic bytes are not allowed");
  if (isSuspiciousPolyglot(input.bytes, extension)) {
    throw new StorageUploadError("POLYGLOT_DETECTED", "File contains a suspicious secondary format signature");
  }
  if (!SHA256_PATTERN.test(input.expectedSha256)) {
    throw new StorageUploadError("CHECKSUM_MISMATCH", "SHA-256 checksum format is invalid");
  }
  const actualSha256 = sha256Hex(input.bytes);
  if (actualSha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
    throw new StorageUploadError("CHECKSUM_MISMATCH", "Upload checksum does not match received bytes");
  }
  const target = buildPrivateObjectTarget(input.environment, input, input.fileName);
  if (input.objectKey !== undefined) {
    assertObjectKeyBinding(input.objectKey, input);
    if (input.objectKey !== target.objectKey) {
      throw new StorageUploadError("OBJECT_KEY_INVALID", "Object key does not match the canonical upload path");
    }
  }
  if (rule.archiveType) assertSafeArchive(input.bytes, rule.archiveType, policy);
  return {
    binding: {
      tenantId: input.tenantId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      attachmentId: input.attachmentId,
    },
    bucket: target.bucket,
    objectKey: target.objectKey,
    contentType: rule.contentType,
    extension,
    byteLength: input.bytes.byteLength,
    sha256: actualSha256,
    isPublic: false,
  };
};

const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");
const fromBase64Url = (value: string): Buffer => Buffer.from(value, "base64url");

const signingKey = (secret: string): Buffer => {
  const key = Buffer.from(secret, "utf8");
  if (key.byteLength < MAX_SECRET_BYTES) throw new StorageUploadError("INVALID_SIGNATURE", "Upload signing secret is too short");
  return key;
};

type SignedUploadClaims = UploadBinding & {
  version: 1;
  purpose: "upload";
  objectKey: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
};

export type SignedUploadTarget = PrivateStorageTarget & {
  method: "PUT";
  token: string;
  expiresAt: number;
  maxBytes: number;
};

export type SignedUploadRequest = UploadBinding & {
  environment: StorageEnvironment;
  fileName: string;
  secret: string;
  now?: number;
  ttlSeconds?: number;
  policy?: Partial<UploadPolicy>;
};

export const createSignedUploadTarget = (input: SignedUploadRequest): SignedUploadTarget => {
  const policy = resolvedPolicy(input.policy);
  const now = input.now ?? Date.now();
  const ttlSeconds = input.ttlSeconds ?? policy.signedUrlTtlSeconds;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > policy.signedUrlTtlSeconds) {
    throw new StorageUploadError("TOKEN_EXPIRED", "Signed upload lifetime is invalid");
  }
  const target = buildPrivateObjectTarget(input.environment, input, input.fileName);
  const claims: SignedUploadClaims = {
    version: 1,
    purpose: "upload",
    tenantId: input.tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    attachmentId: input.attachmentId,
    objectKey: target.objectKey,
    nonce: toBase64Url(randomBytes(16)),
    issuedAt: now,
    expiresAt: now + ttlSeconds * 1000,
  };
  const payload = toBase64Url(Buffer.from(JSON.stringify(claims), "utf8"));
  const signature = toBase64Url(createHmac("sha256", signingKey(input.secret)).update(payload).digest());
  return {
    ...target,
    method: "PUT",
    token: `${payload}.${signature}`,
    expiresAt: claims.expiresAt,
    maxBytes: policy.maxBytes,
  };
};

export class InMemoryUploadReplayGuard {
  private readonly used = new Map<string, number>();

  claim(nonce: string, expiresAt: number, now = Date.now()): boolean {
    for (const [usedNonce, usedUntil] of this.used) {
      if (usedUntil <= now) this.used.delete(usedNonce);
    }
    if (this.used.has(nonce)) return false;
    this.used.set(nonce, expiresAt);
    return true;
  }
}

export const consumeSignedUploadToken = (
  token: string,
  secret: string,
  expected: UploadBinding & { objectKey: string },
  replayGuard: InMemoryUploadReplayGuard,
  now = Date.now(),
): UploadBinding & { objectKey: string; expiresAt: number } => {
  try {
    const pieces = token.split(".");
    if (pieces.length !== 2 || !pieces[0] || !pieces[1]) throw new StorageUploadError("INVALID_SIGNATURE", "Signed token shape is invalid");
    const [payload, encodedSignature] = pieces;
    const expectedSignature = createHmac("sha256", signingKey(secret)).update(payload).digest();
    const actualSignature = fromBase64Url(encodedSignature);
    if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
      throw new StorageUploadError("INVALID_SIGNATURE", "Signed token signature is invalid");
    }
    const claims = JSON.parse(fromBase64Url(payload).toString("utf8")) as Partial<SignedUploadClaims>;
    if (
      claims.version !== 1 ||
      claims.purpose !== "upload" ||
      typeof claims.nonce !== "string" ||
      typeof claims.expiresAt !== "number" ||
      typeof claims.issuedAt !== "number" ||
      !claims.tenantId ||
      !claims.resourceType ||
      !claims.resourceId ||
      !claims.attachmentId ||
      !claims.objectKey
    ) {
      throw new StorageUploadError("INVALID_SIGNATURE", "Signed token claims are invalid");
    }
    if (now >= claims.expiresAt) throw new StorageUploadError("TOKEN_EXPIRED", "Signed upload token has expired");
    if (
      claims.tenantId !== expected.tenantId ||
      claims.resourceType !== expected.resourceType ||
      claims.resourceId !== expected.resourceId ||
      claims.attachmentId !== expected.attachmentId ||
      claims.objectKey !== expected.objectKey
    ) {
      throw new StorageUploadError("TOKEN_BINDING_MISMATCH", "Signed upload token is outside the verified binding");
    }
    if (!replayGuard.claim(claims.nonce, claims.expiresAt, now)) {
      throw new StorageUploadError("TOKEN_REPLAYED", "Signed upload token has already been consumed");
    }
    return {
      tenantId: claims.tenantId,
      resourceType: claims.resourceType,
      resourceId: claims.resourceId,
      attachmentId: claims.attachmentId,
      objectKey: claims.objectKey,
      expiresAt: claims.expiresAt,
    };
  } catch (error) {
    if (error instanceof StorageUploadError) throw error;
    throw new StorageUploadError("INVALID_SIGNATURE", "Signed upload token cannot be decoded");
  }
};

export const finalizeUpload = async (
  input: UploadValidationInput,
  scanner: MalwareScanner,
): Promise<FinalizeUploadResult> => {
  let validated: ValidatedUpload;
  try {
    validated = validateUpload(input);
  } catch (error) {
    if (error instanceof StorageUploadError) return { state: "QUARANTINED", reasonCode: error.code };
    return { state: "QUARANTINED", reasonCode: "MAGIC_MISMATCH" };
  }
  let verdict: MalwareScanVerdict;
  try {
    verdict = await scanner.scan({
      bytes: input.bytes,
      sha256: validated.sha256,
      tenantId: validated.binding.tenantId,
      objectKey: validated.objectKey,
    });
  } catch {
    verdict = "UNAVAILABLE";
  }
  if (verdict === "CLEAN") return { state: "READY", upload: validated };
  return {
    state: "QUARANTINED",
    reasonCode: verdict === "UNAVAILABLE" ? "SCANNER_UNAVAILABLE" : "MALWARE_SUSPECTED",
  };
};

const INGESTION_TRANSITIONS: Readonly<Record<IngestionState, readonly IngestionState[]>> = {
  QUARANTINED: ["VALIDATING", "FAILED"],
  VALIDATING: ["MALWARE_SCANNING", "QUARANTINED", "FAILED"],
  MALWARE_SCANNING: ["PARSING", "QUARANTINED", "FAILED"],
  PARSING: ["NORMALIZING", "FAILED"],
  NORMALIZING: ["EXTRACTING_FACTS", "FAILED"],
  EXTRACTING_FACTS: ["NEEDS_REVIEW", "CONFLICT_CHECK", "FAILED"],
  NEEDS_REVIEW: ["CONFLICT_CHECK", "FAILED"],
  CONFLICT_CHECK: ["INDEXING", "EVALUATING", "FAILED"],
  INDEXING: ["EVALUATING", "FAILED"],
  EVALUATING: ["APPROVED", "FAILED"],
  APPROVED: ["ACTIVE", "FAILED"],
  ACTIVE: ["RETIRED"],
  FAILED: ["QUARANTINED"],
  RETIRED: [],
};

export const canTransitionIngestionState = (from: IngestionState, to: IngestionState): boolean =>
  INGESTION_TRANSITIONS[from].includes(to);
