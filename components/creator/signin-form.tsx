"use client";

import { useState } from "react";
import { Mail, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMagicLink } from "@/app/creator/actions";

export function SignInForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function action(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await sendMagicLink(formData);
    setPending(false);
    if (res?.error) setError(res.error);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="glass drip-glow w-full max-w-sm rounded-2xl p-8 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-500">
          <Check className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent you a sign-in link. Open it on this device to continue, your wallet is
          created automatically.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="glass drip-glow w-full max-w-sm rounded-2xl p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Creator sign in</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Sign in with your email, no password, no crypto wallet needed. We create your payout
        wallet for you.
      </p>
      <label className="mt-6 block text-sm font-medium">Email</label>
      <input
        name="email"
        type="email"
        required
        placeholder="you@example.com"
        className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      {error && <p className="mt-2 text-sm text-amber-500">{error}</p>}
      <Button type="submit" disabled={pending} className="mt-4 w-full">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Sending link…
          </>
        ) : (
          <>
            <Mail className="size-4" /> Email me a sign-in link
          </>
        )}
      </Button>
    </form>
  );
}
