import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  fetchLeaderboardRange,
  fetchUserPositionsPage,
  type LeaderboardCategory,
  type LeaderboardOrderBy,
  type LeaderboardTimePeriod,
  type LeaderboardTrader,
  type Position,
} from "../polymarket/data-api.js";

type EntryRule = "within-range" | "at-or-below-weighted" | "none";

type Args = {
  top: number;
  category: LeaderboardCategory;
  timePeriod: LeaderboardTimePeriod;
  orderBy: LeaderboardOrderBy;
  asOf: string;
  withinDays: number;
  agreement: number;
  minLeaders: number;
  minPositionValue: number;
  entryRule: EntryRule;
  concurrency: number;
  maxPagesPerTrader: number;
  json?: string;
  csv?: string;
};

type CandidateLeader = {
  rank: number;
  userName: string;
  proxyWallet: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  cashPnl: number;
};

type Candidate = {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug?: string;
  endDate: string;
  outcome: string;
  marketLeaderCount: number;
  agreeingLeaderCount: number;
  agreementPct: number;
  totalCurrentValue: number;
  currentPrice: number;
  weightedAvgEntry: number;
  minAvgEntry: number;
  maxAvgEntry: number;
  withinEntryRange: boolean;
  atOrBelowWeightedEntry: boolean;
  leaders: CandidateLeader[];
};

type MarketGroup = {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug?: string;
  endDate: string;
  leaderWallets: Set<string>;
  outcomes: Map<string, CandidateLeader[]>;
};

const args = parseArgs(process.argv.slice(2));
const warnings: string[] = [];
const { traders } = await fetchLeaderboardRange({
  fromRank: 1,
  toRank: args.top,
  category: args.category,
  timePeriod: args.timePeriod,
  orderBy: args.orderBy,
});

const marketGroups = await collectMarketGroups(traders, args);
const allCandidates = buildCandidates(marketGroups, args);
const acceptedCandidates = allCandidates.filter((candidate) => passesEntryRule(candidate, args.entryRule));

const manifest = {
  schemaVersion: 1,
  fetchedAt: new Date().toISOString(),
  source: {
    leaderboard: "https://data-api.polymarket.com/v1/leaderboard",
    positions: "https://data-api.polymarket.com/positions",
  },
  query: {
    top: args.top,
    category: args.category,
    timePeriod: args.timePeriod,
    orderBy: args.orderBy,
    asOf: args.asOf,
    through: addDays(args.asOf, args.withinDays),
    withinDays: args.withinDays,
    agreement: args.agreement,
    minLeaders: args.minLeaders,
    minPositionValue: args.minPositionValue,
    entryRule: args.entryRule,
    maxPagesPerTrader: args.maxPagesPerTrader,
  },
  traderIds: traders.map((trader) => trader.proxyWallet),
  scannedTraderCount: traders.length,
  agreementCandidateCount: allCandidates.length,
  acceptedCandidateCount: acceptedCandidates.length,
  warnings,
  candidates: acceptedCandidates,
  rejectedByEntryRule: allCandidates.length - acceptedCandidates.length,
};

if (args.json) writeJson(args.json, manifest);
if (args.csv) writeCsv(args.csv, acceptedCandidates);

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

