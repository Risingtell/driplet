import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A viewer's prepaid-but-unwatched balance for one stream.
 *
 * A viewer prepays a lump into the stream treasury (Face ID / email / own
 * wallet) and watches it down a second at a time. `prepaid` is the sum of those
 * lumps, derived live from payment_events — never stored here. `consumed` is how
 * much they've actually watched, the one thing this ledger persists so a
 * returning viewer resumes their balance instead of paying a fresh lump.
 *
 * Every function here fails open: any error (including the viewer_credit table
 * not existing yet) yields zero remaining and a silent no-op write, which makes
 * the whole flow fall back to exactly the pre-persistence behaviour — a fresh
 * prepay each visit. So this can ship before the migration is applied.
 */

// Viewer prepay endpoints. Patron is the AI agent's own spending, not a viewer
// prepay, so it's deliberately excluded.
const prepayEndpoints = (slug: string) => [`/own/${slug}`, `/passkey/${slug}`, `/email/${slug}`];

/** PostgREST / Postgres codes for "this table doesn't exist (yet)". */
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

/**
 * Sum of refunds already sent (or in flight) back to viewers, optionally for one
 * payer and/or one stream. Returns null if the ledger can't be read, so callers
 * can fail closed. A missing table means the migration hasn't run, so no refund
 * can ever have happened: that is a real zero, not an error.
 */
export async function getRefunded(
  supabase: SupabaseClient,
  filter: { slug?: string; payer?: string },
): Promise<number | null> {
  let q = supabase.from("viewer_refunds").select("amount_usdc").in("status", ["pending", "sent"]);
  if (filter.slug) q = q.eq("slug", filter.slug);
  if (filter.payer) q = q.eq("payer", filter.payer.toLowerCase());
  const { data, error } = await q;
  if (error) return MISSING_TABLE.has(error.code) ? 0 : null;
  return (data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);
}

export interface ViewerCredit {
  prepaid: number;
  consumed: number;
  /** Already sent back to the viewer's wallet (see lib/viewer-refund). */
  refunded: number;
  remaining: number;
}

const ZERO: ViewerCredit = { prepaid: 0, consumed: 0, refunded: 0, remaining: 0 };

export async function getViewerCredit(
  supabase: SupabaseClient,
  slug: string,
  payer: string,
): Promise<ViewerCredit> {
  try {
    const [pays, cons, refunded] = await Promise.all([
      supabase
        .from("payment_events")
        .select("amount_usdc")
        .in("endpoint", prepayEndpoints(slug))
        // Addresses are recorded as-signed (mixed case); match case-insensitively.
        .ilike("payer", payer),
      supabase
        .from("viewer_credit")
        .select("consumed_usdc")
        .eq("slug", slug)
        .ilike("payer", payer)
        .maybeSingle(),
      getRefunded(supabase, { slug, payer }),
    ]);

    // If EITHER read fails — including the viewer_credit table not existing yet
    // (pre-migration) — return zero remaining so the caller offers no resume and
    // falls back to a fresh prepay. Resuming on an unreadable consumed value
    // would let a viewer re-watch a lump they'd already spent.
    // The same goes for refunds: an unreadable refund total could hand back
    // credit that was already sent to the viewer's wallet.
    if (pays.error || cons.error || refunded === null) return ZERO;

    const prepaid = (pays.data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);
    const consumed = Number(cons.data?.consumed_usdc ?? 0);
    return {
      prepaid,
      consumed,
      refunded,
      remaining: Math.max(0, prepaid - consumed - refunded),
    };
  } catch {
    return ZERO;
  }
}

/**
 * Record that `deltaUsd` more of this viewer's prepaid balance has been watched.
 * Clamped so consumed can never exceed prepaid — a viewer never owes more than
 * they put in, even if a stale client over-reports.
 */
export async function addViewerConsumption(
  supabase: SupabaseClient,
  slug: string,
  payer: string,
  deltaUsd: number,
): Promise<void> {
  if (!(deltaUsd > 0)) return;
  try {
    const { prepaid, consumed, refunded } = await getViewerCredit(supabase, slug, payer);
    const next = Math.min(prepaid - refunded, consumed + deltaUsd);
    if (next <= consumed) return; // already fully consumed; nothing to write
    await supabase.from("viewer_credit").upsert(
      {
        payer: payer.toLowerCase(),
        slug,
        consumed_usdc: String(next),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "payer,slug" },
    );
  } catch {
    // Fail open: an unrecorded second of consumption just means the viewer keeps
    // a hair more credit than they used — viewer-favourable, and self-limited to
    // one sync interval.
  }
}
