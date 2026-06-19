import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runTraderQuality, type TraderQualityOptions, type TraderQualityRow } from "../polymarket/trader-quality.js";
import type { LeaderboardCategory, LeaderboardOrderBy, LeaderboardTimePeriod } from "../polymarket/data-api.js";

type Args = TraderQualityOptions & {
  json?: string;
  csv?: string;
};

const args = parseArgs(process.argv.slice(2));
const { json, csv, ...options } = args;
const result = await runTraderQuality(options);

if (json) writeJson(json, result);
if (csv) writeCsv(csv, result.traders);

console.log(
  JSON.stringify(
    {
      ...result,
      files: {
        json: json ? resolve(process.cwd(), json) : undefined,
        csv: csv ? resolve(process.cwd(), csv) : undefined,
      },
    },
    null,
    2,
  ),
);

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const category = getOptionalArg(argv, "--category", "OVERALL").toUpperCase() as LeaderboardCategory;
  const timePeriod = getOptionalArg(argv, "--time-period", "DAY").toUpperCase() as LeaderboardTimePeriod;
  const orderBy = getOptionalArg(argv, "--order-by", "PNL").toUpperCase() as LeaderboardOrderBy;

  if (!isCategory(category)) throw new Error(`Unsupported --category: ${category}`);
  if (!isTimePeriod(timePeriod)) throw new Error(`Unsupported --time-period: ${timePeriod}`);
  if (orderBy !== "PNL" && orderBy !== "VOL") throw new Error(`Unsupported --order-by: ${orderBy}`);

  return {
    top: readInteger(getOptionalArg(argv, "--top", "20"), "--top"),
    category,
    timePeriod,
    orderBy,
    minVolume: readNumber(getOptionalArg(argv, "--min-volume", "1000"), "--min-volume"),
    minRoiPct: readNumber(getOptionalArg(argv, "--min-roi-pct", "0"), "--min-roi-pct"),
    minTrades: readInteger(getOptionalArg(argv, "--min-trades", "50"), "--min-trades"),
    minMarkets: readInteger(getOptionalArg(argv, "--min-markets", "10"), "--min-markets"),
    minClosedMarkets: readInteger(getOptionalArg(argv, "--min-closed-markets", "5"), "--min-closed-markets"),
    tradePagesPerTrader: readInteger(getOptionalArg(argv, "--trade-pages", "1"), "--trade-pages"),
    closedPositionPagesPerTrader: readInteger(getOptionalArg(argv, "--closed-pages", "2"), "--closed-pages"),
    positionPagesPerTrader: readInteger(getOptionalArg(argv, "--current-pages", "1"), "--current-pages"),
    concurrency: readInteger(getOptionalArg(argv, "--concurrency", "2"), "--concurrency"),
    cacheTtlHours: readNumber(getOptionalArg(argv, "--cache-hours", "6"), "--cache-hours"),
    refreshCache: argv.includes("--refresh"),
    cachePath: getOptionalArg(argv, "--cache"),
    json: getOptionalArg(argv, "--json"),
    csv: getOptionalArg(argv, "--csv"),
  };
}

