"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  connectArcWallet,
  getEthereum,
  isOnArc,
  shortAddress,
} from "@/lib/arc-chain";

/**
 * "Connect wallet" control. On click it prompts the wallet, then automatically
 * adds + switches to Arc Testnet (no manual network setup). Once connected it
 * shows the address and live Arc-network status.
 */
export function ConnectArc() {
  const [address, setAddress] = useState<string | null>(null);
  const [onArc, setOnArc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshNetwork = useCallback(async () => {
    const eth = getEthereum();
    if (eth) setOnArc(await isOnArc(eth));
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const addr = await connectArcWallet();
      setAddress(addr);
      await refreshNetwork();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refreshNetwork]);

  // Reflect chain/account changes the user makes directly in their wallet.
  useEffect(() => {
    const eth = getEthereum();
    if (!eth?.on) return;
    const onChain = () => void refreshNetwork();
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setAddress(accounts?.[0] ?? null);
    };
    eth.on("chainChanged", onChain);
    eth.on("accountsChanged", onAccounts);
    return () => {
      eth.removeListener?.("chainChanged", onChain);
      eth.removeListener?.("accountsChanged", onAccounts);
    };
  }, [refreshNetwork]);

  if (address) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
          onArc
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-500"
            : "border-amber-500/30 bg-amber-500/5 text-amber-500"
        }`}
        title={onArc ? "Connected to Arc Testnet" : "Wrong network — switch to Arc Testnet"}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {onArc ? "Arc Testnet" : "Wrong network"} · {shortAddress(address)}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={connect} disabled={busy} size="sm" variant="outline">
        <Wallet className="mr-2 h-4 w-4" />
        {busy ? "Connecting…" : "Connect wallet"}
      </Button>
      {error && (
        <span className="max-w-[230px] text-right text-xs text-amber-500">{error}</span>
      )}
    </div>
  );
}
