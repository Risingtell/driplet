"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { createCreatorWallet, getUsdc, withdrawUsdc } from "@/lib/circle";

/** Email a passwordless magic link. The link returns to /auth/callback. */
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email." };
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Sign in by typing the 6-digit code from the email instead of clicking the
 * link. Unlike the link (which only works in the browser that requested it,
 * because of the PKCE cookie), the code works from any device or browser.
 */
export async function verifyEmailCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  if (!email || !token) return { error: "Enter the code from the email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    return { error: "That code didn't work. It may have expired, request a new email." };
  }
  try {
    await ensureWallet();
  } catch {
    // The studio layout retries ensureWallet if this fails.
  }
  redirect("/studio");
}

/**
 * Ensure the signed-in creator has a Circle wallet on Arc. Creates one on first
 * call and stores it. Returns the wallet address.
 */
export async function ensureWallet(): Promise<{ address?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = adminClient();
  const { data: existing } = await admin
    .from("creators")
    .select("address")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { address: existing.address };

  try {
    const wallet = await createCreatorWallet(user.id);
    await admin.from("creators").insert({
      user_id: user.id,
      email: user.email,
      circle_wallet_id: wallet.id,
      address: wallet.address,
    });
    return { address: wallet.address };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** The signed-in creator's wallet address + USDC balance. */
export async function getWalletInfo(): Promise<{
  address?: string;
  balance?: number;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = adminClient();
  const { data } = await admin
    .from("creators")
    .select("circle_wallet_id, address")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { error: "No wallet yet." };

  try {
    const { amount } = await getUsdc(data.circle_wallet_id);
    return { address: data.address, balance: amount };
  } catch {
    return { address: data.address, balance: 0 };
  }
}

/** Withdraw USDC from the creator's wallet to any Arc address. */
export async function withdraw(formData: FormData) {
  const to = String(formData.get("to") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return { error: "Enter a valid 0x… address." };
  if (!(Number(amount) > 0)) return { error: "Enter an amount greater than 0." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = adminClient();
  const { data } = await admin
    .from("creators")
    .select("circle_wallet_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { error: "No wallet found." };

  try {
    const tx = await withdrawUsdc({ walletId: data.circle_wallet_id, to, amount });
    return { ok: true, state: tx.state };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function signOutCreator() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export interface CreatorStream {
  slug: string;
  title: string;
  isLive: boolean;
  drips: number;
  streamed: number;
}

/** Streams created by the signed-in creator (matched by their wallet in the split). */
export async function getCreatorStreams(): Promise<CreatorStream[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = adminClient();
  const { data: creator } = await admin
    .from("creators")
    .select("address")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator?.address) return [];
  const addr = creator.address.toLowerCase();

  const { data: rows } = await admin
    .from("streams")
    .select("slug, title, is_live, rate_per_second, split, created_at")
    .order("created_at", { ascending: false });

  const mine = (rows ?? []).filter(
    (r) =>
      Array.isArray(r.split) &&
      r.split.some((p: { address?: string }) => (p.address ?? "").toLowerCase() === addr),
  );

  const out: CreatorStream[] = [];
  for (const r of mine) {
    // Per-second watch payments (fixed price → count x rate)…
    const { count } = await admin
      .from("payment_events")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", `/watch/${r.slug}`);
    const drips = count ?? 0;
    // …plus lump payments from viewers' own wallets: MetaMask own-pay, Face ID
    // (passkey), and the AI patron. These were being ignored, so a creator who
    // earned only via Face ID saw $0. Sum their amounts.
    const { data: lumps } = await admin
      .from("payment_events")
      .select("amount_usdc")
      .in("endpoint", [`/own/${r.slug}`, `/passkey/${r.slug}`, `/patron/${r.slug}`]);
    const lumpTotal = (lumps ?? []).reduce((s, x) => s + Number(x.amount_usdc ?? 0), 0);
    out.push({
      slug: r.slug,
      title: r.title,
      isLive: !!r.is_live,
      drips,
      streamed: drips * Number(r.rate_per_second) + lumpTotal,
    });
  }
  return out;
}
