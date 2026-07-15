# Driplet, get paid by the second

[![live: trydriplet.vercel.app](https://img.shields.io/badge/live-trydriplet.vercel.app-14b8a6)](https://trydriplet.vercel.app)
[![proof feed: /impact](https://img.shields.io/badge/proof_feed-%2Fimpact-0ea5e9)](https://trydriplet.vercel.app/impact)
[![settles on Arc testnet](https://img.shields.io/badge/settles_on-Arc_testnet-1f1f1f)](https://testnet.arcscan.app)
[![payments: Circle x402 + Gateway](https://img.shields.io/badge/payments-Circle_x402_%2B_Gateway-2775CA)](https://github.com/circlefin/arc-nanopayments)
[![demo video](https://img.shields.io/badge/demo-YouTube-ff0000)](https://youtu.be/PaQt4rzGJC4)
[![X: @agentdriplet](https://img.shields.io/badge/X-%40agentdriplet-000000)](https://x.com/agentdriplet)

**Pay-per-second live-stream monetization in USDC, settled on Arc.**

### ⏱️ Judging this? Verify every claim in under 3 minutes → [JUDGE-QUICKSTART.md](./JUDGE-QUICKSTART.md)

> ## **25,700+ real settlements · 22+ distinct paying wallets · 1,400+ autonomous agent payments · $7.72+ USDC streamed · 0 failures**
> All on-chain on Arc testnet, recomputed live at **[trydriplet.vercel.app/impact](https://trydriplet.vercel.app/impact)** *(snapshot 2026-07-10, and still climbing — check the live number)*

A creator goes live, and viewers pay a fraction of a cent for every second they watch. Stop watching, stop paying. No subscription, no bank account, no chargebacks. Each stream runs its own autonomous on-chain treasury that splits incoming drips in real time between the creator, a co-host, and a real AI agent it pays for live commentary, so money flows in from the audience and back out to people and agents with no platform in the middle.

> Built for the **Lepton Agents Hackathon** (Canteen, with Circle on Arc). Answers **RFB #3, the "Owncast per-second streaming webhook sidecar"** from Canteen's request-for-payments-founders list, live at [`/sidecar`](https://trydriplet.vercel.app/sidecar).
> **Circle stack used:** Gateway Nanopayments (batched EIP-3009, makes sub-cent payments viable) · x402 (every charge and agent call) · Developer-Controlled Wallets (creator payouts) · Modular Wallets passkey/Face ID (gasless viewer onboarding) · plus a gasless EIP-3009 relay for own-wallet pay.
> Live: **https://trydriplet.vercel.app** · Proof feed: **/impact** · Demo video: **[youtu.be/PaQt4rzGJC4](https://youtu.be/PaQt4rzGJC4)** · X: **[@agentdriplet](https://x.com/agentdriplet)**

## The delta: everything here was built during Lepton

First commit **June 16, 2026** (one day after kickoff), starting from Circle's open-source [`arc-nanopayments`](https://github.com/circlefin/arc-nanopayments) sample. **91 commits later**: real live video, the autonomous treasury, two AI agents with money of their own, Face ID onboarding, the Owncast sidecar, on-chain stream metadata with Walrus storage, and real users in Kano paying from 22+ distinct wallets. Judges score the gap; the gap is the whole repo.

---

## Why this couldn't exist before

A payment worth a fraction of a cent was impossible when the fee cost more than the payment. Circle Nanopayments on Arc change that: gas-free USDC transfers as small as `$0.000001`, sub-second finality, batched settlement. Driplet uses that to price the one thing every creator already has, attention, by the second. Amounts are shown in Naira (₦) for the local audience even though they settle in USDC.

## What it does

- **Pay-per-second watching.** The viewer's player sends one nanopayment per second to the creator over x402, batched and settled gas-free through Circle Gateway. Watch time becomes settled USDC.
- **Autonomous stream treasury.** Each stream is its own economic entity. As drips arrive, the treasury splits them live across payees and pays a real AI agent out of its own earnings, a genuine agent-to-agent payment with no human in the loop.
- **A real AI co-host.** The agent runs a live LLM that writes real one-line commentary and gets paid per call on-chain into its own wallet. Earn and spend, closed loop.
- **Owncast sidecar.** A drop-in webhook subscriber that adds per-second pay to any self-hosted Owncast stream without changing a line of Owncast. Proven end to end against a real Owncast server. This is the "Owncast per-second streaming webhook sidecar" from Canteen's request-for-payments-founders list. Because it only consumes Owncast's standard webhooks, it works with **every Owncast deployed today** — no fork, no proxy in the video path, no waiting on a plugin framework — and the same settlement core can become a native plugin when Owncast v0.3.0's plugin system lands.
- **A budget-aware agent, with its reasoning on screen.** The co-host decides every cycle whether paying itself keeps it within its 10% share of what the stream actually earned, and pauses itself when it wouldn't, so the creator is always paid first. Its ledger ("income → my share cap → spent → decision") is shown live on the watch page and in the treasury panel.
- **An autonomous AI patron that pays from its own wallet.** A viewer agent with its own funded USDC wallet looks at what's streaming (host on air, viewers present, chat activity, price) and decides with an LLM whether any stream deserves its money right now. When it pays, it signs a gasless EIP-3009 payment from its own address into the stream's treasury; when it doesn't, it says why. Every decision, including refusals, is public on [`/impact`](https://trydriplet.vercel.app/impact) — and anyone can trigger a cycle (`POST /api/agents/patron`, self-throttled) and watch it think. With the co-host earning on the other side, autonomous agents sit on **both sides** of the economy.
- **Pay from your own wallet.** Viewers can optionally pay from their own wallet with a single gasless EIP-3009 signature (no gas, no Gateway deposit); the treasury relays it on-chain. The shared demo wallet stays the default so anyone can try it with zero setup.
- **Face ID onboarding for people with no wallet.** A viewer can create a gasless smart-account wallet right in the browser with a passkey (Circle Modular Wallets, ERC-4337, gas sponsored by Circle's paymaster), fund it at the faucet, and pay the creator from their own address. No app, no seed phrase, no extension.
- **Email onboarding as a second no-wallet path.** A viewer can instead sign in with a one-time email code and get a Circle developer-controlled wallet auto-created, the same mechanism the creator studio already uses. Payment happens server-side via Circle's Transaction API rather than an ERC-4337 UserOperation, so it doesn't depend on the passkey path's bundler at all.
- **Live video, screen share, and chat.** Broadcast a camera (LiveKit) or post a recorded video, share your screen, flip front/back camera, and chat live. Video uploads are stored on Walrus (decentralized storage).
- **Decentralized storage end to end.** Each stream's metadata and its Walrus blob pointer are recorded on-chain on Arc (a `StreamRegistry` contract); the video files live on Walrus. Metadata on Arc, blobs on Walrus, readable back at `/api/streams/[slug]/onchain`.
- **Creator profiles and discovery.** Public profiles you can save (a browser bookmark, no account) and an Explore page to search streams and creators.
- **Creator studio.** Email sign-in auto-creates a Circle wallet on Arc; go live, see earnings, and withdraw USDC.

## How it works

```
Viewer ──$0.0003/sec──▶ stream charge endpoint (x402 + Circle Gateway) ──▶ stream treasury on Arc
                                                                              │
                                       splits in real time, no human         ▼
            Creator (70%)  ◀──  Co-host (20%)  ◀──  AI co-host (10%, own wallet, real LLM)
```

Every payment is a signed, gas-free off-chain authorization that Circle Gateway batches into a single on-chain settlement on Arc, which makes thousands of sub-cent payments per session economically viable.

## How it maps to the judging criteria

| Criterion | Where in Driplet |
| --- | --- |
| **Agentic sophistication (30%)** | Autonomous agents on both sides of the money. Spending side: an AI patron with its own funded wallet decides with an LLM which streams deserve its money and pays them gaslessly from its own address, publishing every decision (including refusals) with its reasoning. Earning side: a real LLM co-host that each stream's autonomous treasury pays per call out of its own income, budget-aware (it pauses itself rather than out-earn its share) with its ledger reasoning shown live on the watch page. |
| **Traction (30%)** | 25,300+ real settlements from real viewers reached through WhatsApp creator communities in Kano; 22+ distinct wallets that paid from their own address; every settlement verifiable live at [`/impact`](https://trydriplet.vercel.app/impact). |
| **Circle tool usage (20%)** | Gateway nanopayments (batched EIP-3009) + x402 for every per-second charge and agent call; Developer-Controlled Wallets for creator payouts and email-based viewer onboarding; Modular Wallets (passkey/Face ID) with paymaster-sponsored ERC-4337 as a second viewer onboarding path; a gasless EIP-3009 relay for own-wallet pay. |
| **Innovation (20%)** | Per-second paid live video with a multi-payee on-chain treasury; the Owncast sidecar from Canteen's request-for-payments-founders list, proven against a real Owncast server; Face ID wallet onboarding for non-crypto viewers; stream metadata on Arc with video on Walrus. |

## Reusable Arc primitives (open source)

The Circle samples show a single buyer-to-seller x402 payment. Driplet adds the pieces you need once payments actually stream and get shared out, and they are meant to be lifted out of the repo:

1. **A metered per-second payment loop** (continuous sub-cent nanopayments, batched gas-free).
2. **An autonomous treasury that splits revenue in real time** to several wallets, each its own address on Arc.
3. **A real AI agent as an on-chain payee** that does real work and earns and spends on its own.
4. **A hardened server-side Gateway client** (lazy connect, auto-deposit, wait until spendable, shared in-flight deposit, retry on transient timeouts).
5. **A permissionless Owncast sidecar** built on the same shared settlement core.
6. **Gasless own-wallet payments** via relayed EIP-3009 (pay from a wallet with one signature, no on-chain transaction by the user).
7. **On-chain metadata with off-chain files** (a `StreamRegistry` on Arc plus Walrus blobs), a clean split for apps that want records on-chain and large files off-chain.
8. **Face ID wallet onboarding** (Circle Modular Wallets): a passkey creates a gasless ERC-4337 smart account on Arc in the browser, gas sponsored, paying in the same USDC as the rest of the app. A reusable "let a normal person get a paying wallet with their face" flow.
9. **An autonomous buyer agent** (`lib/patron.ts`): an LLM-driven agent with its own wallet that evaluates live signals, decides what's worth paying for, pays gaslessly via signed EIP-3009, and records every decision with its reasoning. A reusable "agent that spends its own money accountably" template.

## Traction

Every number in this README comes from the same on-chain settlement log that's live at [`/impact`](https://trydriplet.vercel.app/impact) — real per-second payments from real viewers, distinct wallets that paid from their own address (own-wallet or Face ID), the treasury's agent paying itself out of stream earnings, and the AI patron paying from its own wallet, every decision including refusals shown with its reasoning. See the current totals at the top of this README, or watch them update live on the page itself, so there's never two conflicting snapshots to reconcile.

## Tech

- **Next.js 16** (App Router) + **Tailwind v4** / shadcn UI, light and dark themes
- **Circle Nanopayments** via **`@circle-fin/x402-batching`** (`GatewayClient` + `BatchFacilitatorClient`)
- **x402** payment protocol, **Arc testnet** settlement (USDC-native L1)
- **viem** for wallet and chain access, plus a gasless EIP-3009 relay for own-wallet pay
- **Supabase** (Postgres) for streams, the payment log, and chat
- **LiveKit** for live video and screen share, **Walrus** for decentralized video storage
- A free LLM (Groq) for the AI co-host

## Run it locally

Prerequisites: Node 22+, a Supabase project, testnet USDC from [faucet.circle.com](https://faucet.circle.com) (Arc Testnet).

```bash
npm install
cp .env.example .env.local        # then fill in the values (Supabase, Arc wallet keys, LiveKit, GROQ_API_KEY, ...)
# create the DB tables: paste the files in supabase/*.sql into the Supabase SQL editor
npm run dev                       # http://localhost:3000
```

Open `/watch/ada-live`, press play, and watch the meter and the treasury split move in real time.

## Key routes

| Route | Purpose |
| --- | --- |
| `/` | Landing |
| `/watch/[slug]` | Viewer player, live treasury split, chat, own-wallet pay |
| `/explore` | Discover and search streams and creators |
| `/c/[address]` | Public creator profile (save to re-watch) |
| `/studio` | Creator studio: overview, go live, streams, wallet |
| `/sidecar` | The Owncast per-second webhook sidecar |
| `/impact` | Public real-time proof feed of every settlement |
| `/api/watch/[slug]/charge` | x402 per-second charge |
| `/api/watch/[slug]/own-pay` | Relay a viewer's gasless own-wallet payment |
| `/api/watch/[slug]/passkey-pay` | Verify + record a Face ID smart-account payment |
| `/api/agents/captions` | The real AI co-host, selling its work per call |
| `/api/agents/patron` | The AI patron: GET its decisions, POST to trigger a cycle |
| `/api/streams/[slug]/onchain` | Read a stream's metadata back from the Arc registry |
| `/api/sidecar/owncast` | Owncast webhook receiver that settles per second |

## Acknowledgements

The settlement core is adapted from Circle's open-source [`arc-nanopayments`](https://github.com/circlefin/arc-nanopayments) sample (Apache-2.0). Driplet adds the per-second streaming experience, the autonomous stream treasury, the real AI agent payee, the Owncast sidecar, gasless own-wallet payments, and the creator-facing product.

## License

Apache-2.0. See [LICENSE](./LICENSE).
