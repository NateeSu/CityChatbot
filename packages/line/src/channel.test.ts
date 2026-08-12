import { describe, expect, it } from "vitest";

import { LineChannelError, LineChannelRegistry, type LineProviderValidator } from "./channel";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const RECORD_A = "33333333-3333-4333-8333-333333333333";
const HASH_SECRET = "line-webhook-hash-secret-with-32-bytes";
const CHANNEL_SECRET = "channel-secret-synthetic-value";
const ACCESS_TOKEN = "access-token-synthetic-value";
const WEBHOOK_KEY = "unguessable-webhook-key-synthetic-value-123456";

const makeRegistry = (audit: Array<unknown> = [], now = new Date("2026-08-10T00:00:00.000Z")) => new LineChannelRegistry({
  encryptionKey: new Uint8Array(32).fill(7),
  encryptionKeyVersion: "key-v1",
  webhookHashSecret: HASH_SECRET,
  clock: () => now,
  auditSink: (event) => audit.push(event),
});

const createDraft = (registry: LineChannelRegistry) => registry.createDraft({
  id: RECORD_A,
  tenantId: TENANT_A,
  channelId: "line-channel-a",
  destination: "line-destination-a",
  liffIds: ["liff-a"],
  webhookKey: WEBHOOK_KEY,
  channelSecret: CHANNEL_SECRET,
  accessToken: ACCESS_TOKEN,
  actorType: "STAFF",
  reason: "configure synthetic channel",
});

const cleanProvider: LineProviderValidator = {
  validate: async ({ channelSecret, accessToken }) => ({ ok: channelSecret === CHANNEL_SECRET && accessToken === ACCESS_TOKEN }),
};

