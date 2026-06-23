import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignInForm } from "@/components/creator/signin-form";

export default function SignInPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-5">
      <Link href="/" className="absolute left-5 top-6">
        <Logo />
      </Link>
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <Suspense fallback={null}>
        <SignInGate />
      </Suspense>
    </main>
  );
}

async function SignInGate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/studio");
  return <SignInForm />;
}
