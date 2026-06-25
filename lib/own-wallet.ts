import { getEthereum } from "@/lib/arc-chain";

/**
 * Viewer "pay from my own wallet" via a gasless EIP-3009 signature. The viewer
 * signs a TransferWithAuthorization over Arc's USDC in their wallet (no gas, no
 * Gateway deposit); the server relays it. They only need testnet USDC in their
 * wallet.
 */
const USDC = "0x3600000000000000000000000000000000000000";
const CHAIN_ID = 5042002;

export interface SignedAuthorization {
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
  signature: string;
}

function randomNonce(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return "0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Read a wallet's USDC balance (in dollars) via the injected provider. */
export async function getUsdcBalance(address: string): Promise<number> {
  const eth = getEthereum();
  if (!eth) return 0;
  const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0"); // balanceOf(address)
  try {
    const res = (await eth.request({
      method: "eth_call",
      params: [{ to: USDC, data }, "latest"],
    })) as string;
    return parseInt(res, 16) / 1e6;
  } catch {
    return 0;
  }
}

/**
 * Ask the viewer's wallet to sign an authorization to pay `amountUsd` USDC to
 * `to`. Returns the signed authorization to POST to the own-pay route.
 */
export async function signWatchAuthorization(
  from: string,
  to: string,
  amountUsd: number,
): Promise<SignedAuthorization> {
  const eth = getEthereum();
  if (!eth) throw new Error("No wallet found.");

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from,
    to,
    value: Math.round(amountUsd * 1e6).toString(),
    validAfter: "0",
    validBefore: String(now + 3600),
    nonce: randomNonce(),
  };

  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    domain: { name: "USDC", version: "2", chainId: CHAIN_ID, verifyingContract: USDC },
    primaryType: "TransferWithAuthorization",
    message: authorization,
  };

  const signature = (await eth.request({
    method: "eth_signTypedData_v4",
    params: [from, JSON.stringify(typedData)],
  })) as string;

  return { authorization, signature };
}
