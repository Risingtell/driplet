import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Viewer-presence session store for the Owncast sidecar. Owncast fires
 * `USER_JOINED` and `USER_PARTED` as separate webhook requests (possibly to
 * different serverless instances), so we persist the join time in the database
 * and compute presence as a server-authoritative `now - joined_at` on part.
 *
 * Requires supabase/owncast_sidecar_setup.sql. If that table doesn't exist yet,
 * the store degrades to a per-instance in-memory map so a quick demo still works
 * (single warm instance) — but the DB is the correct, durable path.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const memory = new Map<string, number>(); // `${slug}:${viewerId}` -> joinedAt ms
const key = (slug: string, viewerId: string) => `${slug}:${viewerId}`;

/** A duration longer than this is treated as a stuck session and ignored. */
const MAX_SESSION_SECONDS = 6 * 60 * 60; // 6 hours

function isMissingTable(message: string): boolean {
  return /owncast_sessions/.test(message) && /(does not exist|not find|schema cache)/i.test(message);
}

/** Record that a viewer joined a stream (resets the clock on a re-join). */
export async function openSession(slug: string, viewerId: string): Promise<void> {
  const { error } = await supabase
    .from("owncast_sessions")
    .upsert(
      { stream_slug: slug, viewer_id: viewerId, joined_at: new Date().toISOString() },
      { onConflict: "stream_slug,viewer_id" },
    );
  if (error) {
    if (isMissingTable(error.message)) {
      memory.set(key(slug, viewerId), Date.now());
      return;
    }
    throw new Error(error.message);
  }
}

/**
 * Close a viewer's session and return the seconds they were present, or null if
 * there was no open session (e.g. a part with no matching join). Durations above
 * MAX_SESSION_SECONDS are clamped.
 */
export async function closeSession(slug: string, viewerId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("owncast_sessions")
    .select("joined_at")
    .eq("stream_slug", slug)
    .eq("viewer_id", viewerId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) {
      const joinedAt = memory.get(key(slug, viewerId));
      if (joinedAt === undefined) return null;
      memory.delete(key(slug, viewerId));
      return clampSeconds((Date.now() - joinedAt) / 1000);
    }
    throw new Error(error.message);
  }
  if (!data) return null;

  await supabase
    .from("owncast_sessions")
    .delete()
    .eq("stream_slug", slug)
    .eq("viewer_id", viewerId);

  const joinedMs = new Date(data.joined_at as string).getTime();
  return clampSeconds((Date.now() - joinedMs) / 1000);
}

function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(Math.round(seconds), MAX_SESSION_SECONDS);
}
