import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { streams, streamEndpoint } from "@/lib/streams";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const AGENT_ENDPOINT = "/agents/captions";
const AGENT_PRICE = 0.005;

/**
 * Public, real-time proof-of-impact feed. Aggregates every settled per-second
 * payment across all streams plus the autonomous agent payments, and returns
 * the most recent settlements with their Circle Gateway settlement ids — so
 * anyone (judges included) can open /impact and watch real USDC settle on Arc
 * live, not take our word for a counter.
 */
export async function GET() {
  // Exact per-endpoint counts (uncapped past the 1000-row REST page limit):
  // every payment to a given endpoint is the same fixed price, so total = count x price.
  const counters = await Promise.all(
    streams.map((s) =>
      supabase
        .from("payment_events")
        .select("id", { count: "exact", head: true })
        .eq("endpoint", streamEndpoint(s.slug)),
    ),
  );
  const agent = await supabase
    .from("payment_events")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", AGENT_ENDPOINT);

  const recent = await supabase
    .from("payment_events")
    .select("id, created_at, endpoint, amount_usdc, network, gateway_tx")
    .order("created_at", { ascending: false })
    .limit(12);

  const err = counters.find((c) => c.error)?.error ?? agent.error ?? recent.error;
  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  let watchCount = 0;
  let totalStreamed = 0;
  streams.forEach((s, i) => {
    const c = counters[i].count ?? 0;
    watchCount += c;
    totalStreamed += c * s.ratePerSecond;
  });
  const agentCount = agent.count ?? 0;
  const agentPaid = agentCount * AGENT_PRICE;

  const feed = (recent.data ?? []).map((r) => ({
    id: r.id as string,
    at: r.created_at as string,
    kind: r.endpoint === AGENT_ENDPOINT ? "agent" : "stream",
    endpoint: r.endpoint as string,
    amount: r.amount_usdc as string,
    network: r.network as string,
    settlement: (r.gateway_tx as string | null) ?? null,
  }));

  return NextResponse.json(
    {
      totalStreamed,
      watchCount,
      minutesStreamed: watchCount / 60,
      agentCount,
      agentPaid,
      streamCount: streams.length,
      feed,
      updatedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
