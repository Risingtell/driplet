/**
 * Simulate Jellyfin's webhook plugin firing against the Driplet Jellyfin
 * sidecar, to prove per-minute VOD settlement end-to-end without standing up
 * a full Jellyfin server.
 *
 * Fires PlaybackStart at position 0, then two PlaybackProgress events that
 * advance the position forward (settling each delta), then PlaybackStop —
 * plus one deliberate pause (a Progress event with an unchanged position,
 * which should settle nothing) to prove pausing isn't billed.
 *
 * Usage:
 *   node scripts/simulate-jellyfin.mjs [minutesWatched] [stream-slug] [base-url]
 *
 * Examples:
 *   node scripts/simulate-jellyfin.mjs                       # 2 min on ada-live, prod
 *   node scripts/simulate-jellyfin.mjs 5 ada-live http://localhost:3000
 */

const minutesWatched = Number(process.argv[2] ?? 2);
const slug = process.argv[3] ?? "ada-live";
const base = (process.argv[4] ?? "https://trydriplet.vercel.app").replace(/\/$/, "");
const key = process.env.JELLYFIN_SIDECAR_SECRET ?? process.env.OWNCAST_SIDECAR_SECRET;

const qs = new URLSearchParams({ stream: slug });
if (key) qs.set("key", key);
const url = `${base}/api/sidecar/jellyfin?${qs.toString()}`;

const viewerId = `sim-${Math.random().toString(36).slice(2, 9)}`;
const TICKS_PER_SECOND = 10_000_000;
const ticksFor = (seconds) => Math.round(seconds * TICKS_PER_SECOND);

function send(type, positionTicks) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, viewerId, itemId: "sim-item", positionTicks }),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
}

function report(label, res) {
  console.log(`${label}:`, res.status, JSON.stringify(res.json));
  if (res.json?.settled?.length) {
    for (const s of res.json.settled) {
      console.log(`    ${s.ok ? "✓" : "✗"} ${s.name} (${s.role}) — $${s.amount} → ${s.address}`);
    }
  }
}

console.log(`→ ${url}`);
console.log(`→ viewer ${viewerId} plays ${minutesWatched} min, pauses, then stops\n`);

const halfSeconds = (minutesWatched * 60) / 2;

report("PlaybackStart   ", await send("PlaybackStart", 0));
report("PlaybackProgress", await send("PlaybackProgress", ticksFor(halfSeconds)));
report("PlaybackProgress (paused, same position — should settle 0)", await send("PlaybackProgress", ticksFor(halfSeconds)));
report("PlaybackStop    ", await send("PlaybackStop", ticksFor(halfSeconds * 2)));
