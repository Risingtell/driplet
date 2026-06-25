import { NextRequest, NextResponse } from "next/server";
import { getStreamOnChain, registryAddress, registryExplorerUrl } from "@/lib/stream-registry";

/** Read a stream's metadata back from Arc, proving it lives on-chain. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const onchain = await getStreamOnChain(slug).catch(() => null);
  return NextResponse.json(
    {
      registry: registryAddress(),
      explorer: registryExplorerUrl(),
      onchain,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
