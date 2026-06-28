"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  Radio,
  Maximize,
  Volume2,
  VolumeX,
  Bot,
  Wallet,
  Check,
  Fingerprint,
  Copy,
  Clapperboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveVideo } from "@/components/watch/live-video";
import { naira } from "@/lib/currency";
import { connectArcWallet, shortAddress } from "@/lib/arc-chain";
import { signWatchAuthorization, getUsdcBalance } from "@/lib/own-wallet";
import type { Stream } from "@/lib/streams";

type Status = "idle" | "connecting" | "streaming" | "retrying" | "waiting" | "preview";

// How often (in paid seconds) the stream treasury pays the AI captions agent.
// Kept short so the autonomous agent-to-agent payment is visible in a demo.
const AGENT_PAY_EVERY = 20;

// Default own-wallet session: one signature prepays this much (capped by the
// viewer's balance), enough to watch for hours so it never runs out mid-demo.
const SESSION_USD = 5;

// Free preview: seconds a viewer can watch on the demo wallet before being asked
// to connect their own wallet. 0 = unlimited free demo (the default, keeps reach
// frictionless). Flip on later by setting NEXT_PUBLIC_FREE_PREVIEW_SECONDS=60.
const FREE_PREVIEW_SECONDS = Number(process.env.NEXT_PUBLIC_FREE_PREVIEW_SECONDS ?? 0);

