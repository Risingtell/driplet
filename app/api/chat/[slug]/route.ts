import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Live stream chat over a tiny polling API (the browser GETs every couple of
 * seconds and POSTs to send). Goes through the service role so there's no
 * client-side Realtime/RLS auth to configure, and it works on both live and
 * recorded streams. Requires supabase/chat_setup.sql.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, name, text, host, created_at")
    .eq("slug", slug)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ messages: [] }, { headers: { "cache-control": "no-store" } });
  return NextResponse.json({ messages: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    text?: string;
    host?: boolean;
  };
  const name = String(body.name ?? "").slice(0, 40).trim() || "Guest";
  const text = String(body.text ?? "").slice(0, 300).trim();
  if (!text) return NextResponse.json({ error: "empty message" }, { status: 400 });

  const { error } = await supabase
    .from("chat_messages")
    .insert({ slug, name, text, host: !!body.host });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
