"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Loader2, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMagicLink, verifyEmailCode } from "@/app/creator/actions";
import { createClient } from "@/lib/supabase/client";

// Google sign-in renders once the Google provider is configured in Supabase
// and this flag is set in the environment (no redeploy of logic needed).
const GOOGLE_ENABLED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_SIGNIN);

export function SignInForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The auth callback lands here with ?error=auth when a link couldn't be
  // used — most often because it was opened in a different browser or app
  // than the one that requested it.
  const linkFailed = useSearchParams().get("error") === "auth";

  async function action(formData: FormData) {
    setPending(true);
    setError(null);
    setEmail(String(formData.get("email") ?? "").trim());
    const res = await sendMagicLink(formData);
    setPending(false);
    if (res?.error) setError(res.error);
    else setSent(true);
  }

  async function verify(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await verifyEmailCode(formData);
    // On success the action redirects to /studio and never returns.
    setPending(false);
    if (res?.error) setError(res.error);
  }

  async function google() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser navigates to Google and never reaches here.
    if (err) {
      setError(err.message);
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="glass drip-glow w-full max-w-sm rounded-2xl p-8">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-500">
          <Check className="size-6" />
        </div>
        <h1 className="text-center text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Type the 6-digit code from the email below. (The sign-in link in the email works too,
          but only in the browser you used to request it.)
        </p>
        <form action={verify} className="mt-5">
          <input type="hidden" name="email" value={email} />
          <label className="block text-sm font-medium">6-digit code</label>
          <input
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="123456"
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
          />
          {error && <p className="mt-2 text-sm text-amber-500">{error}</p>}
          <Button type="submit" disabled={pending} className="mt-4 w-full">
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Signing in…
              </>
            ) : (
              <>
                <KeyRound className="size-4" /> Sign in with the code
              </>
            )}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setError(null);
          }}
          className="mt-3 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Use a different email
        </button>
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
      {linkFailed && !error && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-500">
          That sign-in link didn&apos;t work. Links only open in the browser that requested them,
          so enter your email again and type the 6-digit code from the email instead.
        </p>
      )}
      {GOOGLE_ENABLED && (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={google}
            className="mt-6 w-full"
          >
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.1-7-5.1L1.2 17.2C3.2 21.2 7.3 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5 14.3a7.3 7.3 0 0 1 0-4.6L1.2 6.8a12 12 0 0 0 0 10.4L5 14.3Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.6c1.8 0 3 .8 3.7 1.4l2.7-2.7C16.5 1.6 14 .5 12 .5 7.3.5 3.2 3.3 1.2 6.8L5 9.7c1-3 3.8-5.1 7-5.1Z"
              />
            </svg>
            Continue with Google
          </Button>
          <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or with email{" "}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
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
            <Mail className="size-4" /> Email me a sign-in code
          </>
        )}
      </Button>
    </form>
  );
}
