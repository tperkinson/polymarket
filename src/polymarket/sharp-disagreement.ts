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
  loadCachedTraderQualityProfiles,
  type CachedTraderQualityProfile,
  type TopicMetrics,
} from "./trader-quality.js";
import { inferMarketTopic, type MarketTopic } from "./topic-classifier.js";

export type SharpDisagreementOptions = {
  top: number;
  category: LeaderboardCategory;
  timePeriod: LeaderboardTimePeriod;
  orderBy: LeaderboardOrderBy;
  asOf: string;
  withinDays: number;
  strongQualityThreshold: number;
  weakQualityMax: number;
  minTopicScore: number;
  minPositionValue: number;
  maxPagesPerTrader: number;
  concurrency: number;
  requireWeakOpposition: boolean;
};

export type SharpDisagreementLeader = {
  rank: number;
  userName: string;
  proxyWallet: string;
  qualityScore?: number;
  qualityLabel?: string;
  qualityRank?: number;
  topic: MarketTopic;
  topicScore: number;
  topicEdgePct?: number;
  topicResolvedPositions: number;
  topicClosedMarkets: number;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  cashPnl: number;
};

export type SharpDisagreementOpposedLeader = SharpDisagreementLeader & {
  outcome: string;
  isWeak: boolean;
};

export type SharpDisagreementCandidate = {
  conditionId: string;
  title: string;
  slug: string;
  eventSlug?: string;
  endDate: string;
  topic: MarketTopic;
  outcome: string;
  marketLeaderCount: number;
  sharpLeaderCount: number;
  alignedLeaderCount: number;
  opposedLeaderCount: number;
  weakOpposedLeaderCount: number;
  sharpCurrentValue: number;
  alignedCurrentValue: number;
  opposedCurrentValue: number;
  weakOpposedCurrentValue: number;
  currentPrice: number;
  weightedAvgEntry: number;
  entryDiscountPct: number;
  score: number;
  scoreComponents: SharpDisagreementScoreComponents;
  sharpLeaders: SharpDisagreementLeader[];
  alignedLeaders: SharpDisagreementLeader[];
  opposedLeaders: SharpDisagreementOpposedLeader[];
};

export type SharpDisagreementScoreComponents = {
  quality: number;
  topicFit: number;
  disagreement: number;
  weakOpposition: number;
  entry: number;
  value: number;
};

export type SharpDisagreementResult = {
  schemaVersion: 1;
  fetchedAt: string;
  source: {
    leaderboard: string;
    positions: string;
    qualityCache: string;
  };
  query: SharpDisagreementOptions & {
    through?: string;
  };
  scannedTraderCount: number;
  cachedProfileCount: number;
  sharpTraderCount: number;
  candidateCount: number;
  traderIds: string[];
  warnings: string[];
  candidates: SharpDisagreementCandidate[];
};

type PositionedLeader = SharpDisagreementLeader & {
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
  topic: MarketTopic;
  leaderWallets: Set<string>;
  outcomes: Map<string, PositionedLeader[]>;
};

export async function runSharpDisagreement(options: SharpDisagreementOptions): Promise<SharpDisagreementResult> {
  validateSharpDisagreementOptions(options);

  const warnings: string[] = [];
  const profiles = loadCachedTraderQualityProfiles();
  const { traders } = await fetchLeaderboardRange({
    fromRank: 1,
    toRank: options.top,
    category: options.category,
    timePeriod: options.timePeriod,
    orderBy: options.orderBy,
  });
  const traderByWallet = new Map(traders.map((trader) => [trader.proxyWallet.toLowerCase(), trader]));

  if (profiles.size === 0) {
    warnings.push("No cached trader-quality profiles found. Run the Trader Quality tab with refresh first, then run Sharp Disagreement.");
  }

  const marketGroups = await collectMarketGroups(traders, traderByWallet, profiles, options, warnings);
  const candidates = buildCandidates(marketGroups, options)
    .filter((candidate) => !options.requireWeakOpposition || candidate.weakOpposedLeaderCount > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.weakOpposedCurrentValue - a.weakOpposedCurrentValue ||
        b.sharpCurrentValue - a.sharpCurrentValue ||
        b.sharpLeaderCount - a.sharpLeaderCount,
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
    cachedProfileCount: traders.filter((trader) => profiles.has(trader.proxyWallet.toLowerCase())).length,
    sharpTraderCount: countSharpTraders(traders, profiles, options),
    candidateCount: candidates.length,
    traderIds: traders.map((trader) => trader.proxyWallet),
    warnings,
    candidates,
  };
}

