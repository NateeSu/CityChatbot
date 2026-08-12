import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { decryptSecret, encryptSecret, type EncryptedSecret } from "@citychatbot/security/secret-vault";

export type LineChannelState = "DRAFT" | "VALIDATING" | "ACTIVE" | "DEGRADED" | "DISABLED";
export type LineChannelHealth = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "INVALID";
export type LineCredentialState = "STAGED" | "ACTIVE" | "RETIRED" | "REVOKED";
export type LineAuditActor = "STAFF" | "SYSTEM" | "SUPER_ADMIN";

export type LineAuditEvent = {
  tenantId: string;
  channelId: string;
  actorType: LineAuditActor;
  action: "line.channel.created" | "line.channel.validated" | "line.channel.validation_failed" | "line.channel.rotated" | "line.channel.activated" | "line.channel.rolled_back" | "line.channel.revoked";
  reason: string;
  credentialVersion?: number;
};

export type LineProviderValidator = {
  validate(input: {
    channelId: string;
    destination: string;
    channelSecret: string;
    accessToken: string;
  }): Promise<{ ok: boolean; reasonCode?: string }>;
};

export class LineChannelError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE_TRANSITION" | "CREDENTIAL_ACCESS_DENIED" | "CHANNEL_DISABLED" | "ROTATION_NOT_READY", message: string) {
    super(`${code}: ${message}`);
    this.name = "LineChannelError";
  }
}

type CredentialVersion = {
  version: number;
  keyVersion: string;
  channelSecret: EncryptedSecret;
  accessToken: EncryptedSecret;
  state: LineCredentialState;
  createdAt: string;
  validatedAt?: string;
};

