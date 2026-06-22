import "server-only";
import { AccessToken } from "livekit-server-sdk";

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const URL = process.env.LIVEKIT_URL;

/** Whether the LiveKit credentials are present (so the UI can degrade gracefully). */
export function livekitConfigured(): boolean {
  return !!(API_KEY && API_SECRET && URL);
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
