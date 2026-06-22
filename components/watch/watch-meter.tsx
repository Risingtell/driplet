"use client";

import { useCallback, useRef, useState } from "react";
import { Play, Pause, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveVideo } from "@/components/watch/live-video";
import type { Stream } from "@/lib/streams";

type Status = "idle" | "connecting" | "streaming" | "retrying";

// How often (in paid seconds) the stream treasury pays the AI captions agent.
// Kept short so the autonomous agent-to-agent payment is visible in a demo.
const AGENT_PAY_EVERY = 20;

export function WatchMeter({ stream }: { stream: Stream }) {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [paid, setPaid] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const watchingRef = useRef(false);
  const tickCountRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loop = useCallback(async () => {
    if (!watchingRef.current) return;
    try {
      const r = await fetch("/api/watch/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: stream.slug }),
      });
      const j = await r.json();
      if (j.ok) {
        setPaid((p) => p + parseFloat(j.amount));
        setSeconds((s) => s + 1);
        setStatus("streaming");
        tickCountRef.current += 1;
        // Periodically, the treasury autonomously (a) pays the AI captions agent
        // and (b) splits the interval's income out to each human payee's own
        // wallet on Arc — money flows out, not just in.
        if (tickCountRef.current % AGENT_PAY_EVERY === 0) {
          fetch(`/api/watch/${stream.slug}/agent-pay`, { method: "POST" })
            .then((res) => res.json())
            .then((aj) => {
              if (aj?.caption) setCaption(aj.caption);
            })
            .catch(() => {});
          fetch(`/api/streams/${stream.slug}/settle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seconds: AGENT_PAY_EVERY }),
          }).catch(() => {});
        }
      } else {
        setStatus("retrying");
      }
    } catch {
      setStatus("retrying");
    }
    if (watchingRef.current) setTimeout(loop, 1000);
  }, [stream.slug]);

  const start = useCallback(() => {
    if (watchingRef.current) return;
    watchingRef.current = true;
    setStatus("connecting");
    videoRef.current?.play().catch(() => {});
    loop();
  }, [loop]);

  const stop = useCallback(() => {
    watchingRef.current = false;
    setStatus("idle");
    videoRef.current?.pause();
  }, []);

  const watching = status !== "idle";
  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;

  const statusLabel: Record<Status, string> = {
    idle: "Press play to start watching",
    connecting: "Connecting your stream…",
    streaming: "Paying the creator, live",
    retrying: "Reconnecting…",
  };

  return (
    <div className="glass drip-glow overflow-hidden rounded-2xl p-5 sm:p-6">
      {/* video surface */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {/* Live streams show the host's real camera (LiveKit); recorded streams
            autoplay the video file (Watch resumes + pays, Stop pauses it). */}
        {stream.isLive ? (
          <LiveVideo slug={stream.slug} />
        ) : (
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover"
            src={stream.videoUrl}
            autoPlay
            muted
            loop
            playsInline
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/40" />

        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-destructive/90 px-2 py-1 text-xs font-semibold text-white">
          <span className="size-1.5 rounded-full bg-white animate-live" />
          LIVE
        </div>
        <div className="absolute right-3 top-3 rounded-md bg-black/30 px-2 py-1 text-xs text-white/80 tabular">
          {mmss} watched
        </div>

        {watching && (
          <div className="pointer-events-none absolute inset-0">
            {[20, 42, 62, 82].map((left, i) => (
              <span
                key={left}
                className="animate-drip absolute top-1/3 block h-6 w-1 rounded-full bg-gradient-to-b from-primary/0 via-primary to-primary/0"
                style={{ left: `${left}%`, animationDelay: `${i * 0.55}s` }}
              />
            ))}
          </div>
        )}

        {watching && caption && (
          <div className="absolute inset-x-0 bottom-12 flex justify-center px-4">
            <span className="max-w-[90%] rounded-md bg-black/60 px-3 py-1 text-center text-sm text-white backdrop-blur">
              {caption}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 text-xs text-white/70">
          <Radio className="size-3.5 text-primary" />
          {stream.creator} · {stream.location}
        </div>

        {!watching && (
          <button
            onClick={start}
            aria-label="Play"
            className="absolute inset-0 grid place-items-center bg-black/30 transition-colors hover:bg-black/20"
          >
            <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground drip-glow">
              <Play className="size-7 translate-x-0.5 fill-current" />
            </span>
          </button>
        )}
      </div>

      {/* meter */}
      <div className="mt-5 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            You&apos;ve paid {stream.creator}
          </p>
          <p className="text-gradient tabular mt-1 font-mono text-4xl font-semibold leading-none">
            ${paid.toFixed(4)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Rate</p>
          <p className="tabular mt-1 font-mono text-sm text-foreground/80">
            ${stream.ratePerSecond.toFixed(4)}/sec
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={`size-2 rounded-full ${
              status === "streaming"
                ? "bg-primary animate-live"
                : status === "idle"
                  ? "bg-muted-foreground/40"
                  : "bg-amber-400"
            }`}
          />
          {statusLabel[status]}
        </span>
        {watching ? (
          <Button variant="outline" size="sm" onClick={stop}>
            <Pause className="size-4" /> Stop
          </Button>
        ) : (
          <Button size="sm" onClick={start}>
            <Play className="size-4" /> Watch
          </Button>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Every second is a real USDC nanopayment settled on Arc. Stop watching and
        you stop paying — instantly.
      </p>
    </div>
  );
}
