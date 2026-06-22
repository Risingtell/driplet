import { NextRequest, NextResponse } from "next/server";
import { createLiveKitToken, livekitConfigured, livekitUrl } from "@/lib/livekit";

/**
 * Issue a LiveKit token so a host can broadcast (canPublish) or a viewer can
 * watch (subscribe only) a stream's room. The room name is the stream slug.
 *
 * NOTE: this currently trusts the caller's role. Once Google sign-in is in,
 * host tokens will be gated to the authenticated stream owner.
 */
export async function POST(req: NextRequest) {
  if (!livekitConfigured()) {
    return NextResponse.json(
      { error: "Live video isn't configured yet." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    room?: string;
    role?: "host" | "viewer";
    identity?: string;
  };

  const room = (body.room ?? "").trim();
  if (!room) {
    return NextResponse.json({ error: "room is required" }, { status: 400 });
  }

  const isHost = body.role === "host";
  const identity =
    (body.identity ?? "").trim() ||
    `${isHost ? "host" : "viewer"}-${Math.random().toString(36).slice(2, 9)}`;

  try {
    const token = await createLiveKitToken({ room, identity, canPublish: isHost });
    return NextResponse.json({ token, url: livekitUrl(), identity });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
