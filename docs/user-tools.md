# User-Facing Tools

This file lists the tools meant to be run directly from Terminal.

## Setup

Run once after cloning or after dependency changes:

```bash
npm install
```

Optional account checks need `.env.local`, but the public research tools and web app do not require credentials.

```bash
cp .env.example .env.local
```

## Research Web App

Start the local web tool:

```bash
npm start
```

Then open:

```text
http://127.0.0.1:8787
```

What it does:

- Screens leaderboard traders for near-term consensus positions.
- Scores trader quality/history in a separate tab.
- Lets you set top trader count, category, time window, agreement threshold, entry rule, concurrency, and pages per trader.
- Shows candidate markets, leader rows, opposing rows, entry prices, current prices, score components, quality badges, and warnings.

Tabs:

- `Consensus Screen`: finds markets where top leaderboard traders are clustered on the same side.
- `Trader Quality`: scores leaderboard traders by leaderboard ROI/PnL, fetched history, odds-adjusted resolved edge, market diversity, recency, and cached public history.
- `Strong Trader Watch`: starts with cached high-Q traders, shows their current public positions, and splits other leaderboard traders into aligned and opposed groups.
- `Sharp Disagreement`: finds current markets where high-Q traders with topic-specific fit are on one side and other leaderboard traders are opposed, with an optional stricter weak-opposition filter.
- `Kalshi Markets`: searches public Kalshi markets and shows quotes, volume, liquidity, and optional orderbook levels.

Important input distinction:

- `Leaderboard window` chooses which leaderboard cohort to scan: daily, weekly, monthly, or all-time leaders.
- `Expiry days` chooses how far out candidate markets can resolve/end.

The `Score` is a research ranking from 0-100. It combines:

- `agreement`: share of positioned leaders on the consensus side.
- `breadth`: how many agreeing leaders there are, with diminishing returns.
- `value`: leader dollars on the consensus side, with diminishing returns.
- `entry`: how favorable the current price is versus leaders' weighted average entry.
- `opposition`: consensus value relative to opposing value.

Higher score means a cleaner leader-consensus signal. It is not a probability estimate or a trade recommendation.

The `Q` badge beside a trader name is a cached trader-quality score from 0-100. Run the `Trader Quality` tab first for the same leaderboard cohort to populate or refresh those badges. `Q --` means there is no cached score for that trader yet.
Strong Trader Watch requires the latest Trader Quality run to match the same `Top traders`, `Category`, `Leaderboard window`, and `Rank by` settings. If those do not match, it will not reuse stale Q scores from a different cohort.

Trader Quality now adjusts for the odds a trader bought. A trader who wins 90% of bets bought at 90 cents is not showing edge; a trader who wins 35% of bets bought at 20 cents is.

For final-outcome odds edge, the tool only counts closed-position rows that look settlement-consistent: the market price is terminal and the reported realized PnL is close to the expected terminal payout. Rows that appear to have been sold before resolution are excluded from this final-outcome calculation even if the market has since resolved.

Strong Trader Watch fields:

- `Quality threshold`: minimum cached `Q` score to count as a strong trader. Default: `80`.
- `Top traders`: leaderboard cohort to scan for both strong and aligned/opposed traders.
- `Expiry days`: how far forward current positions can end. Use `0` for all non-expired current positions.
- `Min position value`: ignores small positions below this current value.
- `Largest pages/trader`: how many current-position pages to scan per leaderboard trader.
- `Only show markets with opposition`: hides markets where no scanned leaderboard trader is positioned on another side.

Strong Trader Watch output:

- `Strong side`: the outcome held by at least one high-Q trader.
- `Signal`: a 0-100 ranking for the row, based on strong-trader quality, strong value, breadth, alignment, and entry.
- `Strong traders`: high-Q traders on that side.
- `Other aligned leaders`: lower-Q or unscored leaderboard traders on the same side.
- `Opposed leaders`: leaderboard traders on a different outcome in the same market.

Sharp Disagreement fields:

- `Sharp Q minimum`: minimum global `Q` score for a trader to count as sharp.
- `Weak Q maximum`: maximum global `Q` score for an opposed trader to count as weak.
- `Topic score minimum`: minimum topic-fit score for the sharp trader on the inferred market topic.
- `Require weak opposition`: when checked, hides markets unless at least one opposed trader is weak by the selected threshold.

Sharp Disagreement output:

- `Sharp side`: the side held by high-Q, topic-fit traders.
- `Topic`: inferred from market title/slug using local keywords. Treat `OTHER` as uncategorized, not as a true category.
- `Topic`: in trader rows, the trader's topic-fit score and resolved-position sample for that inferred topic.
- `Edge`: topic-specific odds edge for that trader when available.
- `Weak opposed`: count/value of opposed traders below the weak-Q threshold.
- `Discount`: whether the current price is better or worse than the aligned traders' weighted entry price.

Kalshi Markets fields:

- `Search`: filters returned markets locally by ticker, event ticker, title, or side title.
- `Status`: sends Kalshi's public market status filter.
- `Close within days`: filters returned rows locally by close time. Use `0` to disable.
- `Combos`: excludes, includes, or only shows multivariate combo markets.
- `Fetch orderbook levels`: fetches the public orderbook endpoint for each displayed market. Leave off for faster broad scans.

