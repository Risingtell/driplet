#!/usr/bin/env node
// Archives the Lepton-era Arc testnet ledger into history/lepton-testnet/ so the
// record outlives the testnet database. Reads only with the public publishable
// key, i.e. exactly what anyone could already read, and writes:
//   payment_events.csv.gz  every settlement row (no raw payloads)
//   streams.json           every stream and its payout split
//   SUMMARY.json           headline numbers, row counts and file hashes
// Run once: node scripts/export-testnet-history.mjs
// Check any time after, offline: npm run verify:history

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { summarize } from "./history-summary.mjs";

const SUPABASE_URL = "https://zfkfufsimnjeoeuggomq.supabase.co";
const SUPABASE_KEY = "sb_publishable_Wa_7_k7HVhQ5bZOgdQzk_A_37WZL6N9";
const OUT = "history/lepton-testnet";
const PAGE = 1000;
const COLUMNS = ["id", "created_at", "endpoint", "payer", "amount_usdc", "network", "gateway_tx"];

async function selectAll(table, select, order) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=${order}`;
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok) throw new Error(`${table} failed (${res.status}): ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    const total = Number(res.headers.get("content-range")?.split("/")[1]);
    process.stdout.write(`\r${table}: ${rows.length}/${total}`);
    if (page.length < PAGE || rows.length >= total) break;
  }
  process.stdout.write("\n");
  return rows;
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const payments = await selectAll("payment_events", COLUMNS.join(","), "created_at.asc,id.asc");
const streams = await selectAll(
  "streams",
  "slug,title,creator,location,rate_per_second,video_url,split,created_at",
  "created_at.asc,slug.asc",
);

const csv = [COLUMNS.join(","), ...payments.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
const csvGz = gzipSync(Buffer.from(csv, "utf8"), { level: 9, mtime: 0 });
const streamsJson = Buffer.from(JSON.stringify(streams, null, 2) + "\n", "utf8");

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/payment_events.csv.gz`, csvGz);
writeFileSync(`${OUT}/streams.json`, streamsJson);

const summary = {
  source: `${SUPABASE_URL} (Driplet's Arc testnet database, chain eip155:5042002)`,
  exportedAt: new Date().toISOString(),
  firstPayment: payments[0]?.created_at ?? null,
  lastPayment: payments.at(-1)?.created_at ?? null,
  rows: { payment_events: payments.length, streams: streams.length },
  totals: summarize(payments, streams),
  sha256: {
    "payment_events.csv": sha256(Buffer.from(csv, "utf8")),
    "streams.json": sha256(streamsJson),
  },
};
writeFileSync(`${OUT}/SUMMARY.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary.totals, null, 2));
