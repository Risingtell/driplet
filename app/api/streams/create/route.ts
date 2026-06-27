import { NextRequest, NextResponse } from "next/server";
import { createStream } from "@/lib/streams-db";
import { slugify, type Payee } from "@/lib/streams";
import { registerStreamOnChain } from "@/lib/stream-registry";

// Creating a stream now also records its metadata on Arc.
export const maxDuration = 60;

const RATE_PER_SECOND = 0.0003; // fixed denomination for v1
const isAddress = (a: unknown): a is string =>
  typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);

interface Body {
  title?: string;
  creator?: string;
  location?: string;
  videoUrl?: string;
  isLive?: boolean;
  hostAddress?: string;
  cohostName?: string;
  cohostAddress?: string;
  agentAddress?: string;
}

/**
 * Create a creator stream. The host's connected wallet is the creator payout
 * address; a co-host and the AI captions agent are optional payees. Returns the
 * shareable slug. Splits default to 70/20/10 (host/co-host/agent), or 90/10
 * (host/agent) when there is no co-host.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const title = (body.title ?? "").trim();
  const creator = (body.creator ?? "").trim();
  const videoUrl = (body.videoUrl ?? "").trim();
  const isLive = !!body.isLive;

  if (!title || !creator) {
    return NextResponse.json(
      { error: "title and creator are required" },
      { status: 400 },
    );
  }
  if (!isAddress(body.hostAddress)) {
    return NextResponse.json(
      { error: "Connect a wallet — a valid host payout address is required" },
      { status: 400 },
    );
  }
  // A recorded stream needs a video URL; a live stream broadcasts the camera instead.
  if (!isLive) {
    if (!videoUrl) {
      return NextResponse.json(
        { error: "Add a video URL, or choose to go live with your camera" },
        { status: 400 },
      );
    }
    if (!/^https?:\/\//.test(videoUrl)) {
      return NextResponse.json({ error: "videoUrl must be an http(s) URL" }, { status: 400 });
    }
  }

  const hasCohost = isAddress(body.cohostAddress);
  const agentAddress = isAddress(body.agentAddress)
    ? body.agentAddress
    : process.env.CAPTIONS_AGENT_ADDRESS;

  const split: Payee[] = [
    {
      name: creator,
      role: "Creator",
      share: hasCohost ? 0.7 : 0.9,
      address: body.hostAddress,
    },
  ];
  if (hasCohost) {
    split.push({
      name: (body.cohostName ?? "Co-host").trim() || "Co-host",
      role: "Co-host",
      share: 0.2,
      address: body.cohostAddress,
    });
  }
  split.push({
    name: "AI co-host",
    role: "Commentary",
    share: 0.1,
    ...(agentAddress ? { address: agentAddress } : {}),
  });

  // Generate a slug; retry once on the unlikely collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = slugify(title);
    try {
      const stream = await createStream({
        slug,
        title,
        creator,
        location: (body.location ?? "").trim(),
        videoUrl: isLive ? "" : videoUrl,
        isLive,
        ratePerSecond: RATE_PER_SECOND,
        split,
      });
      // Record the stream's metadata on Arc (files stay on Walrus). The blob id
      // is in the video URL for uploaded videos; live camera streams have none.
      const blobId = (videoUrl.match(/\/api\/video\/([A-Za-z0-9_-]+)/)?.[1]) ?? "";
      const onchainTx = await registerStreamOnChain(stream.slug, blobId, creator, title).catch(
        () => null,
      );
      return NextResponse.json({
        ok: true,
        slug: stream.slug,
        watchUrl: `/watch/${stream.slug}`,
        onchainTx,
      });
    } catch (e) {
      if (attempt === 2) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ error: "could not create stream" }, { status: 500 });
}
