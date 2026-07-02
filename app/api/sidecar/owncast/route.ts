import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveStream } from "@/lib/streams-db";
import { settleStreamSeconds } from "@/lib/settlement";
import { openSession, closeSession } from "@/lib/owncast-sessions";

// A part event settles to several wallets and may top up the treasury first.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Owncast per-second streaming webhook sidecar (Canteen RFB #3).
 *
 * An Owncast operator points their instance's webhook at:
 *   POST /api/sidecar/owncast?stream=<driplet-slug>[&key=<secret>]
 *
 * Owncast emits USER_JOINED when a viewer establishes presence and USER_PARTED
 * when they leave (or after ~15s of silence). On join we open a session; on part
 * we compute the seconds present and settle (seconds * ratePerSecond) to the
 * stream's payees through the same Circle Gateway settlement core the rest of
 * Driplet uses — so the streamer is paid for proven presence, second by second,
 * without modifying Owncast at all.
 */

function pickViewerId(eventData: Record<string, unknown>): string | null {
  const user = eventData.user as Record<string, unknown> | undefined;
  const id =
    (user?.id as string | undefined) ??
    (eventData.id as string | undefined) ??
    (eventData.clientId as string | undefined);
  return id ? String(id) : null;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("stream");
  if (!slug) {
    return NextResponse.json(
      { error: "Add ?stream=<driplet-slug> to your Owncast webhook URL." },
      { status: 400 },
    );
  }

  // Shared secret so a public URL can't be abused to drain the treasury.
  // Trimmed because CLI-added env values can carry a trailing newline.
  const secret = (process.env.OWNCAST_SIDECAR_SECRET ?? "").trim();
  if (secret && url.searchParams.get("key")?.trim() !== secret) {
    return NextResponse.json({ error: "Bad or missing key." }, { status: 401 });
  }

  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: `Unknown stream "${slug}".` }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    type?: string;
    eventData?: Record<string, unknown>;
  };
  const type = String(body.type ?? "").toUpperCase();
  const eventData = body.eventData ?? {};
  const viewerId = pickViewerId(eventData);

  if (!viewerId) {
    // Non-presence events (CHAT, STREAM_STARTED, …) are acknowledged and ignored.
    return NextResponse.json({ ok: true, ignored: type || "unknown" });
  }

  if (type === "USER_JOINED") {
    await openSession(slug, viewerId);
    return NextResponse.json({ ok: true, event: "joined", stream: slug, viewerId });
  }

  if (type === "USER_PARTED" || type === "USER_LEFT" || type === "USER_DISCONNECTED") {
    const seconds = await closeSession(slug, viewerId);
    if (!seconds) {
      return NextResponse.json({ ok: true, event: "parted", seconds: 0, note: "no open session" });
    }
    const settled = await settleStreamSeconds(stream, seconds, {
      origin: url.origin,
      source: "owncast",
    });
    return NextResponse.json({ ok: true, event: "parted", stream: slug, viewerId, seconds, settled });
  }

  return NextResponse.json({ ok: true, ignored: type || "unknown" });
}

/** Health + live stats for the sidecar (settlements it has driven so far). */
export async function GET() {
  const { data, count } = await supabase
    .from("payment_events")
    .select("amount_usdc", { count: "exact" })
    .like("endpoint", "/payout/owncast/%")
    .order("created_at", { ascending: false })
    .limit(1000);

  const totalSettled = (data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);

  return NextResponse.json(
    {
      ok: true,
      sidecar: "owncast-per-second",
      rfb: 3,
      settlementCount: count ?? 0,
      totalSettled: Number(totalSettled.toFixed(6)),
      usage: "POST Owncast webhooks to /api/sidecar/owncast?stream=<slug>",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
