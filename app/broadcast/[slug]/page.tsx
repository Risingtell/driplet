import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveStream } from "@/lib/streams-db";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Broadcaster } from "@/components/broadcast/broadcaster";
import { LiveChat } from "@/components/chat/live-chat";

export default function BroadcastPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-5">
      <header className="flex items-center justify-between py-6">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-4">
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
            <Link href="/studio" className="transition-colors hover:text-foreground">
              Overview
            </Link>
            <Link href="/studio/streams" className="transition-colors hover:text-foreground">
              My streams
            </Link>
            <Link href="/studio/wallet" className="transition-colors hover:text-foreground">
              Wallet
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <Suspense
        fallback={<div className="py-10 text-sm text-muted-foreground">Loading your studio…</div>}
      >
        <BroadcastContent params={params} />
      </Suspense>
    </main>
  );
}

async function BroadcastContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stream = await resolveStream(slug);
  if (!stream) notFound();
  return (
    <div className="grid flex-1 gap-4 pb-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0">
        <Broadcaster slug={slug} title={stream.title} />
      </div>
      <aside className="lg:sticky lg:top-5 lg:self-start">
        <div className="lg:h-[calc(100vh-7.5rem)]">
          <LiveChat slug={slug} host />
        </div>
      </aside>
    </div>
  );
}
