import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { listStreams } from "@/lib/streams-db";
import { relayTransferWithAuthorization, type Authorization } from "@/lib/relayer";
import { streams as demoStreams, type Stream } from "@/lib/streams";

/**
 * The AI patron: an autonomous viewer agent with its OWN funded wallet on Arc.
 * Every cycle it looks at what's streaming (live status, viewers present, chat
 * activity, price) and its own remaining funds, and DECIDES — with a real LLM —
 * whether a stream is worth paying for right now. When it decides to watch, it
 * signs a gasless EIP-3009 authorization from its own wallet and the treasury
 * relays it on-chain, so its money flows through the same autonomous split as
 * any human viewer's. Every decision (including the ones NOT to pay) is
 * recorded with its reasoning and shown publicly on /impact.
 *
 * Together with the AI co-host (which EARNS from stream treasuries), this puts
 * autonomous agents on BOTH sides of the economy: one spends, one earns, and
 * the treasuries in between split it all with no human in the loop.
 */
const USDC = "0x3600000000000000000000000000000000000000" as const;
const CHAIN_ID = 5042002;
const ARC_NETWORK = "eip155:5042002";

const SELLER = (process.env.SELLER_ADDRESS ?? "") as `0x${string}`;
const PATRON_KEY = (process.env.PATRON_AGENT_KEY ?? "").trim() as `0x${string}`;

// One decision pays for this many seconds of watching.
const WATCH_SECONDS = 30;
// Self-throttle: at most one cycle per this window, so a public trigger can't
// be spammed into draining the patron (and each cycle is sub-cent anyway).
const MIN_CYCLE_GAP_MS = 25_000;
// The patron stops (and says so) when its wallet runs this low.
const MIN_BALANCE_USD = 0.02;

const DECISION_ENDPOINT = "/agents/patron/decision";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const arc = {
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
} as const;

const erc20 = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function patronAddress(): `0x${string}` | null {
  if (!PATRON_KEY) return null;
  try {
    return privateKeyToAccount(PATRON_KEY).address;
  } catch {
    return null;
  }
}

async function patronBalance(address: `0x${string}`): Promise<number> {
  const pub = createPublicClient({ chain: arc, transport: http() });
  const raw = await pub.readContract({
    address: USDC,
    abi: erc20,
    functionName: "balanceOf",
    args: [address],
  });
  return Number(raw) / 1e6;
}

interface Candidate {
  slug: string;
  title: string;
  isLive: boolean;
  viewersNow: number;
  chatLast10m: number;
  ratePerSecond: number;
}

/** What's on right now, with the signals the patron reasons over. */
async function gatherCandidates(): Promise<Candidate[]> {
  // Creator streams from the DB plus the in-code demo streams (e.g. ada-live),
  // deduped by slug — resolveStream gives code streams precedence the same way.
  const db = await listStreams(12);
  const seen = new Set(demoStreams.map((s) => s.slug));
  const streams = [...demoStreams, ...db.filter((s) => !seen.has(s.slug))];

  // Presence (viewers in the last 20s) and chat activity (last 10 min),
  // grouped client-side from two cheap queries. Missing tables degrade to 0s.
  const cutoffPresence = new Date(Date.now() - 20_000).toISOString();
  const cutoffChat = new Date(Date.now() - 10 * 60_000).toISOString();
  const [presence, chat] = await Promise.all([
    supabase.from("stream_presence").select("slug").gt("last_seen", cutoffPresence).limit(1000),
    supabase.from("chat_messages").select("slug").gt("created_at", cutoffChat).limit(1000),
  ]);
  const countBy = (rows: { slug: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.slug, (m.get(r.slug) ?? 0) + 1);
    return m;
  };
  const viewers = countBy(presence.data);
  const chats = countBy(chat.data);

  return streams.map((s: Stream) => ({
    slug: s.slug,
    title: s.title,
    isLive: Boolean(s.isLive),
    viewersNow: viewers.get(s.slug) ?? 0,
    chatLast10m: chats.get(s.slug) ?? 0,
    ratePerSecond: s.ratePerSecond,
  }));
}

export interface PatronDecision {
  action: "watch" | "skip";
  slug: string | null;
  rationale: string;
}

