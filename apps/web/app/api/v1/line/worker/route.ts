import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { isLineChatRuntimeReady, runLineWorkerBatch } from "./runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

const hasWorkerSecret = (request: Request): boolean => {
  const configured = process.env.LINE_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || configured.length < 32 || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
};

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasWorkerSecret(request)) return NextResponse.json({ accepted: false, reasonCode: "FORBIDDEN" }, { status: 403 });
  if (!isLineChatRuntimeReady()) return NextResponse.json({ accepted: false, reasonCode: "DEPENDENCY_NOT_READY" }, { status: 503 });
  try {
    const result = await runLineWorkerBatch({ maxJobs: 5 });
    return NextResponse.json(result, { status: result.status === "OK" || result.status === "PARTIAL" ? 200 : 503 });
  } catch {
    return NextResponse.json({ accepted: false, reasonCode: "DEPENDENCY_NOT_READY" }, { status: 503 });
  }
}
