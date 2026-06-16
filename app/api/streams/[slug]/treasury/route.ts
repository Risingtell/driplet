import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStream, streamEndpoint } from "@/lib/streams";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * The stream's autonomous treasury: total USDC the stream has earned, the
 * number of drips, and how it splits across the stream's payees in real time.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const stream = getStream(slug);
  if (!stream) {
    return NextResponse.json({ error: "Unknown stream" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("payment_events")
    .select("amount_usdc")
    .eq("endpoint", streamEndpoint(slug));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = (data ?? []).reduce(
    (sum, row) => sum + parseFloat(row.amount_usdc),
    0,
  );

  const payees = stream.split.map((p) => ({
    name: p.name,
    role: p.role,
    share: p.share,
    amount: total * p.share,
  }));

  return NextResponse.json({ total, count: data?.length ?? 0, payees });
}
