import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { resolveStream } from "@/lib/streams-db";

// Reading a fresh receipt right after the userOp can take a moment.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SELLER = (process.env.SELLER_ADDRESS ?? "") as `0x${string}`;
const ARC_NETWORK = "eip155:5042002";
const USDC = "0x3600000000000000000000000000000000000000";
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const arc = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const isAddr = (a?: string | null): a is `0x${string}` => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);
const topicAddr = (t: string) => "0x" + t.slice(-40).toLowerCase();

function payToFor(split: { role: string; address?: string | null }[]): `0x${string}` {
  const creator = split.find((p) => p.role === "Creator")?.address;
  return isAddr(creator) ? creator : SELLER;
}

/** GET → where a passkey wallet should pay for this stream. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });
  return NextResponse.json({ payTo: payToFor(stream.split), ratePerSecond: stream.ratePerSecond });
}

/**
 * POST → record a gasless passkey-wallet payment after verifying it on-chain.
 * The smart account already sent the USDC transfer (gas sponsored by Circle);
 * the client passes the tx hash + payer, and the server confirms a real USDC
 * Transfer to the stream's payee exists in that tx before recording it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { tx?: string; payer?: string };
  const tx = body.tx;
  const payer = body.payer;
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx ?? "") || !isAddr(payer)) {
    return NextResponse.json({ error: "tx and payer required" }, { status: 400 });
  }

  const expected = payToFor(stream.split);
  const pub = createPublicClient({ chain: arc, transport: http() });

  let receipt;
  try {
    receipt = await pub.waitForTransactionReceipt({ hash: tx as `0x${string}`, timeout: 30_000 });
  } catch {
    return NextResponse.json({ error: "Could not find that transaction on Arc" }, { status: 502 });
  }
  if (receipt.status !== "success") {
    return NextResponse.json({ error: "Transaction reverted on-chain" }, { status: 400 });
  }

  // Find a USDC Transfer from the passkey wallet to this stream's payee.
  const transfer = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === USDC &&
      l.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
      l.topics.length >= 3 &&
      topicAddr(l.topics[1]!) === payer!.toLowerCase() &&
      topicAddr(l.topics[2]!) === expected.toLowerCase(),
  );
  if (!transfer) {
    return NextResponse.json(
      { error: "No matching USDC payment to this stream was found in that transaction" },
      { status: 400 },
    );
  }
  const amount = Number(BigInt(transfer.data)) / 1e6;
  if (!(amount > 0)) return NextResponse.json({ error: "Zero-value transfer" }, { status: 400 });

  // Record with the smart account as the payer — a distinct, real paying wallet.
  await supabase.from("payment_events").insert({
    endpoint: `/passkey/${slug}`,
    payer,
    amount_usdc: String(amount),
    network: ARC_NETWORK,
    gateway_tx: tx,
    raw: { wallet: "circle-passkey", paidTo: expected },
  });

  return NextResponse.json({ ok: true, tx, amount, paidTo: expected });
}
