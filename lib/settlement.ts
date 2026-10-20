import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCreatorGateway, ensureCreatorFunded } from "@/lib/server-gateway";
import { streamEndpoint, type Stream } from "@/lib/streams";
import { getRefunded } from "@/lib/viewer-credit";

const COHOST_FALLBACK = process.env.COHOST_ADDRESS;
const SELLER = (process.env.SELLER_ADDRESS ?? "").toLowerCase();
const isAddr = (a?: string): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

/**
 * Roles paid separately via /agent-pay's own hardcoded budget share, never
 * through the human split below. Shared with app/creator/actions.ts (which
 * must never let a creator edit these payees' share, or /agent-pay's fixed
 * budget assumption and this split stop summing to 100%) and
 * app/api/streams/[slug]/settle/route.ts (which excludes them from the
 * "humanShare" solvency calculation).
 */
export const AGENT_ROLES = new Set(["Live captions agent", "Commentary"]);

/** Sidecar sources whose payouts count as "paid out" for a stream, alongside
 *  the direct web-charge flow. Extend this when a new sidecar (e.g. PeerTube)
 *  ships — settle/route.ts and treasury/route.ts both derive their payout
 *  ledger filter from this single list instead of hand-duplicating it. */
export const SIDECAR_SOURCES = ["owncast", "jellyfin"];

/** The payment_events `.or()` filter matching every payout endpoint (direct
 *  + every known sidecar source) for one stream. */
export function payoutEndpointFilter(slug: string): string {
  const clauses = [
    `endpoint.like./payout/${slug}/%`,
    ...SIDECAR_SOURCES.map((source) => `endpoint.like./payout/${source}/${slug}/%`),
  ];
  return clauses.join(",");
}

export interface StreamRevenue {
  /** Cash the treasury actually holds for this stream: per-second drips plus
   *  own-wallet / Face ID / patron lump prepays, minus unwatched prepay already
   *  refunded to viewers. */
  cashIn: number;
  /** What the treasury has already paid out to its human payees. */
  paidOut: number;
  /** Value viewers have actually watched down, derived from what's been paid
   *  out over the human share. A viewer who prepays $5 and watches ten seconds
   *  has earned the stream $0.003, not $5 — the rest is their unspent credit. */
  earned: number;
  /** Prepaid cash nobody has watched yet. Viewer credit, not revenue. */
  held: number;
  /** How many per-second drips this stream has been paid. */
  dripCount: number;
  /** Actual payouts so far, summed per payee role. */
  paidByRole: Map<string, number>;
}

/**
 * What a stream has taken in versus what it has genuinely earned.
 *
 * These are different numbers and conflating them is a real hazard: a prepaid
 * session lands as one lump sum long before it's watched, so anything that
 * treats cash-in as revenue (an agent budget, a payee's share) pays out against
 * money the viewer hasn't consumed. Solvency questions want `cashIn`; "what has
 * this stream earned / who is owed what" wants `earned`.
 */
