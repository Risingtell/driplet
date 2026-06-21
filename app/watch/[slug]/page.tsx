import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveStream } from "@/lib/streams-db";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { WatchMeter } from "@/components/watch/watch-meter";
import { TreasuryPanel } from "@/components/watch/treasury-panel";
import { ConnectArc } from "@/components/wallet/connect-arc";

export default function WatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-5">
      <header className="flex items-center justify-between py-6">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <ConnectArc />
          <ThemeToggle />
        </div>
      </header>

      <Suspense fallback={<WatchSkeleton />}>
        <WatchContent params={params} />
      </Suspense>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        This is a live testnet demo — payments settle in real USDC on Arc.
      </p>
    </main>
  );
}

async function WatchContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stream = await resolveStream(slug);
  if (!stream) notFound();

  return (
    <>
      <div className="py-6">
        <h1 className="text-2xl font-semibold tracking-tight">{stream.title}</h1>
        <p className="mt-1 text-muted-foreground">
          with {stream.creator} · {stream.location}
        </p>
      </div>
      <WatchMeter stream={stream} />
      <TreasuryPanel stream={stream} />
    </>
  );
}

function WatchSkeleton() {
  return (
    <div className="py-6">
      <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
      <div className="mt-2 h-4 w-40 animate-pulse rounded-md bg-muted" />
      <div className="glass mt-6 aspect-video w-full animate-pulse rounded-2xl" />
    </div>
  );
}
