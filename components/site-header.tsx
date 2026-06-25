import Link from "next/link";
import { Radio } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

/**
 * Shared public navigation. Used on viewer-facing pages (watch, etc.) so people
 * can always get home, learn about the platform, or go live — no dead ends.
 */
export function SiteHeader() {
  return (
    <header className="flex items-center justify-between py-5">
      <Link href="/" aria-label="Driplet home">
        <Logo />
      </Link>
      <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
        <Link href="/" className="transition-colors hover:text-foreground">
          Home
        </Link>
        <Link href="/#how" className="transition-colors hover:text-foreground">
          How it works
        </Link>
        <Link href="/use-cases" className="transition-colors hover:text-foreground">
          Use cases
        </Link>
        <Link href="/why" className="transition-colors hover:text-foreground">
          Why
        </Link>
        <Link href="/explore" className="transition-colors hover:text-foreground">
          Explore
        </Link>
      </nav>
      <div className="flex items-center gap-3">
        <Link
          href="/explore"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          Explore
        </Link>
        <ThemeToggle />
        <Button asChild size="sm">
          <Link href="/studio/go-live">
            <Radio className="size-4" /> Go live
          </Link>
        </Button>
      </div>
    </header>
  );
}
