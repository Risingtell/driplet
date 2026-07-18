"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, PieChart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { updateStreamSplit } from "@/app/creator/actions";

interface Payee {
  name: string;
  role: string;
  share: number;
  /** AI co-host roles: paid from their own fixed budget, not editable here. */
  fixed: boolean;
}

function pctOf(split: Payee[]): Record<string, string> {
  return Object.fromEntries(split.map((p) => [p.role, String(Math.round(p.share * 1000) / 10)]));
}

/** Studio control for a creator to re-split their stream's revenue by role. */
export function EditSplitDialog({ slug, split }: { slug: string; split: Payee[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Record<string, string>>(() => pctOf(split));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync from the current split every time the dialog opens, so a reopen
  // after a save (or after abandoning an unsaved edit) shows the real current
  // values instead of whatever was last typed.
  useEffect(() => {
    if (open) {
      setShares(pctOf(split));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = Object.values(shares).reduce((s, v) => s + (Number(v) || 0), 0);
  // Rounding each payee's share to 0.1% independently can drift the sum by up
  // to ~0.05% per payee — scale the tolerance so an already-balanced split
  // never shows as unbalanced before the user has touched anything.
  const balanced = Math.abs(total - 100) < Math.max(0.05, 0.1 * split.length);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const asShares = Object.fromEntries(
      Object.entries(shares).map(([role, pct]) => [role, (Number(pct) || 0) / 100]),
    );
    const res = await updateStreamSplit(slug, asShares);
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PieChart className="size-3.5" /> Split
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit revenue split</DialogTitle>
          <DialogDescription>
            Set what share of every second watched goes to each payee. Must add up to 100%.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          {split.map((p) => (
            <div key={p.role} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.role}
                  {p.fixed && (
                    <span className="ml-1 inline-flex items-center gap-0.5">
                      <Lock className="size-2.5" /> fixed
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={shares[p.role]}
                  disabled={p.fixed}
                  onChange={(e) => setShares((s) => ({ ...s, [p.role]: e.target.value }))}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
          <div
            className={`text-right text-xs ${balanced ? "text-muted-foreground" : "text-amber-500"}`}
          >
            Total: {total.toFixed(1)}%{!balanced && " — must equal 100%"}
          </div>
          {error && <p className="text-sm text-amber-500">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending || !balanced}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save split
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
