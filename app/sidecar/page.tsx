"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Coins, Hash, Plug, Webhook } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackToTop } from "@/components/back-to-top";

interface SidecarStats {
  settlementCount: number;
  totalSettled: number;
}

function useSidecarStats(endpoint: string): SidecarStats | null {
  const [stats, setStats] = useState<SidecarStats | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        const json = (await res.json()) as SidecarStats;
        if (alive) setStats(json);
      } catch {
        /* ignore, retry on next tick */
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [endpoint]);

  return stats;
}

function StatsRow({ stats }: { stats: SidecarStats | null }) {
  return (
    <section className="grid grid-cols-2 gap-3">
      <div className="glass rounded-2xl border border-border/60 p-5">
        <Coins className="h-5 w-5 text-muted-foreground" />
        <div className="mt-3 text-2xl font-bold tabular-nums">
          {stats ? `$${stats.totalSettled.toFixed(4)}` : "—"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Settled via this sidecar</div>
      </div>
      <div className="glass rounded-2xl border border-border/60 p-5">
        <Hash className="h-5 w-5 text-muted-foreground" />
        <div className="mt-3 text-2xl font-bold tabular-nums">
          {stats ? stats.settlementCount.toLocaleString() : "—"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Sidecar settlements</div>
      </div>
    </section>
  );
}

export default function SidecarPage() {
  const owncastStats = useSidecarStats("/api/sidecar/owncast");
  const jellyfinStats = useSidecarStats("/api/sidecar/jellyfin");

  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col px-5">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="py-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-4 py-1.5 text-sm font-medium text-emerald-500">
          <Plug className="h-4 w-4" /> The sidecar family
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
          Per-second pay for streams you <span className="text-gradient">already run</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Driplet&apos;s settlement core doesn&apos;t need Driplet&apos;s own player. Each sidecar
          listens to a platform&apos;s own webhooks and settles watch time in USDC on Arc, with no
          change to the platform itself.
        </p>
      </section>

      <section className="glass rounded-2xl border border-border/60 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Webhook className="h-5 w-5 text-emerald-500" /> Owncast — per-second live
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Owncast is open-source, self-hosted live streaming. It fires a webhook the moment a
          viewer joins and again when they leave. The sidecar measures exactly how long each
          viewer was present and settles{" "}
          <span className="font-medium text-foreground">seconds&nbsp;×&nbsp;rate</span> to the
          streamer, second by second.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          In your Owncast admin, add a webhook for the <code>USER_JOINED</code> and{" "}
          <code>USER_PARTED</code> events pointing at:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border/60 bg-background p-3 text-xs">
          <code>POST https://trydriplet.vercel.app/api/sidecar/owncast?stream=&lt;your-slug&gt;</code>
        </pre>
        <div className="mt-4">
          <StatsRow stats={owncastStats} />
        </div>
      </section>

      <section className="glass mt-6 rounded-2xl border border-border/60 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Webhook className="h-5 w-5 text-emerald-500" /> Jellyfin — per-minute VOD
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Jellyfin is open-source, self-hosted on-demand video. On-demand means a viewer can pause
          or seek, so the sidecar tracks each viewer&apos;s actual <em>playback position</em>{" "}
          rather than wall-clock time — pausing settles nothing, only the seconds genuinely played
          forward do.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Install Jellyfin&apos;s community <strong>Webhook</strong> plugin, add a generic
          destination for the Playback Start / Progress / Stop notifications pointing at:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border/60 bg-background p-3 text-xs">
          <code>POST https://trydriplet.vercel.app/api/sidecar/jellyfin?stream=&lt;your-slug&gt;</code>
        </pre>
        <p className="mt-3 text-sm text-muted-foreground">with this webhook body template:</p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border/60 bg-background p-3 text-xs">
          <code>{`{
  "type": "{{NotificationType}}",
  "viewerId": "{{UserId}}",
  "itemId": "{{ItemId}}",
  "positionTicks": {{PlaybackPositionTicks}}
}`}</code>
        </pre>
        <div className="mt-4">
          <StatsRow stats={jellyfinStats} />
        </div>
      </section>

      <p className="mb-16 mt-6 text-center text-sm text-muted-foreground">
        Same settlement core both times — no fork, no proxy in the video path, the operator
        installs it at the deployment layer. Watch settlements land in real time on the{" "}
        <Link href="/impact" className="text-emerald-500 hover:underline">
          live proof feed
        </Link>
        .
      </p>
      <BackToTop />
    </main>
  );
}
