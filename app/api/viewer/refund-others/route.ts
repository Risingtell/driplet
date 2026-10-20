import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refundOtherStreams } from "@/lib/viewer-refund";

// May send one refund per stream the viewer left credit on.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAddr = (a?: string | null): a is `0x${string}` => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

/**
 * POST { payer, except } → send back any unwatched prepay this viewer left on
 * other streams, before they pay on `except`. A safety net for the refund the
 * watch page sends on leaving, which a closed tab can skip.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { payer?: string; except?: string };
  if (!isAddr(body.payer)) return NextResponse.json({ refunded: 0, results: [] });

  const results = await refundOtherStreams(supabase, body.payer, body.except ?? "");
  const refunded = results.filter((r) => r.status === "sent").reduce((s, r) => s + r.amount, 0);
  return NextResponse.json(
    { refunded, results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
