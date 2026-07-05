# Judge quickstart — verify everything in under 3 minutes

No setup, no keys, no sign-up. Every claim below is checkable from a browser.

## Minute 1 — see real money move, caused by you

1. Open **https://trydriplet.vercel.app/watch/ada-live** and press play.
   Every second you watch sends a real $0.0003 USDC payment over x402, batched through
   Circle Gateway, settled on Arc testnet. The meter and the stream treasury update live.
2. In a second tab open **https://trydriplet.vercel.app/impact**.
   Watch your own per-second payments land in the live settlement feed within seconds,
   each with its Circle Gateway settlement id. The totals (23,000+ payments, 21 distinct
   paying wallets, 1,200+ autonomous agent payments, $0 failed) are computed from the
   same payment log the feed reads.

## Minute 2 — watch an AI agent decide whether to spend its own money

3. Trigger one autonomous cycle of the **AI patron** (an LLM viewer agent with its own
   funded wallet):

   ```bash
   curl -X POST https://trydriplet.vercel.app/api/agents/patron
   ```

   The response shows what it saw (every stream's live signals) and what it decided,
   in its own words. If a stream has viewers right now it pays from its own wallet
   (gasless EIP-3009, relayed on-chain); if everything is dead it refuses and says why.
   Its decision history, refusals included, is on `/impact` under "The AI patron".
4. On any watch page, the **AI co-host's budget ledger** (income → share cap → spent →
   decision) is printed live in the treasury panel: the earning-side agent pausing
   itself so the creator is always paid first.

## Minute 3 — verify on-chain, not on our word

5. **A patron payment on Arc:** open any `paid` decision's tx link on `/impact`
   (testnet.arcscan.app), sender is the patron wallet
   `0xFFc95764a6Bc62512a7459adC9C46bfC3f36cC0A`.
6. **Stream metadata on-chain:** every creator stream is registered in a `StreamRegistry`
   contract on Arc ([`0x1579…3a3a`](https://testnet.arcscan.app/address/0x1579746117fb136100423120f4f914f8b6991a3a)),
   with video blobs on Walrus. Read one straight from the chain:
   `https://trydriplet.vercel.app/api/streams/ada-live/onchain`
7. **The Owncast sidecar** (RFB #3 from Canteen's request-for-payments-founders list):
   live stats and explainer at **https://trydriplet.vercel.app/sidecar** — a webhook
   subscriber that adds per-second pay to any existing Owncast server, proven against a
   real Owncast 0.2.5 instance.

## If you have ten more minutes

- **Face ID onboarding:** on a watch page tap "Continue with Face ID" — a passkey creates
  a gasless ERC-4337 smart account (Circle Modular Wallets), fund it at
  [faucet.circle.com](https://faucet.circle.com) (Arc Testnet), and pay from your own
  wallet. Your address joins the distinct-wallet count on `/impact`.
- **Creator side:** sign in with Google at `/signin` — a Circle developer-controlled
  wallet is created for you automatically; go live with a camera and watch earnings
  settle per second.
- **Reusable primitives:** the README lists 9 standalone building blocks (metered
  per-second loop, autonomous multi-payee treasury, budget-aware agent payee, buyer
  agent, gasless own-wallet relay, passkey onboarding, hardened Gateway client, Owncast
  sidecar, on-chain metadata + Walrus files) and where each lives in the repo.

## The delta (what was built during Lepton)

Everything. First commit **2026-06-16**, one day after kickoff, starting from Circle's
open-source `arc-nanopayments` sample; **91 commits** later this is a live product with
real users. The full feature list and dates are in the README and `/roadmap`.
