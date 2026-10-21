import { ImageResponse } from "next/og";
import { resolveStream } from "@/lib/streams-db";
import { DripletMark, OG_BACKGROUND } from "@/components/brand/og-parts";

// What a stream link shows when a creator shares it: the stream itself, not
// just the site, so people can see whose stream it is before they tap.
export const alt = "A stream on Driplet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stream = await resolveStream(slug).catch(() => null);

  const title = clip(stream?.title ?? "Watch on Driplet", 42);
  const byline = stream
    ? clip([stream.creator, stream.location].filter(Boolean).join(" · "), 60)
    : "Creators paid by the second";
  const kind = stream?.isLive ? "Live stream" : "Recorded stream";
  const rate = stream ? `$${stream.ratePerSecond}/sec` : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: OG_BACKGROUND,
          color: "#e8f7f9",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <DripletMark px={60} />
            <span style={{ fontSize: 40, fontWeight: 700 }}>Driplet</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 22px",
              borderRadius: 999,
              border: "2px solid rgba(34, 211, 238, 0.45)",
              color: "#22d3ee",
              fontSize: 28,
            }}
          >
            <div style={{ width: 14, height: 14, borderRadius: 999, background: "#22d3ee" }} />
            {kind}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            {title}
          </div>
          <div style={{ marginTop: 22, fontSize: 40, color: "#a3bcc3" }}>
            {stream ? `with ${byline}` : byline}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#7da0a8" }}>
          <span>Pay by the second in USDC{rate ? `, ${rate}` : ""}</span>
          <span>Stop watching, stop paying</span>
        </div>
      </div>
    ),
    size,
  );
}
