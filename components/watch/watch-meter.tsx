"use client";

import { useCallback, useRef, useState } from "react";
import { Play, Pause, Radio, Maximize, Volume2, VolumeX, Bot, Wallet, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveVideo } from "@/components/watch/live-video";
import { naira } from "@/lib/currency";
import { connectArcWallet, shortAddress } from "@/lib/arc-chain";
import { signWatchAuthorization, getUsdcBalance } from "@/lib/own-wallet";
import type { Stream } from "@/lib/streams";

type Status = "idle" | "connecting" | "streaming" | "retrying" | "waiting";

// How often (in paid seconds) the stream treasury pays the AI captions agent.
// Kept short so the autonomous agent-to-agent payment is visible in a demo.
const AGENT_PAY_EVERY = 20;

export function WatchMeter({ stream, isOwner = false }: { stream: Stream; isOwner?: boolean }) {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [paid, setPaid] = useState(0);
  const [agentFlash, setAgentFlash] = useState(false);
  const [muted, setMuted] = useState(true);
  const watchingRef = useRef(false);
  const tickCountRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const goFullscreen = useCallback(() => {
    surfaceRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, []);
  // For live streams, only charge while the host is actually broadcasting.
  const hostLiveRef = useRef(false);
  const setHostLive = useCallback((live: boolean) => {
    hostLiveRef.current = live;
  }, []);

  // Own-wallet mode: the viewer prepays a session from their own wallet (one
  // gasless signature, relayed on-chain) and the meter draws it down per second.
  const [payMode, setPayMode] = useState<"demo" | "own">("demo");
  const [ownAddress, setOwnAddress] = useState<string | null>(null);
  const [ownBudget, setOwnBudget] = useState(0);
  const [ownErr, setOwnErr] = useState<string | null>(null);
  const [ownBusy, setOwnBusy] = useState(false);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [needTopup, setNeedTopup] = useState(false);
  const payModeRef = useRef<"demo" | "own">("demo");
  const ownBudgetRef = useRef(0);

  const useMyWallet = useCallback(async () => {
    setOwnErr(null);
    setOwnBusy(true);
    try {
      const addr = await connectArcWallet();
      const bal = await getUsdcBalance(addr);
      if (bal < 0.01) {
        setOwnErr("This wallet has no testnet USDC. Get some free at faucet.circle.com, then try again.");
        return;
      }
      const info = (await fetch(`/api/watch/${stream.slug}/own-pay`).then((r) => r.json())) as {
        payTo: string;
      };
      const budget = Math.min(0.05, Math.max(0.005, bal - 0.001));
      const { authorization, signature } = await signWatchAuthorization(addr, info.payTo, budget);
      const res = await fetch(`/api/watch/${stream.slug}/own-pay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authorization, signature }),
      });
      const j = (await res.json()) as { ok?: boolean; tx?: string; amount?: number; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Payment failed");
      setOwnAddress(addr);
      ownBudgetRef.current = j.amount ?? budget;
      setOwnBudget(ownBudgetRef.current);
      setLastTx(j.tx ?? null);
      setNeedTopup(false);
      payModeRef.current = "own";
      setPayMode("own");
    } catch (e) {
      const msg = (e as Error).message || "Could not pay from your wallet";
      // A user rejecting the signature in their wallet isn't an error worth shouting about.
      setOwnErr(/reject|denied|user/i.test(msg) ? "Signature cancelled." : msg);
    } finally {
      setOwnBusy(false);
    }
  }, [stream.slug]);

  const loop = useCallback(async () => {
    if (!watchingRef.current) return;
    // Don't charge a live stream until the host's camera is actually on air.
    if (stream.isLive && !hostLiveRef.current) {
      setStatus("waiting");
      if (watchingRef.current) setTimeout(loop, 1000);
      return;
    }
    // Own-wallet mode: draw down the prepaid session locally (the on-chain
    // payment already happened when the viewer signed). No per-second server call.
    if (payModeRef.current === "own") {
      if (ownBudgetRef.current < stream.ratePerSecond) {
        watchingRef.current = false;
        setStatus("idle");
        setNeedTopup(true);
        return;
      }
      ownBudgetRef.current -= stream.ratePerSecond;
      setOwnBudget(ownBudgetRef.current);
      setPaid((p) => p + stream.ratePerSecond);
      setSeconds((s) => s + 1);
      setStatus("streaming");
      if (watchingRef.current) setTimeout(loop, 1000);
      return;
    }
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
              if (aj?.ok) {
                setAgentFlash(true);
                setTimeout(() => setAgentFlash(false), 2500);
              }
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
    // Turn sound on now that the viewer has interacted (autoplay needs muted,
    // but once they press Watch we can play audio for an uploaded video).
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
    setMuted(false);
    // Owners previewing their own stream are not charged — just play it.
    if (isOwner) {
      setStatus("streaming");
      return;
    }
    setStatus("connecting");
    loop();
  }, [loop, isOwner]);

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
    waiting: "Waiting for the host — not charging yet",
  };

  return (
    <div className="glass drip-glow overflow-hidden rounded-2xl p-5 sm:p-6">
      {/* video surface */}
      <div
        ref={surfaceRef}
        className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      >
        {/* Live streams show the host's real camera (LiveKit); recorded streams
            autoplay the video file (Watch resumes + pays, Stop pauses it). */}
        {stream.isLive ? (
          <LiveVideo slug={stream.slug} onLiveChange={setHostLive} />
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

        {/* player controls (shown while watching) */}
        {watching && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5">
            {!stream.isLive && (
              <button
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className="grid size-8 place-items-center rounded-md bg-black/45 text-white/90 backdrop-blur transition-colors hover:bg-black/65"
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            )}
            <button
              onClick={goFullscreen}
              aria-label="Fullscreen"
              className="grid size-8 place-items-center rounded-md bg-black/45 text-white/90 backdrop-blur transition-colors hover:bg-black/65"
            >
              <Maximize className="size-4" />
            </button>
          </div>
        )}

        {watching && (
          <div className="absolute left-3 top-11 inline-flex items-center gap-1.5 rounded-md bg-black/40 px-2 py-1 text-xs text-white/85 backdrop-blur">
            <Bot
              className={`size-3.5 transition-colors ${
                agentFlash ? "text-emerald-400" : "text-white/55"
              }`}
            />
            <span>AI agent{agentFlash ? " · paid" : ""}</span>
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
      {isOwner ? (
        <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          <span className="font-medium text-primary">Previewing your own stream</span>
          <span className="text-muted-foreground">
            {" "}
            — you&apos;re not charged to watch your own content.
          </span>
        </div>
      ) : (
        <div className="mt-5 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              You&apos;ve paid {stream.creator}
            </p>
            <p className="text-gradient tabular mt-1 font-mono text-4xl font-semibold leading-none">
              {naira(paid)}
            </p>
            <p className="tabular mt-1 text-xs text-muted-foreground">
              ≈ ${paid.toFixed(4)} USDC
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="tabular mt-1 font-mono text-sm text-foreground/80">
              {naira(stream.ratePerSecond)}/sec
            </p>
            <p className="tabular text-xs text-muted-foreground">
              ${stream.ratePerSecond.toFixed(4)}
            </p>
          </div>
        </div>
      )}

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
          {isOwner ? "Previewing — not charging" : statusLabel[status]}
        </span>
        {watching ? (
          <Button variant="outline" size="sm" onClick={stop}>
            <Pause className="size-4" /> Stop
          </Button>
        ) : (
          <Button size="sm" onClick={start}>
            <Play className="size-4" /> {isOwner ? "Play preview" : "Watch"}
          </Button>
        )}
      </div>

      {/* payment source */}
      <div className={`mt-4 rounded-xl border border-border/60 p-3 ${isOwner ? "hidden" : ""}`}>
        {payMode === "demo" ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              Paying with the free demo wallet — no setup, settled in real USDC on Arc.
            </span>
            <Button size="sm" variant="outline" onClick={useMyWallet} disabled={ownBusy}>
              <Wallet className="size-4" /> {ownBusy ? "Confirm in wallet…" : "Pay from my wallet"}
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-primary">
                <Check className="size-4" /> Paying from your wallet · {shortAddress(ownAddress ?? "")}
              </span>
              <span className="text-muted-foreground">
                {naira(ownBudget)} left {needTopup && "· used up"}
              </span>
            </div>
            {lastTx && (
              <p className="tabular mt-1 font-mono text-xs text-muted-foreground">
                prepaid on-chain · tx {lastTx.slice(0, 12)}…
              </p>
            )}
            {needTopup && (
              <Button size="sm" className="mt-2" onClick={useMyWallet} disabled={ownBusy}>
                {ownBusy ? "Confirm in wallet…" : "Top up & keep watching"}
              </Button>
            )}
          </div>
        )}
        {ownErr && <p className="mt-2 text-xs text-amber-500">{ownErr}</p>}
      </div>
    </div>
  );
}