export function WatchMeter({ stream, isOwner = false }: { stream: Stream; isOwner?: boolean }) {
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [paid, setPaid] = useState(0);
  const [agentFlash, setAgentFlash] = useState(false);
  const [agentMsg, setAgentMsg] = useState<string | null>(null);
  // The AI co-host pauses itself when it would exceed its earned share.
  const [agentSaving, setAgentSaving] = useState(false);
  const [muted, setMuted] = useState(true);
  const watchingRef = useRef(false);
  const tickCountRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Free-preview gating (only used when FREE_PREVIEW_SECONDS > 0).
  const demoSecondsRef = useRef(0);
  const [previewEnded, setPreviewEnded] = useState(false);

  const goFullscreen = useCallback(() => {
    const surface = surfaceRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => void })
      | null;
    if (!surface) return;
    // Desktop + Android Chrome: fullscreen the whole surface (video + overlays).
    if (surface.requestFullscreen) {
      surface.requestFullscreen().catch(() => {});
      return;
    }
    if (surface.webkitRequestFullscreen) {
      surface.webkitRequestFullscreen();
      return;
    }
    // iPhone Safari has no element Fullscreen API — only the <video> can go
    // fullscreen, via webkitEnterFullscreen. Works for recorded and live feeds.
    const video = surface.querySelector("video") as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    video?.webkitEnterFullscreen?.();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, []);
  // For live streams, only charge while the host is actually broadcasting.
  // The ref drives the charging loop; the state drives the LIVE/Offline badge.
  const hostLiveRef = useRef(false);
  const [hostLive, setHostLiveState] = useState(false);
  const setHostLive = useCallback((live: boolean) => {
    hostLiveRef.current = live;
    setHostLiveState(live);
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
  const lastAmountRef = useRef(SESSION_USD);
  // Which wallet funded the current "own" session, so Top up uses the same one.
  const paySourceRef = useRef<"metamask" | "passkey">("metamask");

  // Passkey (Circle Modular Wallet) onboarding: a gasless smart account created
  // with Face ID / Touch ID, no extension or seed phrase.
  const [pkSupported, setPkSupported] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);
  const [pkAddr, setPkAddr] = useState<string | null>(null);
  const [pkNeedsFunds, setPkNeedsFunds] = useState(false);
  const [copied, setCopied] = useState(false);
  const fundRef = useRef<HTMLDivElement>(null);

  // When the wallet is created but unfunded, bring the funding step into view so
  // it isn't missed below the fold (a tester kept re-tapping Face ID otherwise).
  useEffect(() => {
    if (pkNeedsFunds && pkAddr) {
      fundRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [pkNeedsFunds, pkAddr]);

  useEffect(() => {
    const supported =
      !!process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY &&
      typeof window !== "undefined" &&
      !!window.PublicKeyCredential;
    setPkSupported(supported);
    // Warm the passkey SDK chunk now so the Face ID ceremony fires immediately on
    // tap. iOS Safari invalidates the user gesture if a network chunk load runs
    // first, which silently blocks navigator.credentials.create (Face ID).
    if (supported) void import("@/lib/passkey");
  }, []);

  const usePasskey = useCallback(
    async (amountUsd: number) => {
      lastAmountRef.current = amountUsd;
      setOwnErr(null);
      setPkBusy(true);
      try {
        const { signInWithPasskey, currentSession } = await import("@/lib/passkey");
        let session = currentSession();
        if (!session) {
          const stored = localStorage.getItem("driplet_passkey_user");
          const username = stored ?? `driplet-${Math.random().toString(16).slice(2, 8)}`;
          try {
            session = await signInWithPasskey(username, stored ? "login" : "register");
          } catch (e) {
            // A stored credential that won't log in (e.g. cleared) → register fresh.
            if (stored) session = await signInWithPasskey(username, "register");
            else throw e;
          }
          localStorage.setItem("driplet_passkey_user", username);
        }
        setPkAddr(session.address);

        const bal = await session.balance();
        if (bal < 0.01) {
          // Brand-new wallet with no testnet USDC: show the address to fund.
          setPkNeedsFunds(true);
          return;
        }
        setPkNeedsFunds(false);

        const info = (await fetch(`/api/watch/${stream.slug}/passkey-pay`).then((r) => r.json())) as {
          payTo: `0x${string}`;
        };
        const budget = Math.min(amountUsd, Math.max(0.005, bal - 0.001));
        const tx = await session.pay(info.payTo, budget);
        const res = await fetch(`/api/watch/${stream.slug}/passkey-pay`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tx, payer: session.address }),
        });
        const j = (await res.json()) as { ok?: boolean; tx?: string; amount?: number; error?: string };
        if (!res.ok || !j.ok) throw new Error(j.error ?? "Payment failed");

        setOwnAddress(session.address);
        ownBudgetRef.current = j.amount ?? budget;
        setOwnBudget(ownBudgetRef.current);
        setLastTx(j.tx ?? tx);
        setNeedTopup(false);
        paySourceRef.current = "passkey";
        payModeRef.current = "own";
        setPayMode("own");
        // If they hit the free-preview wall, resume right where they paused.
        setPreviewEnded(false);
        videoRef.current?.play().catch(() => {});
      } catch (e) {
        const msg = (e as Error).message || "Could not set up your passkey wallet";
        let friendly = msg;
        if (/reject|denied|cancel|NotAllowed|abort/i.test(msg)) friendly = "Sign-in cancelled.";
        else if (/entity config|not found in the system/i.test(msg))
          friendly = "Face ID sign-in isn't available right now. Use your own wallet instead.";
        setOwnErr(friendly);
      } finally {
        setPkBusy(false);
      }
    },
    [stream.slug],
  );

  const copyPkAddr = useCallback(() => {
    if (!pkAddr) return;
    navigator.clipboard?.writeText(pkAddr).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }, [pkAddr]);

  const useMyWallet = useCallback(async (amountUsd: number) => {
    lastAmountRef.current = amountUsd;
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
      // Prepay the chosen amount, capped by what's in the wallet.
      const budget = Math.min(amountUsd, Math.max(0.005, bal - 0.001));
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
      paySourceRef.current = "metamask";
      payModeRef.current = "own";
      setPayMode("own");
      // If they hit the free-preview wall, resume right where they paused.
      setPreviewEnded(false);
      videoRef.current?.play().catch(() => {});
    } catch (e) {
      const msg = (e as Error).message || "Could not pay from your wallet";
      // A user rejecting the signature in their wallet isn't an error worth shouting about.
      setOwnErr(/reject|denied|user/i.test(msg) ? "Signature cancelled." : msg);
    } finally {
      setOwnBusy(false);
    }
  }, [stream.slug]);

  // Every AGENT_PAY_EVERY seconds the stream treasury (a) pays its AI co-host and
  // (b) splits that interval's income out to each human payee's own wallet on Arc.
  // Runs in BOTH demo and own-wallet modes so the autonomous split always happens.
  const runTreasuryCycle = useCallback(() => {
    fetch(`/api/watch/${stream.slug}/agent-pay`, { method: "POST" })
      .then((res) => res.json())
      .then((aj) => {
        if (aj?.ok && !aj.paused) {
          // The agent paid itself this cycle (it's within budget).
          setAgentSaving(false);
          setAgentFlash(true);
          setTimeout(() => setAgentFlash(false), 2500);
          if (aj.caption) {
            setAgentMsg(aj.caption);
            // Auto-dismiss so the caption doesn't sit over the video.
            setTimeout(() => setAgentMsg(null), 6000);
          }
        } else if (aj?.paused) {
          // The agent paused itself to stay within its earned share.
          setAgentSaving(true);
        }
      })
      .catch(() => {});
    fetch(`/api/streams/${stream.slug}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds: AGENT_PAY_EVERY }),
    }).catch(() => {});
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
      // Drive the same autonomous split + agent payment as the demo path, so
      // paying from your own wallet still flows through the stream treasury.
      tickCountRef.current += 1;
      if (tickCountRef.current % AGENT_PAY_EVERY === 0) runTreasuryCycle();
      setStatus("streaming");
      if (watchingRef.current) setTimeout(loop, 1000);
      return;
    }
    // Free-preview cap: after the allotted free seconds on the demo wallet, pause
    // and ask the viewer to connect their own wallet. The loop keeps spinning so
    // it resumes automatically the moment they switch to "own" mode.
    if (FREE_PREVIEW_SECONDS > 0 && demoSecondsRef.current >= FREE_PREVIEW_SECONDS) {
      setPreviewEnded(true);
      setStatus("preview");
      videoRef.current?.pause();
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
        demoSecondsRef.current += 1;
        setStatus("streaming");
        tickCountRef.current += 1;
        if (tickCountRef.current % AGENT_PAY_EVERY === 0) runTreasuryCycle();
      } else {
        setStatus("retrying");
      }
    } catch {
      setStatus("retrying");
    }
    if (watchingRef.current) setTimeout(loop, 1000);
  }, [stream.slug, runTreasuryCycle]);

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
    // Owners previewing their own stream are not charged, just play it.
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
    waiting: "Waiting for the host, not charging yet",
    preview: "Free preview ended — connect to keep watching",
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
          <LiveVideo slug={stream.slug} onLiveChange={setHostLive} muted={muted} />
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

        {stream.isLive ? (
          hostLive ? (
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-destructive/90 px-2 py-1 text-xs font-semibold text-white">
              <span className="size-1.5 rounded-full bg-white animate-live" />
              LIVE
            </div>
          ) : (
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white/80 backdrop-blur">
              <span className="size-1.5 rounded-full bg-white/40" />
              Offline
            </div>
          )
        ) : (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <Clapperboard className="size-3" />
            Recorded
          </div>
        )}
        <div className="absolute right-3 top-3 rounded-md bg-black/30 px-2 py-1 text-xs text-white/80 tabular">
          {mmss} watched
        </div>

        {/* player controls (shown while watching) */}
        {watching && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="grid size-8 place-items-center rounded-md bg-black/45 text-white/90 backdrop-blur transition-colors hover:bg-black/65"
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
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
                agentFlash ? "text-emerald-400" : agentSaving ? "text-amber-300" : "text-white/55"
              }`}
            />
            <span>
              AI co-host{agentFlash ? " · paid" : agentSaving ? " · saving budget" : ""}
            </span>
          </div>
        )}

        {watching && agentMsg && (
          <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center px-3">
            <span className="line-clamp-2 max-w-[80%] rounded-md bg-black/55 px-2.5 py-1 text-center text-xs text-white/90 backdrop-blur-sm">
              <span className="font-semibold text-primary">AI co-host</span> {agentMsg}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 text-xs text-white/70">
          <Radio className="size-3.5 text-primary" />
          {stream.creator} · {stream.location}
        </div>

        {!watching && !previewEnded && (
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

        {/* Free-preview wall: shown once the free seconds are used up. */}
        {previewEnded && !isOwner && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/75 p-4 text-center backdrop-blur-sm">
            <div className="w-full max-w-xs">
              <p className="text-sm font-semibold text-white">Your free preview ended</p>
              <p className="mt-1 text-xs text-white/70">
                Keep watching {stream.creator} from your own wallet — it takes seconds and the gas
                is on us.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {pkSupported && (
                  <Button onClick={() => usePasskey(SESSION_USD)} disabled={pkBusy || ownBusy}>
                    <Fingerprint className="size-4" />{" "}
                    {pkBusy ? "Setting up…" : "Continue with Face ID"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => useMyWallet(SESSION_USD)}
                  disabled={ownBusy || pkBusy}
                >
                  <Wallet className="size-4" />{" "}
                  {ownBusy ? "Confirm in wallet…" : "Use my own wallet"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* meter */}
      {isOwner ? (
        <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          <span className="font-medium text-primary">Previewing your own stream.</span>
          <span className="text-muted-foreground">
            {" "}
            You&apos;re not charged to watch your own content.
          </span>
        </div>
      ) : (
        <div className="mt-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              You&apos;ve paid {stream.creator}
            </p>
            <p className="text-gradient tabular mt-1 font-mono text-4xl font-semibold leading-none">
              ${paid.toFixed(4)}
            </p>
            <p className="tabular mt-1 text-xs text-muted-foreground">
              USDC on Arc · ≈ {naira(paid)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="tabular mt-1 font-mono text-sm text-foreground/80">
              ${stream.ratePerSecond.toFixed(4)}/sec
            </p>
            <p className="tabular text-xs text-muted-foreground">
              ≈ {naira(stream.ratePerSecond)}
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
          {isOwner ? "Previewing, not charging" : statusLabel[status]}
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
          pkNeedsFunds && pkAddr ? (
            <div ref={fundRef} className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Check className="size-4 text-primary" /> Wallet created with Face ID
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                One more step — add a little free testnet USDC to this address, then come back and
                continue.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="tabular min-w-0 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">
                  {pkAddr}
                </code>
                <Button size="sm" variant="outline" className="shrink-0" onClick={copyPkAddr}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <Button asChild className="mt-2 w-full" onClick={copyPkAddr}>
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                  {copied ? "Address copied — paste it on the faucet" : "Copy address & open faucet.circle.com"}
                </a>
              </Button>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Pick Arc Testnet, paste your address, request USDC, then continue.
              </p>
              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={() => usePasskey(lastAmountRef.current)}
                disabled={pkBusy}
              >
                {pkBusy ? "Checking…" : "I've funded it — continue"}
              </Button>
            </div>
          ) : (
            <div>
              {pkSupported ? (
                <>
                  <p className="text-sm font-medium text-foreground">Watch from your own wallet</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Set one up with Face ID in seconds — no app, no seed phrase, and the gas is on
                    us. You&apos;re on the free demo wallet until you do.
                  </p>
                  <Button
                    className="mt-3 w-full"
                    onClick={() => usePasskey(SESSION_USD)}
                    disabled={pkBusy || ownBusy}
                  >
                    <Fingerprint className="size-4" />{" "}
                    {pkBusy ? "Setting up…" : "Continue with Face ID"}
                  </Button>
                  <button
                    onClick={() => useMyWallet(SESSION_USD)}
                    disabled={ownBusy || pkBusy}
                    className="mt-2 w-full text-center text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-60"
                  >
                    {ownBusy ? "Confirm in wallet…" : "or connect an existing wallet"}
                  </button>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    Paying with the free demo wallet, no setup. Prefer to pay yourself?
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => useMyWallet(SESSION_USD)}
                    disabled={ownBusy || pkBusy}
                  >
                    <Wallet className="size-4" />{" "}
                    {ownBusy ? "Confirm in wallet…" : "Use my own wallet"}
                  </Button>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Using your own wallet? Need testnet USDC?{" "}
                <a
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Get it free at faucet.circle.com →
                </a>
              </p>
            </div>
          )
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
              <Button
                size="sm"
                className="mt-2"
                onClick={() =>
                  paySourceRef.current === "passkey"
                    ? usePasskey(lastAmountRef.current)
                    : useMyWallet(lastAmountRef.current)
                }
                disabled={ownBusy || pkBusy}
              >
                {ownBusy || pkBusy
                  ? "Confirm…"
                  : `Top up ${naira(lastAmountRef.current)} & keep watching`}
              </Button>
            )}
          </div>
        )}
        {ownErr && <p className="mt-2 text-xs text-amber-500">{ownErr}</p>}
      </div>
    </div>
  );
}