function writeJson(path: string, payload: unknown): void {
  const outputPath = resolve(process.cwd(), path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeCsv(path: string, traders: TraderQualityRow[]): void {
  const outputPath = resolve(process.cwd(), path);
  mkdirSync(dirname(outputPath), { recursive: true });
  const headers = [
    "scoreRank",
    "score",
    "scoreLabel",
    "leaderboardRank",
    "userName",
    "proxyWallet",
    "pnl",
    "vol",
    "roiPct",
    "bettingStyle",
    "resolvedPositionCount",
    "resolvedMarketCount",
    "avgEntryOddsPct",
    "actualWinPct",
    "expectedWinPct",
    "oddsEdgePct",
    "edgeZScore",
    "oddsRoiPct",
    "contrarianStakePct",
    "contrarianEdgePct",
    "favoriteStakePct",
    "favoriteEdgePct",
    "tradeCount",
    "uniqueMarketCount",
    "closedMarketCount",
    "closedMarketProfitRate",
    "heldToResolutionPct",
    "soldBeforeResolutionPct",
    "hedgedMarketPct",
    "lastTradeAt",
  ];

  const rows = traders.map((trader) =>
    [
      trader.scoreRank,
      trader.score,
      trader.scoreLabel,
      trader.rank,
      trader.userName,
      trader.proxyWallet,
      trader.pnl,
      trader.vol,
      trader.roiPct,
      trader.metrics.odds.style,
      trader.metrics.odds.resolvedPositionCount,
      trader.metrics.odds.resolvedMarketCount,
      trader.metrics.odds.avgEntryOddsPct,
      trader.metrics.odds.actualWinPct,
      trader.metrics.odds.expectedWinPct,
      trader.metrics.odds.oddsEdgePct,
      trader.metrics.odds.edgeZScore,
      trader.metrics.odds.roiPct,
      trader.metrics.odds.contrarianStakePct,
      trader.metrics.odds.contrarianEdgePct ?? "",
      trader.metrics.odds.favoriteStakePct,
      trader.metrics.odds.favoriteEdgePct ?? "",
      trader.metrics.tradeCount,
      trader.metrics.uniqueMarketCount,
      trader.metrics.closedMarketCount,
      trader.metrics.closedMarketProfitRate,
      trader.metrics.heldToResolutionPct,
      trader.metrics.soldBeforeResolutionPct,
      trader.metrics.hedgedMarketPct,
      trader.metrics.lastTradeAt ?? "",
    ]
      .map((value) => csvCell(String(value)))
      .join(","),
  );

  writeFileSync(outputPath, `${headers.join(",")}\n${rows.join("\n")}\n`);
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function getOptionalArg(argv: string[], name: string, fallback?: string): string {
  const index = argv.indexOf(name);
  if (index === -1) return fallback ?? "";
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function readInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

function readNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

function isCategory(value: string): value is LeaderboardCategory {
  return ["OVERALL", "POLITICS", "SPORTS", "ESPORTS", "CRYPTO", "CULTURE", "MENTIONS", "WEATHER", "ECONOMICS", "TECH", "FINANCE"].includes(value);
}

function isTimePeriod(value: string): value is LeaderboardTimePeriod {
  return ["DAY", "WEEK", "MONTH", "ALL"].includes(value);
}

function printHelp(): void {
  console.log(`Score Polymarket leaderboard traders using public history and cache the scores for the web UI.

Usage:
  npm run trader:quality -- --top 20 [options]

Options:
  --top <n>                     Fetch ranks 1 through n. Default: 20.
  --category <category>         OVERALL, POLITICS, SPORTS, ESPORTS, CRYPTO, CULTURE, MENTIONS, WEATHER, ECONOMICS, TECH, FINANCE. Default: OVERALL.
  --time-period <period>        DAY, WEEK, MONTH, ALL. Default: DAY.
  --order-by <field>            PNL or VOL. Default: PNL.
  --min-volume <amount>         Minimum leaderboard volume. Default: 1000.
  --min-roi-pct <percent>       Minimum leaderboard ROI percentage. Default: 0.
  --min-trades <n>              Minimum fetched trades. Default: 50.
  --min-markets <n>             Minimum fetched unique markets. Default: 10.
  --min-closed-markets <n>      Minimum fetched closed markets. Default: 5.
  --trade-pages <n>             /trades pages per trader, 500 rows each. Default: 1.
  --closed-pages <n>            /closed-positions pages per trader, 50 rows each. Default: 2.
  --current-pages <n>           /positions pages per trader, 500 rows each. Default: 1.
  --concurrency <n>             Parallel trader scans. Default: 2.
  --cache-hours <n>             Reuse cached history this many hours. Default: 6.
  --refresh                     Ignore cached history and fetch again.
  --cache <path>                Cache path. Default: data/cache/trader-quality.json.
  --json <path>                 Write full JSON result.
  --csv <path>                  Write trader table as CSV.
`);
}
