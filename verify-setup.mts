// One-off setup verifier: checks Supabase tables + on-chain USDC balances on Arc testnet.
import { createPublicClient, http, formatUnits, erc20Abi } from "viem";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ARC_RPC = "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000" as const;

function ok(s: string) { console.log(`\x1b[32m✓\x1b[0m ${s}`); }
function bad(s: string) { console.log(`\x1b[31m✗\x1b[0m ${s}`); }

// 1) Supabase tables
for (const table of ["payment_events", "withdrawals"]) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: { apikey: SB_SECRET, Authorization: `Bearer ${SB_SECRET}` },
    });
    if (r.ok) ok(`Supabase table "${table}" exists and is reachable`);
    else bad(`Supabase table "${table}" -> HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  } catch (e) {
    bad(`Supabase "${table}" error: ${(e as Error).message}`);
  }
}

// 2) On-chain USDC balances
const client = createPublicClient({ transport: http(ARC_RPC) });
for (const [label, addr] of [
  ["BUYER (funder)", process.env.BUYER_ADDRESS],
  ["SELLER (payout)", process.env.SELLER_ADDRESS],
] as const) {
  try {
    const bal = await client.readContract({
      address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [addr as `0x${string}`],
    });
    const human = formatUnits(bal as bigint, 6);
    if (Number(human) > 0) ok(`${label} ${addr} -> ${human} USDC`);
    else bad(`${label} ${addr} -> 0 USDC (needs faucet funding)`);
  } catch (e) {
    bad(`${label} balance error: ${(e as Error).message}`);
  }
}
