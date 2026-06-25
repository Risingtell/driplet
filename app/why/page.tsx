import { Zap, Wallet, ShieldCheck, Globe } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { BackToTop } from "@/components/back-to-top";

const pillars = [
  {
    icon: Zap,
    title: "Sub-cent & instant",
    body: "Payments as small as $0.000001, settled in under a second on Arc. That was impossible on any card network or normal chain.",
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
    body: "Made for creators the global payment system ignores, starting where we live, reaching anywhere USDC flows.",
  },
];

export default function WhyPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-5">
      <SiteHeader />
      <section className="py-12">
        <h1 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Why this couldn&apos;t exist before
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          A payment worth a fraction of a cent used to be impossible, because the fee cost more
          than the payment. Nanopayments on Arc change that.
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
      <LandingFooter />
      <BackToTop />
    </main>
  );
}
