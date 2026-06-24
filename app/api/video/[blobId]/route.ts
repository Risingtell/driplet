import { NextRequest, NextResponse } from "next/server";
import { WALRUS_AGGREGATOR } from "@/lib/walrus";

// Streams a (possibly large) video blob through from Walrus.
export const maxDuration = 60;

const ALLOWED_CT = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

/**
 * Content-type shim for Walrus blobs. The Walrus aggregator serves raw bytes
 * with no Content-Type and `nosniff`, so a <video> element won't reliably play
 * a blob URL directly. This route fetches the blob from the aggregator
 * (forwarding Range requests so seeking still works) and re-serves it with the
 * correct video content-type. The bytes still live on Walrus — this is just a
 * thin shim.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ blobId: string }> }) {
  const { blobId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(blobId)) {
    return NextResponse.json({ error: "bad blob id" }, { status: 400 });
  }

  const ctParam = req.nextUrl.searchParams.get("ct") ?? "video/mp4";
  const contentType = ALLOWED_CT.has(ctParam) ? ctParam : "video/mp4";

  const range = req.headers.get("range");
  const upstream = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`, {
    headers: range ? { range } : {},
    cache: "no-store",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `blob not available (${upstream.status})` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=3600");
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("content-range", cr);

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
