"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Film, Radio, UploadCloud, Video, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectArcWallet, shortAddress } from "@/lib/arc-chain";
import { uploadToWalrus, WALRUS_MAX_BYTES } from "@/lib/walrus";
import { getWalletInfo } from "@/app/creator/actions";

/** The Go Live form (camera or video). Lives inside the Creator Studio layout. */
export function GoLiveForm() {
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
  const [onchainTx, setOnchainTx] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatorWallet, setCreatorWallet] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);

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

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);
    if (!file.type.startsWith("video/")) {
      setUploadErr("Please choose a video file.");
      return;
    }
    if (file.size > WALRUS_MAX_BYTES) {
      setUploadErr("Video must be 10 MB or smaller (Walrus testnet limit).");
      return;
    }
    setUploading(true);
    setUploadPct(0);
    setForm((f) => ({ ...f, videoUrl: "" }));
    try {
      const { blobId } = await uploadToWalrus(file, setUploadPct);
      // Serve through our content-type shim so the <video> tag plays it; the
      // bytes still live on Walrus (blob id is in the URL).
      const ct = encodeURIComponent(file.type || "video/mp4");
      const playback = `${window.location.origin}/api/video/${blobId}?ct=${ct}`;
      setForm((f) => ({ ...f, videoUrl: playback }));
      setUploadedName(file.name);
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!host) {
      setError("Connect your wallet first, that's where you get paid.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/streams/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, isLive: mode === "live", hostAddress: host }),
      });
      const json = (await res.json()) as { slug?: string; error?: string; onchainTx?: string };
      if (!res.ok || !json.slug) throw new Error(json.error ?? "Could not create stream");
      if (mode === "live") {
        router.push(`/broadcast/${json.slug}`);
        return;
      }
      setOnchainTx(json.onchainTx ?? null);
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

  if (created) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
          <Radio className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold">Your stream is ready 🎉</h1>
        <p className="mt-3 text-muted-foreground">
          Share this link. Every second someone watches, USDC drips to your wallet and
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
        {onchainTx && (
          <p className="mt-3 text-xs text-muted-foreground">
            <Check className="mr-1 inline h-3.5 w-3.5 text-primary" />
            Metadata recorded on Arc ·{" "}
            <a
              href={`https://testnet.arcscan.app/tx/${onchainTx}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              view transaction
            </a>
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link href={`/watch/${created}`}>
            <Button>Open your stream</Button>
          </Link>
          <Button variant="outline" onClick={() => setCreated(null)}>
            Create another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Go <span className="text-gradient">live</span>
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Viewers pay per second; you and your collaborators get paid into your own wallets,
        automatically.
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
          <div>
            <span className="mb-1.5 block text-sm font-medium">
              Video<span className="text-emerald-500"> *</span>
            </span>
            {form.videoUrl ? (
              <div className="glass flex items-center gap-2 rounded-lg border border-border/60 p-3 text-sm">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="truncate">
                  {uploadedName ?? "Uploaded"} · stored on Walrus
                </span>
                <button
                  type="button"
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setForm((f) => ({ ...f, videoUrl: "" }));
                    setUploadedName(null);
                    setUploadPct(0);
                  }}
                >
                  Replace
                </button>
              </div>
            ) : (
              <label
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center transition-colors hover:border-emerald-500 ${
                  uploading ? "pointer-events-none opacity-70" : ""
                }`}
              >
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
                {uploading ? (
                  <>
                    <span className="text-sm">Uploading to Walrus… {uploadPct}%</span>
                    <span className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full bg-emerald-500 transition-all"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">Upload a video</span>
                    <span className="text-xs text-muted-foreground">
                      MP4 up to 10 MB · stored on Walrus (decentralized)
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={onPickVideo}
                  disabled={uploading}
                />
              </label>
            )}
            {uploadErr && <p className="mt-1.5 text-xs text-amber-500">{uploadErr}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Co-host name">
            <input className={inputCls} value={form.cohostName} onChange={set("cohostName")} placeholder="Bode (optional)" />
          </Field>
          <Field label="Co-host wallet" hint="Optional, they get 20%.">
            <input className={inputCls} value={form.cohostAddress} onChange={set("cohostAddress")} placeholder="0x… (optional)" />
          </Field>
        </div>

        <p className="text-xs text-muted-foreground">
          Split: 70% you · 20% co-host · 10% AI co-host (90/10 if no co-host). The AI co-host does
          real work and is paid into its own wallet too. You and your co-host&apos;s shares can be
          changed any time from the studio — the AI co-host&apos;s is fixed.
        </p>

        {error && <p className="text-sm text-amber-500">{error}</p>}

        <Button
          type="submit"
          disabled={busy || uploading || (mode === "video" && !form.videoUrl)}
          className="w-full"
        >
          {busy
            ? "Creating…"
            : uploading
              ? "Uploading…"
              : mode === "live"
                ? "Go live with my camera"
                : "Publish stream"}
        </Button>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary";

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
