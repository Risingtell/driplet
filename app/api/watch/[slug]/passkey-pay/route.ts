import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { recordViewerPrepay, isTxHash } from "@/lib/viewer-payment";

// Reading a fresh receipt right after the userOp can take a moment.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SELLER = (process.env.SELLER_ADDRESS ?? "") as `0x${string}`;

const isAddr = (a?: string | null): a is `0x${string}` => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

// Always pay the stream treasury, which auto-splits to the creator, co-host and
// AI co-host. Paying the creator directly would skip the split and the agent.
function payToFor(_split: { role: string; address?: string | null }[]): `0x${string}` {
  return SELLER;
}

/** GET → where a passkey wallet should pay for this stream. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });
  return NextResponse.json({ payTo: payToFor(stream.split), ratePerSecond: stream.ratePerSecond });
}

/**
 * POST → record a passkey-wallet prepay after verifying it on-chain. The smart
 * account sent the USDC transfer itself and paid its own network fee (Driplet
 * pays no one's gas); the client passes the tx hash and payer, and the server
 * confirms a real USDC Transfer to the stream's payee before recording it.
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
    endpoint: `/passkey/${slug}`,
    raw: { wallet: "circle-passkey" },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
