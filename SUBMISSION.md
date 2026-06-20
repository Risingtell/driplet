# Driplet — Lepton Agents Hackathon submission copy

Paste-ready answers for the submission form
(https://docs.google.com/forms/d/e/1FAIpQLSd6ZDlIZuiUibZ0Q4YVJUiZVQwXnGgm6RB6Grtk52_idP0b3Q/viewform).
Refresh the traction numbers right before submitting (live values are at
`https://trydriplet.vercel.app/api/streams/ada-live/treasury`).

---

## Links
- **Live app:** https://trydriplet.vercel.app
- **Live proof feed (verify traction in real time):** https://trydriplet.vercel.app/impact
- **Source code:** https://github.com/Risingtell/driplet
- **Demo video:** https://youtu.be/O2HQRyAxLY0
- **Try it:** open https://trydriplet.vercel.app/watch/ada-live and just watch — you'll
  see real per-second USDC payments settle on Arc. Creator view:
  /dashboard (login `admin@example.com` / `123456`).

## Project name
Driplet

## One-liner / tagline
Per-second streaming payments for creators — watch a stream, your wallet drips real
USDC by the second on Arc; stop watching, stop paying. No bank, no subscription.

## What it does (elevator)
Driplet turns "watch time" into money, one second at a time. A viewer opens a stream
and their wallet streams sub-cent USDC (as low as $0.0003/second) to the creator using
Circle's nanopayments on Arc. Every stream has its own **autonomous on-chain treasury**
that splits the income in real time across the creator, co-hosts, and an **AI agent**
that it pays for live services — so money flows in *and* out automatically, by the second.

## The problem
A creator with a small, local audience can't get paid online. Patreon, Stripe and
YouTube require a bank account, a sizeable audience, and can't process tiny payments —
their fees alone exceed a sub-cent tip. Unbanked creators (like those in my own Kano,
Nigeria network) are completely shut out. Micropayments have been "coming soon" for a
decade because the rails didn't exist. Arc + Circle nanopayments make them exist today.

## How it uses Arc + the Circle Agent Stack
- **Arc (Circle's USDC L1)** is the settlement layer — every per-second payment is a
  real testnet USDC settlement, verifiable on-chain.
- **Circle Gateway nanopayments** batch the per-second drips into gas-free, signed
  (EIP-3009) settlements — we never send a raw per-second transaction (Arc's ~$0.01
  base fee would make that impossible); the agent deposits to Gateway and settles in
  batches, x402-v2 compatible.
- **x402** is the payment protocol on each tick and for the AI agent's paid calls.
- The whole thing is built on Circle's `@circle-fin/x402-batching` Gateway client and
  the Agent Stack sample as a foundation.

## The agentic element (why this is an *agents* project)
Each stream runs an **autonomous treasury agent**: it receives the viewer's per-second
income, splits it live (70% creator / 20% co-host / 10% AI), and **pays an AI captions
agent per call, out of the stream's own earnings**, to its own wallet — a closed
earn-and-spend loop with no human in the middle. The treasury is on-chain, the split is
automatic, and the AI agent is a first-class economic participant, not a feature. This is
"agents transacting autonomously," which is exactly what prior Arc winners were built on.

## Traction (real people, real on-chain payments)
Driplet is **already in front of real users.** I shared it into real WhatsApp creator
communities in Kano and people used it. Live, on-chain, on Arc testnet:
- **10,730+** real per-second watch-payments (~179 minutes streamed and paid for)
- **529** autonomous payments to the AI agent
- **~$3.22** streamed end-to-end (creator + co-host + agent), split correctly 70/20/10
- **0% failed payments**
- **Verify it live:** https://trydriplet.vercel.app/impact streams every settlement with
  its Circle Gateway settlement id, updating in real time — open it and watch traction land.
- Visitor analytics via Vercel Web Analytics (the on-chain count can't dedupe people
  because payments come from a shared demo viewer wallet).

These are unbanked creators — a market Patreon, Stripe and YouTube don't serve. That's
the moat: real distribution into a community that genuinely needs this rail.

## Why we'll keep building (intent to continue)
This isn't a hackathon throwaway. The next steps are already mapped: a real **Owncast
webhook sidecar** so any live-stream instance can settle per-second permissionlessly
(matching Canteen's "settlement-grade event stream" pattern), wallet-connect so real
creators use their *own* wallets, an editable negotiable revenue-split UI, and onboarding
more Kano creators. Per-second money for creators the existing platforms ignore is a
mission, not a demo — we continue past June 30.

## Open-source / sidecar track
Driplet is designed as a **plugin/sidecar**, not a fork: it reads stream "watch" events
and settles them without modifying the streaming server, so an Owncast/PeerTube operator
can deploy it permissionlessly. That maps directly to the Arc OSS / sidecar pattern.

## Builder
Solo builder — Rising Technology, Kano, Nigeria. I built the whole stack: the Arc/Circle
nanopayment loop, the autonomous treasury + AI-agent payee, the viewer and creator apps,
and the real-creator distribution. (Proudest prior project: SolMate, an AI agent that
explains Solana wallets in plain English — solmate-hazel.vercel.app.)

---

## $500 Circle/Arc developer-experience feedback (separate form field)
Three real bugs/gaps I hit building on the Circle Agent Stack sample, with fixes:

1. **Gateway deposit "available" race.** The agent deposits to Gateway then pays
   immediately, but the deposit isn't spendable for a few seconds, so the first
   payments fail. Fix: poll `getBalances` until `available > 0` before the first
   settlement. Suggest the SDK expose a `waitForAvailable()` helper.
2. **Transient connect-timeout to `gateway-api-testnet.circle.com`.** The deposit
   wait crashed on an undici connect-timeout. Fix: wrap in try/catch with a retry.
   Suggest built-in retry/backoff on the Gateway client.
3. **Stale `maxTimeoutSeconds` in the sample (the real blocker).** The sample uses
   `maxTimeoutSeconds: 345600` (4 days), but Circle Gateway now requires the EIP-3009
   `validBefore` to be ≥7 days (604800) + buffer, or it returns
   `authorization_validity_too_short`. Fix: set `604900` and pass the explicit
   facilitator URL `https://gateway-api-testnet.circle.com` (the sample omits it).
   Please update the published sample — every new builder hits this on payment #1.
