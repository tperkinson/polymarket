# Polymarket Workspace

This repository starts as a lightweight knowledge system and local tooling workspace for Polymarket-related work.

Begin with:

```bash
./scripts/context_snapshot.sh
```

Primary context lives in `knowledge/START_HERE.md`.

## Start the Web Tool

```bash
npm install
npm start
```

Then open `http://127.0.0.1:8787`.

The web tool includes:

- `Consensus Screen`: finds near-term markets where leaderboard traders cluster on the same side.
- `Trader Quality`: scores leaderboard traders from public trade/position history and caches `Q` badges used by the consensus screen.
- `Strong Trader Watch`: follows high-Q traders' current public positions and shows aligned/opposed leaderboard traders.

## Account Automation Tools

The current automation layer is a conservative account-access foundation built on Polymarket's official CLOB SDK. It can verify public API connectivity, derive local API credentials from your wallet, and run a read-only authenticated account check. It does not place, cancel, or manage trades.

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` with your wallet/account values. The file is ignored by git.

```bash
npm run check:public
npm run auth:derive -- --write-env .env.local
npm run account:check
```

See `docs/user-tools.md` for user-facing commands and `docs/account-automation.md` for setup notes and guardrails.
