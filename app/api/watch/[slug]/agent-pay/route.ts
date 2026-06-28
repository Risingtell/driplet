import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCreatorGateway, ensureCreatorFunded } from "@/lib/server-gateway";
import { streamEndpoint } from "@/lib/streams";
import { resolveStream } from "@/lib/streams-db";

// The treasury may top up before paying the agent; allow headroom.
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ARC_NETWORK = "eip155:5042002";
const AGENT_PRICE = 0.005;
// The AI co-host earns up to its 10% split share of what the stream has actually
// taken in. It never pays itself beyond that, so the creator's cut is protected.
const AGENT_BUDGET_SHARE = 0.1;

/**
 * Budget-aware autonomous agent payment. Before paying its AI co-host, the stream
 * treasury checks that doing so keeps the agent within its share of real income.
 * If the stream can afford it, it pays the agent (agent-to-agent, into the agent's
 * own wallet) out of its own earnings. If not, the agent PAUSES itself — the
 * creator keeps their share — and resumes automatically once the stream earns more.
 * Money flows out of the stream, not just in, and only when it can.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const stream = await resolveStream(slug);
  if (!stream) return NextResponse.json({ error: "Unknown stream" }, { status: 404 });

  // This stream's real income (per-second drips + own-wallet/Face ID lump pays)
  // and what its agent has already been paid.
  const [watch, own, agent] = await Promise.all([
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", streamEndpoint(slug)),
    supabase
      .from("payment_events")
      .select("amount_usdc")
      .in("endpoint", [`/own/${slug}`, `/passkey/${slug}`]),
    supabase
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", `/agents/captions/${slug}`),
  ]);

  const income =
    (watch.count ?? 0) * stream.ratePerSecond +
    (own.data ?? []).reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);
  const agentSpent = (agent.count ?? 0) * AGENT_PRICE;
  // Floor at one payment so a brand-new stream still gets a first line of
  // commentary; after that the agent is strictly capped at its earned share.
  const budget = Math.max(AGENT_PRICE, income * AGENT_BUDGET_SHARE);

  if (income <= 0 || agentSpent + AGENT_PRICE > budget) {
    return NextResponse.json({
      ok: true,
      paused: true,
      reason: "saving budget",
      budget: Number(budget.toFixed(6)),
      spent: Number(agentSpent.toFixed(6)),
    });
  }

  const captionsUrl = `${new URL(req.url).origin}/api/agents/captions`;
  const gw = getCreatorGateway();
  try {
    let res;
    try {
      res = await gw.pay(captionsUrl, { method: "GET" });
    } catch {
      await ensureCreatorFunded();
      res = await gw.pay(captionsUrl, { method: "GET" });
    }
    const caption = (res as { data?: { caption?: string } }).data?.caption ?? null;
    // Per-stream marker so the treasury can attribute this agent payment to THIS
    // stream (the captions route records the global /agents/captions for /impact).
    await supabase.from("payment_events").insert({
      endpoint: `/agents/captions/${slug}`,
      payer: process.env.CAPTIONS_AGENT_ADDRESS ?? "agent",
      amount_usdc: String(AGENT_PRICE),
      network: ARC_NETWORK,
      gateway_tx: null,
      raw: { perStreamAgent: true },
    });
    return NextResponse.json({ ok: true, paused: false, amount: res.formattedAmount, caption });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
