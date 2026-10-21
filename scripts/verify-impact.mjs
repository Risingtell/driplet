#!/usr/bin/env node
// Independently re-derives Driplet's headline traction numbers straight from
// the database and cross-checks them against the live /impact API — so
// anyone (judges included) can confirm the numbers aren't just self-reported.
// Uses only public, read-only credentials; no secrets required to run this.
// This checks the live Arc mainnet app. The Lepton-era testnet numbers are
// archived in history/lepton-testnet/ and checked offline by verify:history.

const SUPABASE_URL = "https://mpbuivmzoivtrqiznlix.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H0S603cmoZDuciWrREspdg_y1ktvxLx";
const IMPACT_URL = process.env.IMPACT_URL ?? "https://trydriplet.vercel.app/api/impact";

// Infrastructure wallets excluded from "distinct paying wallets": the
// treasury, shared demo wallet, captions agent, and co-host. These are public
// Arc mainnet addresses, not secrets; the live app excludes the same set.
const INFRA_WALLETS = new Set(
  [
    "0xfeeE02d5F26Bb80AB88802eB230D8b69044fA1B4", // SELLER (treasury)
    "0xcFeE2C55f3b3535f182df635AF94269a3Ece7D71", // BUYER (shared demo wallet)
    "0x68137887E2c9c44B884195AA0B20BFeD2AEAfa97", // captions agent
    "0x8360B5A0e9bb442a07709E146C82de60422570e8", // co-host
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

// Every matching row, paging past Supabase's 1000-rows-per-request cap.
async function allRows(path, params) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await supabaseSelect(path, { ...params, limit: "1000", offset: String(offset) });
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const sumUsd = (rows) => rows.reduce((s, r) => s + Number(r.amount_usdc ?? 0), 0);
// Dollar totals are sums of decimal strings; compare them to the micro-dollar.
const usd6 = (n) => Number(Number(n).toFixed(6));

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
  //    The same rows are the viewer prepays, so their sum is "prepaid by viewers".
  const walletRows = await allRows("payment_events", {
    select: "payer,amount_usdc",
    or: "(endpoint.like./own/*,endpoint.like./passkey/*,endpoint.like./email/*)",
    order: "id",
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

  // 5. Paid to creators: every payout the stream treasuries made to their human
  //    payees for seconds watched, sidecars included.
  const payoutRows = await allRows("payment_events", {
    select: "amount_usdc",
    endpoint: "like./payout/*",
    order: "id",
  });

  // 6. Payments settled: every row except bookkeeping (per-stream agent markers
  //    mirror a payment already counted; patron decisions move no money).
  const { count: settledCount } = await supabaseSelect("payment_events", {
    select: "id",
    and: "(endpoint.not.like./agents/captions/*,endpoint.not.like./agents/patron/*)",
    limit: "1",
  });

  const results = [
    check("watchCount", live.watchCount, watchCount),
    check("agentCount", live.agentCount, agentCount),
    check("uniqueWallets", live.uniqueWallets, uniqueWallets),
    check("uniqueCreators", live.uniqueCreators, uniqueCreators),
    check("prepaidUsd", usd6(live.prepaidUsd), usd6(sumUsd(walletRows))),
    check("prepayCount", live.prepayCount, walletRows.length),
    check("paidToCreatorsUsd", usd6(live.paidToCreatorsUsd), usd6(sumUsd(payoutRows))),
    check("payoutCount", live.payoutCount, payoutRows.length),
    check("settledCount", live.settledCount, settledCount),
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

  // Refunds live in a server-only table the public key can't read, so they
  // can't be re-derived here; check they're at least a sane non-negative sum.
  const refundSane = typeof live.refundedUsd === "number" && live.refundedUsd >= 0;
  console.log(`${refundSane ? "✓" : "✗"} refundedUsd = $${Number(live.refundedUsd).toFixed(4)} (non-negative)`);
  results.push(refundSane);

  const allPass = results.every(Boolean);
  console.log(`\n${allPass ? "VERIFIED ✓" : "MISMATCH ✗"} — ${results.filter(Boolean).length}/${results.length} checks passed.`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("Verification failed to run:", e.message || e);
  process.exit(1);
});
