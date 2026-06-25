import Link from "next/link";
import {
  ArrowRight,
  Radio,
  Coins,
  Wallet,
  Zap,
  Globe,
  ShieldCheck,
  Split,
  GraduationCap,
  Music,
  Gamepad2,
  PartyPopper,
  Server,
} from "lucide-react";

const useCases = [
  {
    icon: GraduationCap,
    title: "Classes & tutoring",
    body: "Teach a class or a skill. Students pay only for the minutes they attend — no course platform, no payout minimum.",
  },
  {
    icon: Music,
    title: "Music & performance",
    body: "Play a set or perform live. Fans pay by the second they listen, from anywhere USDC reaches.",
  },
  {
    icon: PartyPopper,
    title: "Events & shows",
    body: "Stream a wedding, ceremony, or show to people who couldn't make it in person.",
  },
  {
    icon: Gamepad2,
    title: "Gaming & watch-alongs",
    body: "Stream gameplay or react to content; viewers pay for the time they actually enjoy.",
  },
  {
    icon: Server,
    title: "Self-hosted streamers",
    body: "Already run Owncast? Drop in Driplet's sidecar and add per-second pay without changing your server.",
  },
  {
    icon: Globe,
    title: "Anyone the banks ignore",
    body: "No bank, no Patreon, no big following needed. If people watch, you earn — shown in ₦, settled in USDC.",
  },
];
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LiveDrip } from "@/components/landing/live-drip";

const steps = [
  {
    icon: Radio,
    title: "Go live",
    body: "Start any stream — a class, a set, a workshop. Driplet attaches to it; you change nothing about how you broadcast.",
  },
  {
    icon: Coins,
    title: "Viewers pay by the second",
    body: "Each second of watch time streams a fraction of a cent in USDC. Stop watching, stop paying. No subscription, no sign-up.",
  },
  {
    icon: Split,
    title: "Earn — and auto-split — instantly",
    body: "Every drip lands in the stream's own wallet and splits in real time between you, collaborators, and the tools it runs.",
  },
];

const pillars = [
  {
    icon: Zap,
    title: "Sub-cent & instant",
    body: "Payments as small as $0.000001, settled in under a second on Arc — impossible on any card network or normal chain.",
  },
  {
    icon: Wallet,
    title: "No bank required",
    body: "Get paid in USDC anywhere on earth. No Patreon, no Stripe account, no chargebacks eating your earnings.",
  },
  {
    icon: ShieldCheck,
    title: "Gas-free for fans",
    body: "Circle Gateway batches thousands of drips into one settlement, so viewers never touch gas or crypto plumbing.",
  },
  {
    icon: Globe,
    title: "Built for everyone left out",
    body: "Made for creators the global payment system ignores — starting where we live, reaching anywhere USDC flows.",
  },
];

export default function Landing() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5">
      {/* Header */}
      <header className="flex items-center justify-between py-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#use-cases" className="transition-colors hover:text-foreground">
            Use cases
          </a>
          <a href="#why" className="transition-colors hover:text-foreground">
            Why Driplet
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/studio/go-live">Go live</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="grid items-center gap-12 py-12 md:grid-cols-2 md:py-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-accent-foreground">
            <span className="size-1.5 rounded-full bg-primary animate-live" />
            Pay-per-second streaming · settled on Arc
          </span>

          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Get paid <span className="text-gradient">by the second</span>.
          </h1>

          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Driplet lets you earn USDC in real time as people watch you stream —
            a fraction of a cent every second. No subscriptions, no bank, no
            chargebacks. Stop watching, stop paying.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/studio/go-live">
                Go live <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/watch/ada-live">Watch the live demo</Link>
            </Button>
          </div>

          <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
            <div>
              <p className="tabular font-mono text-xl font-semibold text-foreground">
                &lt;500ms
              </p>
              <p className="text-xs">settlement on Arc</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="tabular font-mono text-xl font-semibold text-foreground">
                $0.000001
              </p>
              <p className="text-xs">smallest payment</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="tabular font-mono text-xl font-semibold text-foreground">
                0 gas
              </p>
              <p className="text-xs">for your fans</p>
            </div>
          </div>
        </div>

        <LiveDrip />
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          From going live to getting paid
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          Three steps. The hard part — settling thousands of sub-cent payments —
          happens invisibly.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="glass rounded-2xl p-6 transition-transform hover:-translate-y-1"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <s.icon className="size-5" />
                </span>
                <span className="tabular font-mono text-sm text-muted-foreground">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section id="use-cases" className="scroll-mt-20 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          Who it&apos;s for
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          If you have an audience and a stream, you can get paid for it — by the second.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((u) => (
            <div
              key={u.title}
              className="glass rounded-2xl p-6 transition-transform hover:-translate-y-1"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <u.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{u.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{u.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why */}
      <section id="why" className="scroll-mt-20 py-16">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          Why this couldn&apos;t exist before
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          A payment worth a fraction of a cent used to be impossible — fees cost
          more than the payment. Nanopayments on Arc change that.
        </p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="flex gap-4 rounded-2xl border border-border bg-card/40 p-6"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <p.icon className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="glass drip-glow relative overflow-hidden rounded-3xl px-8 py-14 text-center">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Turn every second of attention into income.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Set up in minutes. Your audience pays as they watch — you withdraw
            in USDC whenever you like.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/studio/go-live">
                Go live <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto flex flex-col items-center justify-between gap-4 border-t border-border py-8 text-sm text-muted-foreground sm:flex-row">
        <Logo />
        <nav className="flex items-center gap-6">
          <Link href="/impact" className="transition-colors hover:text-foreground">
            Live proof
          </Link>
          <Link href="/sidecar" className="transition-colors hover:text-foreground">
            Owncast sidecar
          </Link>
        </nav>
        <p>Streaming nanopayments · settled in USDC on Arc, powered by Circle.</p>
      </footer>
    </main>
  );
}
