import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// A viewer counts as "here" if its heartbeat landed within this window.
const WINDOW_SECONDS = 20;

const noStore = { "cache-control": "no-store" };

/** Count viewers seen recently. Degrades to 0 if the table isn't there yet. */
async function liveCount(slug: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const { count, error } = await supabase
    .from("stream_presence")
    .select("viewer_id", { count: "exact", head: true })
    .eq("slug", slug)
    .gte("last_seen", since);
  if (error) return 0;
  return count ?? 0;
}

/** Heartbeat: mark this viewer as present, then return the current count. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { viewerId?: string };
  const viewerId = String(body.viewerId ?? "").slice(0, 64).trim();
  if (viewerId) {
    try {
      await supabase
        .from("stream_presence")
        .upsert({ slug, viewer_id: viewerId, last_seen: new Date().toISOString() });
    } catch {
      /* presence is best-effort; ignore (e.g. table not set up yet) */
    }
  }
  return NextResponse.json({ count: await liveCount(slug) }, { headers: noStore });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return NextResponse.json({ count: await liveCount(slug) }, { headers: noStore });
}
