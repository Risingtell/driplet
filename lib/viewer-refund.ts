import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { getStreamRevenue } from "@/lib/settlement";
import { getViewerCredit } from "@/lib/viewer-credit";
import { estimateTreasuryUsdcFee, sendTreasuryUsdc } from "@/lib/relayer";

/**
 * Send a viewer's unwatched prepay on a stream back to the wallet that paid it,
 * so leaving one creator never strands money they could spend on another.
 *
 * Two caps, both re-derived server-side:
 *  - the viewer's own remaining credit (prepaid - watched - already refunded);
 *  - what the stream still holds unspent (cash in minus what its payees have
 *    earned), so a refund can never hand back money already paid to a creator.
 *
 * Unauthenticated on purpose (passkey viewers have no account): the money only
 * ever goes to the address that prepaid it, and only what that address left
 * unwatched. The worst a stranger can do is end someone's session early, and
 * the watch page reconciles to the server's remaining credit within one sync.
 *
 * Fails closed. Each attempt first claims a 'pending' row (one per payer and
 * stream, enforced by a unique index), and only then works out the amount, so
 * two simultaneous requests can never both send the same leftover.
 *
 * Driplet pays no one's gas, so the refund's own network fee comes out of it.
 * The row's amount is what left the treasury (what the viewer received plus
 * that fee), which is what their credit and the stream's cash both drop by;
 * fee_usdc says how much of it was the fee.
 */

// Below this a refund costs about as much in gas as it returns.
const MIN_REFUND = 0.005;

const PREPAY_PREFIXES = ["/own/", "/passkey/", "/email/"];

export interface RefundResult {
  slug: string;
  /** What reached the viewer's wallet, after the network fee. */
  amount: number;
  feeUsd?: number;
  tx?: string;
  status: "sent" | "nothing" | "busy" | "failed";
}

export async function refundViewer(
  supabase: SupabaseClient,
  slug: string,
  payer: `0x${string}`,
): Promise<RefundResult> {
  const stream = await resolveStream(slug);
  if (!stream) return { slug, amount: 0, status: "nothing" };

  const { data: claim, error: claimError } = await supabase
    .from("viewer_refunds")
    .insert({ payer: payer.toLowerCase(), slug, amount_usdc: 0, status: "pending" })
    .select("id")
    .single();
  // 23505 = another refund for this viewer and stream is already in flight.
  if (claimError) {
    return { slug, amount: 0, status: claimError.code === "23505" ? "busy" : "failed" };
  }

  const release = () => supabase.from("viewer_refunds").delete().eq("id", claim.id);

  try {
    const [credit, revenue] = await Promise.all([
      getViewerCredit(supabase, slug, payer),
      getStreamRevenue(supabase, stream),
    ]);
    const gross = Math.floor(Math.min(credit.remaining, revenue.held) * 1e6) / 1e6;
    if (gross < MIN_REFUND) {
      await release();
      return { slug, amount: 0, status: "nothing" };
    }
    // The transfer's network fee comes out of the refund.
    const feeEstimate = await estimateTreasuryUsdcFee(payer, gross);
    const amount = Math.floor((gross - feeEstimate) * 1e6) / 1e6;
    if (amount < MIN_REFUND) {
      await release();
      return { slug, amount: 0, status: "nothing" };
    }

    // Record the most this can take from the treasury before any money moves,
    // so a crash after sending still counts it as refunded rather than
    // offering it again.
    const { error: amountError } = await supabase
      .from("viewer_refunds")
      .update({ amount_usdc: String(gross) })
      .eq("id", claim.id);
    if (amountError) {
      await release();
      return { slug, amount: 0, status: "failed" };
    }

    let sent: Awaited<ReturnType<typeof sendTreasuryUsdc>>;
    try {
      sent = await sendTreasuryUsdc(payer, amount);
    } catch {
      // Never submitted, so no money moved: the credit stays with the viewer.
      await supabase.from("viewer_refunds").update({ status: "failed" }).eq("id", claim.id);
      return { slug, amount: 0, status: "failed" };
    }
    await supabase.from("viewer_refunds").update({ tx_hash: sent.hash }).eq("id", claim.id);
    let feeUsd: number;
    try {
      ({ feeUsd } = await sent.confirmed);
    } catch {
      // Submitted but unconfirmed (or reverted). Leave it 'pending' with its
      // hash and the full reserved amount: it still counts as refunded and
      // blocks a second send, which is the safe side until someone checks it.
      return { slug, amount, tx: sent.hash, status: "failed" };
    }
    // Settle the row at exactly what left the treasury: the refund plus the
    // fee it really cost (the estimate had headroom, which stays the viewer's).
    const settled = Math.round((amount + feeUsd) * 1e6) / 1e6;
    const { error: feeColumnError } = await supabase
      .from("viewer_refunds")
      .update({ status: "sent", amount_usdc: String(settled), fee_usdc: String(feeUsd) })
      .eq("id", claim.id);
    if (feeColumnError) {
      // fee_usdc not migrated yet: keep the exact total, the fee split is lost.
      await supabase
        .from("viewer_refunds")
        .update({ status: "sent", amount_usdc: String(settled) })
        .eq("id", claim.id);
    }
    return { slug, amount, feeUsd, tx: sent.hash, status: "sent" };
  } catch {
    // Reached only before any send (reads failed), so nothing moved.
    await release();
    return { slug, amount: 0, status: "failed" };
  }
}

/**
 * Refund this viewer's leftover on every stream except `exceptSlug`. Run when
 * they connect on a new stream, as a safety net for the leave-page refund
 * (a closed tab or a killed mobile browser can skip it).
 */
export async function refundOtherStreams(
  supabase: SupabaseClient,
  payer: `0x${string}`,
  exceptSlug: string,
): Promise<RefundResult[]> {
  const { data, error } = await supabase
    .from("payment_events")
    .select("endpoint")
    .or(PREPAY_PREFIXES.map((p) => `endpoint.like.${p}%`).join(","))
    // Addresses are recorded as-signed (mixed case); match case-insensitively.
    .ilike("payer", payer);
  if (error) return [];

  const slugs = new Set(
    (data ?? []).map((r) => (r.endpoint as string).split("/")[2]).filter((s) => s && s !== exceptSlug),
  );

  const results: RefundResult[] = [];
  for (const slug of slugs) results.push(await refundViewer(supabase, slug, payer));
  return results;
}
