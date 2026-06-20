import { NextRequest, NextResponse } from "next/server";
import { getViewerGateway, ensureFunded } from "@/lib/server-gateway";

// A tick may need to top up the Gateway balance (deposit + wait for it to be
// credited), which can take longer than the default serverless limit. Give it
// room so a real viewer's payment never gets cut off mid-settlement.
export const maxDuration = 60;

/**
 * One "second" of watching: the viewer wallet pays a single sub-cent
 * nanopayment to the creator's per-second charge endpoint via Circle Gateway.
 * The browser calls this once per second while the player is running.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as { stream?: string });
  const slug = (body as { stream?: string }).stream ?? "ada-live";
  const chargeUrl = `${new URL(req.url).origin}/api/watch/${slug}/charge`;
  const gw = getViewerGateway();

  try {
    let res;
    try {
      res = await gw.pay(chargeUrl, { method: "GET" });
    } catch {
      // First payment of a session, or balance ran low — top up and retry once.
      await ensureFunded();
      res = await gw.pay(chargeUrl, { method: "GET" });
    }
    return NextResponse.json({ ok: true, amount: res.formattedAmount });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 502 },
    );
  }
}
