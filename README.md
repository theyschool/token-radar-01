[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/theyschool/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/theyschool/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01)

# Launch Radar v3 — which pre-token protocols are worth farming

Nobody knows which of these protocols will ever issue a token, or when. What we can know is what a token *would* be worth if it traded like the ones that already do — and what it costs to be there early if it does.

This board prices 178 pre-token protocols off the 92 launched tokens in the same snapshot (DefiLlama, 14 November 2026), then tells you, row by row, whether farming one is worth your money and your evenings. All 40 names on the house watchlist are ranked, plus every pre-token protocol below the $50M floor that passes the same smell test the watchlist uses — no exchanges, no bridges, no liquid staking, no wrapped or staked products, no versioned copies.

## The honest numbers

These are the numbers the dashboard leads with, because they are the only ones that matter:

- **Walk-forward miss ×2.09** — fit on the 41 tokens listed before 2025, tested on the 29 listed after. The typical newer token landed within about twice the model's price. (On average, counting the wild ones, ×4.90.)
- **Leave-one-out miss ×3.56** — hide one token, fit on the other 91, predict the hidden one, 92 times over. (On average ×4.29.)
- **Range holds 83%** — the stated range around each price is twelvefold either way, and the truth landed inside it 83% of the time when tokens were hidden one at a time, 79% on the newer-listings test.
- **Launch odds, held out: 25% vs 13%** — in a five-fold check, the protocols given the highest odds had actually launched 25% of the time (54 of 218), the lowest-odds group 13% (35 of 261). The base rate is 19%. Modest, and printed as modest.
- **Top implied value $57.5M** — Steakhouse Financial, $2.75B of TVL. The curve bends down hard with size: the typical launched token trades at about 22 cents per dollar of TVL, but the biggest names trade far cheaper per dollar, so the model prices the biggest name at $57M, not $600M. That is what the comparables say, and we did not inflate it.
- **36 worth farming, 97 marginal** — a FARM verdict means the expected value (implied value × launch odds) clears $2M and the plan costs $400 or less. Every row on the board carries a seven-step farm plan with what each step costs and how long it takes.

## How the price is fitted

One curve, fitted fresh from the snapshot every run: log market cap on log TVL, with a small per-category offset (ridge-shrunk, so a category with one lonely comparable cannot drag the whole board around). Sixteen recorded tokens could not be used as comparables — fifteen with a market cap of zero and one at minus one dollar — because a price of nothing is not a price.

Every term was kept or dropped on the two blind tests, and the dashboard shows the table:

| Terms | Walk-forward | Leave-one-out | Call |
|---|---|---|---|
| TVL | ×2.22 | ×3.34 | Kept |
| TVL + 7-day growth | ×2.21 | ×3.42 | Dropped |
| TVL + growth + age | ×2.30 | ×3.18 | Dropped |
| TVL + growth + age + chains | ×2.37 | ×3.21 | Dropped |
| TVL + category | ×2.09 | ×3.56 | Kept |

Growth, age, and chain count all sounded useful. None of them moved the blind miss, and age made the walk-forward test much worse, so they are out. TVL does the work; the category nudges it.

Launch odds come from the peers' own record: protocols grouped by how long they have run and how big they are, and the odds are just the share of each group that has a token now. Nothing about a single protocol moves its own odds.

## What the model cannot see

One launched token trades at 400 times its TVL; another at 0.3% of it. TVL does not explain those. If a protocol's value lives somewhere TVL never goes — a brand, a founder, a license — this board will miss it, in either direction. The range printed under every price is the honest part of the board. Read the range, not the point.

## Run it

Node 22, standard library only, no network:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` reads the snapshot, writes `board.json` (178 rows), `data.js`, copies `dashboard/` and `screenshots/` to the output, and writes `dossier.json`. Two runs write byte-identical output.