async function collectMarketGroups(
  traders: LeaderboardTrader[],
  traderByWallet: Map<string, LeaderboardTrader>,
  profiles: Map<string, CachedTraderQualityProfile>,
  options: SharpDisagreementOptions,
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
        const leader = buildPositionedLeader(position, traderByWallet, profiles);
        const existing = marketGroups.get(position.conditionId);
        const group = existing ?? {
          conditionId: position.conditionId,
          title: position.title,
          slug: position.slug,
          eventSlug: position.eventSlug,
          endDate: position.endDate ?? "",
          topic: leader.topic,
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
  options: SharpDisagreementOptions,
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

function isRelevantPosition(position: Position, options: SharpDisagreementOptions): boolean {
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
  profiles: Map<string, CachedTraderQualityProfile>,
): PositionedLeader {
  const wallet = position.proxyWallet.toLowerCase();
  const trader = traderByWallet.get(wallet);
  const profile = profiles.get(wallet);
  const topic = inferMarketTopic(position);
  const topicMetrics = profile?.metrics.topicMetrics.find((metrics) => metrics.topic === topic);
  const topicScore = scoreTopicFit(topicMetrics);

  return {
    rank: Number(trader?.rank ?? 0),
    userName: trader?.userName || profile?.userName || position.proxyWallet,
    proxyWallet: position.proxyWallet,
    qualityScore: profile?.score,
    qualityLabel: profile?.scoreLabel,
    qualityRank: profile?.scoreRank,
    topic,
    topicScore,
    topicEdgePct: topicMetrics?.odds.oddsEdgePct,
    topicResolvedPositions: topicMetrics?.odds.resolvedPositionCount ?? 0,
    topicClosedMarkets: topicMetrics?.closedMarketCount ?? 0,
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
  options: SharpDisagreementOptions,
): SharpDisagreementCandidate[] {
  const candidates: SharpDisagreementCandidate[] = [];

  for (const group of marketGroups.values()) {
    for (const [outcome, leaders] of group.outcomes.entries()) {
      const sharpLeaders = leaders
        .filter((leader) => isSharpLeader(leader, options))
        .sort(sortLeaders);
      if (sharpLeaders.length === 0) continue;

      const opposedLeaders = Array.from(group.outcomes.entries())
        .filter(([otherOutcome]) => otherOutcome !== outcome)
        .flatMap(([otherOutcome, otherLeaders]) =>
          otherLeaders.map((leader) => ({
            ...leader,
            outcome: otherOutcome,
            isWeak: isWeakLeader(leader, options),
          })),
        )
        .sort(sortOpposedLeaders);

      const alignedLeaders = leaders
        .filter((leader) => !sharpLeaders.some((sharpLeader) => sharpLeader.proxyWallet === leader.proxyWallet))
        .sort(sortLeaders);
      const allAligned = [...sharpLeaders, ...alignedLeaders];
      const weakOpposedLeaders = opposedLeaders.filter((leader) => leader.isWeak);
      const sharpCurrentValue = sharpLeaders.reduce((total, leader) => total + leader.currentValue, 0);
      const alignedCurrentValue = allAligned.reduce((total, leader) => total + leader.currentValue, 0);
      const opposedCurrentValue = opposedLeaders.reduce((total, leader) => total + leader.currentValue, 0);
      const weakOpposedCurrentValue = weakOpposedLeaders.reduce((total, leader) => total + leader.currentValue, 0);
      const totalSize = allAligned.reduce((total, leader) => total + leader.size, 0);
      const totalCurrentValue = allAligned.reduce((total, leader) => total + leader.currentValue, 0);
      const currentPrice = allAligned.reduce((total, leader) => total + leader.curPrice * leader.currentValue, 0) / (totalCurrentValue || 1);
      const weightedAvgEntry = allAligned.reduce((total, leader) => total + leader.avgPrice * leader.size, 0) / (totalSize || 1);
      const scoreComponents = scoreCandidate({
        sharpLeaders,
        sharpCurrentValue,
        alignedCurrentValue,
        opposedCurrentValue,
        weakOpposedCurrentValue,
        currentPrice,
        weightedAvgEntry,
      });

      candidates.push({
        conditionId: group.conditionId,
        title: group.title,
        slug: group.slug,
        eventSlug: group.eventSlug,
        endDate: group.endDate,
        topic: group.topic,
        outcome,
        marketLeaderCount: group.leaderWallets.size,
        sharpLeaderCount: sharpLeaders.length,
        alignedLeaderCount: allAligned.length,
        opposedLeaderCount: opposedLeaders.length,
        weakOpposedLeaderCount: weakOpposedLeaders.length,
        sharpCurrentValue: round2(sharpCurrentValue),
        alignedCurrentValue: round2(alignedCurrentValue),
        opposedCurrentValue: round2(opposedCurrentValue),
        weakOpposedCurrentValue: round2(weakOpposedCurrentValue),
        currentPrice: round4(currentPrice),
        weightedAvgEntry: round4(weightedAvgEntry),
        entryDiscountPct: round2(currentPrice > 0 ? ((weightedAvgEntry - currentPrice) / currentPrice) * 100 : 0),
        score: scoreComponents.score,
        scoreComponents: scoreComponents.components,
        sharpLeaders: sharpLeaders.map(formatLeader),
        alignedLeaders: alignedLeaders.map(formatLeader),
        opposedLeaders: opposedLeaders.map((leader) => ({
          ...formatLeader(leader),
          outcome: leader.outcome,
          isWeak: leader.isWeak,
        })),
      });
    }
  }

  return candidates;
}

function scoreCandidate(input: {
  sharpLeaders: SharpDisagreementLeader[];
  sharpCurrentValue: number;
  alignedCurrentValue: number;
  opposedCurrentValue: number;
  weakOpposedCurrentValue: number;
  currentPrice: number;
  weightedAvgEntry: number;
}): { score: number; components: SharpDisagreementScoreComponents } {
  const quality =
    input.sharpLeaders.reduce((total, leader) => total + numberValue(leader.qualityScore), 0) /
    ((input.sharpLeaders.length || 1) * 100);
  const topicFit = input.sharpLeaders.reduce((total, leader) => total + leader.topicScore, 0) / (input.sharpLeaders.length || 1);
  const disagreement = input.opposedCurrentValue / (input.alignedCurrentValue + input.opposedCurrentValue || 1);
  const weakOpposition = input.weakOpposedCurrentValue / (input.alignedCurrentValue + input.weakOpposedCurrentValue || 1);
  const entryRatio = input.currentPrice > 0 ? input.weightedAvgEntry / input.currentPrice : 0;
  const entry = clamp(entryRatio, 0.5, 1.35) / 1.35;
  const value = clamp(Math.log1p(input.sharpCurrentValue) / Math.log1p(100_000), 0, 1);
  const score = 100 * (0.22 * quality + 0.22 * topicFit + 0.20 * weakOpposition + 0.14 * disagreement + 0.12 * entry + 0.10 * value);

  return {
    score: round2(score),
    components: {
      quality: round4(quality),
      topicFit: round4(topicFit),
      disagreement: round4(disagreement),
      weakOpposition: round4(weakOpposition),
      entry: round4(entry),
      value: round4(value),
    },
  };
}

function scoreTopicFit(metrics?: TopicMetrics): number {
  if (!metrics) return 0.25;
  const sample = clamp(metrics.odds.resolvedPositionCount / 20, 0, 1);
  const edge = clamp((metrics.odds.oddsEdgePct + 8) / 24, 0, 1);
  const profit = metrics.closedMarketProfitRate;
  const depth = clamp(Math.log1p(metrics.uniqueMarketCount) / Math.log1p(40), 0, 1);
  return round4(sample * (0.55 * edge + 0.25 * profit + 0.20 * depth) + (1 - sample) * (0.25 + 0.25 * depth));
}

function countSharpTraders(
  traders: LeaderboardTrader[],
  profiles: Map<string, CachedTraderQualityProfile>,
  options: SharpDisagreementOptions,
): number {
  return traders.filter((trader) => {
    const profile = profiles.get(trader.proxyWallet.toLowerCase());
    if (!profile || profile.score < options.strongQualityThreshold) return false;
    return profile.metrics.topicMetrics.some((metrics) => scoreTopicFit(metrics) >= options.minTopicScore / 100);
  }).length;
}

function isSharpLeader(leader: SharpDisagreementLeader, options: SharpDisagreementOptions): boolean {
  return numberValue(leader.qualityScore) >= options.strongQualityThreshold && leader.topicScore >= options.minTopicScore / 100;
}

function isWeakLeader(leader: SharpDisagreementLeader, options: SharpDisagreementOptions): boolean {
  return !Number.isFinite(Number(leader.qualityScore)) || numberValue(leader.qualityScore) <= options.weakQualityMax;
}

function sortLeaders(a: SharpDisagreementLeader, b: SharpDisagreementLeader): number {
  return (
    numberValue(b.qualityScore) - numberValue(a.qualityScore) ||
    b.topicScore - a.topicScore ||
    b.currentValue - a.currentValue ||
    a.rank - b.rank
  );
}

function sortOpposedLeaders(a: SharpDisagreementOpposedLeader, b: SharpDisagreementOpposedLeader): number {
  return Number(b.isWeak) - Number(a.isWeak) || b.currentValue - a.currentValue || sortLeaders(a, b);
}

function formatLeader<T extends SharpDisagreementLeader>(leader: T): T {
  return {
    ...leader,
    topicScore: round4(leader.topicScore),
    topicEdgePct: leader.topicEdgePct === undefined ? undefined : round2(leader.topicEdgePct),
    size: round4(leader.size),
    avgPrice: round4(leader.avgPrice),
    curPrice: round4(leader.curPrice),
    currentValue: round2(leader.currentValue),
    cashPnl: round2(leader.cashPnl),
  };
}

export function validateSharpDisagreementOptions(options: SharpDisagreementOptions): void {
  if (options.top < 1) throw new Error("top must be 1 or greater.");
  if (!["OVERALL", "POLITICS", "SPORTS", "ESPORTS", "CRYPTO", "CULTURE", "MENTIONS", "WEATHER", "ECONOMICS", "TECH", "FINANCE"].includes(options.category)) throw new Error(`Unsupported category: ${options.category}`);
  if (!["DAY", "WEEK", "MONTH", "ALL"].includes(options.timePeriod)) throw new Error(`Unsupported timePeriod: ${options.timePeriod}`);
  if (!["PNL", "VOL"].includes(options.orderBy)) throw new Error(`Unsupported orderBy: ${options.orderBy}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.asOf)) throw new Error("asOf must use YYYY-MM-DD.");
  if (options.withinDays < 0) throw new Error("withinDays must be zero or greater.");
  if (options.strongQualityThreshold < 0 || options.strongQualityThreshold > 100) throw new Error("strongQualityThreshold must be between 0 and 100.");
  if (options.weakQualityMax < 0 || options.weakQualityMax > 100) throw new Error("weakQualityMax must be between 0 and 100.");
  if (options.minTopicScore < 0 || options.minTopicScore > 100) throw new Error("minTopicScore must be between 0 and 100.");
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
