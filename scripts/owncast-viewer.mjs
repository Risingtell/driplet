/**
 * Drive a REAL Owncast viewer session, so Owncast itself fires the
 * USER_JOINED / USER_PARTED webhooks at the Driplet sidecar.
 *
 * It registers a fresh chat user against a running Owncast instance and opens
 * the chat websocket (which is exactly what a browser viewer does). Owncast
 * emits USER_JOINED on connect and USER_PARTED on disconnect. Unlike
 * simulate-owncast.mjs, nothing here talks to Driplet — the webhooks come from
 * the real Owncast server.
 *
 * Usage:
 *   node scripts/owncast-viewer.mjs [seconds] [owncast-base]
 * Example:
 *   node scripts/owncast-viewer.mjs 15 http://localhost:8080
 */
import WebSocket from "ws";

const seconds = Number(process.argv[2] ?? 15);
const base = (process.argv[3] ?? "http://localhost:8080").replace(/\/$/, "");

const reg = await fetch(`${base}/api/chat/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ displayName: `viewer-${Math.random().toString(36).slice(2, 7)}` }),
}).then((r) => r.json());

if (!reg?.accessToken) {
  console.error("Could not register a chat user with Owncast:", reg);
  process.exit(1);
}
console.log(`registered ${reg.displayName} (${reg.id})`);

const wsUrl = `${base.replace(/^http/, "ws")}/ws?accessToken=${reg.accessToken}`;
const ws = new WebSocket(wsUrl);

ws.on("open", () => {
  console.log(`→ connected to Owncast chat — USER_JOINED should fire now. Watching ${seconds}s…`);
  setTimeout(() => {
    console.log("→ disconnecting — USER_PARTED should fire now.");
    ws.close();
  }, seconds * 1000);
});
ws.on("error", (e) => console.error("ws error:", e.message));
ws.on("close", () => {
  console.log("closed. Check the sidecar / /impact for the settlement.");
  process.exit(0);
});
