/**
 * Naira display helpers. Settlement is always USDC on Arc — this is a display
 * convenience so the local audience (who think in ₦, not $) can read amounts
 * naturally. The rate is approximate and easy to update; USDC stays the truth.
 */
export const USD_TO_NGN = 1600;

/** Format a USD amount as an approximate Naira string. */
export function naira(usd: number): string {
  const n = usd * USD_TO_NGN;
  return `₦${n.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: n < 100 ? 2 : 0,
  })}`;
}

/** Format a USD amount as a plain dollar string. */
export function usd(amount: number, dp = 4): string {
  return `$${amount.toFixed(dp)}`;
}
