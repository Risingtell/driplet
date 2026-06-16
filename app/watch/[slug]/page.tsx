import Link from "next/link";
import { notFound } from "next/navigation";
import { getStream } from "@/lib/streams";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { WatchMeter } from "@/components/watch/watch-meter";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stream = getStream(slug);
  if (!stream) notFound();

  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-5">
      <header className="flex items-center justify-between py-6">
        <Link href="/">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <div className="py-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {stream.title}
        </h1>
        <p className="mt-1 text-muted-foreground">
          with {stream.creator} · {stream.location}
        </p>
      </div>

      <WatchMeter stream={stream} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        This is a live testnet demo — payments settle in real USDC on Arc.
      </p>
    </main>
  );
}
