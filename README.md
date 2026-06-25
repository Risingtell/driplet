# Driplet, get paid by the second

**Pay-per-second live-stream monetization in USDC, settled on Arc.**

A creator goes live, and viewers pay a fraction of a cent for every second they watch. Stop watching, stop paying. No subscription, no bank account, no chargebacks. Each stream runs its own autonomous on-chain treasury that splits incoming drips in real time between the creator, a co-host, and a real AI agent it pays for live commentary, so money flows in from the audience and back out to people and agents with no platform in the middle.

> Built for the **Lepton Agents Hackathon** (Canteen, with Circle on Arc).
> Live: **https://trydriplet.vercel.app** · Proof feed: **/impact** · Owncast sidecar: **/sidecar**

---

## Why this couldn't exist before

A payment worth a fraction of a cent was impossible when the fee cost more than the payment. Circle Nanopayments on Arc change that: gas-free USDC transfers as small as `$0.000001`, sub-second finality, batched settlement. Driplet uses that to price the one thing every creator already has, attention, by the second. Amounts are shown in Naira (₦) for the local audience even though they settle in USDC.

## What it does

- **Pay-per-second watching.** The viewer's player sends one nanopayment per second to the creator over x402, batched and settled gas-free through Circle Gateway. Watch time becomes settled USDC.
- **Autonomous stream treasury.** Each stream is its own economic entity. As drips arrive, the treasury splits them live across payees and pays a real AI agent out of its own earnings, a genuine agent-to-agent payment with no human in the loop.
- **A real AI co-host.** The agent runs a live LLM that writes real one-line commentary and gets paid per call on-chain into its own wallet. Earn and spend, closed loop.
- **Owncast sidecar.** A drop-in webhook subscriber that adds per-second pay to any self-hosted Owncast stream without changing a line of Owncast. Proven end to end against a real Owncast server. This is the "Owncast per-second streaming webhook sidecar" from Canteen's request-for-payments-founders list.
- **Pay from your own wallet.** Viewers can optionally pay from their own wallet with a single gasless EIP-3009 signature (no gas, no Gateway deposit); the treasury relays it on-chain. The shared demo wallet stays the default so anyone can try it with zero setup.
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

## Reusable Arc primitives (open source)

The Circle samples show a single buyer-to-seller x402 payment. Driplet adds the pieces you need once payments actually stream and get shared out, and they are meant to be lifted out of the repo:

1. **A metered per-second payment loop** (continuous sub-cent nanopayments, batched gas-free).
2. **An autonomous treasury that splits revenue in real time** to several wallets, each its own address on Arc.
3. **A real AI agent as an on-chain payee** that does real work and earns and spends on its own.
4. **A hardened server-side Gateway client** (lazy connect, auto-deposit, wait until spendable, shared in-flight deposit, retry on transient timeouts).
5. **A permissionless Owncast sidecar** built on the same shared settlement core.
6. **Gasless own-wallet payments** via relayed EIP-3009 (pay from a wallet with one signature, no on-chain transaction by the user).
7. **On-chain metadata with off-chain files** (a `StreamRegistry` on Arc plus Walrus blobs), a clean split for apps that want records on-chain and large files off-chain.

## Traction

Live and on-chain on Arc testnet: over 21,000 real per-second payments, the treasury's agent paid 1,000+ times on its own, around $6.40 streamed end to end, zero failed payments. Watch it land in real time at [`/impact`](https://trydriplet.vercel.app/impact).

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
| `/api/agents/captions` | The real AI co-host, selling its work per call |
| `/api/streams/[slug]/onchain` | Read a stream's metadata back from the Arc registry |
| `/api/sidecar/owncast` | Owncast webhook receiver that settles per second |

## Acknowledgements

The settlement core is adapted from Circle's open-source [`arc-nanopayments`](https://github.com/circlefin/arc-nanopayments) sample (Apache-2.0). Driplet adds the per-second streaming experience, the autonomous stream treasury, the real AI agent payee, the Owncast sidecar, gasless own-wallet payments, and the creator-facing product.

## License

Apache-2.0. See [LICENSE](./LICENSE).
