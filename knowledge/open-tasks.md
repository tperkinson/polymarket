# Open Tasks

## Active

- None.

## Next

- Confirm the user's exact account type (`EOA`, proxy, Safe, or deposit wallet) before expanding account automation beyond read-only checks.
- Add authenticated order-management automation only after explicit scope, safety limits, and eligibility assumptions are documented.
- Consider a local encrypted secret-store workflow if this grows beyond `.env.local`.

## Done

- Added Trader Quality web tab, local `Q` badges on consensus leader rows, and a repository-local trader-quality cache.
- Added Strong Trader Watch web tab to inspect cached high-Q traders' current public positions with aligned/opposed leaderboard context.
- Added Sharp Disagreement web tab to screen for high-Q, topic-fit traders positioned against opposed or weak leaderboard traders.
- Added Kalshi Markets web tab for read-only public Kalshi market search and optional orderbook inspection.
- Added odds-adjusted trader metrics, style labels, and odds-bucket detail to Trader Quality and the cached `Q` score.
- Corrected Trader Quality odds-edge interpretation to exclude sold-before-resolution rows from final-outcome correctness and share-weight expected/actual outcome rates.
- Added `npm run trader:quality` for scoring leaderboard traders and warming/exporting the quality cache.
- Audited consensus web UI fields; clarified leaderboard-vs-expiry windows, changed web agreement input to percentage, added missing categories, and validated field mapping.
- Added `npm start` for one-command web tool startup and created `docs/user-tools.md` for user-facing tool usage.
- Added a local web frontend for the public leader consensus screen.
- Added a reusable public Data API consensus screen for near-term leader-aligned positions with entry-range filters.
- Added a reusable public Data API leaderboard trader pull command that supports top/range selection and saves wallet IDs for later workflows.
- Added a reusable public Data API user-position pull command with pagination and optional JSON/CSV export.
- Added a TypeScript Polymarket CLOB account-access foundation using the official SDK.
- Added public connectivity, L2 credential derivation, and read-only authenticated account-check commands.
- Added current Polymarket API and documentation findings before building the first integration.
- Created the initial knowledge-system structure.
- Initialized the workspace as a Git repository.
