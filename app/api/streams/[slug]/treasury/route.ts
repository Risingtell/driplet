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

  const [watch, own, agent] = await Promise.all([
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", streamEndpoint(slug)),
    // Own-wallet + Face ID + AI-patron payments are lump sums (not the fixed
    // per-second price), so sum their amounts rather than counting them.
    supabase
      .from("payment_events")
      .select("amount_usdc")
      .in("endpoint", [`/own/${slug}`, `/passkey/${slug}`, `/patron/${slug}`]),
    // This stream's OWN agent payments (budget-aware; recorded per-stream by
    // /agent-pay) — not the platform-wide agent count.
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", `/agents/captions/${slug}`),
  ]);

  if (watch.error) {
    return NextResponse.json({ error: watch.error.message }, { status: 500 });
  }

  const count = watch.count ?? 0;
  const ownTotal = (own.data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);
  const total = count * stream.ratePerSecond + ownTotal;
  const agentCount = agent.count ?? 0;
  const agentPaid = agentCount * AGENT_PRICE;

  const payees = stream.split.map((p) => ({
    name: p.name,
    role: p.role,
    share: p.share,
    amount: total * p.share,
    address: p.address ?? null,
  }));

  // Live data polled every couple of seconds — never let the edge cache it, or
  // the treasury panel freezes on a stale snapshot.
  return NextResponse.json(
    { total, count, agentPaid, agentCount, payees },
    { headers: { "Cache-Control": "no-store" } },
  );
}
