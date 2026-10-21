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
import { ARC, arcChain } from "@/lib/arc-network";

/**
 * Passkey onboarding for viewers via Circle Modular Wallets. A viewer creates
 * (or signs into) a smart-account wallet on Arc with Face ID / Touch ID, with
 * no MetaMask extension and no seed phrase. The smart account then pays the
 * stream in the same Arc USDC the rest of the app uses (ERC-4337). It pays its
 * own network fee from that USDC, which is Arc's gas token: Driplet sponsors no
 * one's gas.
 */

// The ERC-20 USDC the whole app accounts in (NOT Arc's 18-decimal native token).
const USDC = ARC.usdc;

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

// EntryPoint deposits: what an account has left there from earlier operations,
// which the next operation's prefund draws on first (native wei, 18 decimals).
const entryPointDepositAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** The wallet holds too little USDC to cover a payment's network fee. */
export class NotEnoughForFeeError extends Error {
  constructor(readonly reserveUsd: number) {
    super(
      `Add a little more USDC. Your wallet pays its own network fee, and this payment needs up to $${reserveUsd.toFixed(
        2,
      )} set aside for it (most of that comes back for your next payment).`,
    );
    this.name = "NotEnoughForFeeError";
  }
}

// Smallest prepay worth sending once the fee is set aside: $0.005.
const MIN_PAYMENT = 5_000n;

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
  /** `tag`: the stream's payment tag (lib/payment-tag), appended to the transfer. */
  pay: (to: `0x${string}`, amountUsd: number, tag?: string) => Promise<`0x${string}`>;
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
 * Arc's raw eth_* endpoints price ordinary transactions, not
 * UserOperations, and the two are far apart: on 23 Jul 2026
 * eth_maxPriorityFeePerGas reported 5 gwei while the bundler's own floor was
 * 22.875 gwei, so UOs built from raw estimates were rejected as underpriced.
 * Passing explicit fees also skips the 2x buffer viem applies when it prepares
 * a UO itself — and even that buffer lands at 10 gwei, still under the floor.
 * circle_getUserOperationGasPrice is the bundler stating its own terms, so it
 * tracks whatever the floor moves to.
 *
 * The viewer pays this fee from their own USDC, so this takes the "medium"
 * tier: still the bundler's own quoted price, so never underpriced, without
 * the premium "high" adds.
 *
 * Returns undefined if the bundler can't be reached, which leaves the fees
 * unset so viem estimates them and applies its own buffer.
 */
async function userOperationFees(
  client: Client<Transport>,
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | undefined> {
  try {
    const price = await getUserOperationGasPrice(client);
    const level = price?.medium ?? price?.high ?? price?.low;
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
  const modularTransport = toModularTransport(`${CLIENT_URL}/${ARC.modularChain}`, CLIENT_KEY);
  const client = createPublicClient({ chain: arcChain, transport: modularTransport });

  const smartAccount = await toCircleSmartAccount({
    client,
    owner: toWebAuthnAccount({ credential }),
  });

  const bundlerClient = createBundlerClient({
    account: smartAccount,
    chain: arcChain,
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
    async pay(to, amountUsd, tag) {
      // The transfer carries the stream's tag after its arguments, so the
      // server can tell which stream it pays for (see lib/payment-tag).
      const transfer = (value: bigint) => ({
        to: USDC,
        data: (encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, value] }) +
          (tag ?? "")) as Hex,
      });
      const wanted = BigInt(Math.round(amountUsd * 1e6));
      const fees = await userOperationFees(client);

      // The viewer pays this operation's network fee from the same USDC. Before
      // validation the EntryPoint takes the most the operation could cost (its
      // gas limits times the max fee), less any deposit left from earlier
      // payments, and keeps what goes unused as that deposit for next time. So
      // the transfer must leave that much in the wallet.
      let op;
      try {
        op = await bundlerClient.prepareUserOperation({
          account: smartAccount,
          calls: [transfer(wanted)],
          ...(fees ?? {}),
        });
      } catch (e) {
        // Simulation refuses an account that can't pay its own prefund.
        if (/AA21|prefund|insufficient/i.test((e as Error).message)) throw new NotEnoughForFeeError(0.1);
        throw e;
      }
      const [balance, deposit] = await Promise.all([
        client.readContract({
          address: USDC,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [smartAccount.address],
        }) as Promise<bigint>,
        (
          client.readContract({
            address: smartAccount.entryPoint.address,
            abi: entryPointDepositAbi,
            functionName: "balanceOf",
            args: [smartAccount.address],
          }) as Promise<bigint>
        ).catch(() => 0n),
      ]);
      const gasLimits = {
        callGasLimit: BigInt(op.callGasLimit),
        verificationGasLimit: BigInt(op.verificationGasLimit),
        preVerificationGas: BigInt(op.preVerificationGas),
      };
      const maxFeePerGas = BigInt(op.maxFeePerGas);
      const maxGas = gasLimits.callGasLimit + gasLimits.verificationGasLimit + gasLimits.preVerificationGas;
      const prefundWei = maxGas * maxFeePerGas;
      const depositWei = BigInt(deposit);
      const missingWei = prefundWei > depositWei ? prefundWei - depositWei : 0n;
      // Native wei (18 decimals) to USDC units (6), rounded up, plus $0.001.
      const reserve = (missingWei + 10n ** 12n - 1n) / 10n ** 12n + 1_000n;
      const spendable = BigInt(balance) - reserve;
      if (spendable < MIN_PAYMENT) throw new NotEnoughForFeeError(Number(reserve) / 1e6);
      const value = spendable < wanted ? spendable : wanted;

      // Same calldata size as the estimate, so reuse its gas limits: the prefund
      // set aside above is exactly the one the EntryPoint will ask for.
      const userOpHash = await bundlerClient.sendUserOperation({
        calls: [transfer(value)],
        ...gasLimits,
        maxFeePerGas,
        maxPriorityFeePerGas: BigInt(op.maxPriorityFeePerGas),
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
