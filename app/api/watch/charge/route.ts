import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";

// One second of watch time. The handler runs only after Circle Gateway has
// verified + settled the nanopayment to the creator.
const handler = async (_req: NextRequest) =>
  NextResponse.json({ ok: true, ts: Date.now() });

export const GET = withGateway(handler, "$0.0003", "/api/watch/charge");
