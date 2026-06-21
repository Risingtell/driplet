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
  video_url: string;
  split: Payee[];
}

function rowToStream(r: StreamRow): Stream {
  return {
    slug: r.slug,
    title: r.title,
    creator: r.creator,
    location: r.location,
    ratePerSecond: Number(r.rate_per_second),
    videoUrl: r.video_url,
    split: r.split,
  };
}

/** Resolve a stream by slug: database first, then the in-code demo catalog. */
export async function resolveStream(slug: string): Promise<Stream | null> {
  const { data, error } = await supabase
    .from("streams")
    .select("slug, title, creator, location, rate_per_second, video_url, split")
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
      split: input.split,
    })
    .select("slug, title, creator, location, rate_per_second, video_url, split")
    .single();
  if (error) throw new Error(error.message);
  return rowToStream(data as StreamRow);
}