Kalshi Markets output:

- `YES bid`, `YES ask`, and `Spread`: current quote fields from Kalshi's market response.
- `Last`: last traded price.
- `24h Vol`: 24-hour volume.
- `Liquidity`: Kalshi's liquidity field.
- `Orderbook`: optional expandable YES/NO bid levels. Kalshi orderbooks expose bids; the opposite side implies asks.

Trader Quality columns:

- `Score`: local 0-100 quality score for quick ranking.
- `Style`: rough label such as `Sharp Contrarian`, `Favorite Grinder`, `Positive Edge`, or `Mixed`.
- `PnL`, `ROI`: leaderboard metrics for the selected leaderboard window.
- `Avg odds`: share-weighted average entry probability on settlement-consistent resolved rows.
- `Actual`: share-weighted share of those rows that finished on the trader's side.
- `Edge`: `Actual` minus `Avg odds`. This is the main odds-adjusted signal.
- `Z`: rough statistical strength of the edge. Higher absolute values mean the edge is less likely to be random noise.
- `Contra`: share of resolved stake bought below 50% implied odds.
- `Trades`: fetched public trade-history sample size.
- `Last trade`: most recent fetched public trade.
- `Odds buckets`: expandable bucket table showing share-weighted edge and cost-weighted ROI by entry-odds range.

Trader Quality writes a local cache at `data/cache/trader-quality.json`. The web app reuses cached history for `Cache hours` unless `Force refresh cached history` is checked.
Sharp Disagreement uses the same cache and needs a refreshed Trader Quality run after this feature was added so topic summaries are present.

Suggested interactive defaults:

- `Top traders`: 20
- `Leaderboard window`: DAY
- `Agreement`: 80%
- `Min leaders`: 2 or 3
- `Expiry days`: 5
- `Largest pages/trader`: 1
- `Concurrency`: 1 or 2
- `Entry rule`: Within range

Parallelism guidance:

- Leaderboard calls are lightweight.
- Position scans are the bottleneck.
- Use concurrency `1` or `2` for reliable interactive runs.
- Higher concurrency can be faster, but the public Data API may time out. The tool will show warnings when a trader scan is truncated.

## Consensus CLI

Run the same screen from Terminal:

```bash
npm run consensus:leaders -- --top 20 --time-period DAY --within-days 5 --entry-rule within-range
```

Save results:

```bash
npm run consensus:leaders -- --top 20 --time-period DAY --within-days 5 --entry-rule within-range --json data/consensus/run.json --csv data/consensus/run.csv
```

Useful options:

- `--agreement 0.8`
- `--min-leaders 3`
- `--min-position-value 1000`
- `--max-pages-per-trader 1`
- `--concurrency 2`
- `--entry-rule within-range`

## Trader Quality CLI

Score leaderboard traders and warm the quality cache:

```bash
npm run trader:quality -- --top 20
```

Save results:

```bash
npm run trader:quality -- --top 20 --json data/quality/top20.json --csv data/quality/top20.csv
```

Useful options:

- `--min-volume 1000`
- `--min-roi-pct 0`
- `--min-trades 50`
- `--min-markets 10`
- `--min-closed-markets 5`
- `--trade-pages 1`
- `--closed-pages 2`
- `--current-pages 1`
- `--cache-hours 6`
- `--refresh`

## Leaderboard Trader IDs

Save top leaderboard trader IDs for later workflows:

```bash
npm run leaderboard:traders -- --top 100 --json data/leaderboards/overall-day-pnl-top100.json
```

Save a rank range:

```bash
npm run leaderboard:traders -- --from 51 --to 100 --json data/leaderboards/overall-day-pnl-51-100.json
```

The JSON includes:

- `ids`: flat list of wallet/profile IDs.
- `traders`: rank, username, wallet, PnL, volume, and profile metadata.

## User Positions

Pull all public positions for a wallet/profile:

```bash
npm run positions:user -- --user 0x...
```

Export JSON and CSV:

```bash
npm run positions:user -- --user 0x... --json data/positions/user.json --csv data/positions/user.csv
```

## Polymarket US Account Check

Requires `.env.local` with:

```text
POLYMARKET_US_KEY_ID=...
POLYMARKET_US_SECRET_KEY=...
```

Run:

```bash
npm run us:check-account
```

This is read-only. It checks balances, open-order count, and position count.

## Public API Checks

Polymarket US public API:

```bash
npm run us:check-public
```

International CLOB public API:

```bash
npm run check:public
```

## CLOB Account Check

This is separate from Polymarket US and requires wallet-based CLOB credentials.

Derive CLOB credentials:

```bash
npm run auth:derive -- --write-env .env.local
```

Read-only CLOB account check:

```bash
npm run account:check
```

## Safety

- These tools are read-only except credential derivation.
- They do not place or cancel trades.
- Treat consensus output as research, not a trade recommendation.
- Confirm a market exists in the account surface you can actually use before acting on any signal.
- Keep `.env.local` private.
