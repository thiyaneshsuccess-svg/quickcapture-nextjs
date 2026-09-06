import { NextResponse } from "next/server";

import { backend, pingDatabase } from "@/lib/tasks/store";

export const dynamic = "force-dynamic";

/**
 * GET /health
 * Liveness/readiness endpoint for platform health checks
 * (Render, Vercel monitors, Docker compose, uptime monitors).
 * Reports which persistence backend is active and, for Postgres,
 * whether the database actually answers.
 */
export async function GET() {
  const dbUp = await pingDatabase();
  return NextResponse.json(
    {
      status: dbUp ? "ok" : "degraded",
      service: "quickcapture",
      backend,
      database: dbUp ? "up" : "unreachable",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
