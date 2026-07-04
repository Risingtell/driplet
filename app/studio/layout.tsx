import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { getUserSafe } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { StudioSidebar } from "@/components/studio/sidebar";
import { ensureWallet, signOutCreator } from "@/app/creator/actions";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <StudioShell>{children}</StudioShell>
    </Suspense>
  );
}

async function StudioShell({ children }: { children: React.ReactNode }) {
  const user = await getUserSafe();
  if (!user) redirect("/signin");

  // Make sure the creator's Circle wallet exists (covers a failed callback).
  await ensureWallet().catch(() => {});

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
          <ThemeToggle />
          <form action={signOutCreator}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOut className="size-4" /> Sign out
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-5 md:grid md:grid-cols-[180px_1fr] md:gap-8">
        <aside className="md:py-1">
          <StudioSidebar />
        </aside>
        <main className="py-4 md:py-1">{children}</main>
      </div>
    </div>
  );
}
