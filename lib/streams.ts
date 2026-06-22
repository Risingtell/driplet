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
  /** Arc address this payee is paid out to (optional for in-code demo payees). */
  address?: string;
}

export interface Stream {
  slug: string;
  title: string;
  creator: string;
  location: string;
  ratePerSecond: number; // USDC charged per second watched
  videoUrl: string; // recorded clip URL shown in the player; "" for a real camera live stream
  isLive: boolean; // true = creator broadcasts their camera via LiveKit (room = slug)
  split: Payee[];
}

export const streams: Stream[] = [
  {
    slug: "ada-live",
    title: "Live design workshop",
    creator: "Ada",
    location: "Kano, Nigeria",
    ratePerSecond: 0.0003,
    videoUrl: "https://media.w3.org/2010/05/sintel/trailer.mp4",
    isLive: false,
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

/** Turn a stream title into a URL-safe slug with a short random suffix. */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "stream"}-${suffix}`;
}
