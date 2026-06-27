import { Suspense } from "react";
import { connection } from "next/server";
import { listStreams, creatorAddress } from "@/lib/streams-db";
import { isHostBroadcasting } from "@/lib/livekit";
import { SiteHeader } from "@/components/site-header";
import { BackToTop } from "@/components/back-to-top";
import { ExploreList, type ExploreItem } from "@/components/explore/explore-list";

export default function ExplorePage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-5">
      <SiteHeader />
      <section className="py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Explore streams</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find creators to watch and save. Press play and pay by the second.
        </p>
        <div className="mt-6">
          <Suspense
            fallback={<div className="py-10 text-sm text-muted-foreground">Loading streams…</div>}
          >
            <ExploreContent />
          </Suspense>
        </div>
      </section>
      <BackToTop />
    </main>
  );
}

async function ExploreContent() {
  // Live status must reflect the moment of the request, never build time.
  await connection();
  const streams = await listStreams();
  const items: ExploreItem[] = await Promise.all(
    streams.map(async (s) => ({
      slug: s.slug,
      title: s.title,
      creator: s.creator,
      location: s.location,
      isLive: s.isLive,
      // "broadcasting" = a host is on air right now (only meaningful for live
      // streams). A live-type stream whose creator is offline shows as Offline.
      broadcasting: s.isLive ? await isHostBroadcasting(s.slug) : false,
      address: creatorAddress(s),
    })),
  );
  return <ExploreList items={items} />;
}
