import { getEthereum } from "@/lib/arc-chain";
import { ARC } from "@/lib/arc-network";
import { paymentTag } from "@/lib/payment-tag";

/**
 * Viewer "pay from my own wallet". The viewer's wallet sends one ordinary USDC
 * transfer on Arc to the stream treasury and pays its network fee itself, in
 * USDC (Arc's gas token, so no second token is needed). Driplet relays nothing
 * and pays no one's gas; the server only confirms the transfer on-chain.
 */
const USDC = ARC.usdc;

/**
 * USDC left in the wallet for the transfer's own network fee. A transfer costs
 * about $0.001 on Arc; this leaves room for a fee spike.
 */
export const OWN_WALLET_FEE_RESERVE = 0.005;

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
 * Ask the viewer's wallet to send `amountUsd` USDC to `to` for stream `slug`.
 * The wallet shows the transfer with its network fee for the viewer to
 * confirm, and resolves with the transaction hash once it is submitted.
 */
export async function sendWatchPayment(
  from: string,
  to: string,
  amountUsd: number,
  slug: string,
): Promise<`0x${string}`> {
  const eth = getEthereum();
  if (!eth) throw new Error("No wallet found.");

  const value = BigInt(Math.round(amountUsd * 1e6));
  // transfer(address,uint256), then the stream's tag (see lib/payment-tag).
  const data =
    "0xa9059cbb" +
    to.slice(2).toLowerCase().padStart(64, "0") +
    value.toString(16).padStart(64, "0") +
    paymentTag(slug);

  return (await eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to: USDC, data }],
  })) as `0x${string}`;
}
