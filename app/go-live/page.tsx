"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Film, Radio, Video, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { connectArcWallet, shortAddress } from "@/lib/arc-chain";
import { getWalletInfo } from "@/app/creator/actions";

export default function GoLivePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"live" | "video">("live");
  const [host, setHost] = useState<string | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    creator: "",
    location: "",
    videoUrl: "",
    cohostName: "",
    cohostAddress: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // If the creator is signed in, use their auto-created Circle wallet as payout.
  const [creatorWallet, setCreatorWallet] = useState<string | null>(null);

  useEffect(() => {
    getWalletInfo().then((info) => {
      if (info.address) {
        setHost(info.address);
        setCreatorWallet(info.address);
      }
    });
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function connect() {
    setWalletErr(null);
    try {
      setHost(await connectArcWallet());
    } catch (e) {
      setWalletErr((e as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!host) {
      setError("Connect your wallet first — that's where you get paid.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/streams/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, isLive: mode === "live", hostAddress: host }),
      });
      const json = (await res.json()) as { slug?: string; error?: string };
      if (!res.ok || !json.slug) throw new Error(json.error ?? "Could not create stream");
      if (mode === "live") {
        router.push(`/broadcast/${json.slug}`);
        return;
      }
      setCreated(json.slug);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const watchUrl = created
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/watch/${created}`
    : "";

  return (
    <main className="relative mx-auto flex min-h-screen max-w-xl flex-col px-5">
      <header className="flex items-center justify-between py-6">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {created ? (
        <section className="py-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <Radio className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold">You&apos;re live 🎉</h1>
          <p className="mt-3 text-muted-foreground">
            Share this link. Every second someone watches, USDC drips to your wallet — and
            auto-splits to your co-host and the AI agent.
          </p>
          <div className="glass mt-6 flex items-center gap-2 rounded-xl border border-border/60 p-3">
            <code className="flex-1 truncate text-left text-sm">{watchUrl}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(watchUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/watch/${created}`}>
              <Button>Open your stream</Button>
            </Link>
            <Button variant="outline" onClick={() => setCreated(null)}>
              Create another
            </Button>
          </div>
        </section>
      ) : (
        <section className="py-6">
          <h1 className="text-3xl font-bold tracking-tight">
            Go <span className="text-gradient">live</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Set up a stream in 30 seconds. Viewers pay per second; you and your collaborators
            get paid into your own wallets, automatically.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-border/60 p-1">
            <button
              type="button"
              onClick={() => setMode("live")}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === "live"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Video className="h-4 w-4" /> Go live (camera)
            </button>
            <button
              type="button"
              onClick={() => setMode("video")}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === "video"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Film className="h-4 w-4" /> Use a video
            </button>
          </div>

          <div className="glass mt-4 rounded-2xl border border-border/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Your payout wallet</div>
                <div className="text-xs text-muted-foreground">
                  {creatorWallet
                    ? "Your Driplet wallet (from email sign-in). Earnings land here."
                    : "Where your share lands. We auto-add & switch to Arc Testnet."}
                </div>
              </div>
              {host ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-500">
                  <Check className="h-3.5 w-3.5" /> {shortAddress(host)}
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={connect}>
                  <Wallet className="mr-2 h-4 w-4" /> Connect
                </Button>
              )}
            </div>
            {walletErr && <p className="mt-2 text-xs text-amber-500">{walletErr}</p>}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Stream title" required>
              <input className={inputCls} value={form.title} onChange={set("title")} placeholder="Live design workshop" />
            </Field>
            <Field label="Your name" required>
              <input className={inputCls} value={form.creator} onChange={set("creator")} placeholder="Ada" />
            </Field>
            <Field label="Location">
              <input className={inputCls} value={form.location} onChange={set("location")} placeholder="Kano, Nigeria" />
            </Field>
            {mode === "video" && (
              <Field label="Video URL" required hint="An .mp4 or HLS link viewers will watch. Upload support coming next.">
                <input className={inputCls} value={form.videoUrl} onChange={set("videoUrl")} placeholder="https://…/clip.mp4" />
              </Field>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Co-host name">
                <input className={inputCls} value={form.cohostName} onChange={set("cohostName")} placeholder="Bode (optional)" />
              </Field>
              <Field label="Co-host wallet" hint="Optional — they get 20%.">
                <input className={inputCls} value={form.cohostAddress} onChange={set("cohostAddress")} placeholder="0x… (optional)" />
              </Field>
            </div>

            <p className="text-xs text-muted-foreground">
              Split: 70% you · 20% co-host · 10% AI captions agent (90/10 if no co-host). The
              agent does real work and is paid into its own wallet too.
            </p>

            {error && <p className="text-sm text-amber-500">{error}</p>}

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Creating…" : mode === "live" ? "Go live with my camera" : "Publish stream"}
            </Button>
          </form>
        </section>
      )}
    </main>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-emerald-500";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="text-emerald-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
