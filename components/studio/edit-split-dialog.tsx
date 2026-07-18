"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PieChart } from "lucide-react";
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
}

/** Studio control for a creator to re-split their stream's revenue by role. */
export function EditSplitDialog({ slug, split }: { slug: string; split: Payee[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(split.map((p) => [p.role, String(Math.round(p.share * 1000) / 10)])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Object.values(shares).reduce((s, v) => s + (Number(v) || 0), 0);
  const balanced = Math.abs(total - 100) < 0.05;

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
                <div className="text-xs text-muted-foreground">{p.role}</div>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={shares[p.role]}
                  onChange={(e) => setShares((s) => ({ ...s, [p.role]: e.target.value }))}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm outline-none focus:border-primary"
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
