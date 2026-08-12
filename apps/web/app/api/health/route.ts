import { parseServerEnv } from "@citychatbot/config/env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  const env = parseServerEnv();

  return NextResponse.json({
    status: "ok",
    service: "web",
    environment: env.CITYCHATBOT_ENV,
  });
}
