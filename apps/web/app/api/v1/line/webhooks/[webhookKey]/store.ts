import { createCipheriv, randomBytes } from "node:crypto";

import { decryptSecret, type EncryptedSecret } from "@citychatbot/security/secret-vault";
import type { DurableLineChannel, DurableLineWebhookStore } from "@citychatbot/line/durable-webhook";
import { databasePool } from "../../../../../../src/server/runtime-database";

type ChannelRow = {
  tenant_id: string;
  channel_record_id: string;
  destination: string;
  encrypted_channel_secret: string;
  credential_key_version: string;
  state: "ACTIVE" | "DEGRADED";
};

type IngestRow = { accepted_event_ids: string[] | null; duplicate_event_ids: string[] | null };
type RuntimeChannel = DurableLineChannel & { webhookKeyHash: string; credentialKeyVersion: string };

const credentialKey = (): Uint8Array => {
  const value = process.env.TENANT_CREDENTIAL_KEY;
  if (!value) throw new Error("credential key is not configured");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32) throw new Error("credential key must decode to 32 bytes");
  return decoded;
};

const parseEnvelope = (value: string, expectedKeyVersion: string): EncryptedSecret => {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object") throw new Error("invalid credential envelope");
  const envelope = parsed as Partial<EncryptedSecret>;
  if (envelope.algorithm !== "aes-256-gcm" || envelope.keyVersion !== expectedKeyVersion || !envelope.iv || !envelope.ciphertext || !envelope.authTag) throw new Error("invalid credential envelope");
  return envelope as EncryptedSecret;
};

const encryptPayload = (rawBody: Uint8Array, keyVersion: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(rawBody), cipher.final()]);
  return JSON.stringify({ algorithm: "aes-256-gcm", keyVersion, iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url") });
};

export class PostgresLineWebhookStore implements DurableLineWebhookStore {
  async resolve(webhookKeyHash: string): Promise<DurableLineChannel | undefined> {
    const result = await databasePool().query<ChannelRow>(
      "select * from private.resolve_line_webhook($1::text)",
      [webhookKeyHash],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      tenantId: row.tenant_id,
      channelRecordId: row.channel_record_id,
      destination: row.destination,
      channelSecret: decryptSecret(parseEnvelope(row.encrypted_channel_secret, row.credential_key_version), credentialKey()),
      state: row.state,
      webhookKeyHash,
      credentialKeyVersion: row.credential_key_version,
    } as RuntimeChannel;
  }

  async persist(input: Parameters<DurableLineWebhookStore["persist"]>[0]): Promise<{ acceptedEventIds: string[]; duplicateEventIds: string[] }> {
    const runtimeChannel = input.channel as RuntimeChannel;
    if (!runtimeChannel.webhookKeyHash || !runtimeChannel.credentialKeyVersion) throw new Error("runtime channel metadata is unavailable");
    const payloadCiphertext = encryptPayload(input.rawBody, runtimeChannel.credentialKeyVersion);
    const events = input.events.map((event) => ({
      webhookEventId: event.webhookEventId,
      eventType: event.supported ? event.eventType : "unsupported",
      timestamp: new Date(event.timestamp).toISOString(),
      redelivery: event.redelivery,
      supported: event.supported,
      payloadCiphertext,
      payloadKeyVersion: runtimeChannel.credentialKeyVersion,
      payloadSha256: input.payloadSha256,
    }));
    const result = await databasePool().query<IngestRow>(
      "select * from private.ingest_line_webhook($1::text, $2::jsonb, $3::uuid, $4::uuid, $5::timestamptz)",
      [runtimeChannel.webhookKeyHash, JSON.stringify(events), input.requestId, input.correlationId, input.receivedAt.toISOString()],
    );
    return { acceptedEventIds: result.rows[0]?.accepted_event_ids ?? [], duplicateEventIds: result.rows[0]?.duplicate_event_ids ?? [] };
  }
}