/**
 * Decide what (if anything) to pay for. Aliveness is a fact, not a judgment,
 * so it's computed deterministically: a stream with a viewer present or recent
 * chat is alive. If nothing is alive the patron declines without burning an
 * LLM call. When streams ARE alive, the LLM chooses which one deserves the
 * money (and may still decline). Falls back to a signal heuristic without a key.
 */
async function decide(candidates: Candidate[], balance: number): Promise<PatronDecision> {
  const alive = candidates.filter((c) => c.viewersNow > 0 || c.chatLast10m > 0);
  if (alive.length === 0) {
    return {
      action: "skip",
      slug: null,
      rationale: `I checked ${candidates.length} streams: no viewers present and no chat anywhere. Nothing deserves my money right now, keeping my $${balance.toFixed(2)}.`,
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  const baseUrl = process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1";
  // The decision needs reliable JSON + arithmetic over signals; use a stronger
  // model than the co-host's one-liner generator (still free on Groq).
  const model = process.env.PATRON_AI_MODEL ?? "llama-3.3-70b-versatile";

  const heuristic = (): PatronDecision => {
    const top = [...alive].sort(
      (a, b) => b.viewersNow - a.viewersNow || b.chatLast10m - a.chatLast10m,
    )[0];
    return {
      action: "watch",
      slug: top.slug,
      rationale: `Signals pick "${top.title}": ${top.viewersNow} watching now, ${top.chatLast10m} chat messages in 10m${top.isLive ? ", live" : ""}. Paying ${WATCH_SECONDS}s at $${top.ratePerSecond}/s from my own wallet.`,
    };
  };

  if (!apiKey) return heuristic();

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 160,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You are an autonomous AI patron with your own USDC wallet on the Arc blockchain. You support live-stream creators by paying them per second watched, from your own funds. You are shown only streams that currently have life (viewers present or recent chat). Pick the one most deserving of support and watch it; decline only if you have a concrete reason (for example your balance is nearly gone). Watching costs well under a cent. Reply ONLY with JSON: {"action": "watch"|"skip", "slug": string|null, "rationale": string}. The rationale is one sentence, first person, citing the actual numbers you used.',
          },
          {
            role: "user",
            content: `My wallet balance: $${balance.toFixed(4)} USDC. Watching costs ${WATCH_SECONDS} seconds x the stream's rate. Streams with life right now: ${JSON.stringify(alive)}. Decide.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return heuristic();
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "") as PatronDecision;
    if (parsed.action === "watch" && alive.some((c) => c.slug === parsed.slug)) {
      return { action: "watch", slug: parsed.slug, rationale: String(parsed.rationale).slice(0, 300) };
    }
    if (parsed.action === "skip") {
      return { action: "skip", slug: null, rationale: String(parsed.rationale).slice(0, 300) };
    }
    return heuristic();
  } catch {
    return heuristic();
  }
}

/** Sign a gasless EIP-3009 pay-the-treasury authorization from the patron's own wallet. */
async function signPatronAuthorization(amountUsd: number): Promise<{
  authorization: Authorization;
  signature: `0x${string}`;
}> {
  const account = privateKeyToAccount(PATRON_KEY);
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const message = {
    from: account.address,
    to: SELLER,
    value: BigInt(Math.round(amountUsd * 1e6)),
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce: toHex(nonceBytes),
  };
  const signature = await account.signTypedData({
    domain: { name: "USDC", version: "2", chainId: CHAIN_ID, verifyingContract: USDC },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message,
  });
  return {
    authorization: {
      from: message.from,
      to: message.to,
      value: message.value.toString(),
      validAfter: "0",
      validBefore: message.validBefore.toString(),
      nonce: message.nonce,
    },
    signature,
  };
}

export interface PatronCycleResult {
  ok: boolean;
  throttled?: boolean;
  action?: "watch" | "skip" | "stop";
  slug?: string | null;
  rationale?: string;
  paidUsd?: number;
  tx?: string | null;
  balance?: number;
  error?: string;
  /** What the patron saw when it decided — transparency for anyone poking the API. */
  candidates?: Candidate[];
}

/** One full autonomous cycle: look → decide → (maybe) pay → record. */
export async function runPatronCycle(): Promise<PatronCycleResult> {
  const address = patronAddress();
  if (!address) return { ok: false, error: "Patron wallet is not configured." };

  // Self-throttle off the last recorded decision.
  const last = await supabase
    .from("payment_events")
    .select("created_at, raw")
    .eq("endpoint", DECISION_ENDPOINT)
    .order("created_at", { ascending: false })
    .limit(1);
  const lastAt = last.data?.[0]?.created_at ? new Date(last.data[0].created_at).getTime() : 0;
  const lastAction = ((last.data?.[0]?.raw ?? {}) as { action?: string }).action;
  if (Date.now() - lastAt < MIN_CYCLE_GAP_MS) {
    return { ok: true, throttled: true };
  }

  const balance = await patronBalance(address);

  const record = async (
    action: "watch" | "skip" | "stop",
    slug: string | null,
    rationale: string,
    paidUsd: number,
    tx: string | null,
  ) => {
    // A quiet night is one fact, not hundreds of rows: consecutive skips are
    // recorded at most every 10 minutes. Watches and stops always record.
    if (action === "skip" && lastAction === "skip" && Date.now() - lastAt < 10 * 60_000) {
      return;
    }
    await supabase.from("payment_events").insert({
      endpoint: DECISION_ENDPOINT,
      payer: address,
      amount_usdc: "0",
      network: ARC_NETWORK,
      gateway_tx: null,
      raw: { action, slug, rationale, paidUsd, tx, balance: Number(balance.toFixed(4)) },
    });
  };

  if (balance < MIN_BALANCE_USD) {
    const rationale = `My wallet is down to $${balance.toFixed(4)} — I've spent my funds supporting creators. Stopping until I'm topped up.`;
    await record("stop", null, rationale, 0, null);
    return { ok: true, action: "stop", slug: null, rationale, balance };
  }

  const candidates = await gatherCandidates();
  const decision = await decide(candidates, balance);

  if (decision.action !== "watch" || !decision.slug) {
    await record("skip", null, decision.rationale, 0, null);
    return { ok: true, action: "skip", slug: null, rationale: decision.rationale, balance, candidates };
  }

  const chosen = candidates.find((c) => c.slug === decision.slug)!;
  const amount = Number((chosen.ratePerSecond * WATCH_SECONDS).toFixed(6));

  try {
    const { authorization, signature } = await signPatronAuthorization(amount);
    const tx = await relayTransferWithAuthorization(authorization, signature);
    // The payment itself, from the patron's own distinct wallet — real income
    // for the stream, counted by its treasury and settled to its payees.
    await supabase.from("payment_events").insert({
      endpoint: `/patron/${chosen.slug}`,
      payer: address,
      amount_usdc: String(amount),
      network: ARC_NETWORK,
      gateway_tx: tx,
      raw: { agentPatron: true, seconds: WATCH_SECONDS, rationale: decision.rationale },
    });
    await record("watch", chosen.slug, decision.rationale, amount, tx);
    return {
      ok: true,
      action: "watch",
      slug: chosen.slug,
      rationale: decision.rationale,
      paidUsd: amount,
      tx,
      balance: Number((balance - amount).toFixed(4)),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message, rationale: decision.rationale };
  }
}

export interface PatronStatus {
  address: string | null;
  balance: number;
  totalPaid: number;
  paymentCount: number;
  decisions: {
    at: string;
    action: string;
    slug: string | null;
    rationale: string;
    paidUsd: number;
    tx: string | null;
  }[];
}

/** Public status: who the patron is, what it holds, and its recent decisions. */
export async function getPatronStatus(): Promise<PatronStatus> {
  const address = patronAddress();
  const [paid, decisions, balance] = await Promise.all([
    supabase.from("payment_events").select("amount_usdc").like("endpoint", "/patron/%"),
    supabase
      .from("payment_events")
      .select("created_at, raw")
      .eq("endpoint", DECISION_ENDPOINT)
      .order("created_at", { ascending: false })
      .limit(8),
    address ? patronBalance(address).catch(() => 0) : Promise.resolve(0),
  ]);
  const rows = paid.data ?? [];
  return {
    address,
    balance,
    totalPaid: rows.reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0),
    paymentCount: rows.length,
    decisions: (decisions.data ?? []).map((d) => {
      const raw = (d.raw ?? {}) as {
        action?: string;
        slug?: string | null;
        rationale?: string;
        paidUsd?: number;
        tx?: string | null;
      };
      return {
        at: d.created_at as string,
        action: raw.action ?? "skip",
        slug: raw.slug ?? null,
        rationale: raw.rationale ?? "",
        paidUsd: raw.paidUsd ?? 0,
        tx: raw.tx ?? null,
      };
    }),
  };
}
