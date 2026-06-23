import Link from "next/link";
import { Radio, Wallet, Clapperboard, Droplet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWalletInfo, getCreatorStreams } from "@/app/creator/actions";

export default async function OverviewPage() {
  const [info, streams] = await Promise.all([getWalletInfo(), getCreatorStreams()]);
  const totalDrips = streams.reduce((s, x) => s + x.drips, 0);
  const totalStreamed = streams.reduce((s, x) => s + x.streamed, 0);

  const stats = [
    { label: "Wallet balance", value: `$${(info.balance ?? 0).toFixed(4)}`, icon: Wallet },
    { label: "Total streamed", value: `$${totalStreamed.toFixed(4)}`, icon: Droplet },
    { label: "Drips", value: totalDrips.toLocaleString(), icon: Droplet },
    { label: "Streams", value: String(streams.length), icon: Clapperboard },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your earnings and streams at a glance.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-xl border border-border/60 p-4">
            <s.icon className="size-4 text-muted-foreground" />
            <div className="text-gradient mt-2 font-mono text-xl font-semibold tabular">
              {s.value}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="glass drip-glow mt-6 flex flex-col items-start gap-3 rounded-2xl border border-border/60 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Ready to earn?</h2>
          <p className="text-sm text-muted-foreground">
            Go live with your camera or post a video. Viewers pay you per second.
          </p>
        </div>
        <Link href="/studio/go-live">
          <Button>
            <Radio className="size-4" /> Go live
          </Button>
        </Link>
      </div>
    </div>
  );
}
