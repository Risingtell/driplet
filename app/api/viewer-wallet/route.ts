import { NextResponse } from "next/server";
import { getViewerWalletInfo } from "@/lib/viewer-wallet";

/** GET → the signed-in viewer's Circle wallet address + USDC balance (creates the wallet on first call). */
export async function GET() {
  const info = await getViewerWalletInfo();
  if (info.error || !info.address) {
    return NextResponse.json({ error: info.error ?? "Sign in first." }, { status: 400 });
  }
  return NextResponse.json({ address: info.address, balance: info.balance ?? 0 });
}
