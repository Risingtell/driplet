"use client";

import {
  toPasskeyTransport,
  toWebAuthnCredential,
  toModularTransport,
  toCircleSmartAccount,
  WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, encodeFunctionData, type Hex } from "viem";
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

/**
 * Register a new passkey (or log into an existing one) and build the smart
 * account + bundler client. `mode` defaults to register for first-time viewers.
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
      const userOpHash = await bundlerClient.sendUserOperation({
        calls: [{ to: USDC, data }],
        paymaster: true,
      });
      const { receipt } = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
      return receipt.transactionHash as `0x${string}`;
    },
  };

  cached = session;
  return session;
}

export function currentSession(): Session | null {
  return cached;
}
