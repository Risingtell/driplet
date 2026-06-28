import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { streamEndpoint } from "@/lib/streams";
import { resolveStream } from "@/lib/streams-db";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * The stream's autonomous treasury: total USDC the stream has earned, the
 * number of drips, and how it splits across the stream's payees in real time.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) {
    return NextResponse.json({ error: "Unknown stream" }, { status: 404 });
  }

  // Count exact rows (uncapped) instead of fetching them — payments are a fixed
  // price per call, so totals are count x price. This stays accurate past the
  // REST 1000-row page limit.
  const AGENT_PRICE = 0.005;
  // Matches the watch loop's agent-pay cadence (one agent payment per N watched
  // seconds). The treasury pays its agent once per interval, so this stream's
  // agent payments are derived from its own watched seconds — NOT a global count.
  const AGENT_PAY_EVERY = 20;

  const [watch, own] = await Promise.all([
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", streamEndpoint(slug)),
    // Own-wallet + Face ID payments are lump sums (not the fixed per-second
    // price), so sum their amounts rather than counting them.
    supabase
      .from("payment_events")
      .select("amount_usdc")
      .in("endpoint", [`/own/${slug}`, `/passkey/${slug}`]),
  ]);

  if (watch.error) {
    return NextResponse.json({ error: watch.error.message }, { status: 500 });
  }

  const count = watch.count ?? 0;
  const ownTotal = (own.data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);
  const total = count * stream.ratePerSecond + ownTotal;
  // This stream's own autonomous agent payments (one per AGENT_PAY_EVERY seconds).
  const agentCount = Math.floor(count / AGENT_PAY_EVERY);
  const agentPaid = agentCount * AGENT_PRICE;

  const payees = stream.split.map((p) => ({
    name: p.name,
    role: p.role,
    share: p.share,
    amount: total * p.share,
    address: p.address ?? null,
  }));

  return NextResponse.json({ total, count, agentPaid, agentCount, payees });
}
