import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { recordViewerPrepay, isTxHash } from "@/lib/viewer-payment";
import { ARC } from "@/lib/arc-network";

// Waiting for the viewer's transfer to be mined can take a few seconds.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SELLER = (process.env.SELLER_ADDRESS ?? "") as `0x${string}`;
const ARC_NETWORK = ARC.caip2;
const isAddr = (a?: string | null): a is `0x${string}` => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

// Viewers always pay the stream treasury, which then auto-splits in real time to
// the creator, co-host, and AI co-host (via /api/streams/[slug]/settle). Paying
// the creator directly would skip the split and the agent, so we route to the
// treasury just like the per-second demo charge does.
function payToFor(_split: { role: string; address?: string | null }[]): `0x${string}` {
  return SELLER;
}

/** GET → tell the client where to pay and at what rate. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });
  return NextResponse.json({
    payTo: payToFor(stream.split),
    ratePerSecond: stream.ratePerSecond,
    network: ARC_NETWORK,
  });
}

/**
 * POST { tx, payer } → record a prepay the viewer sent from their own wallet.
 * The viewer submits the USDC transfer and pays its network fee themselves
 * (Driplet pays no one's gas); the server confirms it on-chain and records it
 * with the viewer's real address as the payer, the distinct-wallet proof.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { tx?: string; payer?: string };
  if (!isTxHash(body.tx) || !isAddr(body.payer)) {
    return NextResponse.json({ error: "tx and payer required" }, { status: 400 });
  }

  const result = await recordViewerPrepay(supabase, {
    tx: body.tx,
    payer: body.payer,
    payTo: payToFor(stream.split),
    slug,
    endpoint: `/own/${slug}`,
    raw: { wallet: "own" },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
