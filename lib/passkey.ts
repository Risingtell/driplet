"use client";

import {
  toPasskeyTransport,
  toWebAuthnCredential,
  toModularTransport,
  toCircleSmartAccount,
  getUserOperationGasPrice,
  WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import {
  createPublicClient,
  encodeFunctionData,
  type Client,
  type Hex,
  type Transport,
} from "viem";
import { createBundlerClient, toWebAuthnAccount } from "viem/account-abstraction";
import { arcTestnet } from "viem/chains";

/**
 * Passkey onboarding for viewers via Circle Modular Wallets. A viewer creates
 * (or signs into) a gasless smart-account wallet on Arc Testnet with Face ID /
 * Touch ID — no MetaMask extension, no seed phrase. The smart account then pays
 * the creator in the same Arc USDC the rest of the app uses, gas sponsored by
 * Circle's paymaster (ERC-4337). This removes the #1 friction real viewers hit:
 * not being able to connect a wallet.
 */

// The ERC-20 USDC the whole app accounts in (NOT Arc's 18-decimal native token).
const USDC = "0x3600000000000000000000000000000000000000" as const;

const CLIENT_KEY = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY ?? "";
const CLIENT_URL =
  process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL ?? "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

const erc20Abi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function passkeysSupported(): boolean {
  return (
    !!CLIENT_KEY &&
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential
  );
}

type Session = {
  address: `0x${string}`;
  // Send a gasless USDC transfer from the smart account; resolves to the tx hash.
  pay: (to: `0x${string}`, amountUsd: number) => Promise<`0x${string}`>;
  // Read the smart account's USDC balance in dollars.
  balance: () => Promise<number>;
};

// Cache the signed-in session so top-ups reuse it without re-running discovery.
let cached: Session | null = null;

// The passkey credential ({ id, publicKey }) is enough to rebuild the exact same
// smart account and to sign later. Persisting it means the viewer logs in with
// Face ID ONCE per device: on later visits we restore the wallet with no prompt,
// and Face ID only appears when they actually sign a payment.
const CRED_KEY = "driplet_passkey_cred";

type StoredCredential = { id: string; publicKey: Hex };

function persistCredential(credential: StoredCredential) {
  try {
    localStorage.setItem(
      CRED_KEY,
      JSON.stringify({ id: credential.id, publicKey: credential.publicKey }),
    );
  } catch {
    // storage disabled (private mode) — the session just won't persist
  }
}

function readCredential(): StoredCredential | null {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as StoredCredential;
    return c?.id && c?.publicKey ? c : null;
  } catch {
    return null;
  }
}

/**
 * Fees for a UserOperation, asked of the bundler instead of inferred from the
 * chain.
 *
 * Arc Testnet's raw eth_* endpoints price ordinary transactions, not
 * UserOperations, and the two are far apart: on 23 Jul 2026
 * eth_maxPriorityFeePerGas reported 5 gwei while the bundler's own floor was
 * 22.875 gwei, so UOs built from raw estimates were rejected as underpriced.
 * Passing explicit fees also skips the 2x buffer viem applies when it prepares
 * a UO itself — and even that buffer lands at 10 gwei, still under the floor.
 * circle_getUserOperationGasPrice is the bundler stating its own terms, so it
 * tracks whatever the floor moves to.
 *
 * The "high" tier is deliberate: gas is paymaster-sponsored, so bidding above
 * the floor costs the viewer nothing, while bidding under it silently drops
 * their payment. Drop to `medium` if sponsorship cost ever matters more than
 * inclusion.
 *
 * Returns undefined if the bundler can't be reached, which leaves the fees
 * unset so viem estimates them and applies its own buffer.
 */
async function userOperationFees(
  client: Client<Transport>,
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | undefined> {
  try {
    const price = await getUserOperationGasPrice(client);
    const level = price?.high ?? price?.medium ?? price?.low;
    if (!level?.maxFeePerGas || !level?.maxPriorityFeePerGas) return undefined;
    return {
      maxFeePerGas: BigInt(level.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(level.maxPriorityFeePerGas),
    };
  } catch {
    return undefined;
  }
}

/** Build the smart account + bundler client + Session from a passkey credential. */
async function buildSession(credential: { id: string; publicKey: Hex }): Promise<Session> {
  const modularTransport = toModularTransport(`${CLIENT_URL}/arcTestnet`, CLIENT_KEY);
  const client = createPublicClient({ chain: arcTestnet, transport: modularTransport });

  const smartAccount = await toCircleSmartAccount({
    client,
    owner: toWebAuthnAccount({ credential }),
  });

  const bundlerClient = createBundlerClient({
    account: smartAccount,
    chain: arcTestnet,
    transport: modularTransport,
  });

  const session: Session = {
    address: smartAccount.address,
    async balance() {
      const raw = (await client.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [smartAccount.address],
      })) as bigint;
      return Number(raw) / 1e6;
    },
    async pay(to, amountUsd) {
      const value = BigInt(Math.round(amountUsd * 1e6));
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, value],
      }) as Hex;
      const fees = await userOperationFees(client);
      const userOpHash = await bundlerClient.sendUserOperation({
        calls: [{ to: USDC, data }],
        paymaster: true,
        ...(fees ?? {}),
      });
      // Give the bundler more room than viem's default (~6 retries) before giving
      // up — observed inclusion can lag well past that under load.
      const { receipt } = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash,
        pollingInterval: 3_000,
        retryCount: 20,
      });
      return receipt.transactionHash as `0x${string}`;
    },
  };

  cached = session;
  return session;
}

/**
 * Register a new passkey (or log into an existing one) and build the smart
 * account + bundler client. `mode` defaults to register for first-time viewers.
 * The Face ID ceremony runs here; afterwards the credential is persisted so
 * future visits restore silently via restoreSession().
 */
export async function signInWithPasskey(
  username: string,
  mode: "register" | "login" = "register",
): Promise<Session> {
  if (!CLIENT_KEY) throw new Error("Passkey wallets are not configured.");

  const passkeyTransport = toPasskeyTransport(CLIENT_URL, CLIENT_KEY);
  const credential = await toWebAuthnCredential({
    transport: passkeyTransport,
    mode: mode === "login" ? WebAuthnMode.Login : WebAuthnMode.Register,
    username,
  });

  persistCredential(credential as StoredCredential);
  return buildSession(credential as { id: string; publicKey: Hex });
}

/**
 * Restore a previously signed-in wallet from the persisted credential WITHOUT a
 * Face ID prompt (reads and address only; signing a payment still prompts). This
 * is what makes Face ID login a one-time thing per device. Returns null if the
 * viewer has never signed in on this device.
 */
export async function restoreSession(): Promise<Session | null> {
  if (cached) return cached;
  if (!CLIENT_KEY || typeof window === "undefined") return null;
  const credential = readCredential();
  if (!credential) return null;
  try {
    return await buildSession(credential);
  } catch {
    return null;
  }
}

export function currentSession(): Session | null {
  return cached;
}
