# Security Policy

Driplet runs on Arc **testnet**: all balances are testnet USDC with no real-world value.
Even so, we take the payment paths seriously and want to hear about anything exploitable.

## Reporting a vulnerability

Please don't file public GitHub issues for security problems. Email
**agentdriplet@gmail.com** with the details (steps to reproduce, affected endpoint,
impact) and we'll respond as quickly as we can.

## Scope notes

- The per-second charge, settlement, payout, and relay endpoints enforce server-side
  guards: payouts are clamped to a stream's real recorded income (solvency guard),
  passkey payments are verified on-chain and idempotent per transaction hash, and the
  sidecar family (Owncast, Jellyfin) requires a shared secret in production.
- Issues in the upstream settlement core should also be reported to Circle through
  their [Bug Bounty Program](https://hackerone.com/circle-bbp) — parts of this project
  derive from Circle's open-source
  [`arc-nanopayments`](https://github.com/circlefin/arc-nanopayments) sample (Apache-2.0).
