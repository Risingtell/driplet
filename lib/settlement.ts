import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCreatorGateway, ensureCreatorFunded } from "@/lib/server-gateway";
import { streamEndpoint, type Stream } from "@/lib/streams";

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
   *  own-wallet / Face ID / patron lump prepays. */
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
  const [watch, own, paid] = await Promise.all([
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
        `/patron/${stream.slug}`,
      ]),
    supabase
      .from("payment_events")
      .select("endpoint, amount_usdc")
      .or(payoutEndpointFilter(stream.slug)),
  ]);

  const sum = (rows: { amount_usdc?: string | number | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);

  const cashIn = (watch.count ?? 0) * stream.ratePerSecond + sum(own.data);
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
