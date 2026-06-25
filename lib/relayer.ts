import "server-only";
import { createPublicClient, createWalletClient, http, hexToSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Gasless own-wallet payments. A viewer signs an EIP-3009
 * TransferWithAuthorization over Arc's USDC (no gas, no Gateway deposit — just a
 * signature in their wallet). The treasury relays it on-chain here, so the
 * viewer's own USDC moves to the payee. Verified working on Arc testnet.
 */
const USDC = "0x3600000000000000000000000000000000000000" as const;

const arc = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

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
