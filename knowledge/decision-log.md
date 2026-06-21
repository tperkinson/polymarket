# Decision Log

Record durable decisions here. Use dates in `YYYY-MM-DD` format.

## 2026-06-18 - Use a lightweight repository-local knowledge system

Decision: Keep startup context in plain Markdown files under `knowledge/`, with root-level `AGENTS.md` as the required instruction bridge for future conversations.

Rationale: The workspace is empty, so a simple text-first system gives future chats immediate context without committing to an application stack too early.

Impact: New tools and research findings must be registered in the knowledge files as they are created.

## 2026-06-18 - Use official TypeScript SDK for first account-access tools

Decision: Build the first Polymarket account automation layer in TypeScript on `@polymarket/clob-client-v2`, with `viem` wallet signing and local `.env.local` secrets.

Rationale: Polymarket's current docs list TypeScript, Python, and Rust official SDKs; the TypeScript package is current on npm and exposes the needed L1/L2 methods.

Impact: Initial tools are read-only except for API credential creation/derivation. Trading, cancellation, bridging, and withdrawals require a separate explicit decision and guardrails.

## 2026-06-18 - Keep first account automation read-only

Decision: Do not add order placement, cancellation, bridge, withdrawal, VPN/geoblock bypass, or web UI automation in the first account-access layer.

Rationale: Account actions are sensitive, Polymarket access rules are time-sensitive, and the user's exact account type has not been confirmed.

Impact: The current scripts can verify connectivity, derive credentials, and check account state. Future account automation must document account type, authorization boundaries, and failure limits first.

## 2026-06-18 - Keep Polymarket US tooling separate from international CLOB tooling

Decision: Add `polymarket-us` commands and environment variables separately from `@polymarket/clob-client-v2` commands.

Rationale: The user's saved passkey is for `polymarket.us`, whose official docs use developer portal API keys (`POLYMARKET_US_KEY_ID`, `POLYMARKET_US_SECRET_KEY`) rather than wallet-derived CLOB API credentials.

Impact: Use `npm run us:*` commands for Polymarket US accounts and `npm run check:public` / `auth:derive` / `account:check` for international CLOB flows.

## 2026-06-18 - Start trader-history persistence with a local cache

Decision: Use a repository-local JSON cache at `data/cache/trader-quality.json` for trader-quality/history metrics before introducing a full database.

Rationale: The current need is to avoid re-pulling public history during interactive screening. A small JSON cache has no native dependency or service setup, works with `npm start`, and can be replaced by SQLite later if periodic background updates or larger history tables become necessary.

Impact: The Trader Quality tab and `npm run trader:quality` warm the cache. The Consensus Screen reads cached scores and shows `Q` badges when available. Cache entries are freshness-limited by the user-selected cache TTL and can be force-refreshed.

## 2026-06-18 - Keep strong-trader inspection separate from consensus

Decision: Add `Strong Trader Watch` as a separate web tab instead of folding high-Q trader positions into the consensus screen.

Rationale: Consensus answers "where do leaderboard traders broadly agree?" while Strong Trader Watch answers "what are high-quality traders currently holding, and who agrees or opposes?" Keeping them separate avoids mixing two different screening philosophies in one table.

Impact: Strong Trader Watch depends on cached `Q` scores from Trader Quality, then scans current public positions for the selected leaderboard cohort and groups aligned/opposed traders by market/outcome.

## 2026-06-18 - Score trader quality with odds-adjusted edge

Decision: Include odds-adjusted resolved performance in Trader Quality and the cached `Q` score instead of relying on raw win rate or aggregate ROI alone.

Rationale: A trader can win frequently by buying 90-cent favorites without showing edge, while a contrarian can win less often but beat implied odds and earn better risk-adjusted returns. `Actual resolved rate - average entry odds` is a clearer measure of whether the trader was on the correct side of the price.

Impact: Trader Quality now computes average entry odds, actual resolved rate, odds edge, edge z-score, contrarian/favorite exposure, style labels, and odds-bucket performance from settlement-consistent terminal closed-position rows. Rows closed before resolution remain useful for ROI/behavioral metrics but are not counted as final-outcome correctness. Expected and actual outcome rates are share-weighted; ROI remains cost-weighted.

## 2026-06-19 - Add sharp-disagreement screen with inferred topic fit

Decision: Add a separate Sharp Disagreement web tab instead of overloading Strong Trader Watch or Consensus Screen.

Rationale: This screen answers a different question: "Are high-quality traders with some demonstrated topic fit positioned against other leaderboard traders?" It is a stronger research screen than raw consensus when informed-vs-noisy disagreement exists.

Impact: Trader Quality cache entries now include topic-level summaries. Topic is inferred locally from market title/slug keywords until a richer market metadata source is added. The screen can optionally require opposed traders below a weak-Q threshold, but that strict filter may be sparse in small cohorts.

## 2026-06-19 - Start Kalshi integration as read-only public market data

Decision: Add Kalshi support first as a separate read-only market-search tab using public REST market and orderbook endpoints.

Rationale: Kalshi account access and trading require API keys and signed authenticated requests. A public market-data adapter lets the workspace compare venues and inspect prices without introducing account safety or order-placement risk.

Impact: The web app now has a Kalshi Markets tab. It does not use credentials, place orders, read a user account, or merge Kalshi data into Polymarket trader screens yet.
