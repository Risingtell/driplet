import { NextRequest, NextResponse } from "next/server";
import { resolveStream } from "@/lib/streams-db";
import { settleStreamSeconds } from "@/lib/settlement";

// Pays out to several wallets and may top up the treasury first.
export const maxDuration = 60;

/**
 * Autonomous treasury split. For the interval just watched (default 60s), the
 * stream treasury pays each human payee (creator, co-host) their share of the
 * income directly into their own wallet on Arc, via Circle Gateway. See
 * lib/settlement for the shared split logic (also used by the Owncast sidecar).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { seconds?: number };
  const seconds = body.seconds && body.seconds > 0 ? body.seconds : 60;

  const origin = new URL(req.url).origin;
  const settled = await settleStreamSeconds(stream, seconds, { origin });

  return NextResponse.json({ ok: true, settled });
}
