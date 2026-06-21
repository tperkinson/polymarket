# Research Log

Record dated research findings and source checks here.

## Format

Use this structure:

```markdown
## YYYY-MM-DD - Topic

- Source: URL or local file
- Checked by: agent/user
- Finding: concise summary
- Confidence: high/medium/low
- Recheck when: condition or date
```

## Current Notes

- See dated notes below for current API checks.

## 2026-06-18 - Polymarket CLOB authentication model

- Source: https://docs.polymarket.com/api-reference/authentication
- Checked by: agent
- Finding: The CLOB API uses L1 wallet/private-key signing to create or derive API credentials and L2 API credentials for authenticated CLOB requests. Public Gamma/Data APIs and public CLOB read endpoints do not require authentication. Trading endpoints require L2 `POLY_*` headers, and order creation still requires locally signed order payloads.
- Confidence: high
- Recheck when: before adding or modifying authenticated trading, cancellation, balance, allowance, or account-management automation.

## 2026-06-18 - Official Polymarket SDKs

- Source: https://docs.polymarket.com/api-reference/clients-sdks
- Checked by: agent
- Finding: Polymarket documents official open-source clients for TypeScript, Python, and Rust. The TypeScript package is `@polymarket/clob-client-v2`; npm reported version `1.0.6` on 2026-06-18.
- Confidence: high
- Recheck when: upgrading dependencies or adding new API coverage.

## 2026-06-18 - Deposit wallet flow for new API users

- Source: https://docs.polymarket.com/trading/deposit-wallets
- Checked by: agent
- Finding: Polymarket docs describe deposit wallets as the wallet path for new API users, using CLOB signature type `3` / `POLY_1271`; existing Safe and proxy users may continue with their current wallet setup.
- Confidence: high
- Recheck when: configuring a real account's `POLYMARKET_SIGNATURE_TYPE` or `POLYMARKET_FUNDER_ADDRESS`.

## 2026-06-18 - Public CLOB connectivity verification

- Source: local command `npm run check:public`
- Checked by: agent
- Finding: `https://clob.polymarket.com` returned OK, version `2`, server time, and 1000 simplified markets on the first page.
- Confidence: high
- Recheck when: connectivity fails, endpoint behavior changes, or the SDK is upgraded.

## 2026-06-18 - Polymarket US authentication and passkey role

- Source: https://docs.polymarket.us/api-reference/authentication
- Checked by: agent
- Finding: Polymarket US authenticated endpoints require a developer portal API Key ID and Secret Key. A `polymarket.us` passkey is used to sign in to the app/developer portal, but it is not the API credential itself. The docs warn that the secret key is shown only once and should be stored safely.
- Confidence: high
- Recheck when: generating, rotating, or debugging Polymarket US API credentials.

## 2026-06-18 - Polymarket US SDK and public API verification

- Source: https://docs.polymarket.us/api-reference/sdks/typescript/quickstart and local command `npm run us:check-public`
- Checked by: agent
- Finding: The official TypeScript SDK is `polymarket-us`; npm reported version `0.1.1`. Public API calls to `https://gateway.polymarket.us` succeeded locally, returning active events, markets, and sports data.
- Confidence: high
- Recheck when: upgrading dependencies or expanding US API coverage.

## 2026-06-18 - Public trader leaderboard endpoint

- Source: https://docs.polymarket.com/api-reference/core/get-trader-leaderboard-rankings and local request to `https://data-api.polymarket.com/v1/leaderboard`
- Checked by: agent
- Finding: The public Data API exposes trader leaderboard rankings with query parameters `category`, `timePeriod`, `orderBy`, `limit`, and `offset`. The documented page limit is 50 and offset maximum is 1000. Verified top and rank-range requests locally with `npm run leaderboard:traders`.
- Confidence: high
- Recheck when: building reusable leaderboard tools or if leaderboard fields/filters change.

## 2026-06-18 - Public user positions endpoint

