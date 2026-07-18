import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { settleStreamSeconds } from "@/lib/settlement";
import { resetPosition, advancePosition, closePosition } from "@/lib/jellyfin-sessions";

// A progress/stop event settles to several wallets and may top up the treasury first.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Jellyfin per-minute VOD sidecar — second member of the sidecar family
 * alongside /api/sidecar/owncast, same settlement core.
 *
 * A Jellyfin operator installs the community "Webhook" plugin, adds a generic
 * destination pointed at:
 *   POST /api/sidecar/jellyfin?stream=<driplet-slug>[&key=<secret>]
 * with the body template documented on /sidecar, and subscribes to Playback
 * Start / Progress / Stop. Jellyfin is on-demand video, so wall-clock time
 * between events isn't a safe measure of "watched" (a viewer can pause or
 * seek) — instead we track each viewer's actual PlaybackPositionTicks and
 * settle only forward movement of that position (see
 * lib/jellyfin-sessions.ts), through the same Circle Gateway settlement core
 * the rest of Driplet uses.
 */

function readEvent(body: Record<string, unknown>) {
  const type = String(body.type ?? "").trim();
  const viewerId = body.viewerId != null ? String(body.viewerId) : null;
  // An unrendered Handlebars field can arrive as "" rather than being omitted
  // — treat that the same as missing (NaN), not as a literal position of 0.
  const rawTicks = body.positionTicks;
  const positionTicks = rawTicks === "" || rawTicks == null ? NaN : Number(rawTicks);
  return { type, viewerId, positionTicks };
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("stream");
  if (!slug) {
    return NextResponse.json(
      { error: "Add ?stream=<driplet-slug> to your Jellyfin webhook URL." },
      { status: 400 },
    );
  }

  // Shared secret so a public URL can't be abused to drain the treasury.
  // Falls back to the Owncast sidecar's secret so one shared value covers the
  // whole sidecar family unless a Jellyfin-specific one is set. `||` (not `??`)
  // so an env var that exists but was left blank still falls through instead
  // of silently disabling the check.
  const secret = (process.env.JELLYFIN_SIDECAR_SECRET || process.env.OWNCAST_SIDECAR_SECRET || "").trim();
  if (secret && url.searchParams.get("key")?.trim() !== secret) {
    return NextResponse.json({ error: "Bad or missing key." }, { status: 401 });
  }

  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: `Unknown stream "${slug}".` }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { type, viewerId, positionTicks } = readEvent(body);

  if (!viewerId || !Number.isFinite(positionTicks)) {
    // Non-playback events, or a template field that didn't render, are
    // acknowledged and ignored rather than treated as an error.
    return NextResponse.json({ ok: true, ignored: type || "unknown" });
  }

  if (type === "PlaybackStart") {
    await resetPosition(slug, viewerId, positionTicks);
    return NextResponse.json({ ok: true, event: "start", stream: slug, viewerId });
  }

  if (type === "PlaybackProgress" || type === "PlaybackStop") {
    const seconds =
      type === "PlaybackStop"
        ? await closePosition(slug, viewerId, positionTicks)
        : await advancePosition(slug, viewerId, positionTicks);

    if (!seconds) {
      return NextResponse.json({ ok: true, event: type, stream: slug, viewerId, seconds: 0 });
    }
    const settled = await settleStreamSeconds(stream, seconds, {
      origin: url.origin,
      source: "jellyfin",
    });
    return NextResponse.json({ ok: true, event: type, stream: slug, viewerId, seconds, settled });
  }

  return NextResponse.json({ ok: true, ignored: type || "unknown" });
}

/** Health + live stats for the sidecar (settlements it has driven so far). */
export async function GET() {
  const { data, count } = await supabase
    .from("payment_events")
    .select("amount_usdc", { count: "exact" })
    .like("endpoint", "/payout/jellyfin/%")
    .order("created_at", { ascending: false })
    .limit(1000);

  const totalSettled = (data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);

  return NextResponse.json(
    {
      ok: true,
      sidecar: "jellyfin-per-minute",
      settlementCount: count ?? 0,
      totalSettled: Number(totalSettled.toFixed(6)),
      usage: "POST Jellyfin webhook events to /api/sidecar/jellyfin?stream=<slug>",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
