import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { settleStreamSeconds } from "@/lib/settlement";
import { streamEndpoint } from "@/lib/streams";

// Pays out to several wallets and may top up the treasury first.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// One settle call covers at most this many watched seconds (the watch page
// settles every 20s; the Owncast sidecar settles through lib/settlement, not
// this route, so long real sessions are unaffected).
const MAX_SECONDS_PER_CALL = 600;

const AGENT_ROLES = new Set(["Live captions agent", "Commentary"]);

/**
 * Autonomous treasury split. For the interval just watched (default 60s), the
 * stream treasury pays each human payee (creator, co-host) their share of the
 * income directly into their own wallet on Arc, via Circle Gateway. See
 * lib/settlement for the shared split logic (also used by the Owncast sidecar).
 *
 * Solvency guard: the treasury only pays out of what this stream has actually
 * earned. `seconds` comes from the client, so before settling we re-derive the
 * stream's real recorded income and what has already been paid out, and clamp
 * the interval so cumulative payouts can never exceed income. An attacker
 * posting a huge `seconds` gets a paused treasury, not a drained one.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { seconds?: number };
  const requested = body.seconds && body.seconds > 0 ? Math.floor(body.seconds) : 60;

  const humanShare = stream.split
    .filter((p) => !AGENT_ROLES.has(p.role))
    .reduce((s, p) => s + p.share, 0);

  let seconds = Math.min(requested, MAX_SECONDS_PER_CALL);
  if (humanShare > 0) {
    // The stream's real income (per-second drips + own-wallet/Face ID lumps)
    // vs what its treasury has already paid out for it.
    const [watch, own, paid] = await Promise.all([
      supabase
        .from("payment_events")
        .select("id", { count: "exact", head: true })
        .eq("endpoint", streamEndpoint(slug)),
      supabase
        .from("payment_events")
        .select("amount_usdc")
        .in("endpoint", [`/own/${slug}`, `/passkey/${slug}`, `/patron/${slug}`]),
      supabase
        .from("payment_events")
        .select("amount_usdc")
        .or(
          `endpoint.like./payout/${slug}/%,endpoint.like./payout/owncast/${slug}/%,endpoint.like./payout/jellyfin/${slug}/%`,
        ),
    ]);

    const income =
      (watch.count ?? 0) * stream.ratePerSecond +
      (own.data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);
    const alreadyPaid = (paid.data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);

    const remaining = income - alreadyPaid;
    const affordable = Math.floor(remaining / (humanShare * stream.ratePerSecond));
    seconds = Math.min(seconds, Math.max(0, affordable));
  }

  if (seconds <= 0) {
    return NextResponse.json({ ok: true, settled: [], guard: "solvency" });
  }

  const origin = new URL(req.url).origin;
  const settled = await settleStreamSeconds(stream, seconds, { origin });

  return NextResponse.json({ ok: true, settled });
}
