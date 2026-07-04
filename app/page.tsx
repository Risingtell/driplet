import Link from "next/link";
import { ArrowRight, Radio, Coins, Split, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LiveDrip } from "@/components/landing/live-drip";
import { LandingFooter } from "@/components/landing/landing-footer";
import { BackToTop } from "@/components/back-to-top";

const steps = [
  {
    icon: Radio,
    title: "Go live",
    body: "Start any stream: a class, a set, a workshop. Driplet attaches to it, and you change nothing about how you broadcast.",
  },
  {
    icon: Coins,
    title: "Viewers pay by the second",
    body: "Each second of watch time streams a fraction of a cent in USDC. Stop watching, stop paying. No subscription, no sign-up.",
  },
  {
    icon: Split,
    title: "Earn and auto-split, instantly",
    body: "Every drip lands in the stream's own wallet and splits in real time between you, your collaborators, and the tools it runs.",
  },
];

export default function Landing() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 py-5">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-foreground/70 md:flex">
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <Link href="/use-cases" className="transition-colors hover:text-foreground">
            Use cases
          </Link>
          <Link href="/why" className="transition-colors hover:text-foreground">
            Why Driplet
          </Link>
        </nav>
        <div className="flex shrink-0 items-center gap-2.5">
          <ThemeToggle />
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
          >
            <Link href="/explore">
              <Play className="size-4" /> Watch live
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/studio/go-live">
              <Radio className="size-4" /> Go live
            </Link>
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
            Driplet lets you earn USDC in real time as people watch you stream, a fraction of a
            cent every second. No subscriptions, no bank, no chargebacks. Stop watching, stop
            paying.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/studio/go-live">
                Go live <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/watch/ada-live">Watch a demo stream</Link>
            </Button>
          </div>

          <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
            <div>
              <p className="tabular font-mono text-xl font-semibold text-foreground">&lt;500ms</p>
              <p className="text-xs">settlement on Arc</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="tabular font-mono text-xl font-semibold text-foreground">$0.000001</p>
              <p className="text-xs">smallest payment</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="tabular font-mono text-xl font-semibold text-foreground">0 gas</p>
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
          Three steps. The hard part, settling thousands of sub-cent payments, happens invisibly.
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
                <span className="tabular font-mono text-sm text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center gap-3 text-sm">
          <Link href="/use-cases" className="text-primary hover:underline">
            See who it&apos;s for
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link href="/why" className="text-primary hover:underline">
            Why it couldn&apos;t exist before
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="glass drip-glow relative overflow-hidden rounded-3xl px-8 py-14 text-center">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Turn every second of attention into income.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Set up in minutes. Your audience pays as they watch, and you withdraw in USDC whenever
            you like.
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

      <LandingFooter />
      <BackToTop />
    </main>
  );
}
