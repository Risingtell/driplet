import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";
import { generateCommentary } from "@/lib/agent-ai";

/**
 * The stream's AI co-host agent. It sells its work per call via x402 — the
 * stream treasury pays it, agent-to-agent, out of what the stream earns, into
 * the agent's own wallet. The work is real: a free LLM generates a line of live
 * commentary (set GROQ_API_KEY to enable; falls back to a canned line otherwise).
 */
const AGENT = process.env.CAPTIONS_AGENT_ADDRESS as `0x${string}` | undefined;

const handler = async (_req: NextRequest) => {
  const caption = await generateCommentary();
  return NextResponse.json({ caption });
};

export const GET = withGateway(handler, "$0.005", "/agents/captions", AGENT);
