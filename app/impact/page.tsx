"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  Bot,
  Clock,
  Coins,
  History,
  Radio,
  Undo2,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { BackToTop } from "@/components/back-to-top";
import { ARC, arcTxUrl } from "@/lib/arc-network";

interface FeedItem {
  id: string;
  at: string;
  kind: "payout" | "prepay" | "stream" | "agent" | "patron";
  endpoint: string;
  slug: string | null;
  amount: string;
  network: string;
  settlement: string | null;
}

interface PatronDecision {
  at: string;
  action: string;
  slug: string | null;
  rationale: string;
  paidUsd: number;
  tx: string | null;
  repeats?: number;
  since?: string;
}

interface Patron {
  address: string | null;
  balance: number;
  totalPaid: number;
  paymentCount: number;
  decisions: PatronDecision[];
}

interface Impact {
  totalStreamed: number;
  watchCount: number;
  minutesStreamed: number;
  agentCount: number;
  agentPaid: number;
  uniqueWallets: number;
  uniqueCreators: number;
  prepaidUsd: number;
  prepayCount: number;
  paidToCreatorsUsd: number;
  payoutCount: number;
  minutesWatched: number;
  settledCount: number;
  refundedUsd: number;
  feed: FeedItem[];
  updatedAt: string;
}

// The archived Arc testnet ledger (history/lepton-testnet in the repo), which
// `npm run verify:history` re-derives offline from the exported rows.
const TESTNET_HISTORY_URL = "https://github.com/Risingtell/driplet/tree/master/history/lepton-testnet";

function usd(n: number, dp = 4): string {
  return `$${n.toFixed(dp)}`;
}

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const isTxHash = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);

const KIND_LABEL: Record<FeedItem["kind"], { label: string; className: string; icon: typeof Bot }> = {
  payout: { label: "to creator", className: "bg-emerald-500/10 text-emerald-500", icon: ArrowDownToLine },
  prepay: { label: "viewer prepay", className: "bg-cyan-500/10 text-cyan-500", icon: Wallet },
  stream: { label: "per second", className: "bg-sky-500/10 text-sky-500", icon: Activity },
  agent: { label: "AI co-host", className: "bg-violet-500/10 text-violet-500", icon: Bot },
  patron: { label: "AI patron", className: "bg-cyan-500/10 text-cyan-500", icon: Bot },
};

