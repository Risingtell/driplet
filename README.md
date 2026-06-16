# Driplet — get paid by the second

**Pay-per-second live-stream monetization in USDC, settled on Arc.**

A creator goes live; viewers pay a fraction of a cent for every second they watch. Stop watching, stop paying. No subscription, no bank account, no chargebacks. Each stream runs its own **autonomous on-chain treasury** that splits incoming drips in real time between the creator, collaborators, and the **AI agent it pays for its own captions** — money flows *in* from the audience and *out* to people and agents, with no platform in the middle.

> Built for the **Lepton Agents Hackathon** (Canteen × Circle on Arc). Live demo: **https://driplet-vert.vercel.app**

---

## Why this couldn't exist before

A payment worth a fraction of a cent was impossible when fees cost more than the payment itself. **Circle Nanopayments on Arc** changes that: gas-free USDC transfers as small as `$0.000001`, sub-second finality, batched settlement. Driplet uses that to price the one thing every creator already has — *attention* — by the second.

## What it does

- **Pay-per-second watching.** The viewer's player pays one nanopayment per second to the creator via Circle Gateway (`/api/watch/[slug]/charge`, x402). Watch time = settled USDC.
- **Autonomous stream treasury.** Each stream is its own economic entity. As drips arrive, the treasury splits them live across payees and **autonomously pays an AI captions agent per minute out of its own earnings** (`/api/watch/[slug]/agent-pay`) — a real agent-to-agent payment. The agent's captions appear live on the stream as proof of work.
- **Creator dashboard.** Real-time earnings feed, totals, and USDC withdrawal.
- **For the unbanked creator.** Get paid in USDC anywhere — the market Patreon/Stripe/YouTube monetization don't serve.

## How it works

```
Viewer ──$0.0003/sec──▶ Stream charge endpoint (x402 + Circle Gateway) ──▶ Creator treasury (Arc)
                                                                              │
                                          per minute, autonomously            ▼
                                   Creator treasury ──$0.005──▶ AI Captions agent (its own wallet)
```

Every payment is a signed, gas-free off-chain authorization that Circle Gateway batches into a single on-chain settlement on Arc — making thousands of sub-cent payments per session economically viable.

## Tech

- **Next.js 16** (App Router) + **Tailwind v4** / shadcn UI, light + dark themes
- **Circle Nanopayments** via **`@circle-fin/x402-batching`** (`GatewayClient` + `BatchFacilitatorClient`)
- **x402** payment protocol; **Arc testnet** settlement (USDC-native L1)
- **Supabase** (Postgres + realtime) for the live earnings feed
- **viem** for wallet + chain access

## Run it locally

Prerequisites: Node 22+, a Supabase project, testnet USDC from [faucet.circle.com](https://faucet.circle.com) (Arc Testnet).

```bash
npm install
cp .env.example .env.local        # then fill in the values
npm run generate-wallets          # creates seller (creator) + buyer (viewer) wallets
# create the DB tables: paste supabase/driplet_setup.sql into the Supabase SQL editor
npm run dev                       # http://localhost:3000
```

Open `/watch/ada-live`, press play, and watch the meter — and the treasury split — move in real time.

## Key routes

| Route | Purpose |
| --- | --- |
| `/` | Landing |
| `/watch/[slug]` | Viewer player + live treasury split |
| `/dashboard` | Creator earnings (demo login `admin@example.com` / `123456`) |
| `/api/watch/[slug]/charge` | x402 per-second charge (paid to creator) |
| `/api/watch/tick` | Viewer pays one second |
| `/api/watch/[slug]/agent-pay` | Treasury autonomously pays the AI captions agent |
| `/api/agents/captions` | The AI agent, selling its work per call |
| `/api/streams/[slug]/treasury` | Live treasury totals + split + agent outflow |

## Acknowledgements

The settlement core is adapted from Circle's open-source [`arc-nanopayments`](https://github.com/circlefin/arc-nanopayments) sample (Apache-2.0). Driplet adds the per-second streaming experience, the autonomous stream treasury, the agent-to-agent payout loop, and the creator-facing product.
