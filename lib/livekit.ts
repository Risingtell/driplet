import "server-only";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const URL = process.env.LIVEKIT_URL;

/** Whether the LiveKit credentials are present (so the UI can degrade gracefully). */
export function livekitConfigured(): boolean {
  return !!(API_KEY && API_SECRET && URL);
}

let roomService: RoomServiceClient | null = null;
function svc(): RoomServiceClient | null {
  if (!API_KEY || !API_SECRET || !URL) return null;
  // RoomServiceClient wants the HTTP(S) origin, not the wss:// one.
  if (!roomService) roomService = new RoomServiceClient(URL.replace(/^ws/, "http"), API_KEY, API_SECRET);
  return roomService;
}

/**
 * Whether a host is *actually* on air in this room right now (a publisher with
 * at least one live track). Lets the UI show a truthful LIVE badge instead of
 * implying a live-type stream is on when the creator has gone offline.
 */
export async function isHostBroadcasting(room: string): Promise<boolean> {
  const s = svc();
  if (!s) return false;
  try {
    const participants = await s.listParticipants(room);
    return participants.some((p) => p.identity.startsWith("host-") && p.tracks.length > 0);
  } catch {
    // Room doesn't exist (never opened) → nobody is broadcasting.
    return false;
  }
}

export function livekitUrl(): string | undefined {
  return URL;
}

/**
 * Mint a LiveKit access token for a room (= stream slug). The host can publish
 * their camera; viewers can only subscribe. Tokens are short-lived.
 */
export async function createLiveKitToken(opts: {
  room: string;
  identity: string;
  canPublish: boolean;
}): Promise<string> {
  if (!API_KEY || !API_SECRET) throw new Error("LiveKit is not configured.");
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: opts.identity,
    ttl: "2h",
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: opts.canPublish,
    canSubscribe: true,
    canPublishData: opts.canPublish,
  });
  return at.toJwt();
}
