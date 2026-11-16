[![Token Radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/theyschool/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/theyschool/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01)

# Token Radar — pre-token protocols ranked by implied value

A radar for token launches that have not happened yet. It reads a frozen snapshot of 758
DeFi protocols (DefiLlama, 2026-11-14), ranks the 198 protocols that record no token and could
plausibly launch one of their own, and shows a reader how to farm each one.

The board covers all 40 protocols on the snapshot's watchlist (TVL of at least $50M, no token
on record) plus 158 early finds the floor leaves out — including protocols above the floor the
watchlist rule sets aside for other reasons. The 32 largest live-token protocols are set aside
with their market caps: they are never ranked, and their market-cap-to-TVL ratios are the
anchor the model prices pre-token protocols by.

## The model (radar-2)

```
implied = round( tvl_usd × anchor(category) × growth × maturity × breadth )
```

- **anchor(category)** — the median market-cap-to-TVL of the live protocols in the same
  category (at least 3 comparables, shrunk toward the all-category median of 0.22×), clamped
  to [0.05, 1.00]. The market, not a hardcoded list, sets what each kind of protocol is worth.
- **growth** — `1 + clamp(change_7d, -50, 100) / 100 × 0.5`, from the protocol's 7-day TVL change.
- **maturity** — `0.6 + min(age_days, 1095) / 1095 × 0.4`, where age is the time since first
  listing: how long the protocol has run with no token on record. Unknown age counts as 365 days.
- **breadth** — `min(1.15, 1 + 0.03 × ln(chains))`: a protocol live on more chains reaches more farmers.

No protocol name is special-cased. The dashboard recomputes every row from the same factors
and shows the live comparables the anchor came from.

Top of the board on this snapshot: Steakhouse Financial ($519.1M implied), Sentora Curator
($484.6M, an early find), Gauntlet ($311.3M).

## The dashboard

A static page with no network: a sortable, filterable board (search, category, chain,
watchlist-only, early-finds-only), a detail view per protocol with the model's factor
breakdown, its live comparables and a seven-step farm plan, a live-token view, and a Method
tab that states the model, lists every category anchor and carries the caveats.

Each farm plan is derived from the protocol's own record — the category picks the action, the
TVL picks the capital, the chains pick the gas cost and the second action, the age picks the
hold — and every step states what it costs and how long it takes.

> “No token on record” is not “has no token”: DefiLlama's record may miss a token. A board row
> is not a prediction that a token will launch, or when. Implied value is this entry's own
> claim from a frozen snapshot; it is not a price, not a valuation and not financial advice.

## Run it

Requires Node.js 22.18 or later. Nothing is installed: the program uses the standard library
only.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

That writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data),
`out/dashboard/` (the page), `out/screenshots/` (the three screenshots) and
`out/dossier.json` (the summary the judge reads, built from the dashboard and screenshots).

To look at the dashboard, open `out/dashboard/index.html` in a browser. A row's detail view
opens at `#p=<slug>`; a filtered view at `#category=<category>`.

## Layout

- `main.ts` — the entrypoint: snapshot in, board + dashboard + dossier out.
- `lib/model.ts` — the radar-2 model, the farm plans and the board checks.
- `dashboard/` — `index.html`, `app.css`, `app.js` (33,758 bytes in all, under the 64 KB cap).
- `screenshots/` — the board, a protocol's detail view and a filtered view.
- `vendor/makefun-board.ts` — make.fun's dossier library, unchanged from the kit.

## License

MIT. See [LICENSE](LICENSE).
