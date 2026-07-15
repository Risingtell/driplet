import "server-only";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { createDeveloperWallet, getUsdc } from "@/lib/circle";

/**
 * Ensure the signed-in viewer has a Circle wallet on Arc, so they can pay
 * without a browser wallet or passkey. Creates one on first call and stores
 * it. Mirrors ensureWallet() in app/creator/actions.ts, kept separate since
 * viewers and creators are different roles.
 */
export async function ensureViewerWallet(): Promise<{
  address?: string;
  walletId?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = adminClient();
  const { data: existing } = await admin
    .from("viewer_wallets")
    .select("circle_wallet_id, address")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { address: existing.address, walletId: existing.circle_wallet_id };

  try {
    const wallet = await createDeveloperWallet(user.id);
    await admin.from("viewer_wallets").insert({
      user_id: user.id,
      email: user.email,
      circle_wallet_id: wallet.id,
      address: wallet.address,
    });
    return { address: wallet.address, walletId: wallet.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** The signed-in viewer's wallet address + USDC balance, creating the wallet if needed. */
export async function getViewerWalletInfo(): Promise<{
  address?: string;
  walletId?: string;
  balance?: number;
  error?: string;
}> {
  const ensured = await ensureViewerWallet();
  if (ensured.error || !ensured.walletId) return ensured;

  try {
    const { amount } = await getUsdc(ensured.walletId);
    return { address: ensured.address, walletId: ensured.walletId, balance: amount };
  } catch {
    return { address: ensured.address, walletId: ensured.walletId, balance: 0 };
  }
}
