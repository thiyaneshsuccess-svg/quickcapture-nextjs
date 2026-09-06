import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /health
 * Liveness/readiness endpoint for platform health checks
 * (Render, Docker compose, uptime monitors).
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "quickcapture" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
