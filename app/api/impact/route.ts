import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { streams as demoStreams } from "@/lib/streams";
import { getRefunded } from "@/lib/viewer-credit";

// Next wraps the global fetch for caching. This endpoint must read the database
// live every time (a count that came back empty on a fresh server's first call
// was published as 0), so every request from this client opts out of that.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } },
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

// Viewer prepays: a lump from the viewer's own wallet (own wallet, Face ID or
// email onboarding) that they then watch down a second at a time.
const PREPAY_FILTER = "endpoint.like./own/%,endpoint.like./passkey/%,endpoint.like./email/%";

type Row = { endpoint: string; amount_usdc: string | number | null; payer?: string | null };

/** Every matching row, paging past the 1000-row REST limit. */
async function allRows(
  client: SupabaseClient,
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<{ rows: Row[]; error: string | null }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { rows, error: null };
  }
}

const sum = (rows: Row[]) => rows.reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);

/** The stream slug inside a payment endpoint, if it names one. */
function slugOf(endpoint: string): string | null {
  const parts = endpoint.split("/");
  if (parts[1] === "payout") return parts.length === 5 ? parts[3] : (parts[2] ?? null);
  if (["watch", "own", "passkey", "email", "patron"].includes(parts[1])) return parts[2] ?? null;
  return null;
}

/**
 * Public, real-time proof-of-impact feed, and the numbers on /impact.
 *
 * On mainnet most viewers prepay a small lump from their own wallet and watch
 * it down, so the money story is: prepaid by viewers -> paid out to creators
 * for the seconds actually watched -> anything unwatched returned to the
 * viewer. The per-second demo drips (/watch/...) are still counted, and the
 * original fields stay exactly as they were, because `npm run verify:impact`
 * re-derives them independently from the database.
 */