async function collectMarketGroups(traders: LeaderboardTrader[], options: Args): Promise<Map<string, MarketGroup>> {
  const marketGroups = new Map<string, MarketGroup>();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < traders.length) {
      const trader = traders[nextIndex];
      nextIndex += 1;
      const positions = await fetchRelevantPositions(trader, options);

      for (const position of positions) {
        const conditionId = position.conditionId;
        const existing = marketGroups.get(conditionId);
        const group = existing ?? {
          conditionId,
          title: position.title,
          slug: position.slug,
          eventSlug: position.eventSlug,
          endDate: position.endDate ?? "",
          leaderWallets: new Set<string>(),
          outcomes: new Map<string, CandidateLeader[]>(),
        };

        group.leaderWallets.add(trader.proxyWallet);

        const leader: CandidateLeader = {
          rank: Number(trader.rank),
          userName: trader.userName,
          proxyWallet: trader.proxyWallet,
          size: numberValue(position.size),
          avgPrice: numberValue(position.avgPrice),
          curPrice: numberValue(position.curPrice),
          currentValue: numberValue(position.currentValue),
          cashPnl: numberValue(position.cashPnl),
        };

        const leaders = group.outcomes.get(position.outcome) ?? [];
        leaders.push(leader);
        group.outcomes.set(position.outcome, leaders);
        marketGroups.set(conditionId, group);
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  return marketGroups;
}

async function fetchRelevantPositions(trader: LeaderboardTrader, options: Args): Promise<Position[]> {
  const relevant: Position[] = [];

  for (let pageIndex = 0; pageIndex < options.maxPagesPerTrader; pageIndex += 1) {
    const offset = pageIndex * 500;
    let page: Position[];
    try {
      page = await fetchUserPositionsPage({
        user: trader.proxyWallet,
        limit: 500,
        offset,
        sortBy: "CURRENT",
        sortDirection: "DESC",
        sizeThreshold: 0,
      });
    } catch (error) {
      warnings.push(`Truncated positions for ${trader.userName} (${trader.proxyWallet}) at offset ${offset}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }

    if (page.length === 0) break;

    let sawPositionAboveThreshold = false;
    for (const position of page) {
      const currentValue = numberValue(position.currentValue);
      if (currentValue >= options.minPositionValue) sawPositionAboveThreshold = true;
      if (isRelevantPosition(position, options)) relevant.push(position);
    }

    if (page.length < 500 || !sawPositionAboveThreshold) break;
  }

  return relevant;
}

function isRelevantPosition(position: Position, options: Args): boolean {
  if (position.redeemable) return false;
  if (numberValue(position.currentValue) < options.minPositionValue) return false;
  if (!position.endDate || position.endDate === "1970-01-01") return false;

  const through = addDays(options.asOf, options.withinDays);
  return position.endDate >= options.asOf && position.endDate <= through;
}

function buildCandidates(marketGroups: Map<string, MarketGroup>, options: Args): Candidate[] {
  const candidates: Candidate[] = [];

  for (const group of marketGroups.values()) {
    const marketLeaderCount = group.leaderWallets.size;
    if (marketLeaderCount < options.minLeaders) continue;

    for (const [outcome, leaders] of group.outcomes.entries()) {
      const agreementPct = leaders.length / marketLeaderCount;
      if (agreementPct < options.agreement) continue;

      const totalCurrentValue = leaders.reduce((total, leader) => total + leader.currentValue, 0);
      const totalSize = leaders.reduce((total, leader) => total + leader.size, 0);
      const weightedAvgEntry = leaders.reduce((total, leader) => total + leader.avgPrice * leader.size, 0) / (totalSize || 1);
      const currentPrice = leaders.reduce((total, leader) => total + leader.curPrice * leader.currentValue, 0) / (totalCurrentValue || 1);
      const avgPrices = leaders.map((leader) => leader.avgPrice).sort((a, b) => a - b);
      const minAvgEntry = avgPrices[0] ?? 0;
      const maxAvgEntry = avgPrices.at(-1) ?? 0;

      candidates.push({
        conditionId: group.conditionId,
        title: group.title,
        slug: group.slug,
        eventSlug: group.eventSlug,
        endDate: group.endDate,
        outcome,
        marketLeaderCount,
        agreeingLeaderCount: leaders.length,
        agreementPct: round4(agreementPct * 100),
        totalCurrentValue: round2(totalCurrentValue),
        currentPrice: round4(currentPrice),
        weightedAvgEntry: round4(weightedAvgEntry),
        minAvgEntry: round4(minAvgEntry),
        maxAvgEntry: round4(maxAvgEntry),
        withinEntryRange: currentPrice >= minAvgEntry && currentPrice <= maxAvgEntry,
        atOrBelowWeightedEntry: currentPrice <= weightedAvgEntry,
        leaders: leaders.sort((a, b) => a.rank - b.rank).map((leader) => ({
          ...leader,
          currentValue: round2(leader.currentValue),
          cashPnl: round2(leader.cashPnl),
          avgPrice: round4(leader.avgPrice),
          curPrice: round4(leader.curPrice),
        })),
      });
    }
  }

  return candidates.sort(
    (a, b) =>
      b.agreementPct - a.agreementPct ||
      b.agreeingLeaderCount - a.agreeingLeaderCount ||
      b.totalCurrentValue - a.totalCurrentValue,
  );
}

function passesEntryRule(candidate: Candidate, rule: EntryRule): boolean {
  if (rule === "none") return true;
  if (rule === "within-range") return candidate.withinEntryRange;
  return candidate.atOrBelowWeightedEntry;
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const top = readInteger(getOptionalArg(argv, "--top", "50"), "--top");
  const category = getOptionalArg(argv, "--category", "OVERALL").toUpperCase() as LeaderboardCategory;
  const timePeriod = getOptionalArg(argv, "--time-period", "WEEK").toUpperCase() as LeaderboardTimePeriod;
  const orderBy = getOptionalArg(argv, "--order-by", "PNL").toUpperCase() as LeaderboardOrderBy;
  const withinDays = readInteger(getOptionalArg(argv, "--within-days", "5"), "--within-days");
  const agreement = readNumber(getOptionalArg(argv, "--agreement", "0.8"), "--agreement");
  const minLeaders = readInteger(getOptionalArg(argv, "--min-leaders", "3"), "--min-leaders");
  const minPositionValue = readNumber(getOptionalArg(argv, "--min-position-value", "1000"), "--min-position-value");
  const entryRule = getOptionalArg(argv, "--entry-rule", "within-range") as EntryRule;
  const concurrency = readInteger(getOptionalArg(argv, "--concurrency", "4"), "--concurrency");
  const maxPagesPerTrader = readInteger(getOptionalArg(argv, "--max-pages-per-trader", "2"), "--max-pages-per-trader");
  const asOf = getOptionalArg(argv, "--as-of", todayDate());

  if (top < 1) throw new Error("--top must be 1 or greater.");
  if (!isCategory(category)) throw new Error(`Unsupported --category: ${category}`);
  if (!isTimePeriod(timePeriod)) throw new Error(`Unsupported --time-period: ${timePeriod}`);
  if (orderBy !== "PNL" && orderBy !== "VOL") throw new Error(`Unsupported --order-by: ${orderBy}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("--as-of must use YYYY-MM-DD.");
  if (withinDays < 0) throw new Error("--within-days must be zero or greater.");
  if (agreement <= 0 || agreement > 1) throw new Error("--agreement must be greater than 0 and no more than 1.");
  if (minLeaders < 1) throw new Error("--min-leaders must be 1 or greater.");
  if (minPositionValue < 0) throw new Error("--min-position-value must be zero or greater.");
  if (!["within-range", "at-or-below-weighted", "none"].includes(entryRule)) throw new Error(`Unsupported --entry-rule: ${entryRule}`);
  if (concurrency < 1 || concurrency > 10) throw new Error("--concurrency must be between 1 and 10.");
  if (maxPagesPerTrader < 1 || maxPagesPerTrader > 21) throw new Error("--max-pages-per-trader must be between 1 and 21.");

  return {
    top,
    category,
    timePeriod,
    orderBy,
    asOf,
    withinDays,
    agreement,
    minLeaders,
    minPositionValue,
    entryRule,
    concurrency,
    maxPagesPerTrader,
    json: getOptionalArg(argv, "--json"),
    csv: getOptionalArg(argv, "--csv"),
  };
}

function writeJson(path: string, payload: unknown): void {
  const outputPath = resolve(process.cwd(), path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeCsv(path: string, candidates: Candidate[]): void {
  const outputPath = resolve(process.cwd(), path);
  mkdirSync(dirname(outputPath), { recursive: true });
  const headers = [
    "title",
    "outcome",
    "endDate",
    "agreementPct",
    "agreeingLeaderCount",
    "marketLeaderCount",
    "totalCurrentValue",
    "currentPrice",
    "weightedAvgEntry",
    "minAvgEntry",
    "maxAvgEntry",
    "slug",
    "conditionId",
  ];
  const rows = candidates.map((candidate) => headers.map((header) => csvCell(String(candidate[header as keyof Candidate] ?? ""))).join(","));
  writeFileSync(outputPath, `${headers.join(",")}\n${rows.join("\n")}\n`);
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

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCategory(value: string): value is LeaderboardCategory {
  return ["OVERALL", "POLITICS", "SPORTS", "ESPORTS", "CRYPTO", "CULTURE", "MENTIONS", "WEATHER", "ECONOMICS", "TECH", "FINANCE"].includes(value);
}

function isTimePeriod(value: string): value is LeaderboardTimePeriod {
  return ["DAY", "WEEK", "MONTH", "ALL"].includes(value);
}

function todayDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function printHelp(): void {
  console.log(`Find near-term consensus positions among leaderboard traders.

Usage:
  npm run consensus:leaders -- [options]

Defaults scan top 50 OVERALL/WEEK/PNL traders for live positions expiring from today through five days out.

Options:
  --top <n>                    Leaderboard ranks 1..n to scan. Default: 50.
  --category <category>        OVERALL, POLITICS, SPORTS, ESPORTS, CRYPTO, CULTURE, MENTIONS, WEATHER, ECONOMICS, TECH, FINANCE. Default: OVERALL.
  --time-period <period>       DAY, WEEK, MONTH, ALL. Default: WEEK.
  --order-by <field>           PNL or VOL. Default: PNL.
  --as-of <YYYY-MM-DD>         Start date for expiry window. Default: today.
  --within-days <n>            Include markets ending within n days after --as-of. Default: 5.
  --agreement <decimal>        Required same-outcome agreement among leaders in the market. Default: 0.8.
  --min-leaders <n>            Minimum positioned leaders in a market. Default: 3.
  --min-position-value <usd>   Ignore individual positions below this current value. Default: 1000.
  --entry-rule <rule>          within-range, at-or-below-weighted, or none. Default: within-range.
  --max-pages-per-trader <n>   Pages of current-value-sorted positions to scan per trader. Default: 2.
  --json <path>                Write full consensus manifest.
  --csv <path>                 Write candidate summary CSV.
`);
}
