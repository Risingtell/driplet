import "server-only";
import { getCreatorGateway, ensureCreatorFunded } from "@/lib/server-gateway";
import type { Stream } from "@/lib/streams";

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
