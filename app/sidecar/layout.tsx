import type { Metadata } from "next";

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Sidecar family",
  description: "Per-second pay for Owncast and Jellyfin streams you already run, settled in USDC on Arc.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
