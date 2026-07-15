import "server-only";
import {
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
const walletSetId = process.env.CIRCLE_WALLET_SET_ID;

export function circleConfigured(): boolean {
  return !!(apiKey && entitySecret && walletSetId);
}

type Client = ReturnType<typeof initiateDeveloperControlledWalletsClient>;
let _client: Client | null = null;
function client(): Client {
  if (!apiKey || !entitySecret) throw new Error("Circle is not configured.");
  if (!_client) _client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return _client;
}

/** Create a developer-controlled wallet on Arc Testnet (refId = our user id). Used for both creator and viewer (email-wallet) onboarding. */
export async function createDeveloperWallet(
  refId: string,
): Promise<{ id: string; address: string }> {
  const res = await client().createWallets({
    walletSetId: walletSetId!,
    blockchains: ["ARC-TESTNET"],
    count: 1,
    accountType: "EOA",
    metadata: [{ refId }],
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet) throw new Error("Wallet creation failed.");
  return { id: wallet.id, address: wallet.address };
}

/** USDC balance (as a number) for a wallet, plus the USDC token id for transfers. */
export async function getUsdc(
  walletId: string,
): Promise<{ amount: number; tokenId: string | null }> {
  const res = await client().getWalletTokenBalance({ id: walletId });
  const balances = res.data?.tokenBalances ?? [];
  const usdc = balances.find((b) =>
    (b.token?.symbol ?? "").toUpperCase().includes("USDC"),
  );
  return { amount: usdc ? Number(usdc.amount) : 0, tokenId: usdc?.token?.id ?? null };
}

/** Withdraw USDC from a creator's wallet to any Arc address. Returns the tx id + state. */
export async function withdrawUsdc(opts: {
  walletId: string;
  to: string;
  amount: string;
}): Promise<{ id: string; state: string }> {
  const { tokenId, amount } = await getUsdc(opts.walletId);
  if (!tokenId) throw new Error("No USDC in this wallet to withdraw.");
  if (Number(opts.amount) > amount) throw new Error("Amount exceeds your balance.");
  const res = await client().createTransaction({
    walletId: opts.walletId,
    tokenId,
    destinationAddress: opts.to,
    amount: [opts.amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return { id: res.data?.id ?? "", state: res.data?.state ?? "" };
}

const FAILURE_STATES = new Set(["CANCELLED", "DENIED", "FAILED", "STUCK"]);

/** Poll a Circle transaction until it's on-chain (or fails) and return its tx hash. */
export async function waitForTransaction(
  id: string,
  timeoutMs = 45_000,
): Promise<{ state: string; txHash?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await client().getTransaction({
      id,
      waitForState: "CONFIRMED",
      pollingInterval: 2000,
      signal: controller.signal,
    });
    const tx = res.data?.transaction;
    return { state: tx?.state ?? "UNKNOWN", txHash: tx?.txHash };
  } finally {
    clearTimeout(timer);
  }
}

/** Withdraw USDC from a wallet to an address and wait for it to confirm on-chain. */
export async function payAndConfirm(opts: {
  walletId: string;
  to: string;
  amountUsd: number;
}): Promise<{ txHash: string; state: string }> {
  const tx = await withdrawUsdc({ walletId: opts.walletId, to: opts.to, amount: opts.amountUsd.toFixed(6) });
  if (!tx.id) throw new Error("Payment could not be initiated.");
  const result = await waitForTransaction(tx.id);
  if (FAILURE_STATES.has(result.state)) {
    throw new Error(`Payment ${result.state.toLowerCase()}.`);
  }
  if (!result.txHash) {
    throw new Error("Payment is still confirming — try again in a moment.");
  }
  return { txHash: result.txHash, state: result.state };
}
