import "server-only";
import { GatewayClient } from "@circle-fin/x402-batching/client";

/**
 * Server-side "viewer" wallet that pays per-second on behalf of the demo
 * audience. In production each viewer connects their own wallet; for the demo
 * we reuse the funded testnet wallet and keep its Gateway balance topped up.
 */
const VIEWER_KEY = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;

const DEPOSIT_AMOUNT = "1"; // USDC topped into Gateway when the balance runs low
const MIN_AVAILABLE = 50_000n; // 0.05 USDC (atomic units) before we re-deposit

let client: GatewayClient | null = null;
let funding: Promise<void> | null = null;

export function getViewerGateway(): GatewayClient {
  if (!VIEWER_KEY) {
    throw new Error("BUYER_PRIVATE_KEY (viewer wallet) is not configured.");
  }
  if (!client) {
    client = new GatewayClient({ chain: "arcTestnet", privateKey: VIEWER_KEY });
  }
  return client;
}

/**
 * Ensure the viewer has spendable Gateway balance. Deposits + waits for the
 * deposit to be credited as "available" (Gateway credits a beat after the
 * on-chain tx confirms). Concurrent callers share one in-flight deposit.
 */
export async function ensureFunded(): Promise<void> {
  const gw = getViewerGateway();
  const balances = await gw.getBalances();
  if (balances.gateway.available >= MIN_AVAILABLE) return;

  if (!funding) {
    funding = (async () => {
      await gw.deposit(DEPOSIT_AMOUNT);
      const startedAt = Date.now();
      while (Date.now() - startedAt < 90_000) {
        const b = await gw.getBalances();
        if (b.gateway.available > 0n) return;
        await new Promise((r) => setTimeout(r, 3000));
      }
    })().finally(() => {
      funding = null;
    });
  }
  await funding;
}
