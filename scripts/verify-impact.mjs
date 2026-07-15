#!/usr/bin/env node
// Independently re-derives Driplet's headline traction numbers straight from
// the database and cross-checks them against the live /impact API — so
// anyone (judges included) can confirm the numbers aren't just self-reported.
// Uses only public, read-only credentials; no secrets required to run this.

const SUPABASE_URL = "https://zfkfufsimnjeoeuggomq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Wa_7_k7HVhQ5bZOgdQzk_A_37WZL6N9";
const IMPACT_URL = process.env.IMPACT_URL ?? "https://trydriplet.vercel.app/api/impact";

// Infrastructure wallets excluded from "distinct paying wallets" — the
// treasury, shared demo wallet, captions agent, and co-host fallback. These
// are public Arc addresses, not secrets; the live app excludes the same set.
const INFRA_WALLETS = new Set(
  [
    "0x8156f646a79cf7C97986298eEa8B5ed136426094", // SELLER (treasury)
    "0x0C63826eE08aF1f144ec5D84B6c56fe393fE19F5", // BUYER (shared demo wallet)
    "0x61c14fe51c3720b4d10798EE4608d161e992B172", // captions agent
    "0x3A0654529eF560bCfCFCD714a39ACdDfef878baE", // co-host fallback
  ].map((a) => a.toLowerCase()),
);
const isWallet = (a) => /^0x[0-9a-f]{40}$/.test(a);

async function supabaseSelect(path, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) throw new Error(`Supabase query failed (${res.status}): ${await res.text()}`);
  const contentRange = res.headers.get("content-range"); // "0-24/1234"
  const total = contentRange ? Number(contentRange.split("/")[1]) : null;
  const data = await res.json();
  return { data, count: total };
}

function check(label, expected, actual) {
  const pass = expected === actual;
  console.log(`${pass ? "✓" : "✗"} ${label}: live=${expected} independent=${actual}${pass ? "" : "  <-- MISMATCH"}`);
  return pass;
}

async function main() {
  console.log(`Fetching live numbers from ${IMPACT_URL} ...`);
  const live = await fetch(IMPACT_URL, { cache: "no-store" }).then((r) => r.json());

  console.log("\nRe-deriving each number independently from Supabase (public anon key)...\n");

  // 1. Watch payments — count rows, don't trust the API's arithmetic.
  const { count: watchCount } = await supabaseSelect("payment_events", {
    select: "id",
    endpoint: "like./watch/*",
    limit: "1",
  });

  // 2. Agent payments.
  const { count: agentCount } = await supabaseSelect("payment_events", {
    select: "id",
    endpoint: "eq./agents/captions",
    limit: "1",
  });

  // 3. Distinct paying wallets (own-pay, Face ID, email onboarding), minus infra.
  const { data: walletRows } = await supabaseSelect("payment_events", {
    select: "payer",
    or: "(endpoint.like./own/*,endpoint.like./passkey/*,endpoint.like./email/*)",
    limit: "10000",
  });
  const uniqueWallets = new Set(
    walletRows.map((r) => (r.payer ?? "").toLowerCase()).filter((a) => isWallet(a) && !INFRA_WALLETS.has(a)),
  ).size;

  // 4. Distinct creators — dedupe the "Creator" payee address across all streams.
  const { data: streamRows } = await supabaseSelect("streams", { select: "split", limit: "1000" });
  const uniqueCreators = new Set(
    streamRows
      .flatMap((r) => (Array.isArray(r.split) ? r.split : []))
      .filter((p) => p?.role === "Creator")
      .map((p) => (p.address ?? "").toLowerCase())
      .filter((a) => isWallet(a)),
  ).size;

  const results = [
    check("watchCount", live.watchCount, watchCount),
    check("agentCount", live.agentCount, agentCount),
    check("uniqueWallets", live.uniqueWallets, uniqueWallets),
    check("uniqueCreators", live.uniqueCreators, uniqueCreators),
  ];

  // 5. Internal consistency: derive the per-unit rate from the live totals
  // instead of hardcoding it a second time, and sanity-check it's a small,
  // stable, sub-cent constant rather than trusting the multiplication blindly.
  const derivedRate = live.totalStreamed / live.watchCount;
  const derivedAgentPrice = live.agentPaid / live.agentCount;
  const rateSane = derivedRate > 0 && derivedRate < 0.01;
  const agentPriceSane = derivedAgentPrice > 0 && derivedAgentPrice < 0.1;
  console.log(
    `${rateSane ? "✓" : "✗"} totalStreamed / watchCount = $${derivedRate.toFixed(6)}/sec (sane sub-cent rate)`,
  );
  console.log(
    `${agentPriceSane ? "✓" : "✗"} agentPaid / agentCount = $${derivedAgentPrice.toFixed(6)}/call (sane sub-dollar price)`,
  );
  results.push(rateSane, agentPriceSane);

  const allPass = results.every(Boolean);
  console.log(`\n${allPass ? "VERIFIED ✓" : "MISMATCH ✗"} — ${results.filter(Boolean).length}/${results.length} checks passed.`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("Verification failed to run:", e.message || e);
  process.exit(1);
});
