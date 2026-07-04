import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function LandingFooter() {
  return (
    <footer className="mt-auto flex flex-col items-center justify-between gap-4 border-t border-border py-8 text-sm text-muted-foreground sm:flex-row">
      <Logo />
      <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <Link href="/explore" className="transition-colors hover:text-foreground">
          Explore
        </Link>
        <Link href="/use-cases" className="transition-colors hover:text-foreground">
          Use cases
        </Link>
        <Link href="/why" className="transition-colors hover:text-foreground">
          Why Driplet
        </Link>
        <Link href="/impact" className="transition-colors hover:text-foreground">
          Live proof
        </Link>
        <Link href="/sidecar" className="transition-colors hover:text-foreground">
          Owncast sidecar
        </Link>
        <Link href="/roadmap" className="transition-colors hover:text-foreground">
          Roadmap
        </Link>
        <a
          href="https://x.com/agentdriplet"
          target="_blank"
          rel="noreferrer"
          className="transition-colors hover:text-foreground"
        >
          @agentdriplet
        </a>
      </nav>
      <p>Streaming nanopayments, settled in USDC on Arc, powered by Circle.</p>
    </footer>
  );
}
