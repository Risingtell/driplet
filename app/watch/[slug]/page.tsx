import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveStream, creatorAddress } from "@/lib/streams-db";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import type { Stream } from "@/lib/streams";
import { SiteHeader } from "@/components/site-header";
import { WatchMeter } from "@/components/watch/watch-meter";
import { TreasuryPanel } from "@/components/watch/treasury-panel";
import { LiveChat } from "@/components/chat/live-chat";

export default function WatchPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-5">
      <SiteHeader />

      <Suspense fallback={<WatchSkeleton />}>
        <WatchContent params={params} />
      </Suspense>

      <p className="py-6 text-center text-xs text-muted-foreground">
        Live testnet demo — payments settle in real USDC on Arc, shown in ₦ for convenience.
      </p>
    </main>
  );
}

/** True when the signed-in creator is the owner of this stream (so we don't
 *  meter them for watching their own content). */
async function viewerOwnsStream(stream: Stream): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await adminClient()
      .from("creators")
      .select("address")
      .eq("user_id", user.id)
      .maybeSingle();
    const addr = data?.address?.toLowerCase();
    if (!addr) return false;
    return stream.split.some((p) => (p.address ?? "").toLowerCase() === addr);
  } catch {
    return false;
  }
}

async function WatchContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stream = await resolveStream(slug);
  if (!stream) notFound();
  const isOwner = await viewerOwnsStream(stream);
  const addr = creatorAddress(stream);

  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* main column: title, player, treasury */}
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{stream.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            with{" "}
            {addr ? (
              <Link href={`/c/${addr}`} className="text-foreground hover:text-primary">
                {stream.creator}
              </Link>
            ) : (
              stream.creator
            )}{" "}
            · {stream.location}
          </p>
        </div>
        <WatchMeter stream={stream} isOwner={isOwner} />
        <TreasuryPanel stream={stream} />
      </div>

      {/* side column: chat (sticky + full height on desktop) */}
      <aside className="lg:sticky lg:top-5 lg:self-start">
        <div className="lg:h-[calc(100vh-7.5rem)]">
          <LiveChat slug={stream.slug} />
        </div>
      </aside>
    </div>
  );
}

function WatchSkeleton() {
  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="glass aspect-video w-full animate-pulse rounded-2xl" />
      </div>
      <div className="glass hidden min-h-[20rem] animate-pulse rounded-2xl lg:block" />
    </div>
  );
}
