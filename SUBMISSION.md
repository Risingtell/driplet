# Driplet — Lepton Agents Hackathon submission

Paste-ready answers for the submission form.
Before submitting, refresh the numbers from the live feed at
https://trydriplet.vercel.app/impact (or /api/impact).

---

## Links
- Live app: https://trydriplet.vercel.app
- Try it yourself: open https://trydriplet.vercel.app/watch/ada-live and press Watch. You'll see real USDC settle on Arc every second you watch.
- Live proof feed: https://trydriplet.vercel.app/impact (every settlement, with its Circle Gateway id, updating in real time)
- Demo video: https://youtu.be/kNDozV116bU
- Source code: https://github.com/Risingtell/driplet
- Creator dashboard: https://trydriplet.vercel.app/dashboard (login admin@example.com / 123456)

## Project name
Driplet

## One-liner
Pay creators by the second. You watch a stream and your wallet sends a fraction of a cent in USDC every second, on Arc. Stop watching and the payments stop. No bank account, no subscription, no minimum payout.

## Project Description (form: "what it does, how it works, what tech you used")
Driplet lets people pay creators by the second. You open a stream and, for every second you watch, your wallet sends a fraction of a cent in USDC to the creator on Arc. Stop watching and the payments stop. No bank account, no subscription, no minimum payout.

How it works: when you press Watch, the page sends one payment per second. Instead of a raw on-chain transaction each time (Arc's base fee would make sub-cent payments pointless), the drips are batched and settled through Circle Gateway using signed EIP-3009 authorizations, which keeps them gas-free and lets amounts as small as $0.0003 actually clear. Each stream has its own treasury that runs without a human: as income arrives it splits in real time between the creator, a co-host, and an AI captions agent, paying each into their own wallet on Arc. The captions agent is paid per call out of the stream's own earnings, so money flows in and back out on its own.

Tech: Next.js (App Router) and TypeScript front and back, deployed on Vercel; Supabase (Postgres) for streams and the payment log; payments over x402 settled through Circle Gateway on Arc, built on Circle's @circle-fin/x402-batching client; viem for wallet and chain work; a wallet-connect that auto-adds the Arc network.

During Lepton I took this from the Circle sample to a working product: per-second metered payments, the autonomous multi-payee treasury with the AI agent as a payee, a creator "go live" flow with real per-wallet payouts, a public proof feed at /impact, and real users through WhatsApp creator communities. It's live at trydriplet.vercel.app with over 18,000 real on-chain payments and zero failures.

## What it does
Driplet turns watch time into income, one second at a time. A viewer opens a stream and starts paying the creator a sub-cent amount of USDC per second (as little as $0.0003), settled on Arc through Circle's nanopayments. Each stream has its own treasury that handles the money on its own: as income comes in, it splits in real time between the creator, a co-host, and an AI agent that the stream pays for live captions out of its own earnings. So money comes in and goes back out automatically, second by second, without anyone managing it.

## The problem I'm solving
A lot of people have an audience but no real way to get paid for it online. The mainstream platforms all want a bank account and a sizable following, and they simply can't process payments worth a fraction of a cent because the fee would be larger than the payment itself. That leaves a whole layer of creators, especially anyone without easy access to banking, out of the picture. People have promised micropayments for years, but the rails were never really there. Arc and Circle's nanopayments are the first time they actually are, and Driplet is what I built on top of them.

## How it uses Arc and the Circle Agent Stack
Every per-second payment is a real USDC settlement on Arc testnet, and you can verify each one on the live feed. I don't send a raw transaction per second, since Arc's base fee would make that pointless. Instead the drips are batched and settled through Circle Gateway using signed EIP-3009 authorizations, which keeps them gas-free and lets sub-cent amounts actually work. The payments themselves run over x402, both for the viewer's per-second charge and for the AI agent's paid calls. The whole thing is built on Circle's @circle-fin/x402-batching Gateway client.

## Why it's an agents project
The heart of Driplet is the stream treasury, and it runs without a human in the loop. It takes in the viewer's per-second payments, splits them live (70% to the creator, 20% to the co-host, 10% to the AI), and pays the captions agent per call straight from the stream's own earnings, into the agent's own wallet. The treasury and the split are on-chain, and the AI agent isn't a feature bolted on the side, it earns and spends like any other party on the stream.

## Traction
Driplet is already being used by real people. I shared it with creator communities I'm part of, and they actually watched and paid. Everything below is live and on-chain on Arc testnet:

- over 18,000 real per-second payments (more than 300 minutes watched and paid for)
- the AI agent paid 900+ times, on its own, out of stream earnings
- around $5.50 streamed end to end, split correctly across creator, co-host and agent
- zero failed payments
- you can watch it land in real time at https://trydriplet.vercel.app/impact

One honest note: because the testnet demo lets anyone try it with no wallet setup, all the viewer payments come from one shared wallet, so the on-chain data can't tell individual viewers apart. I track unique visitors separately through Vercel's analytics. I made that trade on purpose, because the easiest way to get real people to actually use it was to remove every bit of friction.

## What's next
I'm going to keep building this after the hackathon. The next things on my list: letting viewers connect their own wallets (the connect flow is already in), real live video instead of recorded clips, an editable revenue split so creators can set their own terms, and a small sidecar so an existing live-stream server can settle per-second payments without changing its own code. The goal is a payment rail for the creators the current platforms overlook, and that's worth more than two weeks of work to me.

## Open source / sidecar
Driplet is built to sit alongside a streaming server rather than replace it. It reads watch events and settles them without touching the streaming server's own code, so an operator running something like Owncast or PeerTube could drop it in without asking anyone's permission. That's the direction the Arc OSS / sidecar idea points to, and it's where I'm taking it.

## About me
I'm a solo builder running a small technology shop in Kano, Nigeria. I built the whole thing: the Arc and Circle payment loop, the autonomous treasury with the AI agent as a payee, the viewer and creator apps, and the distribution to real users. The project I was proudest of before this is SolMate, an AI agent that explains Solana wallets and transactions in plain English (solmate-hazel.vercel.app).

---

## (Arc OSS) Why choose this project / what primitives & flows it adds vs circlefin/arc-*
I'm keeping the whole project open source. The Circle and Arc samples I started from mostly show a single buyer-to-seller x402 payment with a dashboard to watch it. Driplet adds the pieces you need once you want payments to actually stream and get shared out, and those are the parts other builders can reuse:

- A metered per-second payment loop. Instead of one x402 call, the viewer pays a continuous stream of sub-cent nanopayments, batched through Circle Gateway so they stay gas-free. It's a reusable pattern for anything pay-as-you-go: media, APIs, compute time.
- An autonomous treasury that splits revenue in real time. As income arrives it pays shares out to several wallets, each to its own address on Arc, with nobody pressing a button. That multi-payee settlement flow is the part the samples don't cover.
- An AI agent as an on-chain payee. The treasury pays a captions agent per call out of its own earnings, into the agent's own wallet, so you get a closed earn-and-spend loop between agents.
- A hardened server-side Gateway client. I wrapped the GatewayClient so it lazily connects, auto-deposits, waits until the deposit is actually spendable, shares one in-flight deposit across concurrent callers, and retries transient timeouts. This fixes a race the sample hits on its first payment.

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
