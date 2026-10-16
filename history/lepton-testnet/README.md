# Lepton-era Arc testnet ledger

Driplet ran on Arc testnet from 16 June to 3 October 2026, through the Lepton Agents Hackathon and after it, before moving to Arc mainnet at [trydriplet.vercel.app](https://trydriplet.vercel.app). This folder is the complete settlement record from that period, exported from the testnet database on 16 October 2026 so it outlives that database.

| File | What it holds |
| --- | --- |
| `payment_events.csv.gz` | All 50,728 settlement rows: id, time, endpoint, payer address, USDC amount, network, Circle Gateway settlement id |
| `streams.json` | All 49 streams and their payout splits (payee names, roles, shares, Arc addresses) |
| `SUMMARY.json` | Headline numbers, row counts and SHA-256 hashes of the two files above |

## Headline numbers

| | |
| --- | --- |
| Per-second watch payments | 37,091 |
| USDC streamed to creators | $11.1273 |
| Minutes watched and paid for | 618 |
| Autonomous agent payments | 1,640 ($8.20) |
| Distinct wallets that paid from their own address | 37 |
| Distinct creators | 12 |

## Check it yourself

```
npm run verify:history
```

No network and no keys. It re-derives every number above from the archived rows using the same rules the live `/impact` page used, and checks both files against their SHA-256 hashes. `scripts/export-testnet-history.mjs` is the script that produced the archive.

Only data that was already public is here: the same rows anyone could read from the testnet `/impact` feed with the site's public key. Creator and viewer emails, wallet IDs and chat messages were never exported.
