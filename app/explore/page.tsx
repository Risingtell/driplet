import { Suspense } from "react";
import { listStreams, creatorAddress } from "@/lib/streams-db";
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
  const streams = await listStreams();
  const items: ExploreItem[] = streams.map((s) => ({
    slug: s.slug,
    title: s.title,
    creator: s.creator,
    location: s.location,
    isLive: s.isLive,
    address: creatorAddress(s),
  }));
  return <ExploreList items={items} />;
}
