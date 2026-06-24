/**
 * Simulate Owncast's per-viewer webhooks against the Driplet sidecar, to prove
 * the per-second settlement end-to-end without standing up a full Owncast.
 *
 * Fires USER_JOINED, waits, then USER_PARTED — exactly the two events Owncast
 * emits — and prints the on-chain settlement the sidecar drives.
 *
 * Usage:
 *   node scripts/simulate-owncast.mjs [seconds] [stream-slug] [base-url]
 *
 * Examples:
 *   node scripts/simulate-owncast.mjs                       # 12s on ada-live, prod
 *   node scripts/simulate-owncast.mjs 30 ada-live http://localhost:3000
 */

const seconds = Number(process.argv[2] ?? 12);
const slug = process.argv[3] ?? "ada-live";
const base = (process.argv[4] ?? "https://trydriplet.vercel.app").replace(/\/$/, "");
const key = process.env.OWNCAST_SIDECAR_SECRET;

const qs = new URLSearchParams({ stream: slug });
if (key) qs.set("key", key);
const url = `${base}/api/sidecar/owncast?${qs.toString()}`;

const viewerId = `sim-${Math.random().toString(36).slice(2, 9)}`;

function send(type) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type,
      eventData: {
        user: { id: viewerId, displayName: "Simulated viewer" },
        timestamp: new Date().toISOString(),
      },
    }),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
}

console.log(`→ ${url}`);
console.log(`→ viewer ${viewerId} joins, watches ${seconds}s, then parts\n`);

const joined = await send("USER_JOINED");
console.log("USER_JOINED:", joined.status, JSON.stringify(joined.json));

await new Promise((r) => setTimeout(r, seconds * 1000));

const parted = await send("USER_PARTED");
console.log("USER_PARTED:", parted.status, JSON.stringify(parted.json, null, 2));

if (parted.json?.settled?.length) {
  console.log("\n✓ Settled per-second presence to:");
  for (const s of parted.json.settled) {
    console.log(`  ${s.ok ? "✓" : "✗"} ${s.name} (${s.role}) — $${s.amount} → ${s.address}`);
  }
} else {
  console.log("\n(no settlement — check the stream slug and that the treasury is funded)");
}
