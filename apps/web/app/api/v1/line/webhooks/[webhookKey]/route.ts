import { randomUUID } from "node:crypto";

import { processDurableLineWebhook } from "@citychatbot/line/durable-webhook";
import { NextResponse } from "next/server";

import { PostgresLineWebhookStore } from "./store";

export const runtime = "nodejs";
export const maxDuration = 10;

const store = new PostgresLineWebhookStore();

export async function POST(request: Request, { params }: { params: Promise<{ webhookKey: string }> }): Promise<NextResponse> {
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
  return NextResponse.json({ accepted: true, requestId: result.requestId, correlationId: result.correlationId, acceptedEventIds: result.acceptedEventIds, duplicateEventIds: result.duplicateEventIds }, { status: 200 });
}
