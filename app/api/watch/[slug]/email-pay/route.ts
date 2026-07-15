import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { resolveStream } from "@/lib/streams-db";
import { payAndConfirm } from "@/lib/circle";

// Confirming a Circle transaction on-chain can take a few seconds.
export const maxDuration = 60;

const SELLER = (process.env.SELLER_ADDRESS ?? "") as `0x${string}`;
const ARC_NETWORK = "eip155:5042002";

/**
 * POST → pay the stream treasury from the signed-in viewer's Circle
 * developer-controlled wallet (email onboarding, no browser wallet or
 * passkey needed). Unlike passkey-pay, the payment itself happens here
 * server-side via Circle's Transaction API — the client never touches a
 * key or a UserOperation, so this doesn't depend on the ERC-4337 bundler.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { amountUsd?: number };
  const amountUsd = Number(body.amountUsd);
  if (!(amountUsd > 0)) {
    return NextResponse.json({ error: "amountUsd must be greater than 0" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const admin = adminClient();
  const { data: wallet } = await admin
    .from("viewer_wallets")
    .select("circle_wallet_id, address")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!wallet) {
    return NextResponse.json({ error: "No wallet yet — sign in again to create one." }, { status: 400 });
  }

  try {
    const { txHash } = await payAndConfirm({
      walletId: wallet.circle_wallet_id,
      to: SELLER,
      amountUsd,
    });
    await admin.from("payment_events").insert({
      endpoint: `/email/${slug}`,
      payer: wallet.address,
      amount_usdc: String(amountUsd),
      network: ARC_NETWORK,
      gateway_tx: txHash,
      raw: { wallet: "circle-email", paidTo: SELLER },
    });
    return NextResponse.json({ ok: true, tx: txHash, amount: amountUsd, address: wallet.address });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