export async function GET() {
  // Exact counts (uncapped past the 1000-row REST page limit): every per-second
  // watch payment is the same fixed price across all streams, so total =
  // count x price. Counting by the /watch/ endpoint prefix includes every
  // creator-created stream automatically.
  const [watch, agent, recent, prepays, streams, payouts, settled, refunded] = await Promise.all([
    supabase
      .from("payment_events")
      .select("id", { count: "exact" })
      .like("endpoint", "/watch/%")
      .limit(1),
    supabase
      .from("payment_events")
      .select("id", { count: "exact" })
      .eq("endpoint", AGENT_ENDPOINT)
      .limit(1),
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
    // Every viewer prepay. Its payers are the distinct wallets that paid from
    // their OWN wallet, i.e. real people, not the shared demo wallet.
    allRows(supabase, (from, to) =>
      supabase
        .from("payment_events")
        .select("endpoint, amount_usdc, payer")
        .or(PREPAY_FILTER)
        .order("id")
        .range(from, to),
    ),
    // Distinct creators: each stream's payout split names one payee with
    // role "Creator" — dedupe by that address to count real streamers, not
    // stream count (one person can run several streams).
    supabase.from("streams").select("slug, split, rate_per_second"),
    // What the stream treasuries actually paid their human payees (creators
    // and co-hosts) for seconds watched, sidecars included.
    allRows(supabase, (from, to) =>
      supabase
        .from("payment_events")
        .select("endpoint, amount_usdc")
        .like("endpoint", "/payout/%")
        .order("id")
        .range(from, to),
    ),
    // Every settled payment, minus bookkeeping rows: per-stream agent markers
    // mirror an agent payment already counted, and patron decisions move no money.
    supabase
      .from("payment_events")
      .select("id", { count: "exact" })
      .not("endpoint", "like", "/agents/captions/%")
      .not("endpoint", "like", "/agents/patron/%")
      .limit(1),
    getRefunded(supabase, {}),
  ]);

  // Any failed query fails the response: a missing wallets or streams read
  // must not quietly publish 0 users or 0 creators.
  const err =
    watch.error?.message ??
    agent.error?.message ??
    recent.error?.message ??
    prepays.error ??
    streams.error?.message ??
    payouts.error ??
    settled.error?.message ??
    (refunded === null ? "Could not read viewer refunds." : null) ??
    // An exact count that comes back empty is a failed read too, not a zero.
    (watch.count === null || agent.count === null || settled.count === null
      ? "A payment count came back empty."
      : null);
  if (err) {
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const watchCount = watch.count ?? 0;
  const totalStreamed = watchCount * RATE_PER_SECOND;
  const agentCount = agent.count ?? 0;
  const agentPaid = agentCount * AGENT_PRICE;

  // Unique real users = distinct paying wallets minus infrastructure wallets.
  const uniqueWallets = new Set(
    prepays.rows
      .map((r) => (r.payer ?? "").toLowerCase())
      .filter((a) => isWallet(a) && !INFRA_WALLETS.has(a)),
  ).size;

  const streamRows = (streams.data ?? []) as {
    slug: string;
    split: unknown;
    rate_per_second: number | string;
  }[];
  const uniqueCreators = new Set(
    streamRows
      .flatMap((r) => (Array.isArray(r.split) ? r.split : []))
      .filter((p: { role?: string }) => p.role === "Creator")
      .map((p: { address?: string }) => (p.address ?? "").toLowerCase())
      .filter((a) => isWallet(a)),
  ).size;

  // Seconds watched, recovered from the creator's payouts: each one pays the
  // creator share x seconds x rate for an interval actually watched, so
  // seconds = amount / (share x rate). Paid-for demo drips are settled the same
  // way, so this counts every watched second exactly once.
  const terms = new Map<string, { share: number; rate: number }>();
  for (const s of demoStreams) {
    const share = s.split.find((p) => p.role === "Creator")?.share ?? 0;
    terms.set(s.slug, { share, rate: s.ratePerSecond });
  }
  for (const r of streamRows) {
    const split = Array.isArray(r.split) ? (r.split as { role?: string; share?: number }[]) : [];
    const share = Number(split.find((p) => p.role === "Creator")?.share ?? 0);
    terms.set(r.slug, { share, rate: Number(r.rate_per_second) || RATE_PER_SECOND });
  }
  let secondsWatched = 0;
  for (const row of payouts.rows) {
    if (!row.endpoint.endsWith("/Creator")) continue;
    const t = terms.get(slugOf(row.endpoint) ?? "");
    if (!t || !(t.share > 0) || !(t.rate > 0)) continue;
    secondsWatched += Number(row.amount_usdc ?? 0) / (t.share * t.rate);
  }

  const feed = (recent.data ?? []).map((r) => {
    const endpoint = r.endpoint as string;
    const kind =
      endpoint === AGENT_ENDPOINT
        ? "agent"
        : endpoint.startsWith("/patron/")
          ? "patron"
          : endpoint.startsWith("/payout/")
            ? "payout"
            : /^\/(own|passkey|email)\//.test(endpoint)
              ? "prepay"
              : "stream";
    return {
      id: r.id as string,
      at: r.created_at as string,
      kind,
      endpoint,
      slug: slugOf(endpoint),
      amount: r.amount_usdc as string,
      network: r.network as string,
      settlement: (r.gateway_tx as string | null) ?? null,
    };
  });

  return NextResponse.json(
    {
      totalStreamed,
      watchCount,
      minutesStreamed: watchCount / 60,
      agentCount,
      agentPaid,
      uniqueWallets,
      uniqueCreators,
      prepaidUsd: sum(prepays.rows),
      prepayCount: prepays.rows.length,
      paidToCreatorsUsd: sum(payouts.rows),
      payoutCount: payouts.rows.length,
      minutesWatched: secondsWatched / 60,
      settledCount: settled.count ?? 0,
      refundedUsd: refunded,
      feed,
      updatedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