type ChannelRecord = {
  id: string;
  tenantId: string;
  channelId: string;
  destination: string;
  liffIds: string[];
  webhookKeyHash: string;
  credentials: CredentialVersion[];
  activeCredentialVersion?: number;
  state: LineChannelState;
  health: LineChannelHealth;
  quotaSnapshot?: { remaining?: number; resetAt?: string };
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type LineChannelPublicView = {
  id: string;
  tenantId: string;
  channelId: string;
  destination: string;
  liffIds: string[];
  state: LineChannelState;
  health: LineChannelHealth;
  activeCredentialVersion?: number;
  credentialVersions: Array<{ version: number; keyVersion: string; state: LineCredentialState; createdAt: string; validatedAt?: string }>;
  quotaSnapshot?: { remaining?: number; resetAt?: string };
  lastVerifiedAt?: string;
  webhookKeyConfigured: true;
};

export type ServerCredential = {
  version: number;
  keyVersion: string;
  channelSecret: string;
  accessToken: string;
};

export type LineChannelRegistryOptions = {
  encryptionKey: Uint8Array;
  encryptionKeyVersion: string;
  webhookHashSecret: string;
  auditSink?: (event: LineAuditEvent) => void;
  clock?: () => Date;
};

export type CreateLineChannelInput = {
  tenantId: string;
  channelId: string;
  destination: string;
  liffIds: string[];
  webhookKey: string;
  channelSecret: string;
  accessToken: string;
  actorType: LineAuditActor;
  reason: string;
  id?: string;
};

export type RotateLineCredentialsInput = {
  channelId: string;
  channelSecret: string;
  accessToken: string;
  actorType: LineAuditActor;
  reason: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const MIN_WEBHOOK_KEY_LENGTH = 32;

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const assertUuid = (value: string, field: string): void => {
  if (!isUuid(value)) throw new LineChannelError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const assertText = (value: string, field: string, minLength = 1, maxLength = 256): void => {
  if (!value || value.length < minLength || value.length > maxLength || CONTROL_PATTERN.test(value)) {
    throw new LineChannelError("VALIDATION_ERROR", `${field} is invalid`);
  }
};

const assertActorReason = (actorType: LineAuditActor, reason: string): void => {
  if (!["STAFF", "SYSTEM", "SUPER_ADMIN"].includes(actorType) || reason.trim().length < 3 || reason.length > 500) {
    throw new LineChannelError("VALIDATION_ERROR", "actor and audit reason are required");
  }
};

const assertTransition = (from: LineChannelState, to: LineChannelState): void => {
  const allowed: Record<LineChannelState, readonly LineChannelState[]> = {
    DRAFT: ["VALIDATING", "DISABLED"],
    VALIDATING: ["ACTIVE", "DEGRADED", "DISABLED"],
    ACTIVE: ["VALIDATING", "DEGRADED", "DISABLED"],
    DEGRADED: ["VALIDATING", "ACTIVE", "DISABLED"],
    DISABLED: ["DRAFT"],
  };
  if (!allowed[from].includes(to)) throw new LineChannelError("INVALID_STATE_TRANSITION", `${from} cannot become ${to}`);
};

const hashWebhookKey = (webhookKey: string, secret: string): string => {
  if (Buffer.from(secret, "utf8").byteLength < 32) throw new LineChannelError("VALIDATION_ERROR", "Webhook hash secret is too short");
  return createHmac("sha256", secret).update(webhookKey).digest("hex");
};

const sameHash = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
};

export class LineChannelRegistry {
  private readonly channels = new Map<string, ChannelRecord>();
  private readonly options: LineChannelRegistryOptions;

  constructor(options: LineChannelRegistryOptions) {
    if (options.encryptionKey.byteLength !== 32) throw new LineChannelError("VALIDATION_ERROR", "LINE encryption key must be 32 bytes");
    assertText(options.encryptionKeyVersion, "encryption key version", 1, 64);
    if (Buffer.from(options.webhookHashSecret, "utf8").byteLength < 32) throw new LineChannelError("VALIDATION_ERROR", "Webhook hash secret is too short");
    this.options = options;
  }

  createDraft(input: CreateLineChannelInput): LineChannelPublicView {
    assertUuid(input.tenantId, "tenantId");
    assertText(input.channelId, "channelId", 1, 128);
    assertText(input.destination, "destination", 1, 128);
    assertText(input.webhookKey, "webhookKey", MIN_WEBHOOK_KEY_LENGTH, 512);
    assertText(input.channelSecret, "channelSecret", 8, 512);
    assertText(input.accessToken, "accessToken", 8, 2048);
    assertActorReason(input.actorType, input.reason);
    this.assertLiffIds(input.liffIds);
    const id = input.id ?? randomUUID();
    assertUuid(id, "channel record id");
    if (this.channels.has(id)) throw new LineChannelError("VALIDATION_ERROR", "Channel record already exists");
    const now = this.now().toISOString();
    const record: ChannelRecord = {
      id,
      tenantId: input.tenantId,
      channelId: input.channelId,
      destination: input.destination,
      liffIds: [...new Set(input.liffIds)],
      webhookKeyHash: hashWebhookKey(input.webhookKey, this.options.webhookHashSecret),
      credentials: [this.encryptCredential(1, input.channelSecret, input.accessToken, now)],
      activeCredentialVersion: undefined,
      state: "DRAFT",
      health: "UNKNOWN",
      createdAt: now,
      updatedAt: now,
    };
    this.channels.set(id, record);
    this.audit({ tenantId: record.tenantId, channelId: record.id, actorType: input.actorType, action: "line.channel.created", reason: input.reason, credentialVersion: 1 });
    return this.publicView(record);
  }

  stageCredentialRotation(input: RotateLineCredentialsInput): LineChannelPublicView {
    const record = this.requireChannel(input.channelId);
    assertText(input.channelSecret, "channelSecret", 8, 512);
    assertText(input.accessToken, "accessToken", 8, 2048);
    assertActorReason(input.actorType, input.reason);
    if (record.state === "DISABLED") throw new LineChannelError("CHANNEL_DISABLED", "Disabled channel cannot rotate credentials");
    const version = Math.max(...record.credentials.map((credential) => credential.version)) + 1;
    const now = this.now().toISOString();
    record.credentials.push(this.encryptCredential(version, input.channelSecret, input.accessToken, now));
    this.transition(record, "VALIDATING");
    record.updatedAt = now;
    this.audit({ tenantId: record.tenantId, channelId: record.id, actorType: input.actorType, action: "line.channel.rotated", reason: input.reason, credentialVersion: version });
    return this.publicView(record);
  }

  async validateChannel(channelId: string, validator: LineProviderValidator, version?: number): Promise<LineChannelPublicView> {
    const record = this.requireChannel(channelId);
    if (record.state === "DISABLED") throw new LineChannelError("CHANNEL_DISABLED", "Disabled channel cannot validate");
    const target = this.selectCredential(record, version);
    this.transition(record, "VALIDATING");
    const credentials = this.decryptForServer(record, target.version);
    const result = await validator.validate({
      channelId: record.channelId,
      destination: record.destination,
      channelSecret: credentials.channelSecret,
      accessToken: credentials.accessToken,
    });
    const now = this.now().toISOString();
    target.validatedAt = result.ok ? now : undefined;
    record.updatedAt = now;
    if (!result.ok) {
      record.health = "DEGRADED";
      const hasActiveFallback = record.activeCredentialVersion !== undefined && target.version !== record.activeCredentialVersion;
      record.state = hasActiveFallback ? "ACTIVE" : "DEGRADED";
      this.audit({ tenantId: record.tenantId, channelId: record.id, actorType: "SYSTEM", action: "line.channel.validation_failed", reason: result.reasonCode ?? "provider validation failed", credentialVersion: target.version });
      return this.publicView(record);
    }
    record.health = "HEALTHY";
    record.lastVerifiedAt = now;
    if (record.activeCredentialVersion === undefined || target.version === record.activeCredentialVersion) {
      this.activate(record, target.version);
    } else {
      record.state = "ACTIVE";
    }
    this.audit({ tenantId: record.tenantId, channelId: record.id, actorType: "SYSTEM", action: "line.channel.validated", reason: "provider validation passed", credentialVersion: target.version });
    return this.publicView(record);
  }

  activateCredentialVersion(channelId: string, version: number, actorType: LineAuditActor, reason: string): LineChannelPublicView {
    const record = this.requireChannel(channelId);
    assertActorReason(actorType, reason);
    const target = this.selectCredential(record, version);
    if (target.state !== "STAGED" || !target.validatedAt) throw new LineChannelError("ROTATION_NOT_READY", "Credential version must pass validation before activation");
    this.activate(record, version);
    record.health = "HEALTHY";
    record.updatedAt = this.now().toISOString();
    this.audit({ tenantId: record.tenantId, channelId: record.id, actorType, action: "line.channel.activated", reason, credentialVersion: version });
    return this.publicView(record);
  }

  rollbackCredentialVersion(channelId: string, version: number, actorType: LineAuditActor, reason: string): LineChannelPublicView {
    const record = this.requireChannel(channelId);
    assertActorReason(actorType, reason);
    const target = this.selectCredential(record, version);
    if (target.state !== "RETIRED") throw new LineChannelError("ROTATION_NOT_READY", "Only a retained credential can be restored");
    this.activate(record, version);
    record.health = "HEALTHY";
    record.updatedAt = this.now().toISOString();
    this.audit({ tenantId: record.tenantId, channelId: record.id, actorType, action: "line.channel.rolled_back", reason, credentialVersion: version });
    return this.publicView(record);
  }

  revokeChannel(channelId: string, actorType: LineAuditActor, reason: string): LineChannelPublicView {
    const record = this.requireChannel(channelId);
    assertActorReason(actorType, reason);
    this.transition(record, "DISABLED");
    for (const credential of record.credentials) credential.state = "REVOKED";
    record.health = "INVALID";
    record.updatedAt = this.now().toISOString();
    this.audit({ tenantId: record.tenantId, channelId: record.id, actorType, action: "line.channel.revoked", reason });
    return this.publicView(record);
  }

  resolveByWebhookKey(webhookKey: string): { tenantId: string; channelRecordId: string; lineChannelId: string; destination: string; activeCredentialVersion: number; state: LineChannelState } | undefined {
    assertText(webhookKey, "webhookKey", MIN_WEBHOOK_KEY_LENGTH, 512);
    const candidateHash = hashWebhookKey(webhookKey, this.options.webhookHashSecret);
    for (const channel of this.channels.values()) {
      if (channel.state === "DISABLED" || !channel.activeCredentialVersion || !sameHash(channel.webhookKeyHash, candidateHash)) continue;
      return {
        tenantId: channel.tenantId,
        channelRecordId: channel.id,
        lineChannelId: channel.channelId,
        destination: channel.destination,
        activeCredentialVersion: channel.activeCredentialVersion,
        state: channel.state,
      };
    }
    return undefined;
  }

  getPublicView(channelId: string): LineChannelPublicView {
    return this.publicView(this.requireChannel(channelId));
  }

  getServerCredentials(channelId: string, principal: "SERVER" | "BROWSER", version?: number): ServerCredential {
    if (principal !== "SERVER") throw new LineChannelError("CREDENTIAL_ACCESS_DENIED", "LINE credentials are server-only");
    return this.decryptForServer(this.requireChannel(channelId), version);
  }

  private selectCredential(record: ChannelRecord, version?: number): CredentialVersion {
    const selectedVersion = version ?? record.activeCredentialVersion ?? Math.max(...record.credentials.map((credential) => credential.version));
    const credential = record.credentials.find((candidate) => candidate.version === selectedVersion);
    if (!credential || credential.state === "REVOKED") throw new LineChannelError("NOT_FOUND", "Credential version was not found");
    return credential;
  }

  private encryptCredential(version: number, channelSecret: string, accessToken: string, createdAt: string): CredentialVersion {
    return {
      version,
      keyVersion: this.options.encryptionKeyVersion,
      channelSecret: encryptSecret(channelSecret, this.options.encryptionKey, this.options.encryptionKeyVersion),
      accessToken: encryptSecret(accessToken, this.options.encryptionKey, this.options.encryptionKeyVersion),
      state: "STAGED",
      createdAt,
    };
  }

  private decryptForServer(record: ChannelRecord, version?: number): ServerCredential {
    const credential = this.selectCredential(record, version);
    return {
      version: credential.version,
      keyVersion: credential.keyVersion,
      channelSecret: decryptSecret(credential.channelSecret, this.options.encryptionKey),
      accessToken: decryptSecret(credential.accessToken, this.options.encryptionKey),
    };
  }

  private activate(record: ChannelRecord, version: number): void {
    const target = this.selectCredential(record, version);
    const previous = record.activeCredentialVersion === undefined ? undefined : record.credentials.find((credential) => credential.version === record.activeCredentialVersion);
    if (previous && previous.version !== target.version) previous.state = "RETIRED";
    target.state = "ACTIVE";
    record.activeCredentialVersion = target.version;
    this.transition(record, "ACTIVE");
  }

  private transition(record: ChannelRecord, to: LineChannelState): void {
    if (record.state === to) return;
    assertTransition(record.state, to);
    record.state = to;
  }

  private requireChannel(channelId: string): ChannelRecord {
    assertUuid(channelId, "channel record id");
    const channel = this.channels.get(channelId);
    if (!channel) throw new LineChannelError("NOT_FOUND", "Channel was not found");
    return channel;
  }

  private publicView(record: ChannelRecord): LineChannelPublicView {
    return {
      id: record.id,
      tenantId: record.tenantId,
      channelId: record.channelId,
      destination: record.destination,
      liffIds: [...record.liffIds],
      state: record.state,
      health: record.health,
      ...(record.activeCredentialVersion !== undefined ? { activeCredentialVersion: record.activeCredentialVersion } : {}),
      credentialVersions: record.credentials.map((credential) => ({
        version: credential.version,
        keyVersion: credential.keyVersion,
        state: credential.state,
        createdAt: credential.createdAt,
        ...(credential.validatedAt ? { validatedAt: credential.validatedAt } : {}),
      })),
      ...(record.quotaSnapshot ? { quotaSnapshot: { ...record.quotaSnapshot } } : {}),
      ...(record.lastVerifiedAt ? { lastVerifiedAt: record.lastVerifiedAt } : {}),
      webhookKeyConfigured: true,
    };
  }

  private assertLiffIds(liffIds: string[]): void {
    if (liffIds.length > 10 || new Set(liffIds).size !== liffIds.length) throw new LineChannelError("VALIDATION_ERROR", "LIFF IDs are invalid");
    for (const liffId of liffIds) assertText(liffId, "LIFF ID", 1, 128);
  }

  private audit(event: LineAuditEvent): void {
    this.options.auditSink?.({ ...event });
  }

  private now(): Date {
    return this.options.clock?.() ?? new Date();
  }
}
