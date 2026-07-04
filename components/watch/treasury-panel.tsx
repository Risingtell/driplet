"use client";

import { useEffect, useState } from "react";
import { Split } from "lucide-react";
import { naira } from "@/lib/currency";
import type { Stream } from "@/lib/streams";

interface Payee {
  name: string;
  role: string;
  share: number;
  amount: number;
  address?: string | null;
}

interface Treasury {
  total: number;
  count: number;
  agentPaid: number;
  agentCount: number;
  payees: Payee[];
}

const roleColor = ["bg-primary", "bg-chart-2", "bg-chart-3"];

export function TreasuryPanel({ stream }: { stream: Stream }) {
  const [data, setData] = useState<Treasury>({
    total: 0,
    count: 0,
    agentPaid: 0,
    agentCount: 0,
    payees: stream.split.map((p) => ({ ...p, amount: 0 })),
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/streams/${stream.slug}/treasury`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (active && j && typeof j.total === "number") setData(j);
      } catch {
        /* keep last known values */
      }
    };
    load();
    const id = setInterval(load, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [stream.slug]);

  return (
    <div className="glass mt-5 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Split className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Stream treasury</h2>
            <p className="text-xs text-muted-foreground">
              Auto-splitting every drip in real time
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Total received</p>
          <p className="text-gradient tabular font-mono text-lg font-semibold leading-none">
            ${data.total.toFixed(4)}
          </p>
          <p className="tabular text-[11px] text-muted-foreground">≈ {naira(data.total)}</p>
        </div>
      </div>

      {/* split bar */}
      <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {data.payees.map((p, i) => (
          <div
            key={p.name}
            className={`${roleColor[i % roleColor.length]} h-full transition-all`}
            style={{ width: `${p.share * 100}%` }}
          />
        ))}
      </div>

      {/* payees */}
      <ul className="mt-4 space-y-3">
        {data.payees.map((p, i) => (
          <li key={p.name} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className={`size-2.5 shrink-0 rounded-full ${roleColor[i % roleColor.length]}`}
              />
              <span className="shrink-0 text-sm font-medium">{p.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {p.role} · {Math.round(p.share * 100)}%
                {p.address ? (
                  <span className="ml-1 font-mono">
                    → {p.address.slice(0, 6)}…{p.address.slice(-4)}
                  </span>
                ) : null}
              </span>
            </span>
            <span className="tabular shrink-0 font-mono text-sm text-foreground/90">
              ${p.amount.toFixed(4)}
            </span>
          </li>
        ))}
      </ul>

      {/* autonomous agent outflow */}
      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <span className="size-2 shrink-0 rounded-full bg-primary animate-live" />
            <span className="truncate font-medium">Autonomously paid the AI co-host</span>
          </span>
          <span className="tabular shrink-0 font-mono text-sm">
            ${data.agentPaid.toFixed(4)}
            <span className="ml-1.5 text-muted-foreground">{data.agentCount}×</span>
          </span>
        </div>
        {/* the agent's live budget ledger — its spending decision, in numbers */}
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground/80">Agent budget ledger:</span> income $
          {data.total.toFixed(4)} → agent share cap (10%) $
          {Math.max(0.005, data.total * 0.1).toFixed(4)} → spent ${data.agentPaid.toFixed(4)} →{" "}
          {data.agentPaid + 0.005 <= Math.max(0.005, data.total * 0.1) ? (
            <span className="text-emerald-500">next $0.005 is within budget, the agent will pay itself</span>
          ) : (
            <span className="text-amber-500">
              share spent, the agent is pausing itself so the creator is paid first
            </span>
          )}
        </p>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        The stream holds its own balance and splits each payment across its people in real time.
        Wallet prepays (like a $5 Face ID session) arrive up front and stream out to the payees per
        second actually watched. The treasury pays the AI co-host it runs only while that stays
        within the agent&apos;s earned share, and the agent pauses itself when funds run low so the
        creator is always paid first. Agent-to-agent, no human in the loop.
      </p>
    </div>
  );
}
