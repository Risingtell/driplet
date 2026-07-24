import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { getViewerCredit, addViewerConsumption } from "@/lib/viewer-credit";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAddr = (a?: string | null): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);
const noStore = { headers: { "Cache-Control": "no-store" } };

/**
 * GET → how much prepaid-but-unwatched credit a viewer has on this stream, so a
 * returning viewer can resume it instead of paying a fresh lump. Fails open to
 * remaining: 0 (no resume) on any error or before the migration is applied.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const payer = req.nextUrl.searchParams.get("payer");
  if (!isAddr(payer)) {
    return NextResponse.json({ remaining: 0 }, noStore);
  }
  const credit = await getViewerCredit(supabase, slug, payer);
  return NextResponse.json(credit, noStore);
}

/**
 * POST { payer, seconds } → record that `seconds` more of this viewer's prepaid
 * balance has been watched. The rate is taken from the resolved stream, never
 * the client, and consumption is clamped server-side to what they prepaid.
 * Best-effort: a failure just means a hair of credit goes unrecorded.
 *
 * This is intentionally unauthenticated (viewers have no account on the passkey
 * path). Its blast radius is tightly bounded: it can only ever *raise* a payer's
 * consumed figure toward what they prepaid, i.e. shrink that payer's own resume
 * credit. It cannot touch creator payouts or treasury solvency (those are gated
 * on-chain by cashIn/paidOut), cannot consume more than the payer prepaid, and
 * runs on testnet with sub-cent lumps. The worst a griefer achieves is making a
 * viewer re-prepay — which if anything favours the treasury.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { payer?: string; seconds?: number };
  if (!isAddr(body.payer) || !(Number(body.seconds) > 0)) {
    return NextResponse.json({ ok: false }, noStore);
  }
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ ok: false }, noStore);

  const deltaUsd = Number(body.seconds) * stream.ratePerSecond;
  await addViewerConsumption(supabase, slug, body.payer, deltaUsd);
  const credit = await getViewerCredit(supabase, slug, body.payer);
  return NextResponse.json({ ok: true, remaining: credit.remaining }, noStore);
}
