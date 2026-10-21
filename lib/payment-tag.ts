import { keccak256, toHex } from "viem";

/**
 * 16 bytes a viewer's own USDC transfer carries after its normal arguments,
 * naming the stream it pays for. A transaction otherwise says nothing about the
 * stream, so without it any transfer to the treasury (someone else's payment,
 * an old top-up, a withdrawal mint) could be claimed as a prepay for whichever
 * stream asked first, and paid out to that stream's creator. Arc's USDC ignores
 * the extra calldata (about 256 more gas). Lowercase hex, no 0x.
 */
export function paymentTag(slug: string): string {
  return keccak256(toHex(`driplet:${slug}`)).slice(2, 34);
}