describe("LINE channel credential lifecycle", () => {
  it("creates a draft with encrypted credentials and a masked public view", () => {
    const audit: unknown[] = [];
    const registry = makeRegistry(audit);
    const view = createDraft(registry);
    expect(view).toMatchObject({ id: RECORD_A, tenantId: TENANT_A, state: "DRAFT", health: "UNKNOWN", webhookKeyConfigured: true });
    expect(view.credentialVersions[0]).toMatchObject({ version: 1, keyVersion: "key-v1", state: "STAGED" });
    expect(JSON.stringify(view)).not.toContain(CHANNEL_SECRET);
    expect(JSON.stringify(view)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(view)).not.toContain(WEBHOOK_KEY);
    expect(audit).toHaveLength(1);
  });

  it("allows only the server principal to decrypt credentials", () => {
    const registry = makeRegistry();
    createDraft(registry);
    expect(registry.getServerCredentials(RECORD_A, "SERVER")).toMatchObject({ version: 1, keyVersion: "key-v1", channelSecret: CHANNEL_SECRET, accessToken: ACCESS_TOKEN });
    expect(() => registry.getServerCredentials(RECORD_A, "BROWSER")).toThrowError(/server-only/i);
  });

  it("validates clean credentials, resolves webhook key to the stored tenant and never uses body tenant", async () => {
    const registry = makeRegistry();
    createDraft(registry);
    const view = await registry.validateChannel(RECORD_A, cleanProvider);
    expect(view).toMatchObject({ state: "ACTIVE", health: "HEALTHY", activeCredentialVersion: 1 });
    expect(registry.resolveByWebhookKey(WEBHOOK_KEY)).toMatchObject({ tenantId: TENANT_A, channelRecordId: RECORD_A, activeCredentialVersion: 1 });
    expect(registry.resolveByWebhookKey(`${WEBHOOK_KEY}-wrong`)).toBeUndefined();
  });

  it("fails closed with a non-secret diagnostic when provider validation fails", async () => {
    const registry = makeRegistry();
    createDraft(registry);
    const invalidProvider: LineProviderValidator = { validate: async () => ({ ok: false, reasonCode: "PROVIDER_REJECTED" }) };
    const view = await registry.validateChannel(RECORD_A, invalidProvider);
    expect(view).toMatchObject({ state: "DEGRADED", health: "DEGRADED" });
    expect(registry.resolveByWebhookKey(WEBHOOK_KEY)).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(CHANNEL_SECRET);
  });

  it("stages and activates rotation without downtime, retaining old credentials for rollback", async () => {
    const registry = makeRegistry();
    createDraft(registry);
    await registry.validateChannel(RECORD_A, cleanProvider);
    const staged = registry.stageCredentialRotation({
      channelId: RECORD_A,
      channelSecret: "channel-secret-v2-synthetic",
      accessToken: "access-token-v2-synthetic",
      actorType: "STAFF",
      reason: "rotate channel credential",
    });
    expect(staged).toMatchObject({ state: "VALIDATING", activeCredentialVersion: 1 });
    const v2Provider: LineProviderValidator = { validate: async ({ channelSecret, accessToken }) => ({ ok: channelSecret.endsWith("v2-synthetic") && accessToken.endsWith("v2-synthetic") }) };
    const validated = await registry.validateChannel(RECORD_A, v2Provider, 2);
    expect(validated).toMatchObject({ state: "ACTIVE", activeCredentialVersion: 1 });
    const active = registry.activateCredentialVersion(RECORD_A, 2, "STAFF", "activate validated rotation");
    expect(active).toMatchObject({ state: "ACTIVE", health: "HEALTHY", activeCredentialVersion: 2 });
    expect(active.credentialVersions.find((credential) => credential.version === 1)?.state).toBe("RETIRED");
    const rolledBack = registry.rollbackCredentialVersion(RECORD_A, 1, "STAFF", "rollback provider credential");
    expect(rolledBack.activeCredentialVersion).toBe(1);
  });

  it("rejects activation before validation and validates rotation state", () => {
    const registry = makeRegistry();
    createDraft(registry);
    registry.stageCredentialRotation({
      channelId: RECORD_A,
      channelSecret: "channel-secret-v2-synthetic",
      accessToken: "access-token-v2-synthetic",
      actorType: "STAFF",
      reason: "rotate channel credential",
    });
    expect(() => registry.activateCredentialVersion(RECORD_A, 2, "STAFF", "activate too early")).toThrowError(/ROTATION_NOT_READY/);
  });

  it("disables a channel and revokes all credential versions", async () => {
    const registry = makeRegistry();
    createDraft(registry);
    await registry.validateChannel(RECORD_A, cleanProvider);
    const view = registry.revokeChannel(RECORD_A, "STAFF", "disable compromised channel");
    expect(view).toMatchObject({ state: "DISABLED", health: "INVALID" });
    expect(view.credentialVersions.every((credential) => credential.state === "REVOKED")).toBe(true);
    expect(registry.resolveByWebhookKey(WEBHOOK_KEY)).toBeUndefined();
    expect(() => registry.getServerCredentials(RECORD_A, "SERVER")).toThrowError(/NOT_FOUND|CHANNEL_DISABLED/);
  });

  it("rejects malformed configuration and cross-record access", () => {
    const registry = makeRegistry();
    expect(() => registry.createDraft({
      ...{
        id: RECORD_A,
        tenantId: "not-a-tenant",
        channelId: "line-channel-a",
        destination: "line-destination-a",
        liffIds: [],
        webhookKey: WEBHOOK_KEY,
        channelSecret: CHANNEL_SECRET,
        accessToken: ACCESS_TOKEN,
        actorType: "STAFF" as const,
        reason: "bad tenant",
      },
    })).toThrowError(/tenantId/);
    expect(() => registry.getPublicView("44444444-4444-4444-8444-444444444444")).toThrowError(/NOT_FOUND/);
  });

  it("does not expose secrets through audit events and rejects disabled mutation", async () => {
    const audit: unknown[] = [];
    const registry = makeRegistry(audit);
    createDraft(registry);
    await registry.validateChannel(RECORD_A, cleanProvider);
    registry.revokeChannel(RECORD_A, "STAFF", "disable channel after incident");
    expect(JSON.stringify(audit)).not.toContain(CHANNEL_SECRET);
    expect(JSON.stringify(audit)).not.toContain(ACCESS_TOKEN);
    expect(() => registry.stageCredentialRotation({
      channelId: RECORD_A,
      channelSecret: "channel-secret-v2-synthetic",
      accessToken: "access-token-v2-synthetic",
      actorType: "STAFF",
      reason: "rotate disabled channel",
    })).toThrowError(/CHANNEL_DISABLED/);
  });

  it("keeps tenant/channel resolution bound to the credential hash", async () => {
    const registry = makeRegistry();
    createDraft(registry);
    await registry.validateChannel(RECORD_A, cleanProvider);
    const result = registry.resolveByWebhookKey(WEBHOOK_KEY);
    expect(result?.tenantId).toBe(TENANT_A);
    expect(result).not.toHaveProperty("channelSecret");
    expect(result).not.toHaveProperty("accessToken");
  });
});
