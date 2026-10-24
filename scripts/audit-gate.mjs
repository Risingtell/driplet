#!/usr/bin/env node
// Fails on any high or critical advisory, except the few listed below, each
// with the reason it cannot be fixed yet. Arguments go straight to `npm audit`
// (e.g. --omit=dev). Remove an entry as soon as a fixed version can be used.
import { spawnSync } from "node:child_process";

const SKIPPED = {
  // zod < 4.6.6 can run out of memory on a huge array. Fixed only in zod 4;
  // Circle's SDKs, @x402 and web3 all still require zod 3, so no version of
  // this app can avoid it until they move.
  "GHSA-mrhx-c7xc-m3w5": "zod 3 is required by Circle, @x402 and web3; fixed only in zod 4",
};

const run = spawnSync("npm", ["audit", "--json", ...process.argv.slice(2)], {
  encoding: "utf8",
  shell: process.platform === "win32",
  maxBuffer: 64 * 1024 * 1024,
});
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error("npm audit gave no JSON:\n" + run.stdout + run.stderr);
  process.exit(2);
}

const found = new Map();
for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of entry.via) {
    if (typeof via === "string" || !["high", "critical"].includes(via.severity)) continue;
    const id = via.url.split("/").pop();
    found.set(id, { id, name, severity: via.severity, title: via.title, url: via.url });
  }
}

const blocking = [...found.values()].filter((a) => !SKIPPED[a.id]);
for (const a of found.values()) {
  if (SKIPPED[a.id]) console.log(`skipped  ${a.severity} ${a.name}: ${a.title} (${a.id}): ${SKIPPED[a.id]}`);
}
for (const a of blocking) console.log(`BLOCKING ${a.severity} ${a.name}: ${a.title} ${a.url}`);
console.log(`${blocking.length} blocking, ${found.size - blocking.length} skipped`);
process.exit(blocking.length ? 1 : 0);
