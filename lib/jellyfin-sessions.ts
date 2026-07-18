import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Per-viewer playback-position tracker for the Jellyfin sidecar. Unlike
 * Owncast's live join/part (where wall-clock time between the two events IS
 * the watched time), Jellyfin is on-demand video: a viewer can pause, seek, or
 * rewind, so wall-clock elapsed time is not a safe proxy for seconds watched.
 * Instead we track the viewer's actual `PlaybackPositionTicks` and settle only
 * forward movement of that position between consecutive webhook events —
 * paused time settles nothing, and a rewind resets the baseline rather than
 * billing a negative delta.
 *
 * Requires supabase/jellyfin_sidecar_setup.sql. If that table doesn't exist
 * yet, the store degrades to a per-instance in-memory map so a quick demo
 * still works (single warm instance) — same fallback pattern as
 * lib/owncast-sessions.ts.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const memory = new Map<string, number>(); // `${slug}:${viewerId}` -> last known position ticks
const key = (slug: string, viewerId: string) => `${slug}:${viewerId}`;

// Jellyfin ticks are 100-nanosecond units: 10,000,000 ticks per second.
const TICKS_PER_SECOND = 10_000_000;
// Clamp one event's delta so a missed webhook or a forward seek can't be
// settled as if it were watched in full (mirrors Owncast's session clamp).
const MAX_DELTA_SECONDS = 30 * 60;

function isMissingTable(message: string): boolean {
  return /jellyfin_sessions/.test(message) && /(does not exist|not find|schema cache)/i.test(message);
}

function deltaSeconds(lastTicks: number | undefined, positionTicks: number): number {
  if (lastTicks === undefined) return 0; // first sighting for this viewer, nothing to settle yet
  const deltaTicks = positionTicks - lastTicks;
  if (deltaTicks <= 0) return 0; // paused, seeked backward, or replayed — don't bill it
  return Math.min(deltaTicks / TICKS_PER_SECOND, MAX_DELTA_SECONDS);
}

/**
 * Hard-reset a viewer's tracked position (PlaybackStart). Always overwrites
 * rather than diffing, so a stale row left over from a crashed prior session
 * (Stop never arrived) can't be settled as one huge jump.
 */
export async function resetPosition(
  slug: string,
  viewerId: string,
  positionTicks: number,
): Promise<void> {
  const { error } = await supabase
    .from("jellyfin_sessions")
    .upsert(
      {
        stream_slug: slug,
        viewer_id: viewerId,
        position_ticks: positionTicks,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stream_slug,viewer_id" },
    );
  if (error) {
    if (isMissingTable(error.message)) {
      memory.set(key(slug, viewerId), positionTicks);
      return;
    }
    throw new Error(error.message);
  }
}

/**
 * Advance a viewer's tracked position (PlaybackProgress) and return the
 * watched seconds since the last known position. Leaves the session open.
 */
export async function advancePosition(
  slug: string,
  viewerId: string,
  positionTicks: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("jellyfin_sessions")
    .select("position_ticks")
    .eq("stream_slug", slug)
    .eq("viewer_id", viewerId)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) {
      const last = memory.get(key(slug, viewerId));
      memory.set(key(slug, viewerId), positionTicks);
      return deltaSeconds(last, positionTicks);
    }
    throw new Error(error.message);
  }

  const last = data ? Number(data.position_ticks) : undefined;
  await resetPosition(slug, viewerId, positionTicks);
  return deltaSeconds(last, positionTicks);
}

/**
 * Settle the final delta and end a viewer's session (PlaybackStop) so the
 * next PlaybackStart begins from a clean baseline.
 */
export async function closePosition(
  slug: string,
  viewerId: string,
  positionTicks: number,
): Promise<number> {
  const seconds = await advancePosition(slug, viewerId, positionTicks);
  const { error } = await supabase
    .from("jellyfin_sessions")
    .delete()
    .eq("stream_slug", slug)
    .eq("viewer_id", viewerId);
  if (error && !isMissingTable(error.message)) throw new Error(error.message);
  memory.delete(key(slug, viewerId));
  return seconds;
}
