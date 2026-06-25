import Link from "next/link";
import { Radio, ExternalLink, Clapperboard, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { naira } from "@/lib/currency";
import { getCreatorStreams, getWalletInfo } from "@/app/creator/actions";

export default async function StreamsPage() {
  const [streams, info] = await Promise.all([getCreatorStreams(), getWalletInfo()]);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">My streams</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Streams you&apos;ve created. Share a link and you get paid per second.
      </p>

      {info.address && (
        <Link
          href={`/c/${info.address}`}
          target="_blank"
          className="glass mt-4 flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm transition-colors hover:text-primary"
        >
          <UserRound className="size-4 text-primary" />
          <span className="font-medium">Your public profile</span>
          <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
            /c/{info.address.slice(0, 6)}…{info.address.slice(-4)}
          </span>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {streams.length === 0 ? (
        <div className="glass mt-6 rounded-2xl border border-border/60 p-8 text-center">
          <Clapperboard className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">You haven&apos;t created a stream yet.</p>
          <Link href="/studio/go-live" className="mt-4 inline-block">
            <Button>
              <Radio className="size-4" /> Go live
            </Button>
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {streams.map((s) => (
            <li
              key={s.slug}
              className="glass flex items-center justify-between rounded-xl border border-border/60 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{s.title}</span>
                  {s.isLive && (
                    <span className="inline-flex items-center gap-1 rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <span className="size-1 rounded-full bg-white animate-live" /> LIVE
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {s.drips.toLocaleString()} drips · {naira(s.streamed)} streamed
                </div>
              </div>
              <Link href={`/watch/${s.slug}`} target="_blank">
                <Button variant="outline" size="sm">
                  Open <ExternalLink className="size-3.5" />
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
