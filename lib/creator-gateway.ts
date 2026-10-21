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
import { estimateTreasuryUsdcFee, sendTreasuryUsdc, weiToUsd } from "@/lib/relayer";
import { adminClient } from "@/lib/supabase/admin";

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
 * these developer wallets, and the treasury key never leaves the server.
 *
 * Who pays: Driplet pays no one's gas. A creator's wallet holds no USDC on-chain
 * to pay a mint with, so the earnings are minted to the treasury, which
 * forwards them minus the exact gas it spent (the mint, the forward, and on a
 * first withdrawal the one-time delegate setup). Creators still need no gas
 * money up front; the fees just come out of what they withdraw. Each
 * withdrawal is logged in creator_withdrawals before money moves, so a forward
 * that fails after the mint is completed on the creator's next attempt.
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

// Gas a gatewayMint took on Arc (133,191 on the first real withdrawal, 21 Oct
// 2026), with headroom. Only an estimate until the mint's receipt says.
const MINT_GAS = 160_000n;
// A USDC transfer to an address that has never held USDC costs the most (74k).
const FORWARD_GAS = 80_000n;
// Smallest amount worth withdrawing once every fee is out of it.
const MIN_RECEIVED = 0.005;

async function gasPriceWei(): Promise<bigint> {
  const pub = publicClient();
  const [block, priority] = await Promise.all([pub.getBlock(), pub.estimateMaxPriorityFeePerGas()]);
  return (block.baseFeePerGas ?? 0n) + priority;
}

async function isDelegated(address: string): Promise<boolean> {
  return publicClient().readContract({
    address: cfg.gatewayWallet,
    abi: GATEWAY_WALLET_ABI,
    functionName: "isAuthorizedForBalance",
    args: [cfg.usdc, address as `0x${string}`, treasury().address],
  });
}

/** Worst-case network fees for a withdrawal, in dollars, before it starts. */
async function networkFeeEstimate(needsDelegate: boolean): Promise<number> {
  const price = await gasPriceWei();
  const withHeadroom = (gas: bigint) => weiToUsd((gas * price * 125n) / 100n);
  // One-time setup: the gas money sent to the creator's wallet for
  // addDelegate, plus that transfer's own fee.
  const setup = needsDelegate ? DELEGATE_GAS_TOPUP + withHeadroom(FORWARD_GAS) : 0;
  return withHeadroom(MINT_GAS) + withHeadroom(FORWARD_GAS) + setup;
}

/**
 * The most a creator can withdraw right now (their Gateway balance minus the
 * fee Gateway charges to move it), in atomic units, and the network fees that
 * will come out of it, in dollars.
 */
export async function getWithdrawable(
  address: string,
): Promise<{ balance: bigint; max: bigint; networkFee: number }> {
  const balance = await getGatewayBalance(address);
  if (balance === 0n) return { balance, max: 0n, networkFee: 0 };
  const signer = treasury().address;
  const [intent, delegated] = await Promise.all([
    estimate({ depositor: address, signer, recipient: signer, value: balance }),
    isDelegated(address),
  ]);
  const fee = BigInt(intent.maxFee);
  return {
    balance,
    max: balance > fee ? balance - fee : 0n,
    networkFee: await networkFeeEstimate(!delegated),
  };
}

/**
 * Make sure the treasury may sign withdrawals of this creator's Gateway
 * balance. First time only: send the creator wallet a cent of USDC for gas and
 * have it call addDelegate(USDC, treasury). `onCost` hears what that cost the
 * treasury the moment it is spent, so it is repaid even if a later step fails.
 * Returns the cost in dollars (0 when already set up).
 */
