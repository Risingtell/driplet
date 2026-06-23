"use server";

import { headers } from "next/headers";
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
}
