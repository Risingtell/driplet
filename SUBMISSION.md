# Driplet, Lepton Agents Hackathon submission

Paste-ready answers for the submission form.
Before submitting, refresh the numbers from the live feed at
https://trydriplet.vercel.app/impact (or /api/impact).

---

## Links
- Live app: https://trydriplet.vercel.app
- Try it yourself: open https://trydriplet.vercel.app/watch/ada-live and press Watch. You'll see real USDC settle on Arc every second you watch.
- Live proof feed: https://trydriplet.vercel.app/impact (every settlement, with its Circle Gateway id, updating in real time)
- Owncast sidecar: https://trydriplet.vercel.app/sidecar (per-second pay for any Owncast stream, see "Open source / sidecar" below)
- Demo video: https://youtu.be/zFZSRxp6NtY
- Source code: https://github.com/Risingtell/driplet
- Creator studio: sign in at https://trydriplet.vercel.app/signin (email magic link auto-creates a Circle wallet on Arc; then go live with a camera or an uploaded video)

## Project name
Driplet

## One-liner
Pay creators by the second. You watch a stream and your wallet sends a fraction of a cent in USDC every second, on Arc. Stop watching and the payments stop. No bank account, no subscription, no minimum payout.

## Project Description (form: "what it does, how it works, what tech you used")
Driplet lets people pay creators by the second. You open a stream and, for every second you watch, your wallet sends a fraction of a cent in USDC to the creator on Arc. Stop watching and the payments stop. No bank account, no subscription, no minimum payout.

