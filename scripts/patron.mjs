#!/usr/bin/env node
/**
 * Drive the AI patron: POST one autonomous cycle every ~30s against the live
 * app (or a local dev server). The route itself is publicly triggerable and
 * self-throttled — this script just keeps the heartbeat going so the patron's
 * decisions and payments accrue on /impact.
 *
 *   node scripts/patron.mjs                       # against https://trydriplet.vercel.app
 *   node scripts/patron.mjs http://localhost:3000 # against local dev
 */
const base = process.argv[2] ?? "https://trydriplet.vercel.app";
const url = `${base.replace(/\/$/, "")}/api/agents/patron`;

console.log(`AI patron heartbeat → ${url} (Ctrl+C to stop)`);

async function cycle() {
  try {
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(55_000) });
    const json = await res.json();
    const at = new Date().toISOString().slice(11, 19);
    if (json.throttled) {
      console.log(`[${at}] throttled (another cycle ran recently)`);
    } else if (json.action === "watch") {
      console.log(`[${at}] WATCH ${json.slug} · paid $${json.paidUsd} · ${json.tx}`);
      console.log(`         ${json.rationale}`);
    } else if (json.action) {
      console.log(`[${at}] ${json.action.toUpperCase()} · ${json.rationale}`);
    } else {
      console.log(`[${at}] error: ${json.error ?? res.status}`);
    }
  } catch (e) {
    console.log(`[cycle failed] ${e.message}`);
  }
}

await cycle();
setInterval(cycle, 30_000);
