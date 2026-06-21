import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  fetchLeaderboardRange,
  type LeaderboardCategory,
  type LeaderboardOrderBy,
  type LeaderboardTimePeriod,
  type LeaderboardTrader,
} from "../polymarket/data-api.js";

type Args = {
  fromRank: number;
  toRank: number;
  category: LeaderboardCategory;
  timePeriod: LeaderboardTimePeriod;
  orderBy: LeaderboardOrderBy;
  json?: string;
  csv?: string;
};

const args = parseArgs(process.argv.slice(2));
const { traders, hitOffsetLimit } = await fetchLeaderboardRange(args);
const manifest = {
  schemaVersion: 1,
  fetchedAt: new Date().toISOString(),
  source: "https://data-api.polymarket.com/v1/leaderboard",
  query: {
    category: args.category,
    timePeriod: args.timePeriod,
    orderBy: args.orderBy,
    fromRank: args.fromRank,
    toRank: args.toRank,
  },
  hitOffsetLimit,
  count: traders.length,
  ids: traders.map((trader) => trader.proxyWallet),
  traders: traders.map(formatTrader),
};

if (args.json) writeJson(args.json, manifest);
if (args.csv) writeCsv(args.csv, traders);

console.log(
  JSON.stringify(
    {
      ...manifest,
      files: {
        json: args.json ? resolve(process.cwd(), args.json) : undefined,
        csv: args.csv ? resolve(process.cwd(), args.csv) : undefined,
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

  const topValue = getOptionalArg(argv, "--top");
  const fromValue = getOptionalArg(argv, "--from");
  const toValue = getOptionalArg(argv, "--to");

  if (topValue && (fromValue || toValue)) {
    throw new Error("Use either --top or --from/--to, not both.");
  }

  let fromRank: number;
  let toRank: number;

  if (topValue) {
    fromRank = 1;
    toRank = readInteger(topValue, "--top");
  } else {
    fromRank = readInteger(fromValue || "1", "--from");
    toRank = readInteger(toValue || fromValue || "25", "--to");
  }

  if (fromRank < 1) throw new Error("--from must be 1 or greater.");
  if (toRank < fromRank) throw new Error("--to must be greater than or equal to --from.");

  const category = getOptionalArg(argv, "--category", "OVERALL").toUpperCase() as LeaderboardCategory;
  const timePeriod = getOptionalArg(argv, "--time-period", "DAY").toUpperCase() as LeaderboardTimePeriod;
  const orderBy = getOptionalArg(argv, "--order-by", "PNL").toUpperCase() as LeaderboardOrderBy;

  if (!isCategory(category)) throw new Error(`Unsupported --category: ${category}`);
  if (!isTimePeriod(timePeriod)) throw new Error(`Unsupported --time-period: ${timePeriod}`);
  if (orderBy !== "PNL" && orderBy !== "VOL") throw new Error(`Unsupported --order-by: ${orderBy}`);

  return {
    fromRank,
    toRank,
    category,
    timePeriod,
    orderBy,
    json: getOptionalArg(argv, "--json"),
    csv: getOptionalArg(argv, "--csv"),
  };
}

function formatTrader(trader: LeaderboardTrader) {
  return {
    rank: Number(trader.rank),
    proxyWallet: trader.proxyWallet,
    userName: trader.userName,
    pnl: round2(trader.pnl),
    vol: round2(trader.vol),
    xUsername: trader.xUsername ?? "",
    verifiedBadge: trader.verifiedBadge,
    profileImage: trader.profileImage ?? "",
  };
}

function writeJson(path: string, payload: unknown): void {
  const outputPath = resolve(process.cwd(), path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeCsv(path: string, traders: LeaderboardTrader[]): void {
  const outputPath = resolve(process.cwd(), path);
  mkdirSync(dirname(outputPath), { recursive: true });
  const headers = ["rank", "proxyWallet", "userName", "pnl", "vol", "xUsername", "verifiedBadge", "profileImage"];
  const rows = traders.map((trader) => {
    const formatted = formatTrader(trader);
    return headers.map((header) => csvCell(String(formatted[header as keyof typeof formatted] ?? ""))).join(",");
  });
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

function isCategory(value: string): value is LeaderboardCategory {
  return ["OVERALL", "POLITICS", "SPORTS", "ESPORTS", "CRYPTO", "CULTURE", "MENTIONS", "WEATHER", "ECONOMICS", "TECH", "FINANCE"].includes(value);
}

function isTimePeriod(value: string): value is LeaderboardTimePeriod {
  return ["DAY", "WEEK", "MONTH", "ALL"].includes(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function printHelp(): void {
  console.log(`Pull Polymarket leaderboard traders and save their wallet/profile IDs for later workflows.

Usage:
  npm run leaderboard:traders -- --top 100 [options]
  npm run leaderboard:traders -- --from 51 --to 100 [options]

Options:
  --top <n>                 Fetch ranks 1 through n.
  --from <rank>             First 1-based rank to fetch. Default: 1.
  --to <rank>               Last 1-based rank to fetch. Default: 25, or --from if only --from is set.
  --category <category>     OVERALL, POLITICS, SPORTS, ESPORTS, CRYPTO, CULTURE, MENTIONS, WEATHER, ECONOMICS, TECH, FINANCE. Default: OVERALL.
  --time-period <period>    DAY, WEEK, MONTH, ALL. Default: DAY.
  --order-by <field>        PNL or VOL. Default: PNL.
  --json <path>             Write a manifest with ids and trader metadata.
  --csv <path>              Write trader metadata as CSV.
`);
}