How it works: when you press Watch, the page sends one payment per second. Instead of a raw on-chain transaction each time (Arc's base fee would make sub-cent payments pointless), the drips are batched and settled through Circle Gateway using signed EIP-3009 authorizations, which keeps them gas-free and lets amounts as small as $0.0003 actually clear. Each stream has its own treasury that runs without a human: as income arrives it splits in real time between the creator, a co-host, and an AI co-host agent the stream runs (a live LLM that generates real commentary), paying each into their own wallet on Arc. The agent is paid per call out of the stream's own earnings, money flows in and back out on its own, agent to agent, with no human in the loop.

Tech: Next.js (App Router) and TypeScript front and back, deployed on Vercel; Supabase (Postgres) for streams and the payment log; payments over x402 settled through Circle Gateway on Arc, built on Circle's @circle-fin/x402-batching client; viem for wallet and chain work; a wallet-connect that auto-adds the Arc network.

During Lepton I took this from the Circle sample to a real product: per-second metered payments, the autonomous multi-payee treasury that pays its own service agent, creator accounts (email sign-in that auto-creates a Circle wallet on Arc), a "go live" flow with real per-wallet payouts, real live video and screen sharing, live chat, video uploads stored on decentralized storage (Walrus), gasless own-wallet payments so viewers can pay from their own wallets, Face ID onboarding that creates a gasless smart-account wallet right in the browser (Circle Modular Wallets, no app and no seed phrase), saveable creator profiles people can re-watch, stream metadata recorded on-chain on Arc (with the video files on Walrus), and a drop-in Owncast sidecar that adds per-second pay to an existing live-stream server without changing its code. There's a public proof feed at /impact, and real users came through WhatsApp creator communities. It's live at trydriplet.vercel.app with nearly 23,000 real on-chain payments and zero failures.

## What it does
Driplet turns watch time into income, one second at a time. A viewer opens a stream and starts paying the creator a sub-cent amount of USDC per second (as little as $0.0003), settled on Arc through Circle's nanopayments. Each stream has its own treasury that handles the money on its own: as income comes in, it splits in real time between the creator, a co-host, and an AI co-host (a real LLM agent) the stream pays per call out of its own earnings. So money comes in and goes back out automatically, second by second, without anyone managing it.

## The problem I'm solving
A lot of people have an audience but no real way to get paid for it online. The mainstream platforms all want a bank account and a sizable following, and they simply can't process payments worth a fraction of a cent because the fee would be larger than the payment itself. That leaves a whole layer of creators, especially anyone without easy access to banking, out of the picture. People have promised micropayments for years, but the rails were never really there. Arc and Circle's nanopayments are the first time they actually are, and Driplet is what I built on top of them.

I build for the people right around me first: creators in Kano whose audience thinks in Naira, not dollars. So Driplet shows every amount in Naira even though it settles in USDC, because the person watching shouldn't have to care what x402 or Arc or USDC is, they should just see that their favourite creator earned ₦80 while they watched. The point was never the rails; it's that someone who never had a way to get paid for their audience finally does.

## How it uses Arc and the Circle Agent Stack
Every per-second payment is a real USDC settlement on Arc testnet, and you can verify each one on the live feed. I don't send a raw transaction per second, since Arc's base fee would make that pointless. Instead the drips are batched and settled through Circle Gateway using signed EIP-3009 authorizations, which keeps them gas-free and lets sub-cent amounts actually work. The payments themselves run over x402, both for the viewer's per-second charge and for the AI agent's paid calls. The whole thing is built on Circle's @circle-fin/x402-batching Gateway client.

I use two more parts of the Circle stack for wallets. Creators get a Circle developer-controlled wallet on Arc, created automatically on sign-in, that their payouts land in and that they withdraw from. Viewers who want to pay from their own wallet can create one in the browser with Face ID using Circle Modular Wallets: a passkey (WebAuthn) makes a gasless ERC-4337 smart account on Arc, gas sponsored by Circle's paymaster, and it pays the creator the same Arc USDC the rest of the app uses, with no app install and no seed phrase. So the whole journey, viewer and creator, stays on the Circle Agent Stack and on Arc.

## Why it's an agents project
Autonomous agents sit on both sides of Driplet's economy, and every one of their decisions is visible.

On the earning side, each stream's treasury runs without a human in the loop: it takes in the viewer's per-second payments, splits them live (70% to the creator, 20% to the co-host, 10% to the agent), and pays the AI co-host per call straight from the stream's own earnings, into the agent's own wallet. The co-host is a real LLM that generates live commentary, so it does genuine work and gets paid for it on-chain. And it's budget-aware: each cycle it checks whether paying itself stays within its 10% share of what the stream actually earned, pauses itself when it wouldn't (so the creator is always paid first), and its ledger reasoning ("income → my share cap → spent → decision") is shown live on the watch page.

On the spending side, an AI patron with its own funded USDC wallet decides what to watch. Each cycle it looks at real signals (host on air, viewers present, chat activity, price, its own remaining balance) and decides with an LLM whether any stream deserves its money right now. When it pays, it signs a gasless EIP-3009 payment from its own address into the stream's treasury, which splits it like any human viewer's money; when it declines, it says why. Every decision, including the refusals, is published verbatim on /impact, and anyone can trigger a cycle (POST /api/agents/patron, self-throttled) and watch it think. So an agent spends, treasuries split, and an agent earns: a closed agent-to-agent economy where every settlement is real and on-chain.

## Traction
Driplet is already being used by real people. I shared it with creator communities I'm part of, and they actually watched and paid. Everything in the first list is live and verifiable on-chain on Arc testnet (open /impact and check any settlement id):

- nearly 23,000 real per-second payments (around 383 minutes watched and paid for)
- the treasury paid its agent 1,100+ times, on its own, out of stream earnings
- about $6.90 streamed end to end, split correctly across creator, co-host and agent
- 13 distinct wallets that paid from their OWN wallet (own-pay or Face ID), not the shared demo wallet, each verifiable as a distinct payer on-chain
- zero failed payments
- you can watch it land in real time at https://trydriplet.vercel.app/impact (the "distinct paying wallets" stat updates live)

Reach (off-chain context, from Vercel Web Analytics, not verifiable on-chain like the above): ~79 unique visitors in the last 7 days, up 58%, 0% error rate, mostly from WhatsApp creator communities in Kano.

One honest note: most viewer payments come from one shared demo wallet, because letting anyone try it with no setup is what made it spread, so that bulk of on-chain data can't tell those viewers apart, and I track unique visitors separately through Vercel's analytics. Viewers can now also pay from their own wallets two ways, both settling from their own distinct addresses on-chain: a one-signature gasless EIP-3009 payment from an existing wallet, or a brand-new wallet created right in the browser with Face ID (Circle Modular Wallets, gas sponsored), no app and no seed phrase. Real passkey payments are already on the proof feed (look for the /passkey/ entries with their own transaction hash). I kept the no-friction shared-wallet path as the default on purpose.

## What's next
I'm going to keep building this after the hackathon. A lot of the original roadmap already shipped during the event: real live video and screen sharing, creator accounts with auto-created wallets, live chat, decentralized video storage, own-wallet viewer payments, Face ID passkey onboarding, saveable creator profiles, and the Owncast sidecar. What's still ahead: one passkey login for creators too (so a creator signs in and self-custodies their payout wallet with Face ID, the same way viewers already do), an editable revenue split so creators set their own terms, live transcription so the AI co-host can caption real speech, the same sidecar pattern for other servers like Jellyfin and PeerTube, and a move to mainnet. The bigger one after that: pointing the same per-second settlement core at storage, an Arc-coordinated blob-storage protocol where providers bond USDC on-chain and earn per epoch they provably hold data, filling the gap that made me pair Arc with Walrus in the first place. The goal is a payment rail for the creators the current platforms overlook, and that's worth far more than two weeks of work to me.

## Open source / sidecar
This is built, not just a direction. Driplet ships an Owncast sidecar: a small webhook subscriber that turns any self-hosted Owncast stream into a per-second paid stream without changing a line of Owncast. It listens to Owncast's own user-joined and user-parted events, measures exactly how long each viewer was present, and settles seconds × rate to the streamer through the same Circle Gateway settlement core the rest of Driplet uses. An instance operator just points their webhook at it; there's no fork and no upstream change to wait on.

Because it only consumes Owncast's standard webhooks, it works with every Owncast running today (0.2.x), with no fork, no proxy in the video path, and no waiting on a new plugin framework; when Owncast v0.3.0's plugin system lands, the same settlement core can ship as a native plugin too. I proved it end to end: a real Owncast 0.2.5 server firing its real webhooks at the live sidecar, settling real USDC on Arc, visible on the proof feed with its Gateway settlement id. You can see it and the live stats at https://trydriplet.vercel.app/sidecar. Because the settlement core is shared, the same pattern extends to per-minute VOD (Jellyfin) and a payments plugin (PeerTube): build the core once, distribute it across the open-source video stack.

I also kept storage decentralized end to end, the way the organizer suggested when I asked: each stream's metadata and its Walrus blob pointer are recorded on-chain on Arc in a small StreamRegistry contract, and the video files themselves live on Walrus. So a stream is metadata on Arc, files on Walrus, and per-second payments on Arc, with nothing centralized in the storage path. You can read any stream's metadata straight back from Arc at /api/streams/[slug]/onchain.

## About me
I'm a solo builder running a small technology shop in Kano, Nigeria. I built the whole thing: the Arc and Circle payment loop, the autonomous treasury with the AI agent as a payee, the viewer and creator apps, and the distribution to real users. The project I was proudest of before this is SolMate, an AI agent that explains Solana wallets and transactions in plain English (solmate-hazel.vercel.app).

---

## (Arc OSS) Why choose this project / what primitives & flows it adds vs circlefin/arc-*
I'm keeping the whole project open source. The Circle and Arc samples I started from mostly show a single buyer-to-seller x402 payment with a dashboard to watch it. Driplet adds the pieces you need once you want payments to actually stream and get shared out, and those are the parts other builders can reuse:

- A metered per-second payment loop. Instead of one x402 call, the viewer pays a continuous stream of sub-cent nanopayments, batched through Circle Gateway so they stay gas-free. It's a reusable pattern for anything pay-as-you-go: media, APIs, compute time.
- An autonomous treasury that splits revenue in real time. As income arrives it pays shares out to several wallets, each to its own address on Arc, with nobody pressing a button. That multi-payee settlement flow is the part the samples don't cover.
- A real AI agent as an on-chain payee. The treasury pays an AI co-host (a live LLM that writes real commentary) per call out of its own earnings, into the agent's own wallet, a closed earn-and-spend loop with no human in it. The agent does genuine work and gets paid for it on-chain. It's budget-aware too: it only pays itself within its earned share and shows its reasoning on screen.
- An autonomous buyer agent (lib/patron.ts). An LLM-driven agent with its own wallet that evaluates live signals, decides what's worth paying for, pays gaslessly via signed EIP-3009 from its own address, and records every decision with its reasoning, refusals included. A reusable "agent that spends its own money accountably" template for anyone building paying agents on Arc.
- A hardened server-side Gateway client. I wrapped the GatewayClient so it lazily connects, auto-deposits, waits until the deposit is actually spendable, shares one in-flight deposit across concurrent callers, and retries transient timeouts. This fixes a race the sample hits on its first payment.
- A permissionless Owncast sidecar. A webhook subscriber that adds per-second settlement to an existing Owncast server without modifying it, built and proven against a real Owncast instance settling real USDC on Arc. The settlement core under it is shared with the watch flow, so the same shape generalises to other open-source video servers.
- Gasless own-wallet payments. A viewer signs a single EIP-3009 authorization (no gas, no Gateway deposit) and the treasury relays it on-chain, so anyone can pay from their own wallet with one signature, a clean pattern for "let a user pay you from their wallet without making them transact."
- Face ID wallet onboarding. A passkey (Circle Modular Wallets) creates a gasless ERC-4337 smart account on Arc right in the browser, gas sponsored by Circle's paymaster, and pays in the same Arc USDC, no app and no seed phrase. It's the missing on-ramp for non-crypto users: a reusable "let a normal person get a funded, paying wallet on Arc with their face" flow.
- On-chain metadata + decentralized files. A StreamRegistry contract on Arc records each stream's metadata and its Walrus blob pointer, so file storage is decentralized end to end: metadata on Arc, blobs on Walrus. A reusable shape for any app that wants its records on-chain and its large files off-chain.

It's all in the repo and meant to be lifted out. Anyone who wants pay-per-second or auto-splitting payments on Arc can start from these instead of from scratch.

## General Feedback (Canteen team / hackathon)
What worked well: the FAQ was refreshingly clear about what you're actually judging, real payments flowing, intent to keep building, and real usage, which let me focus instead of guessing. The pre-event companion piece reading almost like a shopping list of wanted projects was genuinely useful for picking a direction. The resubmittable form and the "submit early and often" framing took a lot of pressure off, and the office hours and Discord helped.

What could be better: the developer experience on Windows was rough in a few spots. The arc-canteen CLI crashed on a Unicode character under the default Windows code page until I set PYTHONUTF8=1, and a few interactive prompts were hard to run from certain shells. The stale sample config below cost me time early on, so a short "building on Windows" note would help. Reaching mentors by DM didn't always work, so I leaned on the public channels. None of that got in the way of building though. Overall it was well run and I'd do it again.

---

## Circle / Arc Feedback ($500 field)
What worked: Gateway batching is what makes the whole idea possible. Settling sub-cent payments gas-free with signed EIP-3009 authorizations is genuinely impressive, and once it was set up I didn't have to fight it. x402 was clean to work with, and the Agent Stack sample got me a good part of the way.

Where it can improve, with specifics since I hit all three:

1. Deposit isn't spendable right away. After depositing to Gateway, the balance isn't available for a few seconds, so the very first payments fail. I fixed it by polling getBalances until available is greater than zero before settling. A waitForAvailable() helper in the SDK would save everyone this step.

2. Transient connect-timeout to gateway-api-testnet.circle.com. The deposit wait occasionally crashed on an undici connect-timeout. I wrapped it in a try/catch with a retry. Built-in retry/backoff on the Gateway client would handle this cleanly.

3. Stale maxTimeoutSeconds in the sample, which was the real blocker. The sample sets maxTimeoutSeconds to 345600 (4 days), but Gateway now needs the EIP-3009 validBefore to be at least 7 days plus a buffer, otherwise it rejects with authorization_validity_too_short. I set 604900 and passed the explicit facilitator URL https://gateway-api-testnet.circle.com, which the sample leaves out. Worth updating the published sample, because every new builder will hit this on their first payment.
