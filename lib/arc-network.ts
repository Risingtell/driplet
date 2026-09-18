/**
 * The one place that knows which Arc network Driplet runs on.
 *
 * Driplet settles on Arc mainnet. Arc Testnet stays available as a switch so the
 * whole product can be exercised with faucet USDC: set NEXT_PUBLIC_ARC_NETWORK
 * to "testnet" and every module that touches the chain, Circle wallets or
 * Gateway follows, because they all read `ARC` instead of a hardcoded value.
 *
 * The variable is NEXT_PUBLIC_ so the browser-side wallet helpers see the same
 * answer as the server. It is read at build time on the client.
 */

export type ArcNetworkType = "mainnet" | "testnet";

export interface ArcNetwork {
  name: string;
  type: ArcNetworkType;
  chainId: number;
  chainIdHex: `0x${string}`;
  /** CAIP-2 id used by x402 / Gateway. */
  caip2: `eip155:${number}`;
  rpc: string;
  explorer: string;
  /** Native USDC. Same address on both networks. Gas is this same balance. */
  usdc: `0x${string}`;
  /** Circle developer-controlled wallets blockchain slug. */
  circleBlockchain: "ARC" | "ARC-TESTNET";
  /** Chain key for Circle's x402-batching GatewayClient. */
  gatewayChain: "arc" | "arcTestnet";
  gatewayApi: string;
  gatewayWallet: `0x${string}`;
  /** Path segment of Circle's modular wallets RPC for this chain. */
  modularChain: "arc" | "arcTestnet";
  faucet?: string;
}

export const ARC_MAINNET: ArcNetwork = {
  name: "Arc",
  type: "mainnet",
  chainId: 5042,
  chainIdHex: "0x13b2",
  caip2: "eip155:5042",
  rpc: "https://rpc.mainnet.arc.io",
  explorer: "https://explorer.arc.io",
  usdc: "0x3600000000000000000000000000000000000000",
  circleBlockchain: "ARC",
  gatewayChain: "arc",
  gatewayApi: "https://gateway-api.circle.com",
  gatewayWallet: "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
  modularChain: "arc",
};

export const ARC_TESTNET: ArcNetwork = {
  name: "Arc Testnet",
  type: "testnet",
  chainId: 5042002,
  chainIdHex: "0x4cef52",
  caip2: "eip155:5042002",
  rpc: "https://rpc.testnet.arc.io",
  explorer: "https://explorer.testnet.arc.io",
  usdc: "0x3600000000000000000000000000000000000000",
  circleBlockchain: "ARC-TESTNET",
  gatewayChain: "arcTestnet",
  gatewayApi: "https://gateway-api-testnet.circle.com",
  gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  modularChain: "arcTestnet",
  faucet: "https://faucet.circle.com",
};

export function selectNetwork(env: string | undefined = process.env.NEXT_PUBLIC_ARC_NETWORK): ArcNetwork {
  const wanted = (env ?? "").trim().toLowerCase();
  if (wanted === "" || wanted === "mainnet") return ARC_MAINNET;
  if (wanted === "testnet") return ARC_TESTNET;
  throw new Error(`NEXT_PUBLIC_ARC_NETWORK must be "mainnet" or "testnet", not "${env}".`);
}

/** The network this deployment settles on. */
export const ARC: ArcNetwork = selectNetwork();

/** Arc as a viem chain definition. USDC is the gas token, 18 decimals on the native view. */
export const arcChain = {
  id: ARC.chainId,
  name: ARC.name,
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC.rpc] } },
  blockExplorers: { default: { name: "Arc Explorer", url: ARC.explorer } },
  testnet: ARC.type === "testnet",
} as const;

/** Parameters for `wallet_addEthereumChain`. */
export const ARC_WALLET_PARAMS = {
  chainId: ARC.chainIdHex,
  chainName: ARC.name,
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: [ARC.rpc],
  blockExplorerUrls: [ARC.explorer],
} as const;

export function arcTxUrl(hash: string): string {
  return `${ARC.explorer}/tx/${hash}`;
}

export function arcAddressUrl(address: string): string {
  return `${ARC.explorer}/address/${address}`;
}

/**
 * Chains a creator can withdraw Gateway earnings to, keyed by the x402-batching
 * SDK's chain names, with the explorer each one uses. The first entry is Arc
 * itself and is the default in the withdraw dialog.
 */
export interface WithdrawChain {
  value: string;
  label: string;
  explorerTx: string;
}

const MAINNET_WITHDRAW_CHAINS: WithdrawChain[] = [
  { value: "arc", label: "Arc", explorerTx: "https://explorer.arc.io/tx/" },
  { value: "base", label: "Base", explorerTx: "https://basescan.org/tx/" },
  { value: "ethereum", label: "Ethereum", explorerTx: "https://etherscan.io/tx/" },
  { value: "arbitrum", label: "Arbitrum", explorerTx: "https://arbiscan.io/tx/" },
  { value: "optimism", label: "Optimism", explorerTx: "https://optimistic.etherscan.io/tx/" },
  { value: "avalanche", label: "Avalanche", explorerTx: "https://snowscan.xyz/tx/" },
  { value: "polygon", label: "Polygon", explorerTx: "https://polygonscan.com/tx/" },
];

const TESTNET_WITHDRAW_CHAINS: WithdrawChain[] = [
  { value: "arcTestnet", label: "Arc Testnet", explorerTx: "https://explorer.testnet.arc.io/tx/" },
  { value: "baseSepolia", label: "Base Sepolia", explorerTx: "https://sepolia.basescan.org/tx/" },
  { value: "sepolia", label: "Ethereum Sepolia", explorerTx: "https://sepolia.etherscan.io/tx/" },
  { value: "arbitrumSepolia", label: "Arbitrum Sepolia", explorerTx: "https://sepolia.arbiscan.io/tx/" },
  { value: "optimismSepolia", label: "Optimism Sepolia", explorerTx: "https://sepolia-optimism.etherscan.io/tx/" },
  { value: "avalancheFuji", label: "Avalanche Fuji", explorerTx: "https://testnet.snowscan.xyz/tx/" },
  { value: "polygonAmoy", label: "Polygon Amoy", explorerTx: "https://amoy.polygonscan.com/tx/" },
];

export const WITHDRAW_CHAINS: WithdrawChain[] =
  ARC.type === "mainnet" ? MAINNET_WITHDRAW_CHAINS : TESTNET_WITHDRAW_CHAINS;

export function withdrawChainLabel(value: string): string {
  return WITHDRAW_CHAINS.find((c) => c.value === value)?.label ?? value;
}
