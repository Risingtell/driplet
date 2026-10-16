#!/usr/bin/env node
// Re-derives the Lepton-era Arc testnet numbers from the archive in
// history/lepton-testnet/, offline, with the same rules /impact used, and
// checks the files are byte-for-byte what was exported (SHA-256).
// No network and no credentials needed: `npm run verify:history`.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { summarize } from "./history-summary.mjs";

const DIR = "history/lepton-testnet";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const summary = JSON.parse(readFileSync(`${DIR}/SUMMARY.json`, "utf8"));
const csv = gunzipSync(readFileSync(`${DIR}/payment_events.csv.gz`));
const streamsBuf = readFileSync(`${DIR}/streams.json`);

// Minimal CSV parse: cells are quoted only when they contain a comma, quote or newline.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n") row.push(cell), rows.push(row), (row = []), (cell = "");
    else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const payments = parseCsv(csv.toString("utf8"));
const streams = JSON.parse(streamsBuf.toString("utf8"));
const derived = summarize(payments, streams);

let pass = 0;
let total = 0;
function check(label, ok, detail) {
  total++;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `: ${detail}` : ""}`);
}

check("payment_events.csv SHA-256", sha256(csv) === summary.sha256["payment_events.csv"]);
check("streams.json SHA-256", sha256(streamsBuf) === summary.sha256["streams.json"]);
check("payment rows", payments.length === summary.rows.payment_events, String(payments.length));
check("stream rows", streams.length === summary.rows.streams, String(streams.length));
for (const [key, value] of Object.entries(summary.totals)) {
  check(key, derived[key] === value, `archived=${value} re-derived=${derived[key]}`);
}

console.log(
  `\n${pass === total ? "VERIFIED ✓" : "MISMATCH ✗"} ${pass}/${total} checks passed ` +
    `(${summary.firstPayment.slice(0, 10)} to ${summary.lastPayment.slice(0, 10)}, Arc testnet).`,
);
process.exit(pass === total ? 0 : 1);
