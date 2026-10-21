import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Clapperboard, Play, Radio } from "lucide-react";
import { listStreams, creatorAddress } from "@/lib/streams-db";
import { isHostBroadcasting } from "@/lib/livekit";
import { SiteHeader } from "@/components/site-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { BackToTop } from "@/components/back-to-top";
import { SaveCreatorButton } from "@/components/save-creator-button";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const mine = (await listStreams()).filter(
    (s) => (creatorAddress(s) ?? "").toLowerCase() === address.toLowerCase(),
  );
  const name = mine[0]?.creator || "Creator";
  return {
    title: name,
    description: `Watch ${name} on Driplet and pay by the second in USDC.`,
  };
}

export default function CreatorProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-5">
      <SiteHeader />
      <Suspense fallback={<div className="py-10 text-sm text-muted-foreground">Loading…</div>}>
        <ProfileContent params={params} />
      </Suspense>
      <LandingFooter />
      <BackToTop />
    </main>
  );
}

async function ProfileContent({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  // Live status must reflect the moment of the request, never build time.
  await connection();
  const all = await listStreams();
  const mine = all.filter((s) => (creatorAddress(s) ?? "").toLowerCase() === address.toLowerCase());
  if (mine.length === 0) notFound();
  // Same rule as Explore: a live-type stream is only LIVE while its host is
  // actually on air. Otherwise it showed LIVE, and "Watch live" opened a stream
  // that was waiting for its host.
  const onAir = await Promise.all(mine.map((s) => (s.isLive ? isHostBroadcasting(s.slug) : false)));

  const name = mine[0].creator || "Creator";
  const location = mine[0].location;

  return (
    <div className="py-6">
      <div className="glass drip-glow flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary ring-1 ring-primary/20">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="text-sm text-muted-foreground">
              {location ? `${location} · ` : ""}
              {mine.length} stream{mine.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <SaveCreatorButton address={address} name={name} />
      </div>

      <h2 className="mt-8 text-lg font-semibold">Streams</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Save {name} above to come back and re-watch anytime.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mine.map((s, i) => (
          <li key={s.slug} className="glass flex flex-col rounded-xl border border-border/60 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{s.title}</span>
              {onAir[i] ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <span className="size-1 rounded-full bg-white animate-live" /> LIVE
                </span>
              ) : s.isLive ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <span className="size-1 rounded-full bg-muted-foreground/50" /> Offline
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Clapperboard className="size-3" /> Recorded
                </span>
              )}
            </div>
            <Link href={`/watch/${s.slug}`} className="mt-3">
              <Button size="sm" variant="outline" className="w-full">
                <Play className="size-3.5" /> {onAir[i] ? "Watch live" : s.isLive ? "Open" : "Re-watch"}
              </Button>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Radio className="size-4 text-primary" /> Are you a creator too?{" "}
        <Link href="/studio/go-live" className="text-primary hover:underline">
          Go live
        </Link>
      </div>
    </div>
  );
}
