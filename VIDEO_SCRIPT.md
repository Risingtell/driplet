# Driplet — Demo Script (HEART framework, hard cap 3:00, aim 2:45)

**H**ands-on · **E**xplanation · **A**daptable · **R**eal data · **T**ested.
Read the **SAY** lines aloud, do the **DO** lines on screen. Short sentences. Your voice, no music.

## Before you record (the T in HEART)

- Open these tabs in order: `trydriplet.vercel.app` → `/watch/ada-live` → a real creator stream with treasury activity (e.g. one with Face ID prepays) → `/impact` → `/roadmap`.
- Do one Face ID payment 10 minutes before recording so your passkey session is warm (no surprise prompts mid-take).
- Have a phone nearby already signed in, in case you want the Face ID close-up shot.
- Record the whole flow once as a backup take before the real one. Keep the backup.
- If anything hesitates on camera, keep talking and let it land; real settlement takes a beat and that is fine to say out loud.

---

## 1. THE HOOK + PROBLEM — your face on camera (0:00–0:30)

**SAY:** I run a small tech shop in Kano, Nigeria. All around me are creators with real audiences and no way to get paid: platforms want bank accounts, minimum payouts, and a payment can't be smaller than the fee it costs. So I built Driplet. You watch a stream, and your wallet pays the creator a fraction of a cent for every second you watch. Stop watching, stop paying. This is live, on Arc, with real people using it. Let me show you.

---

## 2. LIVE DEMO (0:30–2:15)

### 2a. Pay per second — the core (0:30–0:55)

**DO:** Open `/watch/ada-live`. Press play. Point at the meter ticking and the treasury panel updating.

**SAY:** Every second I watch sends a real USDC payment, three-hundredths of a cent, settled through Circle Gateway on Arc. No gas, no subscription. Watch the meter. Each tick is a real on-chain settlement, and the stream's treasury splits it live: creator, co-host, and the AI co-host the stream itself employs.

### 2b. Face ID — a normal person pays from their own wallet (0:55–1:20)

**DO:** On the watch page, tap **Continue with Face ID** (session already warm). Show the payment land and the "Paying from your wallet" card.

**SAY:** No extension, no seed phrase. A passkey makes a gasless smart-account wallet right in the browser, Circle Modular Wallets, gas sponsored. My testers in Kano paid from their own wallets this way; seventeen distinct wallets so far, each one verifiable on-chain.

### 2c. The treasury thinks — visible agency (1:20–1:45)

**DO:** Scroll to the Stream treasury panel. Point at "paid out" under the creator row, then read the agent budget ledger line aloud.

**SAY:** Prepays stream out per second actually watched; you can see paid-out climbing in real time. And look at the AI co-host's ledger: it checks its own budget every cycle, income, share cap, spent, and it pauses itself when paying itself would eat the creator's share. The agent reasons about money, on screen.

### 2d. The AI patron — agents on both sides (1:45–2:15)

**DO:** Open `/impact`. Point at the AI patron panel: its wallet, its decisions, a refusal, a payment with its tx link. Then sweep over the live totals.

**SAY:** This is the other side: an autonomous viewer. The AI patron has its own funded wallet and decides, with an LLM, which streams deserve its money. When nothing is worth paying for, it refuses and says why. When it pays, that is its own USDC, on-chain. So an agent spends, treasuries split, an agent earns; a closed agent economy. And everything on this page is a real settlement you can check: twenty-three thousand payments, zero failures.

---

## 3. IMPACT + VISION (2:15–2:45)

**DO:** Flash `/sidecar` briefly, then `/roadmap`. End on your face or the landing page.

**SAY:** It's open source and it's not locked to my app: a drop-in sidecar adds per-second pay to any Owncast server running today, no fork, no proxy. Next: creators set their own splits, passkey login for creators, the sidecar family for Jellyfin and PeerTube, then mainnet, and the same per-second engine pointed at storage on Arc. The creators around me finally have a way to get paid for attention. That's worth more than two weeks of work to me. Driplet: get paid by the second.

---

## Field notes

- **Adaptable:** if a judge asks "what else can this meter?" the answer is anything continuous: APIs, compute, storage; the settlement core is already reused by the Owncast sidecar and the roadmap storage protocol.
- If the live take stumbles, cut to the backup recording of that scene; never restart the whole video.
- Upload unlisted (not private). Test the link in an incognito window before submitting.
