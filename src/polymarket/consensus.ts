import {
  fetchLeaderboardRange,
  fetchUserPositionsPage,
  type LeaderboardCategory,
  type LeaderboardOrderBy,
  type LeaderboardTimePeriod,
  type LeaderboardTrader,
  type Position,
} from "./data-api.js";

export type EntryRule = "within-range" | "at-or-below-weighted" | "none";

export type ConsensusOptions = {
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
};

export type ConsensusLeader = {
  rank: number;
  userName: string;
  proxyWallet: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  cashPnl: number;
  qualityScore?: number;
  qualityLabel?: string;
  qualityRank?: number;
  qualityFetchedAt?: string;
};

export type ConsensusCandidate = {
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
  leaders: ConsensusLeader[];
  opposingSides: ConsensusOpposingSide[];
  opposingLeaderCount: number;
  opposingCurrentValue: number;
  score: number;
  scoreComponents: ConsensusScoreComponents;
};

export type ConsensusScoreComponents = {
  agreement: number;
  leaderBreadth: number;
  consensusValue: number;
  entry: number;
  opposition: number;
};

export type ConsensusOpposingSide = {
  outcome: string;
  leaderCount: number;
  totalCurrentValue: number;
  currentPrice: number;
  weightedAvgEntry: number;
  minAvgEntry: number;
  maxAvgEntry: number;
  leaders: ConsensusLeader[];
};

export type ConsensusResult = {
  schemaVersion: 1;
  fetchedAt: string;
  source: {
    leaderboard: string;
    positions: string;
  };
  query: ConsensusOptions & {
    through: string;
  };
  traderIds: string[];
  scannedTraderCount: number;
  agreementCandidateCount: number;
  acceptedCandidateCount: number;
  warnings: string[];
  candidates: ConsensusCandidate[];
  rejectedByEntryRule: number;
};

type MarketGroup = {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug?: string;
  endDate: string;
  leaderWallets: Set<string>;
  outcomes: Map<string, ConsensusLeader[]>;
};

export async function runLeaderConsensus(options: ConsensusOptions): Promise<ConsensusResult> {
  validateConsensusOptions(options);
  const warnings: string[] = [];
  const { traders } = await fetchLeaderboardRange({
    fromRank: 1,
    toRank: options.top,
    category: options.category,
    timePeriod: options.timePeriod,
    orderBy: options.orderBy,
  });

  const marketGroups = await collectMarketGroups(traders, options, warnings);
  const allCandidates = buildCandidates(marketGroups, options);
  const acceptedCandidates = allCandidates.filter((candidate) => passesEntryRule(candidate, options.entryRule));

  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    source: {
      leaderboard: "https://data-api.polymarket.com/v1/leaderboard",
      positions: "https://data-api.polymarket.com/positions",
    },
    query: {
      ...options,
      through: addDays(options.asOf, options.withinDays),
    },
    traderIds: traders.map((trader) => trader.proxyWallet),
    scannedTraderCount: traders.length,
    agreementCandidateCount: allCandidates.length,
    acceptedCandidateCount: acceptedCandidates.length,
    warnings,
    candidates: acceptedCandidates,
    rejectedByEntryRule: allCandidates.length - acceptedCandidates.length,
  };
}

async function collectMarketGroups(
  traders: LeaderboardTrader[],
  options: ConsensusOptions,
  warnings: string[],
): Promise<Map<string, MarketGroup>> {
  const marketGroups = new Map<string, MarketGroup>();
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < traders.length) {
      const trader = traders[nextIndex];
      nextIndex += 1;
      const positions = await fetchRelevantPositions(trader, options, warnings);

      for (const position of positions) {
        const existing = marketGroups.get(position.conditionId);
        const group = existing ?? {
          conditionId: position.conditionId,
          title: position.title,
          slug: position.slug,
          eventSlug: position.eventSlug,
          endDate: position.endDate ?? "",
          leaderWallets: new Set<string>(),
          outcomes: new Map<string, ConsensusLeader[]>(),
        };

        group.leaderWallets.add(trader.proxyWallet);
        const leader: ConsensusLeader = {
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
        marketGroups.set(position.conditionId, group);
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  return marketGroups;
}

async function fetchRelevantPositions(
  trader: LeaderboardTrader,
  options: ConsensusOptions,
  warnings: string[],
): Promise<Position[]> {
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

function isRelevantPosition(position: Position, options: ConsensusOptions): boolean {
  if (position.redeemable) return false;
  if (numberValue(position.currentValue) < options.minPositionValue) return false;
  if (!position.endDate || position.endDate === "1970-01-01") return false;

  const through = addDays(options.asOf, options.withinDays);
  return position.endDate >= options.asOf && position.endDate <= through;
}

function buildCandidates(marketGroups: Map<string, MarketGroup>, options: ConsensusOptions): ConsensusCandidate[] {
  const candidates: ConsensusCandidate[] = [];

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
      const opposingSides = Array.from(group.outcomes.entries())
        .filter(([otherOutcome]) => otherOutcome !== outcome)
        .map(([otherOutcome, otherLeaders]) => buildOpposingSide(otherOutcome, otherLeaders))
        .sort((a, b) => b.totalCurrentValue - a.totalCurrentValue);
      const opposingCurrentValue = round2(opposingSides.reduce((total, side) => total + side.totalCurrentValue, 0));
      const scoreComponents = scoreCandidate({
        agreementPct,
        agreeingLeaderCount: leaders.length,
        totalCurrentValue,
        opposingCurrentValue,
        currentPrice,
        weightedAvgEntry,
      });

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
        opposingSides,
        opposingLeaderCount: opposingSides.reduce((total, side) => total + side.leaderCount, 0),
        opposingCurrentValue,
        score: scoreComponents.score,
        scoreComponents: scoreComponents.components,
      });
    }
  }

  return candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.agreementPct - a.agreementPct ||
      b.agreeingLeaderCount - a.agreeingLeaderCount ||
      b.totalCurrentValue - a.totalCurrentValue,
  );
}

