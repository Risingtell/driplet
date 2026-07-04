import { NextRequest, NextResponse } from "next/server";
import { runPatronCycle } from "@/lib/patron";

// A cycle signs, relays on-chain, and waits for a receipt.
export const maxDuration = 60;

/**
 * Vercel Cron entrypoint for the AI patron. Vercel invokes this on a schedule
 * (see vercel.json) with a GET, so the patron runs itself in the cloud with no
 * local script and no open browser. The cycle is self-throttled and only ever
 * moves the patron's own funds, so it's safe to call; if CRON_SECRET is set,
 * we still require Vercel's signed header so nobody else can drive the schedule.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runPatronCycle();
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
