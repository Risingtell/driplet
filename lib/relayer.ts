import "server-only";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  hexToSignature,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC, arcChain } from "./arc-network";

/**
 * Treasury-side transfers. The house AI patron signs an EIP-3009
 * TransferWithAuthorization and the treasury relays it here (house money paying
 * for its own agent). Viewers no longer use this: Driplet pays no one's gas, so
 * they send their own transfers (lib/own-wallet.ts) and the server only checks
 * them (lib/viewer-payment.ts).
 */
const USDC = ARC.usdc;
const arc = arcChain;

const twaAbi = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export interface Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

/** Relay a viewer-signed EIP-3009 transfer on-chain; returns the tx hash. */
export async function relayTransferWithAuthorization(
  auth: Authorization,
  signature: `0x${string}`,
): Promise<`0x${string}`> {
  const key = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("Relayer wallet is not configured.");

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: arc, transport: http() });
  const pub = createPublicClient({ chain: arc, transport: http() });
  const { r, s, v } = hexToSignature(signature);

  const hash = await wallet.writeContract({
    address: USDC,
    abi: twaAbi,
    functionName: "transferWithAuthorization",
    args: [
      auth.from,
      auth.to,
      BigInt(auth.value),
      BigInt(auth.validAfter),
      BigInt(auth.validBefore),
      auth.nonce,
      Number(v),
      r,
      s,
    ],
  });

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The transfer reverted on-chain.");
  return hash;
}

/**
 * Gas on Arc is paid in USDC from the same balance (the native view has 18
 * decimals, the ERC-20 view 6). Convert a native wei amount to dollars,
 * rounding up so a fee is never understated.
 */
export function weiToUsd(wei: bigint): number {
  return Number((wei + 10n ** 12n - 1n) / 10n ** 12n) / 1e6;
}

/**
 * What the treasury will pay in gas to send `amountUsd` USDC to `to`, with
 * headroom. Driplet never pays anyone's network fee, so whoever a treasury
 * transfer serves has this taken out of their amount before it is sent.
 */
export async function estimateTreasuryUsdcFee(to: `0x${string}`, amountUsd: number): Promise<number> {
  const key = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("Treasury wallet is not configured.");
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain: arc, transport: http() });
  const [gas, block, priority] = await Promise.all([
    pub.estimateContractGas({
      account,
      address: USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, parseUnits(amountUsd.toFixed(6), 6)],
    }),
    pub.getBlock(),
    pub.estimateMaxPriorityFeePerGas(),
  ]);
  // A quarter on top of today's base fee and tip covers a price move before
  // the transfer lands; the exact cost is read back from its receipt.
  const price = (block.baseFeePerGas ?? 0n) + priority;
  return weiToUsd((gas * price * 125n) / 100n);
}

/**
 * Send USDC from the treasury to `to` on Arc (the ERC-20 view, 6 decimals).
 * Resolves as soon as the transfer is submitted, with `confirmed` settling once
 * it is mined, carrying the exact gas it cost in dollars. Callers that keep a
 * ledger need the split: a submitted transfer may still land even if waiting
 * for its receipt fails, so it must never be treated as unsent.
 */
export async function sendTreasuryUsdc(
  to: `0x${string}`,
  amountUsd: number,
): Promise<{ hash: `0x${string}`; confirmed: Promise<{ feeUsd: number }> }> {
  const key = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("Treasury wallet is not configured.");

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: arc, transport: http() });
  const pub = createPublicClient({ chain: arc, transport: http() });

  const hash = await wallet.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, parseUnits(amountUsd.toFixed(6), 6)],
  });
  const confirmed = pub.waitForTransactionReceipt({ hash }).then((receipt) => {
    if (receipt.status !== "success") throw new Error("The transfer reverted on-chain.");
    return { feeUsd: weiToUsd(receipt.gasUsed * receipt.effectiveGasPrice) };
  });
  // The caller awaits this later; until then a rejection must not count as
  // unhandled (Node would kill the function).
  confirmed.catch(() => {});
  return { hash, confirmed };
}