function scoreCandidate(input: {
  agreementPct: number;
  agreeingLeaderCount: number;
  totalCurrentValue: number;
  opposingCurrentValue: number;
  currentPrice: number;
  weightedAvgEntry: number;
}): { score: number; components: ConsensusScoreComponents } {
  const agreement = clamp(input.agreementPct, 0, 1);
  const leaderBreadth = clamp(Math.log1p(input.agreeingLeaderCount) / Math.log1p(10), 0, 1);
  const consensusValue = clamp(Math.log1p(input.totalCurrentValue) / Math.log1p(100_000), 0, 1);
  const entryRatio = input.currentPrice > 0 ? input.weightedAvgEntry / input.currentPrice : 0;
  const entry = clamp(entryRatio, 0.5, 1.25) / 1.25;
  const opposition = input.totalCurrentValue / (input.totalCurrentValue + input.opposingCurrentValue || 1);

  const score =
    100 *
    (0.30 * agreement +
      0.20 * leaderBreadth +
      0.20 * consensusValue +
      0.20 * entry +
      0.10 * opposition);

  return {
    score: round2(score),
    components: {
      agreement: round4(agreement),
      leaderBreadth: round4(leaderBreadth),
      consensusValue: round4(consensusValue),
      entry: round4(entry),
      opposition: round4(opposition),
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildOpposingSide(outcome: string, leaders: ConsensusLeader[]): ConsensusOpposingSide {
  const totalCurrentValue = leaders.reduce((total, leader) => total + leader.currentValue, 0);
  const totalSize = leaders.reduce((total, leader) => total + leader.size, 0);
  const weightedAvgEntry = leaders.reduce((total, leader) => total + leader.avgPrice * leader.size, 0) / (totalSize || 1);
  const currentPrice = leaders.reduce((total, leader) => total + leader.curPrice * leader.currentValue, 0) / (totalCurrentValue || 1);
  const avgPrices = leaders.map((leader) => leader.avgPrice).sort((a, b) => a - b);

  return {
    outcome,
    leaderCount: leaders.length,
    totalCurrentValue: round2(totalCurrentValue),
    currentPrice: round4(currentPrice),
    weightedAvgEntry: round4(weightedAvgEntry),
    minAvgEntry: round4(avgPrices[0] ?? 0),
    maxAvgEntry: round4(avgPrices.at(-1) ?? 0),
    leaders: leaders.sort((a, b) => a.rank - b.rank).map((leader) => ({
      ...leader,
      currentValue: round2(leader.currentValue),
      cashPnl: round2(leader.cashPnl),
      avgPrice: round4(leader.avgPrice),
      curPrice: round4(leader.curPrice),
    })),
  };
}

function passesEntryRule(candidate: ConsensusCandidate, rule: EntryRule): boolean {
  if (rule === "none") return true;
  if (rule === "within-range") return candidate.withinEntryRange;
  return candidate.atOrBelowWeightedEntry;
}

export function validateConsensusOptions(options: ConsensusOptions): void {
  if (options.top < 1) throw new Error("top must be 1 or greater.");
  if (!["OVERALL", "POLITICS", "SPORTS", "ESPORTS", "CRYPTO", "CULTURE", "MENTIONS", "WEATHER", "ECONOMICS", "TECH", "FINANCE"].includes(options.category)) throw new Error(`Unsupported category: ${options.category}`);
  if (!["DAY", "WEEK", "MONTH", "ALL"].includes(options.timePeriod)) throw new Error(`Unsupported timePeriod: ${options.timePeriod}`);
  if (!["PNL", "VOL"].includes(options.orderBy)) throw new Error(`Unsupported orderBy: ${options.orderBy}`);
  if (!["within-range", "at-or-below-weighted", "none"].includes(options.entryRule)) throw new Error(`Unsupported entryRule: ${options.entryRule}`);
  if (options.withinDays < 0) throw new Error("withinDays must be zero or greater.");
  if (options.agreement <= 0 || options.agreement > 1) throw new Error("agreement must be greater than 0 and no more than 1.");
  if (options.minLeaders < 1) throw new Error("minLeaders must be 1 or greater.");
  if (options.minPositionValue < 0) throw new Error("minPositionValue must be zero or greater.");
  if (options.concurrency < 1 || options.concurrency > 10) throw new Error("concurrency must be between 1 and 10.");
  if (options.maxPagesPerTrader < 1 || options.maxPagesPerTrader > 21) throw new Error("maxPagesPerTrader must be between 1 and 21.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.asOf)) throw new Error("asOf must use YYYY-MM-DD.");
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
