import type { Metadata } from "next";
import Link from "next/link";
import { Compass, House } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-5">
      <SiteHeader />
      <section className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          This page isn&apos;t here
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The link may be old, or the stream may have been taken down. Every live stream and
          creator is on Explore.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/explore">
              <Compass className="size-4" /> Explore streams
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <House className="size-4" /> Home
            </Link>
          </Button>
        </div>
      </section>
      <LandingFooter />
    </main>
  );
}
