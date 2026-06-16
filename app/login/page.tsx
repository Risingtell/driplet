"use client";

import { useState } from "react";
import Link from "next/link";
import { login } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-5">
      <Link href="/" className="absolute left-5 top-6">
        <Logo />
      </Link>
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="glass drip-glow w-full max-w-sm rounded-2xl p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Creator sign in
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Access your earnings dashboard.
        </p>

        <form action={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@studio.com" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 rounded-lg border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
          Demo access — <span className="font-mono text-foreground">admin@example.com</span> /{" "}
          <span className="font-mono text-foreground">123456</span>
        </p>
      </div>

      <Link
        href="/"
        className="mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to home
      </Link>
    </main>
  );
}
