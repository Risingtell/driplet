import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const product = [
  { href: "/explore", label: "Watch live" },
  { href: "/studio/go-live", label: "Go live" },
  { href: "/impact", label: "Live proof" },
  { href: "/roadmap", label: "Roadmap" },
];

const learn = [
  { href: "/use-cases", label: "Use cases" },
  { href: "/why", label: "Why Driplet" },
  { href: "/sidecar", label: "Sidecar family" },
];

export function LandingFooter() {
  return (
    <footer className="mt-auto border-t border-border pb-8 pt-10 text-sm">
      <div className="flex flex-col gap-10 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Get paid by the second. Streaming nanopayments for creators, settled in USDC on Arc,
            powered by Circle.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Product
            </h3>
            <ul className="mt-3 space-y-2">
              {product.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Learn
            </h3>
            <ul className="mt-3 space-y-2">
              {learn.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-primary">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contact
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="https://x.com/agentdriplet"
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-primary"
                >
                  X · @agentdriplet
                </a>
              </li>
              <li>
                <a
                  href="mailto:agentdriplet@gmail.com"
                  className="transition-colors hover:text-primary"
                >
                  agentdriplet@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
        <p>© 2026 Driplet</p>
        <p>Built on Arc · Powered by Circle</p>
      </div>
    </footer>
  );
}
