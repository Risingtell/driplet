import { ImageResponse } from "next/og";
import { DripletMark, OG_BACKGROUND } from "@/components/brand/og-parts";

// The picture a Driplet link shows when it's pasted into WhatsApp, X or
// Telegram. Watch pages have their own (app/watch/[slug]/opengraph-image.tsx).
export const alt = "Driplet | Get paid by the second";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <DripletMark px={68} />
          <span style={{ fontSize: 44, fontWeight: 700 }}>Driplet</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
            Get paid
          </div>
          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: -3,
              color: "#22d3ee",
            }}
          >
            by the second.
          </div>
          <div style={{ marginTop: 30, fontSize: 34, lineHeight: 1.35, color: "#a3bcc3", maxWidth: 940 }}>
            Viewers pay creators in USDC for every second they watch. No subscriptions, no bank.
            Settled on Arc.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#7da0a8" }}>
          <span>trydriplet.vercel.app</span>
          <span>Stop watching, stop paying</span>
        </div>
      </div>
    ),
    size,
  );
}
