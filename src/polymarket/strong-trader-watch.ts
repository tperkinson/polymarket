import {
  fetchLeaderboardRange,
  fetchUserPositionsPage,
  type LeaderboardCategory,
  type LeaderboardOrderBy,
  type LeaderboardTimePeriod,
  type LeaderboardTrader,
  type Position,
} from "./data-api.js";
import {
  hasMatchingCachedTraderQualityRun,
  loadCachedTraderQualityBadges,
  type TraderQualityBadge,
} from "./trader-quality.js";

export type StrongTraderWatchOptions = {
  top: number;
  category: LeaderboardCategory;
  timePeriod: LeaderboardTimePeriod;
  orderBy: LeaderboardOrderBy;
  asOf: string;
  withinDays: number;
  qualityThreshold: number;
  minPositionValue: number;
  maxPagesPerTrader: number;
  concurrency: number;
  onlyWithOpposition: boolean;
};

export type StrongWatchLeader = {
  rank: number;
  userName: string;
  proxyWallet: string;
  qualityScore?: number;
  qualityLabel?: string;
  qualityRank?: number;
  qualityFetchedAt?: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  cashPnl: number;
};

export type StrongWatchCandidate = {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug?: string;
  endDate: string;
  outcome: string;
  marketLeaderCount: number;
  strongLeaderCount: number;
  alignedLeaderCount: number;
  opposedLeaderCount: number;
  opposedStrongLeaderCount: number;
  strongCurrentValue: number;
  alignedCurrentValue: number;
  opposedCurrentValue: number;
  currentPrice: number;
  weightedAvgEntry: number;
  minAvgEntry: number;
  maxAvgEntry: number;
  score: number;
  scoreComponents: StrongWatchScoreComponents;
  strongLeaders: StrongWatchLeader[];
  alignedLeaders: StrongWatchLeader[];
  opposedLeaders: StrongWatchOpposedLeader[];
};

export type StrongWatchOpposedLeader = StrongWatchLeader & {
  outcome: string;
};

export type StrongWatchScoreComponents = {
  quality: number;
  strongValue: number;
  strongBreadth: number;
  alignment: number;
  entry: number;
};

export type StrongTraderWatchResult = {
  schemaVersion: 1;
  fetchedAt: string;
  source: {
    leaderboard: string;
    positions: string;
    qualityCache: string;
  };
  query: StrongTraderWatchOptions & {
    through?: string;
  };
  scannedTraderCount: number;
  cachedQualityCount: number;
  strongTraderCount: number;
  candidateCount: number;
  traderIds: string[];
  strongTraderIds: string[];
  warnings: string[];
  candidates: StrongWatchCandidate[];
};

type PositionedLeader = StrongWatchLeader & {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug?: string;
  endDate: string;
  outcome: string;
};

type MarketGroup = {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug?: string;
  endDate: string;
  leaderWallets: Set<string>;
  outcomes: Map<string, PositionedLeader[]>;
};

export async function runStrongTraderWatch(options: StrongTraderWatchOptions): Promise<StrongTraderWatchResult> {
  validateStrongTraderWatchOptions(options);

  const warnings: string[] = [];
  const qualityScope = {
    top: options.top,
    category: options.category,
    timePeriod: options.timePeriod,
    orderBy: options.orderBy,
  };
  const hasMatchingQualityRun = hasMatchingCachedTraderQualityRun(qualityScope);
  const badges = loadCachedTraderQualityBadges(undefined, qualityScope);
  const { traders } = await fetchLeaderboardRange({
    fromRank: 1,
    toRank: options.top,
    category: options.category,
    timePeriod: options.timePeriod,
    orderBy: options.orderBy,
  });
  const traderByWallet = new Map(traders.map((trader) => [trader.proxyWallet.toLowerCase(), trader]));
  const strongTraderIds = traders
    .filter((trader) => (badges.get(trader.proxyWallet.toLowerCase())?.score ?? 0) >= options.qualityThreshold)
    .map((trader) => trader.proxyWallet);

  if (!hasMatchingQualityRun) {
    warnings.push("No matching Trader Quality run found for this exact Top/Category/Window/Rank-by cohort. Run the Trader Quality tab with the same settings first, then run Strong Trader Watch again.");
  } else if (badges.size === 0) {
    warnings.push("The matching Trader Quality run had no accepted scored traders. Loosen Trader Quality filters or refresh that tab first.");
  } else if (strongTraderIds.length === 0) {
    warnings.push(`No cached traders in this leaderboard cohort met Q${options.qualityThreshold} or higher. Lower the threshold or run Trader Quality for this cohort.`);
  }

  const marketGroups = await collectMarketGroups(traders, traderByWallet, badges, options, warnings);
  const candidates = buildCandidates(marketGroups, badges, options)
    .filter((candidate) => !options.onlyWithOpposition || candidate.opposedLeaderCount > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.strongCurrentValue - a.strongCurrentValue ||
        b.strongLeaderCount - a.strongLeaderCount ||
        b.alignedCurrentValue - a.alignedCurrentValue,
    );

  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    source: {
      leaderboard: "https://data-api.polymarket.com/v1/leaderboard",
      positions: "https://data-api.polymarket.com/positions",
      qualityCache: "data/cache/trader-quality.json",
    },
    query: {
      ...options,
      through: options.withinDays > 0 ? addDays(options.asOf, options.withinDays) : undefined,
    },
    scannedTraderCount: traders.length,
    cachedQualityCount: Array.from(traderByWallet.keys()).filter((wallet) => badges.has(wallet)).length,
    strongTraderCount: strongTraderIds.length,
    candidateCount: candidates.length,
    traderIds: traders.map((trader) => trader.proxyWallet),
    strongTraderIds,
    warnings,
    candidates,
  };
}

