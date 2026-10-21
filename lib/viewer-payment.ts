import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { ARC, arcChain } from "@/lib/arc-network";
import { paymentTag } from "@/lib/payment-tag";

/**
 * Viewer prepays that the viewer sends themselves (Face ID smart account or
 * their own wallet). Driplet pays no one's gas, so the viewer submits the USDC
 * transfer and pays its network fee; the server only confirms it on-chain and
 * records it. Shared by the passkey-pay and own-pay routes so both check the
 * same way.
 */

const USDC = ARC.usdc.toLowerCase();
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topicAddr = (t: string) => "0x" + t.slice(-40).toLowerCase();

export const isTxHash = (t?: string | null): t is `0x${string}` => !!t && /^0x[0-9a-fA-F]{64}$/.test(t);

export type PrepayResult =
  | { ok: true; tx: string; amount: number; paidTo: string; alreadyRecorded?: boolean }
  | { ok: false; status: number; error: string };

export async function recordViewerPrepay(
  supabase: SupabaseClient,
  opts: {
    tx: `0x${string}`;
    payer: `0x${string}`;
    payTo: `0x${string}`;
    slug: string;
    /** e.g. `/passkey/<slug>` or `/own/<slug>`. */
    endpoint: string;
    raw: Record<string, unknown>;
  },
): Promise<PrepayResult> {
  // A mint shows up as a Transfer from the zero address; it is never a viewer.
  if (/^0x0{40}$/i.test(opts.payer)) return { ok: false, status: 400, error: "Not a viewer payment." };

  // Each on-chain transfer counts once, under any payment type. The tx doesn't
  // name a stream, so without this a hash could be replayed across streams,
  // or claimed again through a different route, to inflate the feed.
  const { data: existing, error: lookupError } = await supabase
    .from("payment_events")
    .select("endpoint, amount_usdc")
    .eq("gateway_tx", opts.tx)
    .limit(1);
  if (lookupError) return { ok: false, status: 502, error: "Could not check that payment. Try again." };
  if (existing && existing.length > 0) {
    if (existing[0].endpoint !== opts.endpoint) {
      return { ok: false, status: 409, error: "That transaction has already been counted." };
    }
    // Idempotent: a client retry still succeeds, but the payment counts once.
    return {
      ok: true,
      tx: opts.tx,
      amount: Number(existing[0].amount_usdc ?? 0),
      paidTo: opts.payTo,
      alreadyRecorded: true,
    };
  }

  const pub = createPublicClient({ chain: arcChain, transport: http() });
  let receipt;
  try {
    receipt = await pub.waitForTransactionReceipt({ hash: opts.tx, timeout: 30_000 });
  } catch {
    return { ok: false, status: 502, error: "Could not find that transaction on Arc." };
  }
  if (receipt.status !== "success") {
    return { ok: false, status: 400, error: "That transaction reverted on-chain." };
  }

  const transfer = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === USDC &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
      l.topics.length >= 3 &&
      topicAddr(l.topics[1]!) === opts.payer.toLowerCase() &&
      topicAddr(l.topics[2]!) === opts.payTo.toLowerCase(),
  );
  if (!transfer) {
    return { ok: false, status: 400, error: "No USDC payment to this stream was found in that transaction." };
  }
  // The transfer must carry this stream's tag (lib/payment-tag). Without it any
  // transfer to the treasury could be claimed for any stream and paid out to
  // that stream's creator. For a Face ID payment the tag sits inside the
  // UserOperation the bundle transaction carries, so search the whole input.
  const sent = await pub.getTransaction({ hash: opts.tx }).catch(() => null);
  if (!sent || !sent.input.toLowerCase().includes(paymentTag(opts.slug))) {
    return { ok: false, status: 400, error: "That payment wasn't made for this stream." };
  }

  const amount = Number(BigInt(transfer.data)) / 1e6;
  if (!(amount > 0)) return { ok: false, status: 400, error: "Zero-value transfer." };
  // No upper cap: the viewer has already sent this money, so refusing to record
  // it would strand their own funds in the treasury as uncounted credit.

  const { error: insertError } = await supabase.from("payment_events").insert({
    endpoint: opts.endpoint,
    payer: opts.payer,
    amount_usdc: String(amount),
    network: ARC.caip2,
    gateway_tx: opts.tx,
    raw: { ...opts.raw, paidTo: opts.payTo },
  });
  if (insertError) return { ok: false, status: 502, error: "Payment landed but could not be recorded. Try again." };

  return { ok: true, tx: opts.tx, amount, paidTo: opts.payTo };
}
