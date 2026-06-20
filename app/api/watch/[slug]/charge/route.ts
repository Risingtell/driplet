import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";
import { getStream, streamEndpoint } from "@/lib/streams";

// Settlement can include a Gateway top-up on the creator side; allow headroom.
export const maxDuration = 60;

/**
 * One second of watch time for a specific stream. The payment is attributed to
 * the stream (via its endpoint label) so the treasury can split it across the
 * stream's payees. Settles to the creator only after Gateway verifies + settles.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const stream = getStream(slug);
  if (!stream) {
    return NextResponse.json({ error: "Unknown stream" }, { status: 404 });
  }

  const handler = async () => NextResponse.json({ ok: true, ts: Date.now() });
  const wrapped = withGateway(
    handler,
    `$${stream.ratePerSecond}`,
    streamEndpoint(slug),
  );
  return wrapped(req);
}
