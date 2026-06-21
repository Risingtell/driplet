import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildPaymentRequirements, facilitator } from "@/lib/x402";

// A payout may require the treasury to top up its Gateway balance first.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const isAddress = (a: string | null): a is `0x${string}` =>
  !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

/**
 * Generic Circle Gateway payout endpoint: settles a payment to the `to` address
 * for `amount` USDC. Only the funded treasury wallet can actually pay it (it
 * holds the signing key); a request without a valid Gateway payment gets a 402.
 * The stream's /settle route drives this to split per-second income out to each
 * payee's own wallet on Arc.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  const amount = url.searchParams.get("amount");
  const label = (url.searchParams.get("label") ?? "payout").replace(/[^a-zA-Z0-9/_-]/g, "");

  if (!isAddress(to)) {
    return NextResponse.json({ error: "valid 'to' address required" }, { status: 400 });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: "positive 'amount' required" }, { status: 400 });
  }

  const endpoint = `/payout/${label}`;
  const requirements = buildPaymentRequirements(`$${amt}`, to);
  const paymentSignature = req.headers.get("payment-signature");

  if (!paymentSignature) {
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: endpoint,
        description: `Payout (${amt} USDC)`,
        mimeType: "application/json",
      },
      accepts: [requirements],
    };
    return new NextResponse(JSON.stringify({}), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(paymentRequired)).toString("base64"),
      },
    });
  }

  try {
    const payload = JSON.parse(Buffer.from(paymentSignature, "base64").toString("utf-8"));
    const verifyResult = await facilitator.verify(payload, requirements);
    if (!verifyResult.isValid) {
      return NextResponse.json(
        { error: "verification failed", reason: verifyResult.invalidReason },
        { status: 402 },
      );
    }
    const settleResult = await facilitator.settle(payload, requirements);
    if (!settleResult.success) {
      return NextResponse.json(
        { error: "settlement failed", reason: settleResult.errorReason },
        { status: 402 },
      );
    }

    const payer = settleResult.payer ?? verifyResult.payer ?? "treasury";
    await supabase.from("payment_events").insert({
      endpoint,
      payer,
      amount_usdc: (Number(requirements.amount) / 1e6).toString(),
      network: requirements.network,
      gateway_tx: settleResult.transaction ?? null,
      raw: { requirements, settleResult, to },
    });

    const res = NextResponse.json({ ok: true, to, amount: amt });
    res.headers.set(
      "PAYMENT-RESPONSE",
      Buffer.from(
        JSON.stringify({
          success: true,
          transaction: settleResult.transaction,
          network: requirements.network,
          payer,
        }),
      ).toString("base64"),
    );
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "payout error", message }, { status: 500 });
  }
}
