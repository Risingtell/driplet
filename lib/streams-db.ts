import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getStream, type Payee, type Stream } from "@/lib/streams";

/**
 * Database-backed streams. Creators "go live" by inserting a row here; the rest
 * of the app resolves a stream by slug from the DB first, falling back to the
 * in-code demo catalog (so ada-live keeps working even before any creator row
 * exists).
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface StreamRow {
  slug: string;
  title: string;
  creator: string;
  location: string;
  rate_per_second: number;
  video_url: string | null;
  is_live: boolean | null;
  split: Payee[];
}

function rowToStream(r: StreamRow): Stream {
  return {
    slug: r.slug,
    title: r.title,
    creator: r.creator,
    location: r.location,
    ratePerSecond: Number(r.rate_per_second),
    videoUrl: r.video_url ?? "",
    isLive: !!r.is_live,
    split: r.split,
  };
}

const STREAM_COLS = "slug, title, creator, location, rate_per_second, video_url, is_live, split";

/** List recent streams (newest first) for discovery + creator profiles. */
export async function listStreams(limit = 100): Promise<Stream[]> {
  const { data, error } = await supabase
    .from("streams")
    .select(STREAM_COLS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as StreamRow[]).map(rowToStream);
}

/** The creator's payout address for a stream, if any (their stable identity). */
export function creatorAddress(stream: Stream): string | null {
  const a = stream.split.find((p) => p.role === "Creator")?.address;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? a : null;
}

/** Resolve a stream by slug: database first, then the in-code demo catalog. */
export async function resolveStream(slug: string): Promise<Stream | null> {
  const { data, error } = await supabase
    .from("streams")
    .select(STREAM_COLS)
    .eq("slug", slug)
    .maybeSingle();
  if (!error && data) return rowToStream(data as StreamRow);
  return getStream(slug);
}

export interface NewStream {
  slug: string;
  title: string;
  creator: string;
  location: string;
  videoUrl: string;
  isLive: boolean;
  ratePerSecond: number;
  split: Payee[];
}

/** Insert a new creator stream. Throws on a slug collision or DB error. */
export async function createStream(input: NewStream): Promise<Stream> {
  const { data, error } = await supabase
    .from("streams")
    .insert({
      slug: input.slug,
      title: input.title,
      creator: input.creator,
      location: input.location,
      rate_per_second: input.ratePerSecond,
      video_url: input.videoUrl,
      is_live: input.isLive,
      split: input.split,
    })
    .select(STREAM_COLS)
    .single();
  if (error) throw new Error(error.message);
  return rowToStream(data as StreamRow);
}
