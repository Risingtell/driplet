import "server-only";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import abi from "./stream-registry-abi.json";

/**
 * On-chain stream metadata on Arc. Files live on Walrus; the pointer + metadata
 * live in the StreamRegistry contract on Arc. Storage is decentralized end to
 * end: metadata on Arc, blobs on Walrus.
 */
const ADDRESS = process.env.STREAM_REGISTRY_ADDRESS as `0x${string}` | undefined;
const EXPLORER = "https://testnet.arcscan.app";

const arc = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

export function registryAddress(): string | null {
  return ADDRESS ?? null;
}

export function registryExplorerUrl(): string | null {
  return ADDRESS ? `${EXPLORER}/address/${ADDRESS}` : null;
}

/** Record a stream's metadata on Arc. Returns the tx hash (or null if disabled). */
export async function registerStreamOnChain(
  slug: string,
  blobId: string,
  creator: string,
  title: string,
): Promise<`0x${string}` | null> {
  const key = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!ADDRESS || !key) return null;
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: arc, transport: http() });
  return wallet.writeContract({
    address: ADDRESS,
    abi,
    functionName: "register",
    args: [slug, blobId ?? "", creator ?? "", title ?? ""],
  });
}

export interface OnChainEntry {
  blobId: string;
  creator: string;
  title: string;
  registeredBy: string;
  registeredAt: string;
}

/** Read a stream's metadata back from Arc. */
export async function getStreamOnChain(slug: string): Promise<OnChainEntry | null> {
  if (!ADDRESS) return null;
  const pub = createPublicClient({ chain: arc, transport: http() });
  const e = (await pub.readContract({
    address: ADDRESS,
    abi,
    functionName: "get",
    args: [slug],
  })) as { blobId: string; creator: string; title: string; registeredBy: string; registeredAt: bigint };
  if (!e || (!e.blobId && !e.creator && !e.title && Number(e.registeredAt) === 0)) return null;
  return {
    blobId: e.blobId,
    creator: e.creator,
    title: e.title,
    registeredBy: e.registeredBy,
    registeredAt: String(e.registeredAt),
  };
}
