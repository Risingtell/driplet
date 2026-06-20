/**
 * Arc Testnet wallet helpers. Lets a viewer/creator connect any EVM wallet and
 * have the site automatically ADD the Arc Testnet network and SWITCH to it, so
 * nobody has to configure RPC/chain settings by hand. Raw EIP-1193 — no wallet
 * library dependency.
 */

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_TESTNET_CHAIN_ID_HEX = "0x4cef52"; // 5042002

/** Parameters passed to `wallet_addEthereumChain`. Arc is USDC-native. */
export const ARC_TESTNET_PARAMS = {
  chainId: ARC_TESTNET_CHAIN_ID_HEX,
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
} as const;

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

/** The injected wallet provider, if one is present in the browser. */
export function getEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

/**
 * Switch the wallet to Arc Testnet, adding the network first if the wallet
 * doesn't know it yet (error 4902). After this resolves the wallet is on Arc.
 */
export async function addAndSwitchToArc(eth: Eip1193Provider): Promise<void> {
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    // 4902: chain not added to the wallet. Some wallets nest it as -32603.
    if (code === 4902 || code === -32603) {
      await eth.request({ method: "wallet_addEthereumChain", params: [ARC_TESTNET_PARAMS] });
      // addEthereumChain usually switches too; make it explicit for wallets that don't.
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_TESTNET_CHAIN_ID_HEX }],
      });
    } else {
      throw err;
    }
  }
}

/**
 * Prompt the user to connect a wallet, then auto-add + switch to Arc Testnet.
 * Returns the connected address. Throws a friendly error if no wallet exists.
 */
export async function connectArcWallet(): Promise<string> {
  const eth = getEthereum();
  if (!eth) {
    throw new Error("No EVM wallet found. Install MetaMask (or any EVM wallet) and retry.");
  }
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.length) {
    throw new Error("No account was authorized.");
  }
  await addAndSwitchToArc(eth);
  return accounts[0];
}

/** Whether the wallet is currently on Arc Testnet. */
export async function isOnArc(eth: Eip1193Provider): Promise<boolean> {
  const chainId = (await eth.request({ method: "eth_chainId" })) as string;
  return chainId?.toLowerCase() === ARC_TESTNET_CHAIN_ID_HEX;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
