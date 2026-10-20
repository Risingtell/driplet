import "server-only";
import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  pad,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { ARC, arcChain } from "@/lib/arc-network";
import { callContractAsWallet } from "@/lib/circle";
import { sendTreasuryUsdc } from "@/lib/relayer";

/**
 * Creator earnings live in Circle Gateway, not in the creator's wallet on-chain.
 * Every payout is an x402 Gateway payment to the creator's address, so it lands
 * as a Gateway balance owned by that address. This module reads that balance
 * and withdraws it to any Arc address.
 *
 * Who signs: a Gateway withdrawal is an EIP-712 "burn intent" whose domain has
 * no chainId (it is valid across chains), and Circle's API only signs typed
 * data for an Arc wallet when the domain carries one. So the creator's Circle
 * wallet can't sign it. Instead it authorises the treasury once, on-chain, as a
 * Gateway delegate for its balance (addDelegate), and the treasury signs each
 * withdrawal on its behalf. That adds no custody: the platform already controls
 * these developer wallets, and the treasury key never leaves the server. The
 * treasury also submits the mint and pays its gas, so creators need no USDC
 * on-chain to get paid out.
 */

const GATEWAY_API = `${ARC.gatewayApi}/v1`;
const cfg = CHAIN_CONFIGS[ARC.gatewayChain];
const toBytes32 = (addr: string) => pad(addr.toLowerCase() as `0x${string}`, { size: 32 });

