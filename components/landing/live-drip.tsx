"use client";

import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";

const RATE_PER_SECOND = 0.0003; // USDC per second watched — Driplet's default drip

/**
 * A self-running illustration of the core experience: as the seconds tick by,
 * USDC streams to the creator in real time. Pure visual demo (no chain calls).
 */
export function LiveDrip() {
  const [seconds, setSeconds] = useState(0);
  const [paid, setPaid] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    // Read the clock on mount (not during render) to stay compatible with
    // Next's Cache Components prerendering.
    startedAt.current = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - (startedAt.current ?? Date.now())) / 1000;
      setSeconds(Math.floor(elapsed));
      setPaid(elapsed * RATE_PER_SECOND);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;

  return (
    <div className="glass drip-glow relative overflow-hidden rounded-2xl p-6">
      {/* faux video surface */}
      <div className="relative mb-5 aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video
          className="absolute inset-0 size-full object-cover"
          src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/40" />

        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-destructive/90 px-2 py-1 text-xs font-semibold text-white">
          <span className="size-1.5 rounded-full bg-white animate-live" />
          LIVE
        </div>
        <div className="absolute right-3 top-3 rounded-md bg-black/30 px-2 py-1 text-xs text-white/80 tabular">
          {mmss} watched
        </div>

        {/* falling drips */}
        <div className="pointer-events-none absolute inset-0">
          {[18, 38, 58, 78].map((left, i) => (
            <span
              key={left}
              className="animate-drip absolute top-1/3 block h-6 w-1 rounded-full bg-gradient-to-b from-primary/0 via-primary to-primary/0"
              style={{ left: `${left}%`, animationDelay: `${i * 0.55}s` }}
            />
          ))}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3 text-xs text-white/70">
          <Radio className="size-3.5 text-primary" />
          Ada from Kano · live workshop
        </div>
      </div>

      {/* streaming counter */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Paid to creator so far
          </p>
          <p className="text-gradient tabular mt-1 font-mono text-4xl font-semibold leading-none">
            ${paid.toFixed(4)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Rate</p>
          <p className="tabular mt-1 font-mono text-sm text-foreground/80">
            ${RATE_PER_SECOND.toFixed(4)}/sec
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Stop watching and it stops — every second settled in USDC, gas-free.
      </p>
    </div>
  );
}