export async function getStreamRevenue(
  supabase: SupabaseClient,
  stream: Stream,
): Promise<StreamRevenue> {
  const [watch, own, paid, refunded] = await Promise.all([
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", streamEndpoint(stream.slug)),
    supabase
      .from("payment_events")
      .select("amount_usdc")
      .in("endpoint", [
        `/own/${stream.slug}`,
        `/passkey/${stream.slug}`,
        // Email-wallet prepays are real treasury income too. They were missing
        // here (though /impact and creator earnings counted them), so a stream
        // whose viewers all paid by email showed $0 income and never settled to
        // its creator.
        `/email/${stream.slug}`,
        `/patron/${stream.slug}`,
      ]),
    supabase
      .from("payment_events")
      .select("endpoint, amount_usdc")
      .or(payoutEndpointFilter(stream.slug)),
    getRefunded(supabase, { slug: stream.slug }),
  ]);

  // Refunded prepay has left the treasury. If we can't tell how much, stop
  // here rather than count it as income: every caller would otherwise pay out
  // against money that may already be back in a viewer's wallet.
  if (refunded === null) throw new Error("Could not read viewer refunds.");

  const sum = (rows: { amount_usdc?: string | number | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);

  const cashIn = Math.max(0, (watch.count ?? 0) * stream.ratePerSecond + sum(own.data) - refunded);
  const paidOut = sum(paid.data);

  // Payout labels end in the payee's role, spaces written as underscores.
  const paidByRole = new Map<string, number>();
  for (const r of paid.data ?? []) {
    const role = ((r.endpoint as string).split("/").pop() ?? "").replace(/_/g, " ");
    paidByRole.set(role, (paidByRole.get(role) ?? 0) + Number(r.amount_usdc ?? 0));
  }
  const humanShare = stream.split
    .filter((p) => !AGENT_ROLES.has(p.role))
    .reduce((s, p) => s + p.share, 0);
  // Payouts run per watched interval, so they trail live watching by one settle
  // cycle. That makes `earned` a slight under-estimate, which is the safe
  // direction to be wrong in.
  const earned = humanShare > 0 ? Math.min(paidOut / humanShare, cashIn) : 0;

  return {
    cashIn,
    paidOut,
    earned,
    held: Math.max(0, cashIn - earned),
    dripCount: watch.count ?? 0,
    paidByRole,
  };
}

export interface PayeeSettlement {
  name: string;
  role: string;
  address: string;
  amount: number;
  ok: boolean;
}

/**
 * Autonomous treasury split for one watched interval. The stream treasury pays
 * each human payee (creator, co-host) their share of `seconds * ratePerSecond`
 * directly into their own wallet on Arc, via Circle Gateway. The AI captions
 * agent is paid separately through /agent-pay.
 *
 * Shared by the per-second watch flow (/api/streams/[slug]/settle) and the
 * Owncast webhook sidecar (/api/sidecar/owncast). `source` prefixes the payout
 * label so settlements can be attributed to where the "seconds watched" came
 * from (e.g. "owncast/<slug>/Creator").
 */
export async function settleStreamSeconds(
  stream: Stream,
  seconds: number,
  opts: { origin: string; source?: string },
): Promise<PayeeSettlement[]> {
  const gw = getCreatorGateway();
  await ensureCreatorFunded().catch(() => {});

  const prefix = opts.source ? `${opts.source}/` : "";
  const settled: PayeeSettlement[] = [];

  for (const payee of stream.split) {
    // The AI co-host is paid separately via /agent-pay, never through the human
    // split. Matches both the old ("Live captions agent") and new ("Commentary")
    // role labels so existing DB streams keep settling correctly.
    if (AGENT_ROLES.has(payee.role)) continue;
    let address = payee.address;
    if (!isAddr(address) && payee.role === "Co-host") address = COHOST_FALLBACK;
    if (!isAddr(address)) continue;
    if (address.toLowerCase() === SELLER) continue; // treasury can't pay itself

    const amount = Number((payee.share * seconds * stream.ratePerSecond).toFixed(6));
    if (amount <= 0) continue;

    const label = `${prefix}${stream.slug}/${payee.role.replace(/\s+/g, "_")}`;
    const payUrl = `${opts.origin}/api/payout?to=${address}&amount=${amount}&label=${label}`;

    try {
      await gw.pay(payUrl, { method: "GET" });
      settled.push({ name: payee.name, role: payee.role, address, amount, ok: true });
    } catch {
      try {
        await ensureCreatorFunded();
        await gw.pay(payUrl, { method: "GET" });
        settled.push({ name: payee.name, role: payee.role, address, amount, ok: true });
      } catch {
        settled.push({ name: payee.name, role: payee.role, address, amount, ok: false });
      }
    }
  }

  return settled;
}

// One settle call covers at most this many watched seconds (the watch page
// settles every 20s; the Owncast sidecar settles through settleStreamSeconds
// directly, so long real sessions are unaffected).
const MAX_SECONDS_PER_CALL = 600;

/**
 * Settle a client-reported number of watched seconds, clamped so this stream's
 * cumulative payouts can never exceed the cash it actually holds.
 *
 * Solvency guard: `seconds` comes from the client, so before settling we
 * re-derive the stream's real recorded income and what has already been paid
 * out, and clamp the interval to fit. An attacker posting a huge `seconds` gets
 * a paused treasury, not a drained one. Solvency is a cash question, not an
 * earnings one: the treasury can pay a creator for seconds genuinely watched out
 * of the prepay that funded them.
 */
export async function settleWithinIncome(
  supabase: SupabaseClient,
  stream: Stream,
  requestedSeconds: number,
  opts: { origin: string },
): Promise<{ settled: PayeeSettlement[]; guard?: "solvency" }> {
  const humanShare = stream.split
    .filter((p) => !AGENT_ROLES.has(p.role))
    .reduce((s, p) => s + p.share, 0);

  let seconds = Math.min(Math.floor(requestedSeconds), MAX_SECONDS_PER_CALL);
  if (humanShare > 0) {
    const { cashIn, paidOut } = await getStreamRevenue(supabase, stream);
    const affordable = Math.floor((cashIn - paidOut) / (humanShare * stream.ratePerSecond));
    seconds = Math.min(seconds, Math.max(0, affordable));
  }
  if (seconds <= 0) return { settled: [], guard: "solvency" };

  return { settled: await settleStreamSeconds(stream, seconds, opts) };
}
