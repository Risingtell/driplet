import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";

/**
 * The live-captions AI agent. It sells its work per call via x402 — the stream
 * treasury pays it, agent-to-agent, out of what the stream earns. Payment goes
 * to the agent's own wallet (not the creator's).
 */
const CAPTIONS = [
  "Welcome in — let's get started.",
  "Today we're working through the layout grid.",
  "See how consistent spacing creates rhythm.",
  "Good question — let's zoom in on that.",
  "Now we balance the colour contrast.",
  "Nice work, everyone — wrapping this section.",
];

const AGENT = process.env.CAPTIONS_AGENT_ADDRESS as `0x${string}` | undefined;

const handler = async (_req: NextRequest) => {
  const caption = CAPTIONS[Math.floor(Date.now() / 6000) % CAPTIONS.length];
  return NextResponse.json({ caption });
};

export const GET = withGateway(handler, "$0.005", "/agents/captions", AGENT);
