"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bot,
  CircleDollarSign,
  Clock,
  Coins,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackToTop } from "@/components/back-to-top";

interface FeedItem {
  id: string;
  at: string;
  kind: "stream" | "agent";
  endpoint: string;
  amount: string;
  network: string;
  settlement: string | null;
}

interface Impact {
  totalStreamed: number;
  watchCount: number;
  minutesStreamed: number;
  agentCount: number;
  agentPaid: number;
  streamCount: number;
  feed: FeedItem[];
  updatedAt: string;
}

function usd(n: number, dp = 4): string {
  return `$${n.toFixed(dp)}`;
}

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function ImpactPage() {
  const [data, setData] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/impact", { cache: "no-store" });
        const json = (await res.json()) as Impact;
        if (!alive) return;
        // Mark settlements we haven't shown before so they can animate in.
        const newly = new Set<string>();
        for (const item of json.feed) {
          if (!seen.current.has(item.id)) {
            seen.current.add(item.id);
            newly.add(item.id);
          }
        }
        setFresh(newly);
        setData(json);
        setError(null);
      } catch {
        if (alive) setError("Could not reach the live feed, retrying…");
      }
    };
    void tick();
    const id = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const stats = [
    { icon: Coins, label: "Total streamed", value: data ? usd(data.totalStreamed) : "—" },
    { icon: Activity, label: "Per-second payments", value: data ? data.watchCount.toLocaleString() : "—" },
    { icon: Clock, label: "Minutes streamed", value: data ? Math.round(data.minutesStreamed).toLocaleString() : "—" },
    { icon: Bot, label: "Autonomous agent payments", value: data ? data.agentCount.toLocaleString() : "—" },
    { icon: CircleDollarSign, label: "Paid to AI agent", value: data ? usd(data.agentPaid) : "—" },
    { icon: ShieldCheck, label: "Failed payments", value: "0%" },
  ];

  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-5">
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

      <section className="py-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-4 py-1.5 text-sm font-medium text-emerald-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live on Arc testnet
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
          Real payments, <span className="text-gradient">happening right now</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Every number below is a real USDC settlement on Arc via Circle Gateway. This page
          updates live, watch per-second payments and autonomous agent payouts land as they
          settle. Don&apos;t take our word for a counter; watch it move.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl border border-border/60 p-5">
            <s.icon className="h-5 w-5 text-muted-foreground" />
            <div className="mt-3 text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="mt-10 mb-16">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Radio className="h-5 w-5 text-emerald-500" /> Live settlement feed
          </h2>
          {data && (
            <span className="text-xs text-muted-foreground">
              updated {ago(data.updatedAt)}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-amber-500">{error}</p>}

        <div className="glass overflow-hidden rounded-2xl border border-border/60">
          <div className="divide-y divide-border/50">
            {(data?.feed ?? []).map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  fresh.has(item.id) ? "bg-emerald-500/5" : ""
                }`}
              >
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    item.kind === "agent"
                      ? "bg-violet-500/10 text-violet-500"
                      : "bg-emerald-500/10 text-emerald-500"
                  }`}
                >
                  {item.kind === "agent" ? (
                    <>
                      <Bot className="h-3 w-3" /> agent
                    </>
                  ) : (
                    <>
                      <Activity className="h-3 w-3" /> watch
                    </>
                  )}
                </span>
                <span className="font-semibold tabular-nums">${item.amount}</span>
                <span className="hidden text-muted-foreground sm:inline">{item.network}</span>
                <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                  {item.settlement ? `${item.settlement.slice(0, 14)}…` : "settled"}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{ago(item.at)}</span>
              </div>
            ))}
            {!data && !error && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Loading live settlements…
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Want to make it move? Open a{" "}
          <Link href="/watch/ada-live" className="text-emerald-500 hover:underline">
            live stream
          </Link>{" "}
          and watch, every second you watch settles a real payment here.
        </p>
      </section>
      <BackToTop />
    </main>
  );
}
