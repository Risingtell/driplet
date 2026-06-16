/**
 * Demo stream catalog. In production each stream would live in the database and
 * carry its own payout address + collaborator splits; for now one seeded stream
 * is enough to prove the pay-per-second experience.
 */
export interface Stream {
  slug: string;
  title: string;
  creator: string;
  location: string;
  ratePerSecond: number; // USDC charged per second watched
}

export const streams: Stream[] = [
  {
    slug: "ada-live",
    title: "Live design workshop",
    creator: "Ada",
    location: "Kano, Nigeria",
    ratePerSecond: 0.0003,
  },
];

export function getStream(slug: string): Stream | null {
  return streams.find((s) => s.slug === slug) ?? null;
}
