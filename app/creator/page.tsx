import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignInForm } from "@/components/creator/signin-form";
import { WalletPanel } from "@/components/creator/wallet-panel";
import { ensureWallet, getWalletInfo } from "./actions";

export default function CreatorPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col px-5">
      <header className="flex items-center justify-between py-6">
        <Link href="/">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <Suspense fallback={<div className="py-10 text-sm text-muted-foreground">Loading…</div>}>
        <CreatorContent />
      </Suspense>
    </main>
  );
}

async function CreatorContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center py-6">
        <SignInForm />
      </div>
    );
  }

  // Make sure the wallet exists (covers the case where callback creation failed).
  let info = await getWalletInfo();
  if (info.error) {
    await ensureWallet();
    info = await getWalletInfo();
  }

  return (
    <div className="py-2">
      <WalletPanel
        email={user.email ?? ""}
        address={info.address ?? ""}
        balance={info.balance ?? 0}
      />
    </div>
  );
}
