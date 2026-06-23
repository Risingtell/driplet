import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureWallet } from "@/app/creator/actions";

/** Magic-link return: exchange the code for a session, ensure a wallet, go to /creator. */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Create the creator's Circle wallet on first sign-in (best effort).
      try {
        await ensureWallet();
      } catch {
        // The /creator page will retry ensureWallet if this fails.
      }
      return NextResponse.redirect(`${origin}/creator`);
    }
  }
  return NextResponse.redirect(`${origin}/creator?error=auth`);
}
