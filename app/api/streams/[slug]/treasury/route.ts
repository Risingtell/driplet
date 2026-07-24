import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { getStreamRevenue } from "@/lib/settlement";

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

  const [revenue, agent] = await Promise.all([
    getStreamRevenue(supabase, stream),
    // This stream's OWN agent payments (budget-aware; recorded per-stream by
    // /agent-pay) — not the platform-wide agent count.
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", `/agents/captions/${slug}`),
  ]);

  const { cashIn: total, earned, held, dripCount: count, paidByRole } = revenue;
  const agentCount = agent.count ?? 0;
  const agentPaid = agentCount * AGENT_PRICE;

  // A payee's share is a share of what the stream has EARNED, not of the cash
  // it happens to be holding. Splitting `total` here counted prepaid balances
  // nobody had watched yet, so the panel showed a creator "owed" $27 against
  // $0.35 actually paid — which reads as a broken split rather than what it
  // was: money not yet earned. `held` is reported separately as viewer credit.
  const payees = stream.split.map((p) => ({
    name: p.name,
    role: p.role,
    share: p.share,
    amount: earned * p.share,
    paid: paidByRole.get(p.role) ?? 0,
    address: p.address ?? null,
  }));

  // Live data polled every couple of seconds — never let the edge cache it, or
  // the treasury panel freezes on a stale snapshot.
  return NextResponse.json(
    { total, earned, held, count, agentPaid, agentCount, payees },
    { headers: { "Cache-Control": "no-store" } },
  );
}
