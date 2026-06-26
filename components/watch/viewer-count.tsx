"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

// Heartbeat cadence. Must be comfortably under the server's presence window so
// a still-watching viewer is never counted as gone.
const BEAT_MS = 8000;

/** A stable-per-tab id so refreshes don't inflate the count. */
function viewerId(): string {
  const key = "driplet_viewer_id";
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

/**
 * Shows how many people are watching this stream right now. Sends a presence
 * heartbeat every few seconds and reads back the live count. Stays hidden until
 * there's at least one viewer (and if the presence table isn't set up yet).
 */
export function ViewerCount({ slug }: { slug: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const id = viewerId();

    const beat = async () => {
      try {
        const r = await fetch(`/api/watch/${slug}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ viewerId: id }),
        });
        const j = (await r.json()) as { count?: number };
        if (alive) setCount(j.count ?? 0);
      } catch {
        /* presence is best-effort, never block the page */
      }
    };

    beat();
    const t = setInterval(beat, BEAT_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [slug]);

  if (count < 1) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
      <Eye className="size-3.5 text-primary" />
      <span className="tabular font-medium text-foreground">{count}</span>
      watching now
    </span>
  );
}
