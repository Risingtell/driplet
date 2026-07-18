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
 * Every read-then-write here uses optimistic concurrency control (a
 * conditional update/delete keyed on the exact row we just read): if two
 * webhook deliveries for the same viewer race, only one can win the write,
 * the other retries against the now-current row instead of both settling the
 * same interval.
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

interface MemSession {
  positionTicks: number;
  totalSeconds: number;
}
const memory = new Map<string, MemSession>(); // `${slug}:${viewerId}` -> session state
const key = (slug: string, viewerId: string) => `${slug}:${viewerId}`;

// Jellyfin ticks are 100-nanosecond units: 10,000,000 ticks per second.
const TICKS_PER_SECOND = 10_000_000;
// Clamp one event's delta so a missed webhook or a forward seek can't be
// settled as if it were watched in full (mirrors Owncast's session clamp).
const MAX_DELTA_SECONDS = 30 * 60;
// Caps one continuous session's TOTAL billable seconds. Owncast applies its
// equivalent cap once, at close, to a single wall-clock duration; Jellyfin
// bills incrementally on every Progress event, so this clamps the running
// total instead — without it, a session that's never Stopped could settle
// unboundedly many 30-minute-capped deltas over an arbitrarily long session.
const MAX_SESSION_SECONDS = 6 * 60 * 60;
const CAS_RETRIES = 3;

function isMissingTable(message: string): boolean {
  return /jellyfin_sessions/.test(message) && /(does not exist|not find|schema cache)/i.test(message);
}

function isDuplicateKey(error: { code?: string; message: string }): boolean {
  return error.code === "23505" || /duplicate key/i.test(error.message);
}

/** Watched seconds for a forward position move, clamped to MAX_DELTA_SECONDS. */
function rawDelta(lastTicks: number, positionTicks: number): number {
  const deltaTicks = positionTicks - lastTicks;
  if (deltaTicks <= 0) return 0; // paused, seeked backward, or replayed — don't bill it
  return Math.min(deltaTicks / TICKS_PER_SECOND, MAX_DELTA_SECONDS);
}

/**
 * Hard-reset a viewer's tracked position and session budget (PlaybackStart).
 * Always overwrites rather than diffing, so a stale row left over from a
 * crashed prior session (Stop never arrived) can't be settled as one huge
 * jump, and the MAX_SESSION_SECONDS budget starts fresh.
 */
export async function resetPosition(
  slug: string,
  viewerId: string,
  positionTicks: number,
): Promise<void> {
  const { error } = await supabase.from("jellyfin_sessions").upsert(
    {
      stream_slug: slug,
      viewer_id: viewerId,
      position_ticks: positionTicks,
      total_seconds: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stream_slug,viewer_id" },
  );
  if (error) {
    if (isMissingTable(error.message)) {
      memory.set(key(slug, viewerId), { positionTicks, totalSeconds: 0 });
      return;
    }
    throw new Error(error.message);
  }
}

function advanceInMemory(slug: string, viewerId: string, positionTicks: number): number {
  const k = key(slug, viewerId);
  const prev = memory.get(k);
  const delta = prev
    ? Math.min(rawDelta(prev.positionTicks, positionTicks), Math.max(0, MAX_SESSION_SECONDS - prev.totalSeconds))
    : 0;
  memory.set(k, { positionTicks, totalSeconds: (prev?.totalSeconds ?? 0) + delta });
  return delta;
}

/**
 * Advance a viewer's tracked position (PlaybackProgress) and return the
 * watched seconds since the last known position, clamped so this session's
 * running total never exceeds MAX_SESSION_SECONDS. Leaves the session open.
 */
export async function advancePosition(
  slug: string,
  viewerId: string,
  positionTicks: number,
): Promise<number> {
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from("jellyfin_sessions")
      .select("position_ticks, total_seconds")
      .eq("stream_slug", slug)
      .eq("viewer_id", viewerId)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error.message)) return advanceInMemory(slug, viewerId, positionTicks);
      throw new Error(error.message);
    }

    if (!data) {
      // First sighting for this viewer (no PlaybackStart was seen) — create
      // the baseline; nothing to settle yet.
      const { error: insertError } = await supabase
        .from("jellyfin_sessions")
        .insert({ stream_slug: slug, viewer_id: viewerId, position_ticks: positionTicks });
      if (!insertError) return 0;
      if (!isDuplicateKey(insertError)) throw new Error(insertError.message);
      continue; // someone else just created it concurrently — retry and diff against their row
    }

    const lastTicks = Number(data.position_ticks);
    const lastTotal = Number(data.total_seconds);
    const remaining = Math.max(0, MAX_SESSION_SECONDS - lastTotal);
    const delta = Math.min(rawDelta(lastTicks, positionTicks), remaining);

    const { data: updated, error: updateError } = await supabase
      .from("jellyfin_sessions")
      .update({
        position_ticks: positionTicks,
        total_seconds: lastTotal + delta,
        updated_at: new Date().toISOString(),
      })
      .eq("stream_slug", slug)
      .eq("viewer_id", viewerId)
      .eq("position_ticks", lastTicks) // optimistic lock: only writes if nobody raced us
      .select("position_ticks")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (updated) return delta; // we won the race
    // someone else advanced this session between our read and write — retry
  }
  return 0; // exhausted retries under heavy contention; safer to under- than double-bill
}

/**
 * Settle the final delta and end a viewer's session (PlaybackStop) so the
 * next PlaybackStart begins from a clean baseline. Costs at most one SELECT
 * plus one DELETE — never writes a row it's about to delete.
 */
export async function closePosition(
  slug: string,
  viewerId: string,
  positionTicks: number,
): Promise<number> {
  for (let attempt = 0; attempt < CAS_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from("jellyfin_sessions")
      .select("position_ticks, total_seconds")
      .eq("stream_slug", slug)
      .eq("viewer_id", viewerId)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error.message)) {
        const k = key(slug, viewerId);
        const prev = memory.get(k);
        memory.delete(k);
        if (!prev) return 0;
        return Math.min(rawDelta(prev.positionTicks, positionTicks), Math.max(0, MAX_SESSION_SECONDS - prev.totalSeconds));
      }
      throw new Error(error.message);
    }
    if (!data) return 0; // no open session to close

    const lastTicks = Number(data.position_ticks);
    const lastTotal = Number(data.total_seconds);
    const remaining = Math.max(0, MAX_SESSION_SECONDS - lastTotal);
    const delta = Math.min(rawDelta(lastTicks, positionTicks), remaining);

    const { data: deleted, error: deleteError } = await supabase
      .from("jellyfin_sessions")
      .delete()
      .eq("stream_slug", slug)
      .eq("viewer_id", viewerId)
      .eq("position_ticks", lastTicks) // optimistic lock
      .select("position_ticks")
      .maybeSingle();

    if (deleteError) throw new Error(deleteError.message);
    if (deleted) return delta; // we won the race; row is gone
    // someone else changed this session between our read and delete — retry
  }
  return 0;
}