async function ensureTreasuryDelegate(
  walletId: string,
  address: `0x${string}`,
  onCost: (usd: number) => Promise<void>,
): Promise<number> {
  if (await isDelegated(address)) return 0;

  let setupCost = 0;
  // Native balance is the 18-decimal view of the same USDC.
  if ((await publicClient().getBalance({ address })) < parseEther(String(DELEGATE_GAS_TOPUP / 2))) {
    const sent = await sendTreasuryUsdc(address, DELEGATE_GAS_TOPUP);
    const { feeUsd } = await sent.confirmed;
    setupCost = Math.round((DELEGATE_GAS_TOPUP + feeUsd) * 1e6) / 1e6;
    await onCost(setupCost);
  }
  await callContractAsWallet({
    walletId,
    contractAddress: cfg.gatewayWallet,
    abiFunctionSignature: "addDelegate(address,address)",
    abiParameters: [cfg.usdc, treasury().address],
  });
  if (!(await isDelegated(address))) throw new Error("Could not authorise withdrawals yet. Try again shortly.");
  return setupCost;
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

type Ledger = ReturnType<typeof adminClient>;

type LedgerRow = {
  id: string;
  destination: string;
  gross_usdc: number | string;
  network_fee_usdc: number | string;
  net_usdc?: number | string | null;
  forward_tx?: string | null;
};
const LEDGER_COLUMNS = "id, destination, gross_usdc, network_fee_usdc, net_usdc, forward_tx";

async function markSent(db: Ledger, id: string, gross: number, received: number, txHash: `0x${string}`) {
  // The creator paid the estimate; recording gross minus received keeps the
  // ledger equal to exactly what they were charged.
  const networkFee = Math.round((gross - received) * 1e6) / 1e6;
  await db
    .from("creator_withdrawals")
    .update({ status: "sent", net_usdc: String(received), network_fee_usdc: String(networkFee) })
    .eq("id", id);
  return { txHash, received, networkFee };
}

/**
 * Send a minted withdrawal on from the treasury: what was minted, less every
 * network fee recorded so far and this transfer's own (estimated) fee.
 */
async function forward(
  db: Ledger,
  row: LedgerRow,
): Promise<{ txHash: `0x${string}`; received: number; networkFee: number }> {
  const gross = Number(row.gross_usdc);
  const feesSoFar = Number(row.network_fee_usdc);
  const to = row.destination as `0x${string}`;
  const forwardFee = await estimateTreasuryUsdcFee(to, Math.max(gross - feesSoFar, 0.000001));
  const received = Math.floor((gross - feesSoFar - forwardFee) * 1e6) / 1e6;
  if (received <= 0) throw new Error("This withdrawal is too small to cover its network fees.");
  // Write down what is about to go out before it goes: if waiting for the
  // receipt fails, a later attempt checks this transfer instead of sending again.
  await db.from("creator_withdrawals").update({ net_usdc: String(received) }).eq("id", row.id);
  const sent = await sendTreasuryUsdc(to, received);
  await db.from("creator_withdrawals").update({ forward_tx: sent.hash }).eq("id", row.id);
  await sent.confirmed;
  return markSent(db, row.id, gross, received, sent.hash);
}

/**
 * Finish any withdrawal that was minted to the treasury but not yet confirmed
 * as forwarded. Their money is already out of Gateway and owed to them.
 */
async function completePendingForwards(db: Ledger, address: string) {
  const { data } = await db
    .from("creator_withdrawals")
    .select(LEDGER_COLUMNS)
    .eq("creator_address", address.toLowerCase())
    .eq("status", "minted");
  for (const row of (data ?? []) as LedgerRow[]) {
    if (row.forward_tx) {
      // A forward was already submitted. Never send twice: look at it instead.
      const receipt = await publicClient()
        .getTransactionReceipt({ hash: row.forward_tx as `0x${string}` })
        .catch(() => null);
      if (receipt?.status === "success") {
        await markSent(db, row.id, Number(row.gross_usdc), Number(row.net_usdc), row.forward_tx as `0x${string}`);
        continue;
      }
      if (!receipt) throw new Error("An earlier withdrawal of yours is still confirming. Try again in a minute.");
      // It reverted, so nothing went out: send it again.
      await db.from("creator_withdrawals").update({ forward_tx: null }).eq("id", row.id);
    }
    await forward(db, row);
  }
}

/**
 * Setup gas the treasury spent on attempts that failed before minting, which
 * the creator's next successful withdrawal repays.
 */
async function owedSetup(db: Ledger, address: string): Promise<{ ids: string[]; usd: number }> {
  const { data } = await db
    .from("creator_withdrawals")
    .select("id, network_fee_usdc")
    .eq("creator_address", address.toLowerCase())
    .eq("status", "owed");
  const rows = data ?? [];
  return {
    ids: rows.map((r) => r.id as string),
    usd: rows.reduce((t, r) => t + Number(r.network_fee_usdc ?? 0), 0),
  };
}

/**
 * Withdraw `amount` USDC of a creator's Gateway earnings to `to` on Arc. The
 * network fees come out of it, so `received` is what reaches `to`.
 */
export async function withdrawGatewayEarnings(opts: {
  walletId: string;
  address: `0x${string}`;
  to: `0x${string}`;
  amount: string;
}): Promise<{ txHash: `0x${string}`; received: number; gatewayFee: string; networkFee: number }> {
  const value = parseUnits(opts.amount, 6);
  if (value <= 0n) throw new Error("Enter an amount greater than 0.");
  const signer = treasury();
  const db = adminClient();

  // Anything left half-done from an earlier attempt goes out first.
  await completePendingForwards(db, opts.address);
  const owed = await owedSetup(db, opts.address);

  const [balance, intent, delegated] = await Promise.all([
    getGatewayBalance(opts.address),
    // Minted to the treasury, which forwards it net of fees.
    estimate({ depositor: opts.address, signer: signer.address, recipient: signer.address, value }),
    isDelegated(opts.address),
  ]);
  const gatewayFee = BigInt(intent.maxFee);
  if (value + gatewayFee > balance) {
    const max = balance > gatewayFee ? balance - gatewayFee : 0n;
    throw new Error(
      `That's more than you can withdraw. Up to $${formatUnits(max, 6)} is available after Gateway's $${formatUnits(gatewayFee, 6)} fee.`,
    );
  }
  const valueUsd = Number(formatUnits(value, 6));
  const feeEstimate = (await networkFeeEstimate(!delegated)) + owed.usd;
  if (valueUsd - feeEstimate < MIN_RECEIVED) {
    throw new Error(
      `That's too small to withdraw: network fees of about $${feeEstimate.toFixed(4)} come out of it. Try a larger amount.`,
    );
  }

  // Log it before any money moves.
  const { data: row, error: logError } = await db
    .from("creator_withdrawals")
    .insert({
      creator_address: opts.address.toLowerCase(),
      destination: opts.to,
      gross_usdc: String(valueUsd),
      gateway_fee_usdc: formatUnits(gatewayFee, 6),
      network_fee_usdc: "0",
      status: "started",
    })
    .select(LEDGER_COLUMNS)
    .single();
  if (logError || !row) throw new Error("Withdrawals are unavailable for a moment. Try again shortly.");

  try {
    const setupCost = await ensureTreasuryDelegate(opts.walletId, opts.address, async (usd) => {
      // Spent now, so it is owed even if this attempt fails later.
      await db.from("creator_withdrawals").update({ network_fee_usdc: String(usd) }).eq("id", row.id);
    });

    const signature = await signer.signTypedData({
      domain: { name: "GatewayWallet", version: "1" },
      types: BURN_INTENT_TYPES,
      primaryType: "BurnIntent",
      message: {
        maxBlockHeight: BigInt(intent.maxBlockHeight),
        maxFee: gatewayFee,
        spec: { ...intent.spec, value },
      },
    });

    // Gateway learns about a new delegate from the chain, a few blocks behind
    // us, so give a just-added one a little while before giving up.
    let att: Awaited<ReturnType<typeof requestAttestation>> | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        att = await requestAttestation(intent, signature);
        break;
      } catch (e) {
        if (delegated || attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, 4000));
      }
    }

    // The intent names no destination caller, so the treasury submits the mint.
    const wallet = createWalletClient({ account: signer, chain: arcChain, transport: http() });
    const mintTx = await wallet.writeContract({
      address: cfg.gatewayMinter,
      abi: GATEWAY_MINTER_ABI,
      functionName: "gatewayMint",
      args: [att.attestation, att.signature],
    });
    const receipt = await publicClient().waitForTransactionReceipt({ hash: mintTx });
    if (receipt.status !== "success") throw new Error(`The withdrawal mint failed (tx ${mintTx}).`);
    const mintFee = weiToUsd(receipt.gasUsed * receipt.effectiveGasPrice);

    // Everything this withdrawal owes the treasury: its mint, its own setup,
    // and setup left over from earlier failed attempts.
    const minted = {
      ...row,
      network_fee_usdc: String(Math.round((mintFee + setupCost + owed.usd) * 1e6) / 1e6),
    };
    await db
      .from("creator_withdrawals")
      .update({ status: "minted", mint_tx: mintTx, network_fee_usdc: minted.network_fee_usdc })
      .eq("id", row.id);
    if (owed.ids.length) await db.from("creator_withdrawals").update({ status: "repaid" }).in("id", owed.ids);

    let sent;
    try {
      sent = await forward(db, minted);
    } catch {
      throw new Error(
        `Your $${valueUsd.toFixed(4)} left Gateway (tx ${mintTx}) and is safe with Driplet, but sending it on failed. It goes out automatically on your next withdrawal attempt.`,
      );
    }
    return { txHash: sent.txHash, received: sent.received, gatewayFee: formatUnits(gatewayFee, 6), networkFee: sent.networkFee };
  } catch (e) {
    // Failed before the mint: nothing left Gateway, so close the log entry. If
    // the setup gas was already spent, the creator owes it to the next one.
    const { data: now } = await db
      .from("creator_withdrawals")
      .select("status, network_fee_usdc")
      .eq("id", row.id)
      .single();
    if (now?.status === "started") {
      const status = Number(now.network_fee_usdc ?? 0) > 0 ? "owed" : "failed";
      await db.from("creator_withdrawals").update({ status }).eq("id", row.id);
    }
    throw e;
  }
}