- Source: https://docs.polymarket.com/api-reference/core/get-current-positions-for-a-user and local `npm run positions:user` checks
- Checked by: agent
- Finding: The public Data API `/positions` endpoint returns current user positions for a wallet/profile address and supports pagination with `limit` up to 500 and `offset` up to 10000. Verified pagination by pulling 582 positions for `0x2c335066fe58fe9237c3d3dc7b275c2a034a0563`.
- Confidence: high
- Recheck when: changing the positions pull command, adding filters, or if response fields/sort options change.

## 2026-06-18 - Consensus screen caveat for Polymarket US

- Source: local commands `npm run consensus:leaders ...` and Polymarket US SDK `markets.retrieveBySlug`
- Checked by: agent
- Finding: A public Data API consensus screen found two strict entry-range candidates from the top 20 daily PnL leaderboard for markets ending by 2026-06-23. The candidate slugs did not resolve through the Polymarket US SDK public market lookup, so they should be treated as research signals unless independently available in the user's Polymarket US account.
- Confidence: medium
- Recheck when: attempting to act on a candidate, because market availability and slugs differ across Polymarket API surfaces.

## 2026-06-18 - Public user trades endpoint

- Source: https://docs.polymarket.com/api-reference/core/get-trades-for-a-user-or-markets and local requests to `https://data-api.polymarket.com/trades`
- Checked by: agent
- Finding: The public Data API `/trades` endpoint returns user trade rows with `proxyWallet`, `side`, `asset`, `conditionId`, `size`, `price`, `timestamp`, `title`, `slug`, `eventSlug`, `outcome`, and profile fields. The docs list `limit`, `offset`, `takerOnly`, `user`, `market`, `eventId`, and `side` parameters. The changelog notes `/trades` and `/activity` maximums were reduced to `limit=500` and `offset=1000`, so local tooling caps `/trades` pagination conservatively.
- Confidence: high
- Recheck when: changing trader-history pagination or if the Data API changelog updates `/trades` limits.

## 2026-06-18 - Public closed positions endpoint

- Source: https://docs.polymarket.com/api-reference/core/get-closed-positions-for-a-user and local requests to `https://data-api.polymarket.com/closed-positions`
- Checked by: agent
- Finding: The public Data API `/closed-positions` endpoint returns realized position rows with `avgPrice`, `totalBought`, `realizedPnl`, `curPrice`, `timestamp`, `outcome`, `oppositeOutcome`, and `endDate`. The docs list `limit` up to 50 and `offset` up to 100000. The trader-quality tool uses this endpoint to infer closed-market profit rate, held-to-resolution rate, sold-before-resolution rate, and multi-side/hedging signals.
- Confidence: medium-high
- Recheck when: relying on held/sold/hedge metrics for decisions, because those are inferred from public rows rather than a full account ledger.

## 2026-06-18 - Closed-position terminal price caveat

- Source: local denizz review using `data/quality/denizz-recheck.json` and public `/closed-positions` rows for `0xbaa2bcb5439e985ce4ccf815b4700027d1b92c73`
- Checked by: agent
- Finding: A closed-position row can show a terminal `curPrice` after the market resolves even when the trader appears to have sold before resolution. Final-outcome odds edge should therefore require both a terminal market price and realized PnL that is close to terminal payout. The trader-quality tool was updated to exclude non-settlement-consistent rows from final-outcome correctness and to share-weight expected/actual outcome rates.
- Confidence: medium-high
- Recheck when: changing odds-edge logic or if Polymarket adds explicit public fields for whether a position was held to settlement.

## 2026-06-19 - Kalshi public market data API

- Source: https://docs.kalshi.com/api-reference/market/get-markets and https://docs.kalshi.com/api-reference/market/get-market-orderbook
- Checked by: agent
- Finding: Kalshi exposes public REST market data at `https://external-api.kalshi.com/trade-api/v2/markets`, with filters including `limit`, `status`, `tickers`, and `mve_filter`. The market response includes quote fields such as `yes_bid_dollars`, `yes_ask_dollars`, `last_price_dollars`, `volume_24h_fp`, and `liquidity_dollars`. The orderbook endpoint is `/markets/{ticker}/orderbook` and returns YES/NO bid levels; opposite-side bids imply asks in binary markets.
- Confidence: high
- Recheck when: expanding Kalshi support beyond read-only market search, adding authenticated account access, or if Kalshi changes public/auth requirements for orderbooks.
