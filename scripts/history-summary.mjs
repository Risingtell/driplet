// The /impact arithmetic (app/api/impact/route.ts), applied to archived rows,
// so the testnet archive can be re-derived offline with the exact same rules.

const RATE_PER_SECOND = 0.0003;
const AGENT_PRICE = 0.005;
const AGENT_ENDPOINT = "/agents/captions";

// Testnet infrastructure wallets, excluded from "distinct paying wallets":
// treasury, shared demo wallet, captions agent, co-host fallback.
export const TESTNET_INFRA_WALLETS = new Set(
  [
    "0x8156f646a79cf7C97986298eEa8B5ed136426094", // SELLER (treasury)
    "0x0C63826eE08aF1f144ec5D84B6c56fe393fE19F5", // BUYER (shared demo wallet)
    "0x61c14fe51c3720b4d10798EE4608d161e992B172", // captions agent
    "0x3A0654529eF560bCfCFCD714a39ACdDfef878baE", // co-host fallback
  ].map((a) => a.toLowerCase()),
);

const isWallet = (a) => /^0x[0-9a-f]{40}$/.test(a);
const round = (n) => Math.round(n * 1e6) / 1e6;

export function summarize(payments, streams) {
  const watchCount = payments.filter((r) => r.endpoint.startsWith("/watch/")).length;
  const agentCount = payments.filter((r) => r.endpoint === AGENT_ENDPOINT).length;
  const ownPayers = payments
    .filter((r) => /^\/(own|passkey|email)\//.test(r.endpoint))
    .map((r) => (r.payer ?? "").toLowerCase())
    .filter((a) => isWallet(a) && !TESTNET_INFRA_WALLETS.has(a));
  const creators = streams
    .flatMap((s) => (Array.isArray(s.split) ? s.split : []))
    .filter((p) => p?.role === "Creator")
    .map((p) => (p.address ?? "").toLowerCase())
    .filter(isWallet);
  return {
    watchCount,
    totalStreamed: round(watchCount * RATE_PER_SECOND),
    minutesStreamed: round(watchCount / 60),
    agentCount,
    agentPaid: round(agentCount * AGENT_PRICE),
    uniqueWallets: new Set(ownPayers).size,
    uniqueCreators: new Set(creators).size,
  };
}