export default function ImpactPage() {
  const [data, setData] = useState<Impact | null>(null);
  const [patron, setPatron] = useState<Patron | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // The patron reads its wallet balance from Arc on every call, so poll it
  // more gently than the settlement feed.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/agents/patron", { cache: "no-store" });
        const json = (await res.json()) as Patron;
        if (alive && json?.address !== undefined) setPatron(json);
      } catch {
        // panel simply stays hidden
      }
    };
    void tick();
    const id = setInterval(tick, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/impact", { cache: "no-store" });
        const json = (await res.json()) as Impact;
        if (!alive) return;
        if (!res.ok || !Array.isArray(json.feed)) throw new Error("bad response");
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

  const n = (v: number) => v.toLocaleString();
  const stats = [
    { icon: Coins, label: "Paid to creators", value: data ? usd(data.paidToCreatorsUsd) : "…" },
    { icon: Wallet, label: "Prepaid by viewers", value: data ? usd(data.prepaidUsd) : "…" },
    { icon: Users, label: "Paying wallets", value: data ? n(data.uniqueWallets) : "…" },
    { icon: Video, label: "Creators", value: data ? n(data.uniqueCreators) : "…" },
    { icon: Clock, label: "Minutes watched", value: data ? n(Math.round(data.minutesWatched)) : "…" },
    { icon: Activity, label: "Payments settled", value: data ? n(data.settledCount) : "…" },
    { icon: Bot, label: "Paid to the AI co-host", value: data ? usd(data.agentPaid) : "…" },
    { icon: Undo2, label: "Returned to viewers", value: data ? usd(data.refundedUsd) : "…" },
  ];

  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-5">
      <SiteHeader />

      <section className="py-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-4 py-1.5 text-sm font-medium text-emerald-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live on {ARC.name}
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
          Real payments, <span className="text-gradient">happening right now</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Every figure here is counted from real USDC payments on Arc and refreshes every few
          seconds. Viewers prepay a little, creators are paid for each second actually watched, and
          anything left unwatched goes back to the viewer.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl border border-border/60 p-5">
            <s.icon className="h-5 w-5 text-muted-foreground" />
            <div className="mt-3 text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </section>

      {patron?.address && (
        <section className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Bot className="h-5 w-5 text-cyan-500" /> The AI patron
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              {patron.address.slice(0, 6)}…{patron.address.slice(-4)} · holds {usd(patron.balance)} ·
              paid {usd(patron.totalPaid)} over {patron.paymentCount} payments
            </span>
          </div>
          <div className="glass overflow-hidden rounded-2xl border border-border/60">
            <div className="divide-y divide-border/50">
              {patron.decisions.map((d, i) => (
                // Phones: chip and time on one line, reasoning full width below
                // (beside a tx link it was squeezed to a word per line).
                // Wider screens: one row, reasoning in the middle.
                <div
                  key={`${d.at}-${i}`}
                  className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 text-sm sm:flex-nowrap"
                >
                  <span
                    className={`order-1 inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      d.action === "watch"
                        ? "bg-cyan-500/10 text-cyan-500"
                        : d.action === "stop"
                          ? "bg-amber-500/10 text-amber-500"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {d.action === "watch" ? `paid ${usd(d.paidUsd)}` : d.action}
                  </span>
                  <span className="order-3 w-full text-muted-foreground sm:order-2 sm:w-auto sm:min-w-0 sm:flex-1">
                    {d.rationale}
                    {d.slug && (
                      <Link href={`/watch/${d.slug}`} className="ml-1 text-cyan-500 hover:underline">
                        → {d.slug}
                      </Link>
                    )}
                    {(d.repeats ?? 1) > 1 && d.since && (
                      <span className="mt-1 block text-xs text-muted-foreground/80">
                        Same decision {d.repeats} times in a row, since {ago(d.since)}.
                      </span>
                    )}
                  </span>
                  <span className="order-2 ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground sm:order-3 sm:ml-0">
                    {d.tx && (
                      <a
                        href={arcTxUrl(d.tx)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono hover:text-foreground"
                      >
                        {d.tx.slice(0, 10)}…
                      </a>
                    )}
                    <span>{ago(d.at)}</span>
                  </span>
                </div>
              ))}
              {patron.decisions.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No decisions yet. The patron hasn&apos;t run a cycle.
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            An autonomous viewer agent with its own USDC wallet on Arc. Each cycle it looks at
            what&apos;s streaming (host on air, viewers present, chat moving, price) and decides with
            an LLM whether any stream deserves its money right now. When it pays, it signs a gasless
            EIP-3009 payment from its own wallet into the stream&apos;s treasury, which splits it like
            any viewer&apos;s money. So one agent spends money while another, the AI co-host, earns
            it. Every decision above, including refusals to pay, is recorded as the agent gave it.
          </p>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Radio className="h-5 w-5 text-emerald-500" /> Live settlement feed
          </h2>
          {data && (
            <span className="text-xs text-muted-foreground">updated {ago(data.updatedAt)}</span>
          )}
        </div>

        {error && <p className="mb-2 text-sm text-amber-500">{error}</p>}

        <div className="glass overflow-hidden rounded-2xl border border-border/60">
          <div className="divide-y divide-border/50">
            {(data?.feed ?? []).map((item) => {
              const kind = KIND_LABEL[item.kind] ?? KIND_LABEL.stream;
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                    fresh.has(item.id) ? "bg-emerald-500/5" : ""
                  }`}
                >
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${kind.className}`}
                  >
                    <kind.icon className="h-3 w-3" /> {kind.label}
                  </span>
                  <span className="font-semibold tabular-nums">${Number(item.amount).toFixed(4)}</span>
                  {item.slug && (
                    <Link
                      href={`/watch/${item.slug}`}
                      className="hidden min-w-0 truncate text-muted-foreground hover:text-foreground sm:inline"
                    >
                      {item.slug}
                    </Link>
                  )}
                  <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                    {item.settlement && isTxHash(item.settlement) ? (
                      <a
                        href={arcTxUrl(item.settlement)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground"
                      >
                        {item.settlement.slice(0, 10)}…
                      </a>
                    ) : item.settlement ? (
                      `${item.settlement.slice(0, 13)}…`
                    ) : (
                      "settled"
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(item.at)}</span>
                </div>
              );
            })}
            {!data && !error && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Loading live settlements…
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Want to see it move? Open any stream on{" "}
          <Link href="/explore" className="text-emerald-500 hover:underline">
            Explore
          </Link>{" "}
          and press Watch. Every second you watch shows up here.
        </p>
      </section>

      <section className="mt-10 mb-6">
        <div className="glass flex items-start gap-3 rounded-2xl border border-border/60 p-5 text-sm">
          <History className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Before mainnet.</span> From 16 June to 3
            October Driplet ran on Arc testnet and settled 37,091 per-second payments from 37
            wallets for 12 creators. That ledger is{" "}
            <a
              href={TESTNET_HISTORY_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              archived in the repo
            </a>{" "}
            and can be re-checked offline.
          </p>
        </div>
      </section>

      <LandingFooter />
      <BackToTop />
    </main>
  );
}
