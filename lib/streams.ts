/**
 * Demo stream catalog. Each stream is its own economic entity: incoming
 * per-second drips are attributed to it and split, in real time, across its
 * payees (creator, collaborators, and the AI services it runs).
 *
 * In production this would live in the database with on-chain payout addresses
 * per payee; for now one seeded stream proves the model.
 */
export interface Payee {
  name: string;
  role: string;
  /** Share of every incoming drip, 0–1. Shares must sum to 1. */
  share: number;
}

export interface Stream {
  slug: string;
  title: string;
  creator: string;
  location: string;
  ratePerSecond: number; // USDC charged per second watched
  videoUrl: string; // the live feed shown in the player (swap for a real creator clip later)
  split: Payee[];
}

export const streams: Stream[] = [
  {
    slug: "ada-live",
    title: "Live design workshop",
    creator: "Ada",
    location: "Kano, Nigeria",
    ratePerSecond: 0.0003,
    videoUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    split: [
      { name: "Ada", role: "Creator", share: 0.7 },
      { name: "Bode", role: "Co-host", share: 0.2 },
      { name: "AI Captions", role: "Live captions agent", share: 0.1 },
    ],
  },
];

export function getStream(slug: string): Stream | null {
  return streams.find((s) => s.slug === slug) ?? null;
}

/** Stable endpoint label used to attribute settled payments to a stream. */
export function streamEndpoint(slug: string): string {
  return `/watch/${slug}`;
}
