import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { isLineWebhookVerificationProbe, parseLineWebhookEvents, verifyLineSignature, type NormalizedLineEvent } from "./webhook";

export type DurableLineChannel = {
  tenantId: string;
  channelRecordId: string;
  destination: string;
  channelSecret: string;
  state: "ACTIVE" | "DEGRADED";
};

export type DurableLineWebhookStore = {
  resolve(webhookKeyHash: string): Promise<DurableLineChannel | undefined>;
  persist(input: {
    channel: DurableLineChannel;
    events: readonly NormalizedLineEvent[];
    rawBody: Uint8Array;
    payloadSha256: string;
    requestId: string;
    correlationId: string;
    receivedAt: Date;
  }): Promise<{ acceptedEventIds: string[]; duplicateEventIds: string[] }>;
};

export type DurableLineWebhookResult =
  | { accepted: true; status: 200; requestId: string; correlationId: string; acceptedEventIds: string[]; duplicateEventIds: string[] }
  | { accepted: false; status: 400 | 403 | 409 | 503; reasonCode: "VALIDATION_ERROR" | "FORBIDDEN" | "CONFLICT" | "DEPENDENCY_NOT_READY"; requestId: string };

export const constantTimeWebhookHash = (webhookKey: string, hashSecret: string): string => {
  if (webhookKey.length < 32 || webhookKey.length > 512 || Buffer.byteLength(hashSecret, "utf8") < 32) throw new Error("invalid webhook key configuration");
  return createHmac("sha256", hashSecret).update(webhookKey).digest("hex");
};

export const sameWebhookHash = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
};

const logRejectedWebhook = (requestId: string, stage: "configuration" | "resolve_error" | "resolve_miss" | "inactive_channel" | "signature_invalid" | "parse_error" | "persist_error"): void => {
  // Deliberately log only a non-sensitive stage and request correlation id.
  // Never include the webhook key, signature, raw body, destination, or credentials.
  console.warn("line_webhook_rejected", { requestId, stage });
};

export const processDurableLineWebhook = async (input: {
  webhookKey: string;
  webhookHashSecret: string;
  signature: string;
  rawBody: Uint8Array;
  requestId: string;
  correlationId: string;
  store: DurableLineWebhookStore;
  now?: Date;
  maxBodyBytes?: number;
}): Promise<DurableLineWebhookResult> => {
  const now = input.now ?? new Date();
  if (input.rawBody.byteLength > (input.maxBodyBytes ?? 1_000_000)) return { accepted: false, status: 400, reasonCode: "VALIDATION_ERROR", requestId: input.requestId };
  let webhookKeyHash: string;
  try {
    webhookKeyHash = constantTimeWebhookHash(input.webhookKey, input.webhookHashSecret);
  } catch {
    logRejectedWebhook(input.requestId, "configuration");
    return { accepted: false, status: 403, reasonCode: "FORBIDDEN", requestId: input.requestId };
  }
  let channel: DurableLineChannel | undefined;
  try {
    channel = await input.store.resolve(webhookKeyHash);
  } catch {
    logRejectedWebhook(input.requestId, "resolve_error");
    return { accepted: false, status: 503, reasonCode: "DEPENDENCY_NOT_READY", requestId: input.requestId };
  }
  if (!channel) {
    logRejectedWebhook(input.requestId, "resolve_miss");
    return { accepted: false, status: 403, reasonCode: "FORBIDDEN", requestId: input.requestId };
  }
  if (channel.state !== "ACTIVE") {
    logRejectedWebhook(input.requestId, "inactive_channel");
    return { accepted: false, status: 403, reasonCode: "FORBIDDEN", requestId: input.requestId };
  }
  if (!verifyLineSignature(input.rawBody, input.signature, channel.channelSecret)) {
    logRejectedWebhook(input.requestId, "signature_invalid");
    return { accepted: false, status: 403, reasonCode: "FORBIDDEN", requestId: input.requestId };
  }
  let events: NormalizedLineEvent[];
  try {
    if (isLineWebhookVerificationProbe(input.rawBody, channel.destination)) {
      return { accepted: true, status: 200, requestId: input.requestId, correlationId: input.correlationId, acceptedEventIds: [], duplicateEventIds: [] };
    }
    events = parseLineWebhookEvents(input.rawBody, channel.destination, now.getTime());
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reasonCode = message.startsWith("CONFLICT:") ? "CONFLICT" : message.startsWith("FORBIDDEN:") ? "FORBIDDEN" : "VALIDATION_ERROR";
    logRejectedWebhook(input.requestId, "parse_error");
    return { accepted: false, status: reasonCode === "CONFLICT" ? 409 : reasonCode === "FORBIDDEN" ? 403 : 400, reasonCode, requestId: input.requestId };
  }
  try {
    const persisted = await input.store.persist({ channel, events, rawBody: input.rawBody, payloadSha256: createHash("sha256").update(input.rawBody).digest("hex"), requestId: input.requestId, correlationId: input.correlationId, receivedAt: now });
    return { accepted: true, status: 200, requestId: input.requestId, correlationId: input.correlationId, ...persisted };
  } catch {
    logRejectedWebhook(input.requestId, "persist_error");
    return { accepted: false, status: 503, reasonCode: "DEPENDENCY_NOT_READY", requestId: input.requestId };
  }
};
