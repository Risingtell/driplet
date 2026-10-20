"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { formatUnits } from "viem";
import { createDeveloperWallet, getUsdc, withdrawUsdc } from "@/lib/circle";
import { getWithdrawable, withdrawGatewayEarnings } from "@/lib/creator-gateway";
import { resolveStream, creatorAddress, updateSplit } from "@/lib/streams-db";
import { AGENT_ROLES, payoutEndpointFilter } from "@/lib/settlement";

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
    const wallet = await createDeveloperWallet(user.id);
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

/**
 * The signed-in creator's wallet address and money. Stream payouts arrive as a
 * Circle Gateway balance owned by that address (`earnings`), not as USDC in the
 * wallet itself (`balance`, only non-zero if someone sent USDC there directly).
 * `withdrawable` is the earnings left after Gateway's fee for moving them.
 */
export async function getWalletInfo(): Promise<{
  address?: string;
  balance?: number;
  earnings?: number;
  withdrawable?: number;
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

  const [onchain, gateway] = await Promise.allSettled([
    getUsdc(data.circle_wallet_id),
    getWithdrawable(data.address),
  ]);
  return {
    address: data.address,
    balance: onchain.status === "fulfilled" ? onchain.value.amount : 0,
    earnings: gateway.status === "fulfilled" ? Number(formatUnits(gateway.value.balance, 6)) : 0,
    withdrawable: gateway.status === "fulfilled" ? Number(formatUnits(gateway.value.max, 6)) : 0,
  };
}

/**
 * Withdraw to any Arc address. Earnings come out of Gateway first (that's where
 * payouts land); USDC sitting in the wallet itself is used only when the amount
 * is more than the earnings can cover.
 */
export async function withdraw(formData: FormData): Promise<{
  ok?: true;
  state?: string;
  txHash?: string;
  fee?: string;
  error?: string;
}> {
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
    .select("circle_wallet_id, address")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { error: "No wallet found." };

  try {
    const [{ max }, onchain] = await Promise.all([
      getWithdrawable(data.address).catch(() => ({ max: 0n })),
      getUsdc(data.circle_wallet_id).catch(() => ({ amount: 0 })),
    ]);
    const fromEarnings = Number(formatUnits(max, 6));
    if (Number(amount) > fromEarnings && Number(amount) > onchain.amount) {
      return {
        error: `You can withdraw up to $${Math.max(fromEarnings, onchain.amount).toFixed(6)} right now.`,
      };
    }
    if (Number(amount) <= fromEarnings) {
      const res = await withdrawGatewayEarnings({
        walletId: data.circle_wallet_id,
        address: data.address as `0x${string}`,
        to: to as `0x${string}`,
        amount,
      });
      return { ok: true, state: "CONFIRMED", txHash: res.txHash, fee: res.fee };
    }
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
  /** What this creator has actually been paid from the stream: their payout
   *  rows, so it matches what reaches their wallet. */
  paidToYou: number;
  split: { name: string; role: string; share: number; fixed: boolean }[];
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
    const split = r.split as { name: string; role: string; share: number; address?: string }[];
    // Payout labels end in the payee's role, spaces written as underscores.
    const myRoles = new Set(
      split
        .filter((p) => (p.address ?? "").toLowerCase() === addr)
        .map((p) => p.role.replace(/\s+/g, "_")),
    );
    const [{ count }, { data: payouts }] = await Promise.all([
      admin
        .from("payment_events")
        .select("id", { count: "exact", head: true })
        .eq("endpoint", `/watch/${r.slug}`),
      // Not what viewers paid in (a prepay is mostly unwatched credit, and the
      // co-host takes a share), but what the treasury actually paid this
      // creator for seconds watched.
      admin
        .from("payment_events")
        .select("endpoint, amount_usdc")
        .or(payoutEndpointFilter(r.slug)),
    ]);
    const paidToYou = (payouts ?? [])
      .filter((x) => myRoles.has((x.endpoint as string).split("/").pop() ?? ""))
      .reduce((s, x) => s + Number(x.amount_usdc ?? 0), 0);
    out.push({
      slug: r.slug,
      title: r.title,
      isLive: !!r.is_live,
      drips: count ?? 0,
      paidToYou,
      split: split.map((p) => ({
        ...p,
        fixed: AGENT_ROLES.has(p.role),
      })),
    });
  }
  return out;
}

/**
 * Let a stream's owner change what share of every second each existing human
 * payee gets (creator, co-host). Shares by role only — this doesn't add or
 * remove payees or change payout addresses, just re-splits the pie.
 *
 * AI co-host (AGENT_ROLES) shares are frozen and rejected if changed: /agent-pay
 * pays that role from its own hardcoded budget share, independent of whatever
 * `stream.split` says, so letting a creator edit it here would desync the two
 * and could push total payouts past 100% of the stream's real income.
 */
export async function updateStreamSplit(
  slug: string,
  shares: Record<string, number>,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = adminClient();
  const { data: creator } = await admin
    .from("creators")
    .select("address")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creator?.address) return { error: "No wallet yet." };

  const stream = await resolveStream(slug);
  if (!stream) return { error: "Unknown stream." };

  const owner = creatorAddress(stream);
  if (!owner || owner.toLowerCase() !== creator.address.toLowerCase()) {
    return { error: "You don't own this stream." };
  }

  const knownRoles = new Set(stream.split.map((p) => p.role));
  const extraRole = Object.keys(shares).find((role) => !knownRoles.has(role));
  if (extraRole) {
    return { error: `Unknown payee role "${extraRole}".` };
  }

  let sum = 0;
  const newSplit = [];
  for (const p of stream.split) {
    const share = shares[p.role];
    if (!Number.isFinite(share) || share < 0 || share > 1) {
      return { error: `Invalid share for ${p.role}.` };
    }
    if (AGENT_ROLES.has(p.role) && Math.abs(share - p.share) > 0.0005) {
      return {
        error: `${p.name}'s share is fixed and can't be changed here — it's paid separately from its own budget.`,
      };
    }
    sum += share;
    newSplit.push({ ...p, share });
  }
  if (Math.abs(sum - 1) > 0.001) {
    return { error: `Shares must add up to 100% (currently ${(sum * 100).toFixed(1)}%).` };
  }

  try {
    await updateSplit(slug, newSplit);
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
