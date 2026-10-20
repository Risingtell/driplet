import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { settleWithinIncome } from "@/lib/settlement";
import { addViewerConsumption } from "@/lib/viewer-credit";
import { refundViewer } from "@/lib/viewer-refund";

// Settles the last watched seconds, then waits for the refund to be mined.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAddr = (a?: string | null): a is `0x${string}` => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);
const noStore = { headers: { "Cache-Control": "no-store" } };

// The watch page syncs every 20s, so a leave never carries more than that.
const MAX_FINAL_SECONDS = 60;

/**
 * POST { payer, seconds } → the viewer is leaving this stream. `seconds` is
 * whatever they watched since the last sync: it is recorded as consumed and
 * settled to the payees first (under the usual solvency guard), so the creator
 * is paid for every second watched. Then the unwatched rest of their prepay
 * goes back to their wallet. See lib/viewer-refund for the caps.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { payer?: string; seconds?: number };
  if (!isAddr(body.payer)) return NextResponse.json({ ok: false }, noStore);

  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ ok: false }, noStore);

  const seconds = Math.min(Math.floor(Number(body.seconds) || 0), MAX_FINAL_SECONDS);
  if (seconds > 0) {
    await addViewerConsumption(supabase, slug, body.payer, seconds * stream.ratePerSecond);
    const origin = new URL(req.url).origin;
    await settleWithinIncome(supabase, stream, seconds, { origin }).catch(() => {});
  }

  const result = await refundViewer(supabase, slug, body.payer);
  return NextResponse.json({ ok: result.status === "sent" || result.status === "nothing", ...result }, noStore);
}