const GATEWAY_WALLET_ABI = [
  {
    name: "isAuthorizedForBalance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "token", type: "address" },
      { name: "depositor", type: "address" },
      { name: "addr", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const GATEWAY_MINTER_ABI = [
  {
    name: "gatewayMint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestationPayload", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// EIP-712 types Gateway expects a burn intent to be signed with.
const BURN_INTENT_TYPES = {
  TransferSpec: [
    { name: "version", type: "uint32" },
    { name: "sourceDomain", type: "uint32" },
    { name: "destinationDomain", type: "uint32" },
    { name: "sourceContract", type: "bytes32" },
    { name: "destinationContract", type: "bytes32" },
    { name: "sourceToken", type: "bytes32" },
    { name: "destinationToken", type: "bytes32" },
    { name: "sourceDepositor", type: "bytes32" },
    { name: "destinationRecipient", type: "bytes32" },
    { name: "sourceSigner", type: "bytes32" },
    { name: "destinationCaller", type: "bytes32" },
    { name: "value", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "hookData", type: "bytes" },
  ],
  BurnIntent: [
    { name: "maxBlockHeight", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "spec", type: "TransferSpec" },
  ],
} as const;

interface TransferSpec {
  version: number;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: `0x${string}`;
  destinationContract: `0x${string}`;
  sourceToken: `0x${string}`;
  destinationToken: `0x${string}`;
  sourceDepositor: `0x${string}`;
  destinationRecipient: `0x${string}`;
  sourceSigner: `0x${string}`;
  destinationCaller: `0x${string}`;
  value: string;
  salt: `0x${string}`;
  hookData: `0x${string}`;
}

interface BurnIntent {
  maxBlockHeight: string;
  maxFee: string;
  spec: TransferSpec;
}

// Enough USDC (Arc's gas token) for the one-time addDelegate call with room for
// Circle's fee padding. Measured: ~62k gas at ~21 gwei, about $0.0013.
const DELEGATE_GAS_TOPUP = 0.01;

function treasury() {
  const key = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("Treasury wallet is not configured.");
  return privateKeyToAccount(key);
}

const publicClient = () => createPublicClient({ chain: arcChain, transport: http() });

/** A creator's Gateway balance on Arc, in atomic USDC units (6 decimals). */
export async function getGatewayBalance(address: string): Promise<bigint> {
  const res = await fetch(`${GATEWAY_API}/balances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ token: "USDC", sources: [{ domain: cfg.domain, depositor: address }] }),
  });
  if (!res.ok) throw new Error(`Gateway balance lookup failed (${res.status}).`);
  const data = (await res.json()) as { balances?: { domain: number; balance?: string }[] };
  const raw = data.balances?.find((b) => b.domain === cfg.domain)?.balance ?? "0";
  // The API answers in decimal USDC ("0.621000"); accept atomic units too.
  return raw.includes(".") ? parseUnits(raw, 6) : BigInt(raw);
}

/** Ask Gateway for the fee and expiry it would put on a same-chain withdrawal. */
async function estimate(opts: {
  depositor: string;
  signer: string;
  recipient: string;
  value: bigint;
}): Promise<BurnIntent> {
  const spec: TransferSpec = {
    version: 1,
    sourceDomain: cfg.domain,
    destinationDomain: cfg.domain,
    sourceContract: toBytes32(cfg.gatewayWallet),
    destinationContract: toBytes32(cfg.gatewayMinter),
    sourceToken: toBytes32(cfg.usdc),
    destinationToken: toBytes32(cfg.usdc),
    sourceDepositor: toBytes32(opts.depositor),
    destinationRecipient: toBytes32(opts.recipient),
    sourceSigner: toBytes32(opts.signer),
    destinationCaller: toBytes32(zeroAddress),
    value: opts.value.toString(),
    salt: `0x${randomBytes(32).toString("hex")}`,
    hookData: "0x",
  };
  const res = await fetch(`${GATEWAY_API}/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ spec }]),
  });
  const data = (await res.json().catch(() => null)) as { burnIntent?: BurnIntent }[] | null;
  const intent = Array.isArray(data) ? data[0]?.burnIntent : undefined;
  if (!res.ok || !intent) throw new Error("Gateway could not price this withdrawal. Try again shortly.");
  // Sign only what we asked for: Gateway sets the fee and expiry, nothing else.
  // Every other field of the spec is ours, so put it back rather than trust it.
  return { maxBlockHeight: intent.maxBlockHeight, maxFee: intent.maxFee, spec };
}

/**
 * The most a creator can withdraw right now: their Gateway balance minus the
 * fee Gateway charges to move it. Atomic units.
 */
export async function getWithdrawable(address: string): Promise<{ balance: bigint; max: bigint }> {
  const balance = await getGatewayBalance(address);
  if (balance === 0n) return { balance, max: 0n };
  const intent = await estimate({
    depositor: address,
    signer: treasury().address,
    recipient: address,
    value: balance,
  });
  const fee = BigInt(intent.maxFee);
  return { balance, max: balance > fee ? balance - fee : 0n };
}

/**
 * Make sure the treasury may sign withdrawals of this creator's Gateway
 * balance. First time only: fund the creator wallet with a cent for gas if it
 * has none, then have it call addDelegate(USDC, treasury) on the Gateway
 * Wallet contract. Returns true if the delegate was just added.
 */
async function ensureTreasuryDelegate(walletId: string, address: `0x${string}`): Promise<boolean> {
  const pub = publicClient();
  const delegate = treasury().address;
  const authorized = () =>
    pub.readContract({
      address: cfg.gatewayWallet,
      abi: GATEWAY_WALLET_ABI,
      functionName: "isAuthorizedForBalance",
      args: [cfg.usdc, address, delegate],
    });
  if (await authorized()) return false;

  // Native balance is the 18-decimal view of the same USDC.
  if ((await pub.getBalance({ address })) < parseEther(String(DELEGATE_GAS_TOPUP / 2))) {
    const sent = await sendTreasuryUsdc(address, DELEGATE_GAS_TOPUP);
    await sent.confirmed;
  }
  await callContractAsWallet({
    walletId,
    contractAddress: cfg.gatewayWallet,
    abiFunctionSignature: "addDelegate(address,address)",
    abiParameters: [cfg.usdc, delegate],
  });
  if (!(await authorized())) throw new Error("Could not authorise withdrawals yet. Try again shortly.");
  return true;
}

/** POST the signed intent to Gateway for an attestation. */
async function requestAttestation(intent: BurnIntent, signature: `0x${string}`) {
  const res = await fetch(`${GATEWAY_API}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ burnIntent: intent, signature }]),
  });
  const att = (await res.json().catch(() => ({}))) as {
    attestation?: `0x${string}`;
    signature?: `0x${string}`;
    message?: string;
    error?: string;
  };
  if (!res.ok || !att.attestation || !att.signature) {
    throw new Error(`Gateway refused the withdrawal: ${att.message ?? att.error ?? res.status}`);
  }
  return { attestation: att.attestation, signature: att.signature };
}

/**
 * Withdraw `amount` USDC of a creator's Gateway earnings to `to` on Arc.
 * Returns the mint transaction hash once it is mined.
 */
export async function withdrawGatewayEarnings(opts: {
  walletId: string;
  address: `0x${string}`;
  to: `0x${string}`;
  amount: string;
}): Promise<{ txHash: `0x${string}`; amount: string; fee: string }> {
  const value = parseUnits(opts.amount, 6);
  if (value <= 0n) throw new Error("Enter an amount greater than 0.");
  const signer = treasury();

  const [balance, intent] = await Promise.all([
    getGatewayBalance(opts.address),
    estimate({ depositor: opts.address, signer: signer.address, recipient: opts.to, value }),
  ]);
  const fee = BigInt(intent.maxFee);
  if (value + fee > balance) {
    const max = balance > fee ? balance - fee : 0n;
    throw new Error(
      `That's more than you can withdraw. Up to $${formatUnits(max, 6)} is available after Gateway's $${formatUnits(fee, 6)} fee.`,
    );
  }

  const justDelegated = await ensureTreasuryDelegate(opts.walletId, opts.address);

  const signature = await signer.signTypedData({
    domain: { name: "GatewayWallet", version: "1" },
    types: BURN_INTENT_TYPES,
    primaryType: "BurnIntent",
    message: {
      maxBlockHeight: BigInt(intent.maxBlockHeight),
      maxFee: fee,
      spec: { ...intent.spec, value },
    },
  });

  // Gateway learns about a new delegate from the chain, a few blocks behind us,
  // so give a just-added one a little while before giving up.
  let att: Awaited<ReturnType<typeof requestAttestation>> | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      att = await requestAttestation(intent, signature);
      break;
    } catch (e) {
      if (!justDelegated || attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }

  // The intent names no destination caller, so anyone may submit the mint.
  const wallet = createWalletClient({ account: signer, chain: arcChain, transport: http() });
  const txHash = await wallet.writeContract({
    address: cfg.gatewayMinter,
    abi: GATEWAY_MINTER_ABI,
    functionName: "gatewayMint",
    args: [att.attestation, att.signature],
  });
  const receipt = await publicClient().waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error(`The withdrawal mint failed (tx ${txHash}).`);

  return { txHash, amount: opts.amount, fee: formatUnits(fee, 6) };
}
