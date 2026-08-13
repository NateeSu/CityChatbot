import { randomUUID } from "node:crypto";

import { processDurableLineWebhook } from "@citychatbot/line/durable-webhook";
import { after, NextResponse } from "next/server";

import { PostgresLineWebhookStore } from "./store";
import { runLineWorkerBatch } from "../../worker/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

const store = new PostgresLineWebhookStore();

export async function POST(request: Request, { params }: { params: Promise<{ webhookKey: string }> }): Promise<NextResponse> {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const correlationId = randomUUID();
  const hashSecret = process.env.LINE_WEBHOOK_HASH_SECRET;
  if (!hashSecret || !process.env.DATABASE_URL || !process.env.TENANT_CREDENTIAL_KEY) {
    return NextResponse.json({ accepted: false, reasonCode: "DEPENDENCY_NOT_READY", requestId }, { status: 503 });
  }
  const signature = request.headers.get("x-line-signature") ?? "";
  const rawBody = new Uint8Array(await request.arrayBuffer());
  const result = await processDurableLineWebhook({ webhookKey: (await params).webhookKey, webhookHashSecret: hashSecret, signature, rawBody, requestId, correlationId, store });
  if (!result.accepted) return NextResponse.json({ accepted: false, reasonCode: result.reasonCode, requestId: result.requestId }, { status: result.status });
  let workerStatus: "NOT_RUN" | "OK" | "PARTIAL" | "DEFERRED" = "NOT_RUN";
  if (process.env.LINE_CHAT_RUNTIME_ENABLED === "true") {
    workerStatus = "DEFERRED";
    after(async () => {
      try {
        await runLineWorkerBatch({ maxJobs: 5 });
      } catch {
        // The durable inbox keeps the job retryable; LINE must still receive its ACK.
      }
    });
  }
  console.info("line_webhook_accepted", {
    requestId: result.requestId,
    durationMs: Date.now() - startedAt,
    acceptedEventCount: result.acceptedEventIds.length,
    duplicateEventCount: result.duplicateEventIds.length,
    workerStatus,
  });
  return NextResponse.json({ accepted: true, requestId: result.requestId, correlationId: result.correlationId, acceptedEventIds: result.acceptedEventIds, duplicateEventIds: result.duplicateEventIds, workerStatus }, { status: 200 });
}
