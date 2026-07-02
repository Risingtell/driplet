import { NextResponse, connection } from "next/server";
import { runPatronCycle, getPatronStatus } from "@/lib/patron";

// A cycle signs, relays on-chain, and waits for the receipt.
export const maxDuration = 60;

/**
 * The AI patron's public surface.
 *
 * GET  → who the patron is, its live wallet balance, and its recent decisions
 *        with their reasoning (rendered on /impact).
 * POST → run ONE autonomous cycle: look at what's streaming, decide with the
 *        LLM whether any of it is worth paying for, and if so pay from the
 *        patron's own wallet (gasless EIP-3009, relayed on-chain). Publicly
 *        triggerable on purpose — it self-throttles to one cycle per ~25s and
 *        every trigger only ever moves the patron's own sub-cent funds to
 *        creators, so anyone can poke it and watch it think.
 */
export async function GET() {
  await connection();
  const status = await getPatronStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const result = await runPatronCycle();
  return NextResponse.json(result, {
    status: result.ok ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
