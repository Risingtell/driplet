import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleDashed, Telescope } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { BackToTop } from "@/components/back-to-top";

export const metadata: Metadata = {
  title: "Roadmap · Driplet",
  description: "What Driplet has shipped, what's being built next, and the big bet after that.",
};

const shipped = [
  {
    title: "Per-second payments",
    body: "Sub-cent USDC per second watched, over x402 and Circle Gateway on Arc. 23,000+ real settlements, zero failures.",
  },
  {
    title: "Autonomous stream treasury",
    body: "Every stream splits its income live between the creator, a co-host, and its AI agent, each to their own wallet, no human in the loop.",
  },
  {
    title: "A real AI co-host that earns",
    body: "A live LLM writes real commentary and is paid per call out of the stream's own earnings. Budget-aware: it pauses itself rather than out-earn its share, and its ledger reasoning is on screen.",
  },
  {
    title: "An AI patron that spends",
    body: "An autonomous viewer agent with its own funded wallet decides what deserves its money and pays gaslessly from its own address. Every decision, refusals included, is public on the live proof page.",
  },
  {
    title: "Face ID wallet onboarding",
    body: "A passkey creates a gasless smart-account wallet right in the browser (Circle Modular Wallets). No app, no seed phrase, no extension.",
  },
  {
    title: "Pay from your own wallet, gas-free",
    body: "One EIP-3009 signature and the treasury relays it on-chain. No gas, no deposit, no plumbing.",
  },
  {
    title: "Real live video, screen share, and chat",
    body: "Broadcast a camera or upload a video, share your screen, chat live, save creator profiles, explore streams.",
  },
  {
    title: "Decentralized storage end to end",
    body: "Video files on Walrus, stream metadata recorded on-chain on Arc in a StreamRegistry contract, readable straight back from the chain.",
  },
  {
    title: "Owncast per-second sidecar",
    body: "A drop-in webhook subscriber that adds per-second pay to any self-hosted Owncast server, no fork, no proxy. Proven against a real Owncast instance.",
  },
  {
    title: "Creator studio with auto-created wallets",
    body: "Email sign-in creates a Circle wallet on Arc automatically. Go live, watch earnings settle, withdraw USDC.",
  },
];

const next = [
  {
    title: "Passkey login for creators",
    body: "Creators sign in and self-custody their payout wallet with Face ID, the same way viewers already pay.",
  },
  {
    title: "Editable revenue splits",
    body: "Creators set their own terms: who gets what share of every second, changed from the studio.",
  },
  {
    title: "Live transcription for the co-host",
    body: "The AI co-host hears real speech and captions it, so its paid work grows with the stream.",
  },
  {
    title: "The sidecar family",
    body: "The same settlement core for Jellyfin (per-minute VOD) and PeerTube (payments plugin), plus a native Owncast plugin when v0.3.0's plugin system lands. Today's webhook sidecar already works with every Owncast deployed now.",
  },
  {
    title: "Mainnet",
    body: "From testnet proof to real earnings for the creators this was built for.",
  },
];

export default function RoadmapPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-5">
      <SiteHeader />

      <section className="py-12">
        <h1 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Roadmap</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          Built in the open. Everything under &quot;shipped&quot; is live at{" "}
          <Link href="/" className="text-primary hover:underline">
            trydriplet.vercel.app
          </Link>{" "}
          and verifiable on-chain at{" "}
          <Link href="/impact" className="text-primary hover:underline">
            /impact
          </Link>
          .
        </p>
      </section>

      <section className="pb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="size-5 text-emerald-500" /> Shipped
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
            live now
          </span>
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {shipped.map((item) => (
            <div key={item.title} className="glass rounded-2xl border border-border/60 p-5">
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CircleDashed className="size-5 text-cyan-500" /> Building next
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {next.map((item) => (
            <div key={item.title} className="glass rounded-2xl border border-border/60 p-5">
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-12">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Telescope className="size-5 text-violet-500" /> The big bet
        </h2>
        <div className="glass mt-4 rounded-2xl border border-violet-500/25 p-6">
          <h3 className="font-medium">Decentralized storage, coordinated on Arc</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Driplet already proved a per-second settlement core: money flows continuously to
            whoever is delivering value right now. Pointed at storage instead of watching, that
            becomes a blob-storage protocol coordinated on Arc: independent providers bond USDC
            on-chain, store content-addressed blobs, answer availability challenges, and earn for
            every epoch they provably hold data. It would fill the gap that made us pair Arc with
            Walrus for video storage, and it&apos;s the kind of composable primitive the Arc
            ecosystem doesn&apos;t have yet. Same engine, much bigger road.
          </p>
        </div>
      </section>

      <LandingFooter />
      <BackToTop />
    </main>
  );
}
