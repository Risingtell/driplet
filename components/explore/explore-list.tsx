"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clapperboard, Play, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBookmarks, type Bookmark } from "@/lib/bookmarks";

export interface ExploreItem {
  slug: string;
  title: string;
  creator: string;
  location: string;
  isLive: boolean;
  broadcasting: boolean;
  address: string | null;
}

export function ExploreList({ items }: { items: ExploreItem[] }) {
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<Bookmark[]>([]);

  useEffect(() => {
    setSaved(getBookmarks());
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(t) ||
        i.creator.toLowerCase().includes(t) ||
        i.location.toLowerCase().includes(t),
    );
  }, [q, items]);

  return (
    <div>
      {saved.length > 0 && (
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Star className="size-4 fill-current text-primary" /> Saved creators
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {saved.map((b) => (
              <Link
                key={b.address}
                href={`/c/${b.address}`}
                className="glass rounded-full border border-border/60 px-3 py-1.5 text-sm transition-colors hover:text-primary"
              >
                {b.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search streams or creators…"
          className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "No streams yet, be the first to go live." : "No matches."}
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <li key={i.slug} className="glass flex flex-col rounded-xl border border-border/60 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{i.title}</span>
                {i.broadcasting ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    <span className="size-1 rounded-full bg-white animate-live" /> LIVE
                  </span>
                ) : i.isLive ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <span className="size-1 rounded-full bg-muted-foreground/50" /> Offline
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Clapperboard className="size-3" /> Recorded
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {i.address ? (
                  <Link href={`/c/${i.address}`} className="hover:text-primary">
                    {i.creator}
                  </Link>
                ) : (
                  i.creator
                )}
                {i.location ? ` · ${i.location}` : ""}
              </div>
              <Link href={`/watch/${i.slug}`} className="mt-3">
                <Button size="sm" variant="outline" className="w-full">
                  <Play className="size-3.5" />{" "}
                  {i.broadcasting ? "Watch live" : i.isLive ? "Open" : "Re-watch"}
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
