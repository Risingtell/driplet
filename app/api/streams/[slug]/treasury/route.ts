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

  // Count exact rows (uncapped) instead of fetching them — payments are a fixed
  // price per call, so totals are count x price. This stays accurate past the
  // REST 1000-row page limit.
  const AGENT_PRICE = 0.005;

  const [watch, agent] = await Promise.all([
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", streamEndpoint(slug)),
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", "/agents/captions"),
  ]);

  if (watch.error || agent.error) {
    return NextResponse.json(
      { error: (watch.error ?? agent.error)!.message },
      { status: 500 },
    );
  }

  const count = watch.count ?? 0;
  const agentCount = agent.count ?? 0;
  const total = count * stream.ratePerSecond;
  const agentPaid = agentCount * AGENT_PRICE;

  const payees = stream.split.map((p) => ({
    name: p.name,
    role: p.role,
    share: p.share,
    amount: total * p.share,
  }));

  return NextResponse.json({ total, count, agentPaid, agentCount, payees });
}
