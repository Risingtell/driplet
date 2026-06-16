import { NextRequest, NextResponse } from "next/server";
import { getCreatorGateway, ensureCreatorFunded } from "@/lib/server-gateway";

/**
 * Autonomous agent-to-agent payment: the stream treasury (creator wallet) pays
 * the live-captions AI agent for a minute of work, out of its own earnings —
 * no human in the loop. Money flows OUT of the stream, not just in.
 */
export async function POST(req: NextRequest) {
  const captionsUrl = `${new URL(req.url).origin}/api/agents/captions`;
  const gw = getCreatorGateway();

  try {
    let res;
    try {
      res = await gw.pay(captionsUrl, { method: "GET" });
    } catch {
      await ensureCreatorFunded();
      res = await gw.pay(captionsUrl, { method: "GET" });
    }
    const caption =
      (res as { data?: { caption?: string } }).data?.caption ?? null;
    return NextResponse.json({ ok: true, amount: res.formattedAmount, caption });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 502 },
    );
  }
}
