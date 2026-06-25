import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { relayTransferWithAuthorization, type Authorization } from "@/lib/relayer";

// Relaying a tx + waiting for the receipt can take a few seconds.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SELLER = (process.env.SELLER_ADDRESS ?? "") as `0x${string}`;
const ARC_NETWORK = "eip155:5042002";
const isAddr = (a?: string | null): a is `0x${string}` => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

/** The address a viewer should pay for this stream: the creator if they have a
 *  payout address, otherwise the stream treasury. */
function payToFor(split: { role: string; address?: string | null }[]): `0x${string}` {
  const creator = split.find((p) => p.role === "Creator")?.address;
  return isAddr(creator) ? creator : SELLER;
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

/** POST → relay a viewer-signed EIP-3009 authorization, paying from their wallet. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    authorization?: Authorization;
    signature?: `0x${string}`;
  };
  const auth = body.authorization;
  const signature = body.signature;
  if (!auth || !signature) {
    return NextResponse.json({ error: "authorization and signature required" }, { status: 400 });
  }

  const expected = payToFor(stream.split);
  if (!isAddr(auth.from) || auth.to?.toLowerCase() !== expected.toLowerCase()) {
    return NextResponse.json({ error: "authorization must pay this stream" }, { status: 400 });
  }
  const amount = Number(auth.value) / 1e6;
  if (!(amount > 0) || amount > 10) {
    return NextResponse.json({ error: "amount must be between 0 and $10" }, { status: 400 });
  }

  let tx: `0x${string}`;
  try {
    tx = await relayTransferWithAuthorization(auth, signature);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // Record with the viewer's real address as the payer — this is the
  // distinct-wallet proof. A dedicated endpoint label keeps it out of the
  // shared-wallet per-second drip count.
  await supabase.from("payment_events").insert({
    endpoint: `/own/${slug}`,
    payer: auth.from,
    amount_usdc: String(amount),
    network: ARC_NETWORK,
    gateway_tx: tx,
    raw: { authorization: auth, paidTo: expected },
  });

  return NextResponse.json({ ok: true, tx, amount, paidTo: expected });
}
