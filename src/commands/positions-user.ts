import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  fetchAllUserPositions,
  type Position,
  type PositionSortBy,
  type SortDirection,
} from "../polymarket/data-api.js";

type Args = {
  user: string;
  top: number;
  sortBy: PositionSortBy;
  sortDirection: SortDirection;
  sizeThreshold: number;
  json?: string;
  csv?: string;
  market?: string;
  eventId?: string;
};

const args = parseArgs(process.argv.slice(2));
const { positions, hitOffsetLimit } = await fetchAllUserPositions(args);
const summary = summarizePositions(positions);
const topPositions = positions.slice(0, args.top);

if (args.json) {
  writeJson(args.json, {
    user: args.user,
    fetchedAt: new Date().toISOString(),
    query: {
      sortBy: args.sortBy,
      sortDirection: args.sortDirection,
      sizeThreshold: args.sizeThreshold,
      market: args.market,
      eventId: args.eventId,
    },
    hitOffsetLimit,
    summary,
    positions,
  });
}

if (args.csv) {
  writeCsv(args.csv, positions);
}

console.log(
  JSON.stringify(
    {
      user: args.user,
      totalPositions: positions.length,
      hitOffsetLimit,
      summary,
      topPositions: topPositions.map(formatPosition),
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

  const user = getRequiredArg(argv, "--user");
  if (!/^0x[a-fA-F0-9]{40}$/.test(user)) {
    throw new Error("--user must be a 0x-prefixed wallet/profile address.");
  }

  const sortBy = getOptionalArg(argv, "--sort-by", "CURRENT").toUpperCase() as PositionSortBy;
  const sortDirection = getOptionalArg(argv, "--sort-direction", "DESC").toUpperCase() as SortDirection;
  const top = readInteger(getOptionalArg(argv, "--top", "10"), "--top");
  const sizeThreshold = readNumber(getOptionalArg(argv, "--size-threshold", "0"), "--size-threshold");

  if (!isPositionSortBy(sortBy)) throw new Error(`Unsupported --sort-by: ${sortBy}`);
  if (sortDirection !== "ASC" && sortDirection !== "DESC") throw new Error(`Unsupported --sort-direction: ${sortDirection}`);
  if (top < 0) throw new Error("--top must be zero or greater.");
  if (sizeThreshold < 0) throw new Error("--size-threshold must be zero or greater.");

  const market = getOptionalArg(argv, "--market");
  const eventId = getOptionalArg(argv, "--event-id");
  if (market && eventId) throw new Error("--market and --event-id are mutually exclusive.");

  return {
    user,
    top,
    sortBy,
    sortDirection,
    sizeThreshold,
    json: getOptionalArg(argv, "--json"),
    csv: getOptionalArg(argv, "--csv"),
    market,
    eventId,
  };
}

function summarizePositions(positions: Position[]) {
  const live = positions.filter((position) => !position.redeemable && position.currentValue > 0);
  const redeemable = positions.filter((position) => position.redeemable);
  const mergeable = positions.filter((position) => position.mergeable);

  return {
    liveCount: live.length,
    redeemableCount: redeemable.length,
    mergeableCount: mergeable.length,
    totalCurrentValue: round2(sum(positions, "currentValue")),
    liveCurrentValue: round2(sum(live, "currentValue")),
    totalInitialValue: round2(sum(positions, "initialValue")),
    totalCashPnl: round2(sum(positions, "cashPnl")),
    liveCashPnl: round2(sum(live, "cashPnl")),
  };
}

function formatPosition(position: Position) {
  return {
    title: position.title,
    outcome: position.outcome,
    size: position.size,
    avgPrice: position.avgPrice,
    curPrice: position.curPrice,
    currentValue: round2(position.currentValue),
    cashPnl: round2(position.cashPnl),
    percentPnl: round4(position.percentPnl),
    redeemable: position.redeemable,
    mergeable: position.mergeable,
    endDate: position.endDate,
    slug: position.slug,
    conditionId: position.conditionId,
    asset: position.asset,
  };
}

function writeJson(path: string, payload: unknown): void {
  const outputPath = resolve(process.cwd(), path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeCsv(path: string, positions: Position[]): void {
  const outputPath = resolve(process.cwd(), path);
  mkdirSync(dirname(outputPath), { recursive: true });
  const headers = [
    "proxyWallet",
    "title",
    "outcome",
    "size",
    "avgPrice",
    "curPrice",
    "initialValue",
    "currentValue",
    "cashPnl",
    "percentPnl",
    "redeemable",
    "mergeable",
    "endDate",
    "slug",
    "conditionId",
    "asset",
  ];
  const rows = positions.map((position) =>
    headers.map((header) => csvCell(String(position[header as keyof Position] ?? ""))).join(","),
  );
  writeFileSync(outputPath, `${headers.join(",")}\n${rows.join("\n")}\n`);
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function sum(positions: Position[], field: "currentValue" | "initialValue" | "cashPnl"): number {
  return positions.reduce((total, position) => total + (Number.isFinite(position[field]) ? position[field] : 0), 0);
}

function getRequiredArg(argv: string[], name: string): string {
  const value = getOptionalArg(argv, name);
  if (!value) throw new Error(`Missing required argument: ${name}`);
  return value;
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

function isPositionSortBy(value: string): value is PositionSortBy {
  return ["CURRENT", "INITIAL", "TOKENS", "CASHPNL", "PERCENTPNL", "TITLE", "RESOLVING", "PRICE", "AVGPRICE"].includes(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function printHelp(): void {
  console.log(`Pull all current Polymarket Data API positions for a wallet.

Usage:
  npm run positions:user -- --user 0x... [options]

Options:
  --top <n>                 Number of positions to include in stdout summary. Default: 10.
  --sort-by <field>         CURRENT, INITIAL, TOKENS, CASHPNL, PERCENTPNL, TITLE, RESOLVING, PRICE, AVGPRICE. Default: CURRENT.
  --sort-direction <dir>    ASC or DESC. Default: DESC.
  --size-threshold <n>      Minimum token size. Default: 0.
  --market <conditionId>    Limit to a condition ID. Mutually exclusive with --event-id.
  --event-id <id>           Limit to an event ID. Mutually exclusive with --market.
  --json <path>             Write full response and summary to a JSON file.
  --csv <path>              Write positions to a CSV file.
`);
}
