"use client";

import { useState } from "react";
import { Check, Copy, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { naira } from "@/lib/currency";
import { arcTxUrl } from "@/lib/arc-network";
import { getWalletInfo, withdraw } from "@/app/creator/actions";

interface Money {
  /** USDC sitting in the wallet itself on Arc. */
  balance: number;
  /** Stream payouts, held for this address in Circle Gateway. */
  earnings: number;
  /** Earnings left after Gateway's fee for moving them. */
  withdrawable: number;
}

export function WalletPanel({ address, ...initial }: { address: string } & Money) {
  const [money, setMoney] = useState<Money>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wPending, setWPending] = useState(false);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; tx?: string } | null>(null);

  // Most a single withdrawal can take: Gateway earnings (after fee), or the
  // wallet's own USDC if that is larger, since one withdrawal draws on one.
  const max = Math.max(money.withdrawable, money.balance);

  async function refresh() {
    setRefreshing(true);
    const info = await getWalletInfo();
    if (!info.error) {
      setMoney({
        balance: info.balance ?? 0,
        earnings: info.earnings ?? 0,
        withdrawable: info.withdrawable ?? 0,
      });
    }
    setRefreshing(false);
  }

  async function doWithdraw(formData: FormData) {
    setWPending(true);
    setMsg(null);
    const res = await withdraw(formData);
    setWPending(false);
    if (res?.error) setMsg({ kind: "err", text: res.error });
    else {
      setMsg({
        kind: "ok",
        text: res.txHash
          ? `Sent. Gateway's fee was $${Number(res.fee ?? 0).toFixed(4)}.`
          : `Withdrawal submitted (${res.state ?? "pending"}).`,
        tx: res.txHash,
      });
      setAmount("");
      refresh();
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>

      <div className="glass drip-glow rounded-2xl p-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Wallet className="size-4" /> Earnings balance
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div>
            <span className="text-gradient font-mono text-4xl font-semibold tabular">
              ${money.earnings.toFixed(4)}
            </span>
            <span className="tabular ml-2 text-sm text-muted-foreground">
              USDC · ≈ {naira(money.earnings)}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Every payout from your streams lands here, held for your address by Circle Gateway.
          Up to <span className="tabular text-foreground">${money.withdrawable.toFixed(4)}</span>{" "}
          can be withdrawn now, after a small network fee.
        </p>
        {money.balance > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            Plus <span className="tabular text-foreground">${money.balance.toFixed(4)}</span> USDC
            sent straight to your wallet on Arc.
          </p>
        )}

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
          This is your payout address on Arc.
        </p>
      </div>

      <form action={doWithdraw} className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold">Withdraw</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Send your earnings to any Arc address, such as your exchange or personal wallet.
        </p>
        <input
          name="to"
          placeholder="Destination address (0x…)"
          className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="mt-2 flex gap-2">
          <input
            name="amount"
            type="number"
            step="0.000001"
            placeholder="Amount (USDC)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button
            type="button"
            variant="outline"
            disabled={max <= 0}
            onClick={() => setAmount((Math.floor(max * 1e6) / 1e6).toFixed(6))}
          >
            Max
          </Button>
        </div>
        {msg && (
          <p className={`mt-2 text-sm ${msg.kind === "ok" ? "text-emerald-500" : "text-amber-500"}`}>
            {msg.text}{" "}
            {msg.tx && (
              <a href={arcTxUrl(msg.tx)} target="_blank" rel="noreferrer" className="underline">
                View transaction
              </a>
            )}
          </p>
        )}
        <Button type="submit" disabled={wPending} variant="outline" className="mt-3 w-full">
          {wPending ? <Loader2 className="size-4 animate-spin" /> : null} Withdraw
        </Button>
      </form>
    </div>
  );
}
