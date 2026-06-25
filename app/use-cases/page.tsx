import {
  Globe,
  GraduationCap,
  Music,
  Gamepad2,
  PartyPopper,
  Server,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { BackToTop } from "@/components/back-to-top";

const useCases = [
  {
    icon: GraduationCap,
    title: "Classes & tutoring",
    body: "Teach a class or a skill. Students pay only for the minutes they attend, with no course platform and no payout minimum.",
  },
  {
    icon: Music,
    title: "Music & performance",
    body: "Play a set or perform live. Fans pay by the second they listen, from anywhere USDC reaches.",
  },
  {
    icon: PartyPopper,
    title: "Events & shows",
    body: "Stream a wedding, ceremony, or show to people who couldn't make it there in person.",
  },
  {
    icon: Gamepad2,
    title: "Gaming & watch-alongs",
    body: "Stream gameplay or react to content, and viewers pay for the time they actually enjoy.",
  },
  {
    icon: Server,
    title: "Self-hosted streamers",
    body: "Already run Owncast? Drop in Driplet's sidecar and add per-second pay without changing your server.",
  },
  {
    icon: Globe,
    title: "Anyone the banks ignore",
    body: "No bank, no Patreon, no big following needed. If people watch, you earn, shown in ₦ and settled in USDC.",
  },
];

export default function UseCasesPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-5">
      <SiteHeader />
      <section className="py-12">
        <h1 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
          Who it&apos;s for
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          If you have an audience and a stream, you can get paid for it, by the second.
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
      <LandingFooter />
      <BackToTop />
    </main>
  );
}
