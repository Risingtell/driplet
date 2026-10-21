import type { Metadata } from "next";

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Live proof",
  description: "Every payment on Driplet, live: what viewers prepaid, what creators were paid and what went back to viewers, settled in USDC on Arc.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
