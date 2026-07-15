import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const AGENT_ENDPOINT = "/agents/captions";
const AGENT_PRICE = 0.005;
const RATE_PER_SECOND = 0.0003;

// Infrastructure wallets that aren't real users: the treasury, the shared demo
// viewer wallet, the AI agent, and the co-host fallback. Excluded from the
// "unique real wallets" count so it reflects actual distinct people who paid.
const INFRA_WALLETS = new Set(
  [
    process.env.SELLER_ADDRESS,
    process.env.BUYER_ADDRESS,
    process.env.CAPTIONS_AGENT_ADDRESS,
    process.env.COHOST_ADDRESS,
  ]
    .filter(Boolean)
    .map((a) => (a as string).toLowerCase()),
);
const isWallet = (a: string) => /^0x[0-9a-f]{40}$/.test(a);

/**
 * Public, real-time proof-of-impact feed. Aggregates every settled per-second
 * payment across all streams plus the autonomous agent payments, and returns
 * the most recent settlements with their Circle Gateway settlement ids — so
 * anyone (judges included) can open /impact and watch real USDC settle on Arc
 * live, not take our word for a counter.
 */
export async function GET() {
  // Exact counts (uncapped past the 1000-row REST page limit): every per-second
  // watch payment is the same fixed price across all streams, so total =
  // count x price. Counting by the /watch/ endpoint prefix includes every
  // creator-created stream automatically.
  const [watch, agent, recent, wallets, streams] = await Promise.all([
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .like("endpoint", "/watch/%"),
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", AGENT_ENDPOINT),
    supabase
      .from("payment_events")
      .select("id, created_at, endpoint, amount_usdc, network, gateway_tx")
      // Hide the per-stream agent markers (/agents/captions/<slug>) — they mirror
      // the global agent payment already counted, so showing them would double up.
      // Patron DECISION markers (amount 0) live in their own /impact panel; the
      // patron's actual /patron/<slug> payments stay in the feed.
      .not("endpoint", "like", "/agents/captions/%")
      .not("endpoint", "like", "/agents/patron/%")
      .order("created_at", { ascending: false })
      .limit(12),
    // Distinct wallets that paid from their OWN wallet (own-pay, Face ID, or
    // email onboarding), i.e. real people, not the shared demo wallet.
    supabase
      .from("payment_events")
      .select("payer")
      .or("endpoint.like./own/%,endpoint.like./passkey/%,endpoint.like./email/%"),
    // Distinct creators: each stream's payout split names one payee with
    // role "Creator" — dedupe by that address to count real streamers, not
    // stream count (one person can run several streams).
    supabase.from("streams").select("split"),
  ]);

  const err = watch.error ?? agent.error ?? recent.error;
  if (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const watchCount = watch.count ?? 0;
  const totalStreamed = watchCount * RATE_PER_SECOND;
  const agentCount = agent.count ?? 0;
  const agentPaid = agentCount * AGENT_PRICE;

  // Unique real users = distinct paying wallets minus infrastructure wallets.
  const uniqueWallets = new Set(
    (wallets.data ?? [])
      .map((r) => (r.payer ?? "").toLowerCase())
      .filter((a) => isWallet(a) && !INFRA_WALLETS.has(a)),
  ).size;

  const uniqueCreators = new Set(
    (streams.data ?? [])
      .flatMap((r) => (Array.isArray(r.split) ? r.split : []))
      .filter((p: { role?: string }) => p.role === "Creator")
      .map((p: { address?: string }) => (p.address ?? "").toLowerCase())
      .filter((a) => isWallet(a)),
  ).size;

  const feed = (recent.data ?? []).map((r) => ({
    id: r.id as string,
    at: r.created_at as string,
    kind:
      r.endpoint === AGENT_ENDPOINT
        ? "agent"
        : (r.endpoint as string).startsWith("/patron/")
          ? "patron"
          : "stream",
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
      uniqueWallets,
      uniqueCreators,
      feed,
      updatedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
