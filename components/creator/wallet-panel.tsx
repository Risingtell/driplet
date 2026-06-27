"use client";

import { useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { naira } from "@/lib/currency";
import { getWalletInfo, withdraw } from "@/app/creator/actions";

export function WalletPanel({ address, balance }: { address: string; balance: number }) {
  const [bal, setBal] = useState(balance);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wPending, setWPending] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function refresh() {
    setRefreshing(true);
    const info = await getWalletInfo();
    if (typeof info.balance === "number") setBal(info.balance);
    setRefreshing(false);
  }

  async function doWithdraw(formData: FormData) {
    setWPending(true);
    setMsg(null);
    const res = await withdraw(formData);
    setWPending(false);
    if (res?.error) setMsg({ kind: "err", text: res.error });
    else {
      setMsg({ kind: "ok", text: `Withdrawal submitted (${res.state ?? "pending"}).` });
      refresh();
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>

      <div className="glass drip-glow rounded-2xl p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Wallet className="size-4" /> Balance on Arc
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div>
            <span className="text-gradient font-mono text-4xl font-semibold tabular">
              ${bal.toFixed(4)}
            </span>
            <span className="tabular ml-2 text-sm text-muted-foreground">
              USDC · ≈ {naira(bal)}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border/60 p-3">
          <code className="flex-1 truncate text-left text-sm">{address}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          This is your payout address. Earnings from your streams land here.
        </p>
      </div>

      <form action={doWithdraw} className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold">Withdraw</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Send USDC from your wallet to any Arc address.
        </p>
        <input
          name="to"
          placeholder="Destination address (0x…)"
          className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          name="amount"
          type="number"
          step="0.0001"
          placeholder="Amount (USDC)"
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {msg && (
          <p className={`mt-2 text-sm ${msg.kind === "ok" ? "text-emerald-500" : "text-amber-500"}`}>
            {msg.text}
          </p>
        )}
        <Button type="submit" disabled={wPending} variant="outline" className="mt-3 w-full">
          {wPending ? <Loader2 className="size-4 animate-spin" /> : null} Withdraw
        </Button>
      </form>
    </div>
  );
}
