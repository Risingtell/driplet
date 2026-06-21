import { NextRequest, NextResponse } from "next/server";
import { getCreatorGateway, ensureCreatorFunded } from "@/lib/server-gateway";
import { resolveStream } from "@/lib/streams-db";

// Pays out to several wallets and may top up the treasury first.
export const maxDuration = 60;

const COHOST_FALLBACK = process.env.COHOST_ADDRESS;
const SELLER = (process.env.SELLER_ADDRESS ?? "").toLowerCase();
const isAddr = (a?: string): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

/**
 * Autonomous treasury split. For the interval just watched (default 60s), the
 * stream treasury pays each human payee (creator, co-host) their share of the
 * income directly into their own wallet on Arc, via Circle Gateway. The AI
 * captions agent is paid separately through /agent-pay (it also returns the
 * caption shown on the player). So every party — human and agent — collects
 * their portion into their own wallet, with no human in the loop.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { seconds?: number };
  const seconds = body.seconds && body.seconds > 0 ? body.seconds : 60;

  const origin = new URL(req.url).origin;
  const gw = getCreatorGateway();
  await ensureCreatorFunded().catch(() => {});

  const settled: Array<{ name: string; address: string; amount: number; ok: boolean }> = [];

  for (const payee of stream.split) {
    if (payee.role === "Live captions agent") continue; // paid via /agent-pay
    let address = payee.address;
    if (!isAddr(address) && payee.role === "Co-host") address = COHOST_FALLBACK;
    if (!isAddr(address)) continue;
    if (address.toLowerCase() === SELLER) continue; // treasury can't pay itself

    const amount = Number((payee.share * seconds * stream.ratePerSecond).toFixed(6));
    if (amount <= 0) continue;

    const label = `${slug}/${payee.role.replace(/\s+/g, "_")}`;
    const payUrl = `${origin}/api/payout?to=${address}&amount=${amount}&label=${label}`;

    try {
      await gw.pay(payUrl, { method: "GET" });
      settled.push({ name: payee.name, address, amount, ok: true });
    } catch {
      try {
        await ensureCreatorFunded();
        await gw.pay(payUrl, { method: "GET" });
        settled.push({ name: payee.name, address, amount, ok: true });
      } catch {
        settled.push({ name: payee.name, address, amount, ok: false });
      }
    }
  }

  return NextResponse.json({ ok: true, settled });
}
