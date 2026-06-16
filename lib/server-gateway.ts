import "server-only";
import { GatewayClient } from "@circle-fin/x402-batching/client";

/**
 * Server-side "viewer" wallet that pays per-second on behalf of the demo
 * audience. In production each viewer connects their own wallet; for the demo
 * we reuse the funded testnet wallet and keep its Gateway balance topped up.
 */
const DEPOSIT_AMOUNT = "1"; // USDC topped into Gateway when the balance runs low
const MIN_AVAILABLE = 50_000n; // 0.05 USDC (atomic units) before we re-deposit

/**
 * Wraps one funded wallet's Gateway client: lazily constructed, and kept
 * topped up. `ensure()` deposits + waits for the deposit to be credited as
 * "available" (Gateway credits a beat after the tx confirms); concurrent
 * callers share one in-flight deposit.
 */
function manage(key: `0x${string}` | undefined, label: string) {
  let client: GatewayClient | null = null;
  let funding: Promise<void> | null = null;

  const get = (): GatewayClient => {
    if (!key) throw new Error(`${label} wallet key is not configured.`);
    if (!client) {
      client = new GatewayClient({ chain: "arcTestnet", privateKey: key });
    }
    return client;
  };

  const ensure = async (): Promise<void> => {
    const gw = get();
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
  };

  return { get, ensure };
}

// Viewer wallet pays per-second on behalf of the demo audience.
const viewer = manage(
  process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined,
  "Viewer",
);

// Creator/treasury wallet receives viewer payments and autonomously pays the
// stream's AI services (agent-to-agent) out of its earnings.
const creator = manage(
  process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined,
  "Creator/treasury",
);

export const getViewerGateway = viewer.get;
export const ensureFunded = viewer.ensure;
export const getCreatorGateway = creator.get;
export const ensureCreatorFunded = creator.ensure;