async function collectMarketGroups(
  traders: LeaderboardTrader[],
  traderByWallet: Map<string, LeaderboardTrader>,
  badges: Map<string, TraderQualityBadge>,
  options: StrongTraderWatchOptions,
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
        const leader = buildPositionedLeader(position, traderByWallet, badges);
        const existing = marketGroups.get(position.conditionId);
        const group = existing ?? {
          conditionId: position.conditionId,
          title: position.title,
          slug: position.slug,
          eventSlug: position.eventSlug,
          endDate: position.endDate ?? "",
          leaderWallets: new Set<string>(),
          outcomes: new Map<string, PositionedLeader[]>(),
        };

        group.leaderWallets.add(leader.proxyWallet);
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
  options: StrongTraderWatchOptions,
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
      warnings.push(`Truncated current positions for ${trader.userName} (${trader.proxyWallet}) at offset ${offset}: ${error instanceof Error ? error.message : String(error)}`);
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

function isRelevantPosition(position: Position, options: StrongTraderWatchOptions): boolean {
  if (position.redeemable) return false;
  if (numberValue(position.currentValue) < options.minPositionValue) return false;
  if (!position.endDate || position.endDate === "1970-01-01") return false;
  if (position.endDate < options.asOf) return false;
  if (options.withinDays <= 0) return true;
  return position.endDate <= addDays(options.asOf, options.withinDays);
}

function buildPositionedLeader(
  position: Position,
  traderByWallet: Map<string, LeaderboardTrader>,
  badges: Map<string, TraderQualityBadge>,
): PositionedLeader {
  const wallet = position.proxyWallet.toLowerCase();
  const trader = traderByWallet.get(wallet);
  const badge = badges.get(wallet);

  return {
    rank: Number(trader?.rank ?? 0),
    userName: trader?.userName || badge?.userName || position.proxyWallet,
    proxyWallet: position.proxyWallet,
    qualityScore: badge?.score,
    qualityLabel: badge?.scoreLabel,
    qualityRank: badge?.scoreRank,
    qualityFetchedAt: badge?.fetchedAt,
    size: numberValue(position.size),
    avgPrice: numberValue(position.avgPrice),
    curPrice: numberValue(position.curPrice),
    currentValue: numberValue(position.currentValue),
    cashPnl: numberValue(position.cashPnl),
    conditionId: position.conditionId,
    title: position.title,
    slug: position.slug,
    eventSlug: position.eventSlug,
    endDate: position.endDate ?? "",
    outcome: position.outcome,
  };
}

function buildCandidates(
  marketGroups: Map<string, MarketGroup>,
  badges: Map<string, TraderQualityBadge>,
  options: StrongTraderWatchOptions,
): StrongWatchCandidate[] {
  const candidates: StrongWatchCandidate[] = [];

  for (const group of marketGroups.values()) {
    for (const [outcome, leaders] of group.outcomes.entries()) {
      const strongLeaders = leaders
        .filter((leader) => (badges.get(leader.proxyWallet.toLowerCase())?.score ?? 0) >= options.qualityThreshold)
        .sort(sortLeaders);
      if (strongLeaders.length === 0) continue;

      const alignedLeaders = leaders
        .filter((leader) => !strongLeaders.some((strongLeader) => strongLeader.proxyWallet === leader.proxyWallet))
        .sort(sortLeaders);
      const opposedLeaders = Array.from(group.outcomes.entries())
        .filter(([otherOutcome]) => otherOutcome !== outcome)
        .flatMap(([otherOutcome, otherLeaders]) =>
          otherLeaders.map((leader) => ({
            ...leader,
            outcome: otherOutcome,
          })),
        )
        .sort(sortLeaders);

      const allAlignedLeaders = [...strongLeaders, ...alignedLeaders];
      const strongCurrentValue = strongLeaders.reduce((total, leader) => total + leader.currentValue, 0);
      const alignedCurrentValue = allAlignedLeaders.reduce((total, leader) => total + leader.currentValue, 0);
      const opposedCurrentValue = opposedLeaders.reduce((total, leader) => total + leader.currentValue, 0);
      const totalSize = allAlignedLeaders.reduce((total, leader) => total + leader.size, 0);
      const totalCurrentValue = allAlignedLeaders.reduce((total, leader) => total + leader.currentValue, 0);
      const currentPrice = allAlignedLeaders.reduce((total, leader) => total + leader.curPrice * leader.currentValue, 0) / (totalCurrentValue || 1);
      const weightedAvgEntry = allAlignedLeaders.reduce((total, leader) => total + leader.avgPrice * leader.size, 0) / (totalSize || 1);
      const avgEntries = allAlignedLeaders.map((leader) => leader.avgPrice).sort((a, b) => a - b);
      const scoreComponents = scoreCandidate({
        strongLeaders,
        strongCurrentValue,
        alignedCurrentValue,
        opposedCurrentValue,
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
        marketLeaderCount: group.leaderWallets.size,
        strongLeaderCount: strongLeaders.length,
        alignedLeaderCount: allAlignedLeaders.length,
        opposedLeaderCount: opposedLeaders.length,
        opposedStrongLeaderCount: opposedLeaders.filter((leader) => (leader.qualityScore ?? 0) >= options.qualityThreshold).length,
        strongCurrentValue: round2(strongCurrentValue),
        alignedCurrentValue: round2(alignedCurrentValue),
        opposedCurrentValue: round2(opposedCurrentValue),
        currentPrice: round4(currentPrice),
        weightedAvgEntry: round4(weightedAvgEntry),
        minAvgEntry: round4(avgEntries[0] ?? 0),
        maxAvgEntry: round4(avgEntries.at(-1) ?? 0),
        score: scoreComponents.score,
        scoreComponents: scoreComponents.components,
        strongLeaders: strongLeaders.map(formatLeader),
        alignedLeaders: alignedLeaders.map(formatLeader),
        opposedLeaders: opposedLeaders.map((leader) => ({
          ...formatLeader(leader),
          outcome: leader.outcome,
        })),
      });
    }
  }

  return candidates;
}

function scoreCandidate(input: {
  strongLeaders: StrongWatchLeader[];
  strongCurrentValue: number;
  alignedCurrentValue: number;
  opposedCurrentValue: number;
  currentPrice: number;
  weightedAvgEntry: number;
}): { score: number; components: StrongWatchScoreComponents } {
  const quality =
    input.strongLeaders.reduce((total, leader) => total + numberValue(leader.qualityScore), 0) /
    ((input.strongLeaders.length || 1) * 100);
  const strongValue = clamp(Math.log1p(input.strongCurrentValue) / Math.log1p(100_000), 0, 1);
  const strongBreadth = clamp(Math.log1p(input.strongLeaders.length) / Math.log1p(5), 0, 1);
  const alignment = input.alignedCurrentValue / (input.alignedCurrentValue + input.opposedCurrentValue || 1);
  const entryRatio = input.currentPrice > 0 ? input.weightedAvgEntry / input.currentPrice : 0;
  const entry = clamp(entryRatio, 0.5, 1.25) / 1.25;
  const score = 100 * (0.30 * quality + 0.25 * strongValue + 0.20 * alignment + 0.15 * strongBreadth + 0.10 * entry);

  return {
    score: round2(score),
    components: {
      quality: round4(quality),
      strongValue: round4(strongValue),
      strongBreadth: round4(strongBreadth),
      alignment: round4(alignment),
      entry: round4(entry),
    },
  };
}

function sortLeaders(a: StrongWatchLeader, b: StrongWatchLeader): number {
  return (
    numberValue(b.qualityScore) - numberValue(a.qualityScore) ||
    b.currentValue - a.currentValue ||
    a.rank - b.rank
  );
}

function formatLeader<T extends StrongWatchLeader>(leader: T): T {
  return {
    ...leader,
    size: round4(leader.size),
    avgPrice: round4(leader.avgPrice),
    curPrice: round4(leader.curPrice),
    currentValue: round2(leader.currentValue),
    cashPnl: round2(leader.cashPnl),
  };
}

export function validateStrongTraderWatchOptions(options: StrongTraderWatchOptions): void {
  if (options.top < 1) throw new Error("top must be 1 or greater.");
  if (!["OVERALL", "POLITICS", "SPORTS", "ESPORTS", "CRYPTO", "CULTURE", "MENTIONS", "WEATHER", "ECONOMICS", "TECH", "FINANCE"].includes(options.category)) throw new Error(`Unsupported category: ${options.category}`);
  if (!["DAY", "WEEK", "MONTH", "ALL"].includes(options.timePeriod)) throw new Error(`Unsupported timePeriod: ${options.timePeriod}`);
  if (!["PNL", "VOL"].includes(options.orderBy)) throw new Error(`Unsupported orderBy: ${options.orderBy}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.asOf)) throw new Error("asOf must use YYYY-MM-DD.");
  if (options.withinDays < 0) throw new Error("withinDays must be zero or greater.");
  if (options.qualityThreshold < 0 || options.qualityThreshold > 100) throw new Error("qualityThreshold must be between 0 and 100.");
  if (options.minPositionValue < 0) throw new Error("minPositionValue must be zero or greater.");
  if (options.maxPagesPerTrader < 1 || options.maxPagesPerTrader > 10) throw new Error("maxPagesPerTrader must be between 1 and 10.");
  if (options.concurrency < 1 || options.concurrency > 10) throw new Error("concurrency must be between 1 and 10.");
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
