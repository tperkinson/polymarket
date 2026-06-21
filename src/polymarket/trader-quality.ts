import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  fetchLeaderboardRange,
  fetchUserClosedPositionsPage,
  fetchUserPositionsPage,
  fetchUserTradesPage,
  type ClosedPosition,
  type LeaderboardCategory,
  type LeaderboardOrderBy,
  type LeaderboardTimePeriod,
  type LeaderboardTrader,
  type Position,
  type Trade,
} from "./data-api.js";
import { inferMarketTopic, type MarketTopic } from "./topic-classifier.js";

export type TraderQualityOptions = {
  top: number;
  category: LeaderboardCategory;
  timePeriod: LeaderboardTimePeriod;
  orderBy: LeaderboardOrderBy;
  minVolume: number;
  minRoiPct: number;
  minTrades: number;
  minMarkets: number;
  minClosedMarkets: number;
  tradePagesPerTrader: number;
  closedPositionPagesPerTrader: number;
  positionPagesPerTrader: number;
  concurrency: number;
  cacheTtlHours: number;
  refreshCache: boolean;
  cachePath?: string;
};

export type TraderHistoryMetrics = {
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  uniqueMarketCount: number;
  grossTradeValue: number;
  firstTradeAt?: string;
  lastTradeAt?: string;
  closedPositionCount: number;
  closedMarketCount: number;
  profitableClosedMarketCount: number;
  closedMarketProfitRate: number;
  heldToResolutionMarketCount: number;
  heldToResolutionPct: number;
  soldBeforeResolutionMarketCount: number;
  soldBeforeResolutionPct: number;
  hedgedMarketCount: number;
  hedgedMarketPct: number;
  currentPositionCount: number;
  currentMarketCount: number;
  currentValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  odds: OddsAdjustedMetrics;
  topicMetrics: TopicMetrics[];
};

export type TopicMetrics = {
  topic: MarketTopic;
  tradeCount: number;
  uniqueMarketCount: number;
  closedPositionCount: number;
  closedMarketCount: number;
  profitableClosedMarketCount: number;
  closedMarketProfitRate: number;
  currentPositionCount: number;
  currentMarketCount: number;
  currentValue: number;
  realizedPnl: number;
  odds: OddsAdjustedMetrics;
};

export type OddsAdjustedMetrics = {
  resolvedPositionCount: number;
  resolvedMarketCount: number;
  stakeValue: number;
  avgEntryOddsPct: number;
  expectedWinPct: number;
  actualWinPct: number;
  oddsEdgePct: number;
  edgeZScore: number;
  roiPct: number;
  contrarianStakePct: number;
  contrarianEdgePct?: number;
  favoriteStakePct: number;
  favoriteEdgePct?: number;
  style: TraderBettingStyle;
  buckets: OddsBucketMetrics[];
};

export type OddsBucketMetrics = {
  label: string;
  positionCount: number;
  stakeValue: number;
  avgEntryOddsPct: number;
  expectedWinPct: number;
  actualWinPct: number;
  oddsEdgePct: number;
  edgeZScore: number;
  roiPct: number;
};

export type TraderBettingStyle =
  | "Thin Sample"
  | "Sharp Contrarian"
  | "Contrarian"
  | "Sharp Favorite"
  | "Favorite Grinder"
  | "Positive Edge"
  | "Negative Edge"
  | "Mixed";

export type TraderQualityScoreComponents = {
  roi: number;
  pnl: number;
  volume: number;
  historyDepth: number;
  marketDiversity: number;
  closedProfit: number;
  oddsEdge: number;
  recency: number;
};

export type TraderQualityRow = {
  rank: number;
  scoreRank: number;
  userName: string;
  proxyWallet: string;
  pnl: number;
  vol: number;
  roiPct: number;
  score: number;
  scoreLabel: string;
  scoreComponents: TraderQualityScoreComponents;
  metrics: TraderHistoryMetrics;
  cache: {
    hit: boolean;
    historyFetchedAt: string;
  };
};

export type TraderQualityBadge = {
  proxyWallet: string;
  userName: string;
  score: number;
  scoreLabel: string;
  scoreRank?: number;
  fetchedAt: string;
};

export type CachedTraderQualityProfile = TraderQualityBadge & {
  metrics: TraderHistoryMetrics;
};

export type TraderQualityCacheScope = {
  top: number;
  category: LeaderboardCategory;
  timePeriod: LeaderboardTimePeriod;
  orderBy: LeaderboardOrderBy;
};

export type TraderQualityResult = {
  schemaVersion: 1;
  fetchedAt: string;
  source: {
    leaderboard: string;
    trades: string;
    closedPositions: string;
    positions: string;
  };
  query: TraderQualityOptions;
  scannedTraderCount: number;
  acceptedTraderCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  traderIds: string[];
  warnings: string[];
  traders: TraderQualityRow[];
};

type CachedTraderHistory = {
  proxyWallet: string;
  userName: string;
  fetchedAt: string;
  tradePages: number;
  closedPositionPages: number;
  positionPages: number;
  metrics: TraderHistoryMetrics;
  lastScore?: number;
  lastScoreLabel?: string;
  lastScoreRank?: number;
  lastQualityFetchedAt?: string;
};

type CachedTraderQualityRun = TraderQualityCacheScope & {
  fetchedAt: string;
  acceptedTraderIds: string[];
};

type TraderQualityCacheFile = {
  schemaVersion: 1;
  updatedAt: string;
  latestQualityRun?: CachedTraderQualityRun;
  traders: Record<string, CachedTraderHistory>;
};

type TraderHistoryFetch = {
  metrics: TraderHistoryMetrics;
  fetchedAt: string;
  cacheHit: boolean;
};

type MarketPositionGroup<T extends { conditionId: string }> = {
  conditionId: string;
  rows: T[];
};

type ResolvedPositionOutcome = {
  conditionId: string;
  entryProbability: number;
  actualOutcome: number;
  shareCount: number;
  stakeValue: number;
  realizedPnl: number;
};

type OddsBucketDefinition = {
  label: string;
  min: number;
  max: number;
};

export const DEFAULT_TRADER_QUALITY_CACHE_PATH = "data/cache/trader-quality.json";

const TRADE_PAGE_SIZE = 500;
const CLOSED_POSITION_PAGE_SIZE = 50;
const POSITION_PAGE_SIZE = 500;
const TRADE_MAX_OFFSET = 1_000;
const EPSILON = 0.000001;
const ODDS_BUCKETS: OddsBucketDefinition[] = [
  { label: "0-10%", min: 0, max: 0.10 },
  { label: "10-25%", min: 0.10, max: 0.25 },
  { label: "25-40%", min: 0.25, max: 0.40 },
  { label: "40-60%", min: 0.40, max: 0.60 },
  { label: "60-75%", min: 0.60, max: 0.75 },
  { label: "75-90%", min: 0.75, max: 0.90 },
  { label: "90-100%", min: 0.90, max: 1.000001 },
];

export async function runTraderQuality(options: TraderQualityOptions): Promise<TraderQualityResult> {
  validateTraderQualityOptions(options);

  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  const cachePath = resolve(process.cwd(), options.cachePath || DEFAULT_TRADER_QUALITY_CACHE_PATH);
  const cache = readCache(cachePath);
  const { traders } = await fetchLeaderboardRange({
    fromRank: 1,
    toRank: options.top,
    category: options.category,
    timePeriod: options.timePeriod,
    orderBy: options.orderBy,
  });

  const rows: TraderQualityRow[] = [];
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let cacheChanged = false;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < traders.length) {
      const trader = traders[nextIndex];
      nextIndex += 1;
      const history = await getTraderHistory(trader, options, cache, warnings);
      if (history.cacheHit) cacheHitCount += 1;
      else {
        cacheMissCount += 1;
        cacheChanged = true;
      }
      rows.push(buildTraderQualityRow(trader, history));
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));

  const filteredRows = rows
    .filter((row) => row.vol >= options.minVolume)
    .filter((row) => row.roiPct >= options.minRoiPct)
    .filter((row) => row.metrics.tradeCount >= options.minTrades)
    .filter((row) => row.metrics.uniqueMarketCount >= options.minMarkets)
    .filter((row) => row.metrics.closedMarketCount >= options.minClosedMarkets)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.roiPct - a.roiPct ||
        b.pnl - a.pnl ||
        b.metrics.tradeCount - a.metrics.tradeCount,
    )
    .map((row, index) => ({ ...row, scoreRank: index + 1 }));

  for (const row of filteredRows) {
    const key = row.proxyWallet.toLowerCase();
    const entry = cache.traders[key];
    if (!entry) continue;
    entry.lastScore = row.score;
    entry.lastScoreLabel = row.scoreLabel;
    entry.lastScoreRank = row.scoreRank;
    entry.lastQualityFetchedAt = fetchedAt;
    cacheChanged = true;
  }
  cache.latestQualityRun = {
    top: options.top,
    category: options.category,
    timePeriod: options.timePeriod,
    orderBy: options.orderBy,
    fetchedAt,
    acceptedTraderIds: filteredRows.map((row) => row.proxyWallet.toLowerCase()),
  };
  cacheChanged = true;

  if (cacheChanged) writeCache(cachePath, cache);

  return {
    schemaVersion: 1,
    fetchedAt,
    source: {
      leaderboard: "https://data-api.polymarket.com/v1/leaderboard",
      trades: "https://data-api.polymarket.com/trades",
      closedPositions: "https://data-api.polymarket.com/closed-positions",
      positions: "https://data-api.polymarket.com/positions",
    },
    query: { ...options, cachePath },
    scannedTraderCount: traders.length,
    acceptedTraderCount: filteredRows.length,
    cacheHitCount,
    cacheMissCount,
    traderIds: traders.map((trader) => trader.proxyWallet),
    warnings,
    traders: filteredRows,
  };
}

export function loadCachedTraderQualityBadges(
  cachePath = DEFAULT_TRADER_QUALITY_CACHE_PATH,
  scope?: TraderQualityCacheScope,
): Map<string, TraderQualityBadge> {
  const cache = readCache(resolve(process.cwd(), cachePath));
  const badges = new Map<string, TraderQualityBadge>();
  const acceptedIds = matchingAcceptedTraderIds(cache, scope);

  for (const entry of Object.values(cache.traders)) {
    if (typeof entry.lastScore !== "number" || !entry.lastScoreLabel || !entry.lastQualityFetchedAt) continue;
    if (acceptedIds && !acceptedIds.has(entry.proxyWallet.toLowerCase())) continue;
    badges.set(entry.proxyWallet.toLowerCase(), {
      proxyWallet: entry.proxyWallet,
      userName: entry.userName,
      score: entry.lastScore,
      scoreLabel: entry.lastScoreLabel,
      scoreRank: entry.lastScoreRank,
      fetchedAt: entry.lastQualityFetchedAt,
    });
  }

  return badges;
}

export function hasMatchingCachedTraderQualityRun(
  scope: TraderQualityCacheScope,
  cachePath = DEFAULT_TRADER_QUALITY_CACHE_PATH,
): boolean {
  const cache = readCache(resolve(process.cwd(), cachePath));
  return cacheScopeMatches(cache.latestQualityRun, scope);
}

export function loadCachedTraderQualityProfiles(cachePath = DEFAULT_TRADER_QUALITY_CACHE_PATH): Map<string, CachedTraderQualityProfile> {
  const cache = readCache(resolve(process.cwd(), cachePath));
  const profiles = new Map<string, CachedTraderQualityProfile>();

  for (const entry of Object.values(cache.traders)) {
    if (typeof entry.lastScore !== "number" || !entry.lastScoreLabel || !entry.lastQualityFetchedAt) continue;
    if (!entry.metrics.topicMetrics) continue;
    profiles.set(entry.proxyWallet.toLowerCase(), {
      proxyWallet: entry.proxyWallet,
      userName: entry.userName,
      score: entry.lastScore,
      scoreLabel: entry.lastScoreLabel,
      scoreRank: entry.lastScoreRank,
      fetchedAt: entry.lastQualityFetchedAt,
      metrics: entry.metrics,
    });
  }

  return profiles;
}

function buildTraderQualityRow(trader: LeaderboardTrader, history: TraderHistoryFetch): TraderQualityRow {
  const pnl = numberValue(trader.pnl);
  const vol = numberValue(trader.vol);
  const roiPct = vol > 0 ? (pnl / vol) * 100 : 0;
  const scoreComponents = scoreComponentsFor({ pnl, vol, roiPct, metrics: history.metrics });
  const score = round2(
    100 *
      (0.22 * scoreComponents.roi +
        0.15 * scoreComponents.pnl +
        0.10 * scoreComponents.volume +
        0.15 * scoreComponents.historyDepth +
        0.10 * scoreComponents.marketDiversity +
        0.08 * scoreComponents.closedProfit +
        0.15 * scoreComponents.oddsEdge +
        0.05 * scoreComponents.recency),
  );

  return {
    rank: Number(trader.rank),
    scoreRank: 0,
    userName: trader.userName,
    proxyWallet: trader.proxyWallet,
    pnl: round2(pnl),
    vol: round2(vol),
    roiPct: round2(roiPct),
    score,
    scoreLabel: labelScore(score),
    scoreComponents,
    metrics: history.metrics,
    cache: {
      hit: history.cacheHit,
      historyFetchedAt: history.fetchedAt,
    },
  };
}

async function getTraderHistory(
  trader: LeaderboardTrader,
  options: TraderQualityOptions,
  cache: TraderQualityCacheFile,
  warnings: string[],
): Promise<TraderHistoryFetch> {
  const key = trader.proxyWallet.toLowerCase();
  const cached = cache.traders[key];

  if (!options.refreshCache && cached && cacheEntrySatisfies(cached, options)) {
    return {
      metrics: cached.metrics,
      fetchedAt: cached.fetchedAt,
      cacheHit: true,
    };
  }

  const trades = await fetchTradesForTrader(trader, options, warnings);
  const closedPositions = await fetchClosedPositionsForTrader(trader, options, warnings);
  const currentPositions = await fetchCurrentPositionsForTrader(trader, options, warnings);
  const fetchedAt = new Date().toISOString();
  const metrics = computeHistoryMetrics(trades, closedPositions, currentPositions);

  cache.traders[key] = {
    proxyWallet: trader.proxyWallet,
    userName: trader.userName,
    fetchedAt,
    tradePages: options.tradePagesPerTrader,
    closedPositionPages: options.closedPositionPagesPerTrader,
    positionPages: options.positionPagesPerTrader,
    metrics,
    lastScore: cached?.lastScore,
    lastScoreLabel: cached?.lastScoreLabel,
    lastScoreRank: cached?.lastScoreRank,
    lastQualityFetchedAt: cached?.lastQualityFetchedAt,
  };

  return {
    metrics,
    fetchedAt,
    cacheHit: false,
  };
}

async function fetchTradesForTrader(
  trader: LeaderboardTrader,
  options: TraderQualityOptions,
  warnings: string[],
): Promise<Trade[]> {
  const trades: Trade[] = [];

  for (let pageIndex = 0; pageIndex < options.tradePagesPerTrader; pageIndex += 1) {
    const offset = pageIndex * TRADE_PAGE_SIZE;
    if (offset > TRADE_MAX_OFFSET) {
      warnings.push(`Stopped trade history for ${trader.userName} at offset ${offset}; /trades is capped conservatively at offset ${TRADE_MAX_OFFSET}.`);
      break;
    }

    try {
      const page = await fetchUserTradesPage({
        user: trader.proxyWallet,
        limit: TRADE_PAGE_SIZE,
        offset,
        takerOnly: false,
      });
      trades.push(...page);
      if (page.length < TRADE_PAGE_SIZE) break;
    } catch (error) {
      warnings.push(`Truncated trades for ${trader.userName} (${trader.proxyWallet}) at offset ${offset}: ${formatError(error)}`);
      break;
    }
  }

  return trades;
}

async function fetchClosedPositionsForTrader(
  trader: LeaderboardTrader,
  options: TraderQualityOptions,
  warnings: string[],
): Promise<ClosedPosition[]> {
  const positions: ClosedPosition[] = [];

  for (let pageIndex = 0; pageIndex < options.closedPositionPagesPerTrader; pageIndex += 1) {
    const offset = pageIndex * CLOSED_POSITION_PAGE_SIZE;
    try {
      const page = await fetchUserClosedPositionsPage({
        user: trader.proxyWallet,
        limit: CLOSED_POSITION_PAGE_SIZE,
        offset,
        sortBy: "TIMESTAMP",
        sortDirection: "DESC",
      });
      positions.push(...page);
      if (page.length < CLOSED_POSITION_PAGE_SIZE) break;
    } catch (error) {
      warnings.push(`Truncated closed positions for ${trader.userName} (${trader.proxyWallet}) at offset ${offset}: ${formatError(error)}`);
      break;
    }
  }

  return positions;
}

async function fetchCurrentPositionsForTrader(
  trader: LeaderboardTrader,
  options: TraderQualityOptions,
  warnings: string[],
): Promise<Position[]> {
  const positions: Position[] = [];

  for (let pageIndex = 0; pageIndex < options.positionPagesPerTrader; pageIndex += 1) {
    const offset = pageIndex * POSITION_PAGE_SIZE;
    try {
      const page = await fetchUserPositionsPage({
        user: trader.proxyWallet,
        limit: POSITION_PAGE_SIZE,
        offset,
        sortBy: "CURRENT",
        sortDirection: "DESC",
        sizeThreshold: 0,
      });
      positions.push(...page);
      if (page.length < POSITION_PAGE_SIZE) break;
    } catch (error) {
      warnings.push(`Truncated current positions for ${trader.userName} (${trader.proxyWallet}) at offset ${offset}: ${formatError(error)}`);
      break;
    }
  }

  return positions;
}

function computeHistoryMetrics(
  trades: Trade[],
  closedPositions: ClosedPosition[],
  currentPositions: Position[],
): TraderHistoryMetrics {
  const tradeMarkets = new Set<string>();
  const allMarkets = new Set<string>();
  let buyCount = 0;
  let sellCount = 0;
  let grossTradeValue = 0;
  let firstTimestamp = Number.POSITIVE_INFINITY;
  let lastTimestamp = 0;

  for (const trade of trades) {
    tradeMarkets.add(trade.conditionId);
    allMarkets.add(trade.conditionId);
    if (trade.side === "BUY") buyCount += 1;
    if (trade.side === "SELL") sellCount += 1;
    grossTradeValue += numberValue(trade.size) * numberValue(trade.price);
    firstTimestamp = Math.min(firstTimestamp, numberValue(trade.timestamp));
    lastTimestamp = Math.max(lastTimestamp, numberValue(trade.timestamp));
  }

  for (const position of closedPositions) allMarkets.add(position.conditionId);
  for (const position of currentPositions) allMarkets.add(position.conditionId);

  const closedGroups = groupByCondition(closedPositions);
  const closedMarketCount = closedGroups.length;
  let profitableClosedMarketCount = 0;
  let heldToResolutionMarketCount = 0;
  let soldBeforeResolutionMarketCount = 0;
  let realizedPnl = 0;
  const hedgedMarkets = new Set<string>();

  for (const group of closedGroups) {
    const marketPnl = group.rows.reduce((total, row) => total + numberValue(row.realizedPnl), 0);
    realizedPnl += marketPnl;
    if (marketPnl > 0) profitableClosedMarketCount += 1;
    if (isHeldToResolution(group.rows)) heldToResolutionMarketCount += 1;
    else if (isSoldBeforeResolution(group.rows)) soldBeforeResolutionMarketCount += 1;
    if (hasMultipleClosedSides(group.rows)) hedgedMarkets.add(group.conditionId);
  }

  for (const conditionId of detectTradeHedges(trades)) hedgedMarkets.add(conditionId);

  const activePositions = currentPositions.filter((position) => numberValue(position.currentValue) > EPSILON);
  const currentMarkets = new Set(activePositions.map((position) => position.conditionId));
  const currentValue = activePositions.reduce((total, position) => total + numberValue(position.currentValue), 0);
  const unrealizedPnl = activePositions.reduce((total, position) => total + numberValue(position.cashPnl), 0);
  const uniqueMarketCount = Math.max(allMarkets.size, tradeMarkets.size);
  const odds = computeOddsAdjustedMetrics(closedPositions);
  const topicMetrics = computeTopicMetrics(trades, closedPositions, currentPositions);

  return {
    tradeCount: trades.length,
    buyCount,
    sellCount,
    uniqueMarketCount,
    grossTradeValue: round2(grossTradeValue),
    firstTradeAt: Number.isFinite(firstTimestamp) ? timestampToIso(firstTimestamp) : undefined,
    lastTradeAt: lastTimestamp > 0 ? timestampToIso(lastTimestamp) : undefined,
    closedPositionCount: closedPositions.length,
    closedMarketCount,
    profitableClosedMarketCount,
    closedMarketProfitRate: closedMarketCount ? round4(profitableClosedMarketCount / closedMarketCount) : 0,
    heldToResolutionMarketCount,
    heldToResolutionPct: closedMarketCount ? round4(heldToResolutionMarketCount / closedMarketCount) : 0,
    soldBeforeResolutionMarketCount,
    soldBeforeResolutionPct: closedMarketCount ? round4(soldBeforeResolutionMarketCount / closedMarketCount) : 0,
    hedgedMarketCount: hedgedMarkets.size,
    hedgedMarketPct: uniqueMarketCount ? round4(hedgedMarkets.size / uniqueMarketCount) : 0,
    currentPositionCount: activePositions.length,
    currentMarketCount: currentMarkets.size,
    currentValue: round2(currentValue),
    unrealizedPnl: round2(unrealizedPnl),
    realizedPnl: round2(realizedPnl),
    odds,
    topicMetrics,
  };
}

function computeTopicMetrics(
  trades: Trade[],
  closedPositions: ClosedPosition[],
  currentPositions: Position[],
): TopicMetrics[] {
  const topics = new Set<MarketTopic>();
  for (const trade of trades) topics.add(topicForRow(trade));
  for (const position of closedPositions) topics.add(topicForRow(position));
  for (const position of currentPositions) topics.add(topicForRow(position));

  return Array.from(topics)
    .sort()
    .map((topic) => {
      const topicTrades = trades.filter((trade) => topicForRow(trade) === topic);
      const topicClosedPositions = closedPositions.filter((position) => topicForRow(position) === topic);
      const topicCurrentPositions = currentPositions.filter((position) => topicForRow(position) === topic);
      const closedGroups = groupByCondition(topicClosedPositions);
      const activePositions = topicCurrentPositions.filter((position) => numberValue(position.currentValue) > EPSILON);
      const tradeMarkets = new Set(topicTrades.map((trade) => trade.conditionId));
      const allMarkets = new Set<string>([
        ...topicTrades.map((trade) => trade.conditionId),
        ...topicClosedPositions.map((position) => position.conditionId),
        ...activePositions.map((position) => position.conditionId),
      ]);
      const currentMarkets = new Set(activePositions.map((position) => position.conditionId));
      let profitableClosedMarketCount = 0;
      let realizedPnl = 0;

      for (const group of closedGroups) {
        const marketPnl = group.rows.reduce((total, row) => total + numberValue(row.realizedPnl), 0);
        realizedPnl += marketPnl;
        if (marketPnl > 0) profitableClosedMarketCount += 1;
      }

      return {
        topic,
        tradeCount: topicTrades.length,
        uniqueMarketCount: Math.max(allMarkets.size, tradeMarkets.size),
        closedPositionCount: topicClosedPositions.length,
        closedMarketCount: closedGroups.length,
        profitableClosedMarketCount,
        closedMarketProfitRate: closedGroups.length ? round4(profitableClosedMarketCount / closedGroups.length) : 0,
        currentPositionCount: activePositions.length,
        currentMarketCount: currentMarkets.size,
        currentValue: round2(activePositions.reduce((total, position) => total + numberValue(position.currentValue), 0)),
        realizedPnl: round2(realizedPnl),
        odds: computeOddsAdjustedMetrics(topicClosedPositions),
      };
    });
}

function topicForRow(row: { title?: string; slug?: string; eventSlug?: string; outcome?: string }): MarketTopic {
  return inferMarketTopic(row);
}

function computeOddsAdjustedMetrics(closedPositions: ClosedPosition[]): OddsAdjustedMetrics {
  const resolved = closedPositions
    .map(toResolvedPositionOutcome)
    .filter((position): position is ResolvedPositionOutcome => position !== undefined);
  const overall = summarizeResolvedOutcomes(resolved);
  const contrarian = summarizeResolvedOutcomes(resolved.filter((position) => position.entryProbability < 0.5));
  const favorite = summarizeResolvedOutcomes(resolved.filter((position) => position.entryProbability >= 0.7));
  const resolvedMarkets = new Set(resolved.map((position) => position.conditionId));
  const buckets = ODDS_BUCKETS.map((bucket) => {
    const bucketSummary = summarizeResolvedOutcomes(
      resolved.filter((position) => position.entryProbability >= bucket.min && position.entryProbability < bucket.max),
    );
    return {
      label: bucket.label,
      positionCount: bucketSummary.positionCount,
      stakeValue: bucketSummary.stakeValue,
      avgEntryOddsPct: bucketSummary.avgEntryOddsPct,
      expectedWinPct: bucketSummary.expectedWinPct,
      actualWinPct: bucketSummary.actualWinPct,
      oddsEdgePct: bucketSummary.oddsEdgePct,
      edgeZScore: bucketSummary.edgeZScore,
      roiPct: bucketSummary.roiPct,
    };
  });

  return {
    resolvedPositionCount: overall.positionCount,
    resolvedMarketCount: resolvedMarkets.size,
    stakeValue: overall.stakeValue,
    avgEntryOddsPct: overall.avgEntryOddsPct,
    expectedWinPct: overall.expectedWinPct,
    actualWinPct: overall.actualWinPct,
    oddsEdgePct: overall.oddsEdgePct,
    edgeZScore: overall.edgeZScore,
    roiPct: overall.roiPct,
    contrarianStakePct: overall.stakeValue ? round2((contrarian.stakeValue / overall.stakeValue) * 100) : 0,
    contrarianEdgePct: contrarian.positionCount ? contrarian.oddsEdgePct : undefined,
    favoriteStakePct: overall.stakeValue ? round2((favorite.stakeValue / overall.stakeValue) * 100) : 0,
    favoriteEdgePct: favorite.positionCount ? favorite.oddsEdgePct : undefined,
    style: classifyBettingStyle({
      resolvedPositionCount: overall.positionCount,
      oddsEdgePct: overall.oddsEdgePct,
      contrarianStakePct: overall.stakeValue ? (contrarian.stakeValue / overall.stakeValue) * 100 : 0,
      contrarianEdgePct: contrarian.positionCount ? contrarian.oddsEdgePct : undefined,
      favoriteStakePct: overall.stakeValue ? (favorite.stakeValue / overall.stakeValue) * 100 : 0,
      favoriteEdgePct: favorite.positionCount ? favorite.oddsEdgePct : undefined,
    }),
    buckets,
  };
}

function toResolvedPositionOutcome(position: ClosedPosition): ResolvedPositionOutcome | undefined {
  const entryProbability = clamp(numberValue(position.avgPrice), 0, 1);
  const terminalPrice = numberValue(position.curPrice);
  const totalBought = numberValue(position.totalBought);
  if (entryProbability <= 0 || entryProbability >= 1) return undefined;
  if (!isTerminalPrice(terminalPrice)) return undefined;
  if (totalBought <= EPSILON) return undefined;

  const actualOutcome = terminalPrice >= 0.99 ? 1 : 0;
  const terminalPnl = (actualOutcome - entryProbability) * totalBought;
  if (!isSettlementConsistent(position, terminalPnl)) return undefined;

  return {
    conditionId: position.conditionId,
    entryProbability,
    actualOutcome,
    shareCount: totalBought,
    stakeValue: Math.max(entryProbability * totalBought, EPSILON),
    realizedPnl: numberValue(position.realizedPnl),
  };
}

function isSettlementConsistent(position: ClosedPosition, terminalPnl: number): boolean {
  const stakeValue = numberValue(position.avgPrice) * numberValue(position.totalBought);
  const realizedPnl = numberValue(position.realizedPnl);
  const tolerance = Math.max(10, stakeValue * 0.05);
  return Math.abs(realizedPnl - terminalPnl) <= tolerance;
}

function summarizeResolvedOutcomes(positions: ResolvedPositionOutcome[]): {
  positionCount: number;
  stakeValue: number;
  avgEntryOddsPct: number;
  expectedWinPct: number;
  actualWinPct: number;
  oddsEdgePct: number;
  edgeZScore: number;
  roiPct: number;
} {
  const shareCount = positions.reduce((total, position) => total + position.shareCount, 0);
  const stakeValue = positions.reduce((total, position) => total + position.stakeValue, 0);
  const expected = positions.reduce((total, position) => total + position.shareCount * position.entryProbability, 0);
  const actual = positions.reduce((total, position) => total + position.shareCount * position.actualOutcome, 0);
  const varianceNumerator = positions.reduce(
    (total, position) => total + position.shareCount ** 2 * position.entryProbability * (1 - position.entryProbability),
    0,
  );
  const realizedPnl = positions.reduce((total, position) => total + position.realizedPnl, 0);
  const expectedRate = shareCount ? expected / shareCount : 0;
  const actualRate = shareCount ? actual / shareCount : 0;
  const oddsEdge = actualRate - expectedRate;
  const standardError = shareCount ? Math.sqrt(varianceNumerator) / shareCount : 0;
  const edgeZScore = standardError > 0 ? oddsEdge / standardError : 0;

  return {
    positionCount: positions.length,
    stakeValue: round2(stakeValue),
    avgEntryOddsPct: round2(expectedRate * 100),
    expectedWinPct: round2(expectedRate * 100),
    actualWinPct: round2(actualRate * 100),
    oddsEdgePct: round2(oddsEdge * 100),
    edgeZScore: round2(edgeZScore),
    roiPct: stakeValue ? round2((realizedPnl / stakeValue) * 100) : 0,
  };
}

function classifyBettingStyle(input: {
  resolvedPositionCount: number;
  oddsEdgePct: number;
  contrarianStakePct: number;
  contrarianEdgePct?: number;
  favoriteStakePct: number;
  favoriteEdgePct?: number;
}): TraderBettingStyle {
  if (input.resolvedPositionCount < 10) return "Thin Sample";
  if (input.contrarianStakePct >= 50 && numberValue(input.contrarianEdgePct) >= 5) return "Sharp Contrarian";
  if (input.contrarianStakePct >= 50) return "Contrarian";
  if (input.favoriteStakePct >= 60 && numberValue(input.favoriteEdgePct) >= 3) return "Sharp Favorite";
  if (input.favoriteStakePct >= 60) return "Favorite Grinder";
  if (input.oddsEdgePct >= 5) return "Positive Edge";
  if (input.oddsEdgePct <= -5) return "Negative Edge";
  return "Mixed";
}

function scoreComponentsFor(input: {
  pnl: number;
  vol: number;
  roiPct: number;
  metrics: TraderHistoryMetrics;
}): TraderQualityScoreComponents {
  const roi = clamp((input.roiPct + 5) / 35, 0, 1);
  const pnl = input.pnl > 0 ? clamp(Math.log1p(input.pnl) / Math.log1p(250_000), 0, 1) : 0;
  const volume = clamp(Math.log1p(input.vol) / Math.log1p(1_000_000), 0, 1);
  const historyDepth = clamp(Math.log1p(input.metrics.tradeCount) / Math.log1p(500), 0, 1);
  const marketDiversity = clamp(Math.log1p(input.metrics.uniqueMarketCount) / Math.log1p(150), 0, 1);
  const sampleConfidence = clamp(input.metrics.closedMarketCount / 20, 0, 1);
  const closedProfit = sampleConfidence * input.metrics.closedMarketProfitRate + (1 - sampleConfidence) * 0.35;
  const oddsSampleConfidence = clamp(input.metrics.odds.resolvedPositionCount / 30, 0, 1);
  const oddsEdgeBase = clamp((input.metrics.odds.oddsEdgePct + 10) / 25, 0, 1);
  const oddsZBase = clamp((input.metrics.odds.edgeZScore + 1.5) / 4, 0, 1);
  const oddsEdge = oddsSampleConfidence * (0.7 * oddsEdgeBase + 0.3 * oddsZBase) + (1 - oddsSampleConfidence) * 0.4;
  const recency = recencyScore(input.metrics.lastTradeAt);

  return {
    roi: round4(roi),
    pnl: round4(pnl),
    volume: round4(volume),
    historyDepth: round4(historyDepth),
    marketDiversity: round4(marketDiversity),
    closedProfit: round4(closedProfit),
    oddsEdge: round4(oddsEdge),
    recency: round4(recency),
  };
}

function recencyScore(lastTradeAt?: string): number {
  if (!lastTradeAt) return 0;
  const ageDays = (Date.now() - Date.parse(lastTradeAt)) / 86_400_000;
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.85;
  if (ageDays <= 30) return 0.55;
  if (ageDays <= 90) return 0.25;
  return 0.05;
}

function detectTradeHedges(trades: Trade[]): Set<string> {
  const hedged = new Set<string>();
  const tradesByCondition = groupByCondition(trades);

  for (const group of tradesByCondition) {
    const inventoryByAsset = new Map<string, number>();
    const sorted = [...group.rows].sort((a, b) => numberValue(a.timestamp) - numberValue(b.timestamp));
    for (const trade of sorted) {
      const current = inventoryByAsset.get(trade.asset) ?? 0;
      const direction = trade.side === "SELL" ? -1 : 1;
      inventoryByAsset.set(trade.asset, current + direction * numberValue(trade.size));
      const positiveAssetCount = Array.from(inventoryByAsset.values()).filter((value) => value > EPSILON).length;
      if (positiveAssetCount > 1) {
        hedged.add(group.conditionId);
        break;
      }
    }
  }

  return hedged;
}

function isHeldToResolution(rows: ClosedPosition[]): boolean {
  const endAt = marketEndMs(rows);
  if (!endAt) return rows.some((row) => isTerminalPrice(row.curPrice));
  const closedAt = Math.max(...rows.map((row) => numberValue(row.timestamp) * 1000));
  return closedAt >= endAt || rows.some((row) => isTerminalPrice(row.curPrice));
}

function isSoldBeforeResolution(rows: ClosedPosition[]): boolean {
  const endAt = marketEndMs(rows);
  if (!endAt) return false;
  const closedAt = Math.max(...rows.map((row) => numberValue(row.timestamp) * 1000));
  return closedAt < endAt && rows.every((row) => !isTerminalPrice(row.curPrice));
}

function hasMultipleClosedSides(rows: ClosedPosition[]): boolean {
  const sides = new Set(rows.filter((row) => numberValue(row.totalBought) > EPSILON).map((row) => row.asset || row.outcome));
  return sides.size > 1;
}

function marketEndMs(rows: ClosedPosition[]): number {
  const values = rows
    .map((row) => (row.endDate ? Date.parse(row.endDate) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  return values.length ? Math.max(...values) : 0;
}

function isTerminalPrice(price: number): boolean {
  const value = numberValue(price);
  return value <= 0.01 || value >= 0.99;
}

function groupByCondition<T extends { conditionId: string }>(rows: T[]): MarketPositionGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.conditionId) ?? [];
    group.push(row);
    groups.set(row.conditionId, group);
  }
  return Array.from(groups.entries()).map(([conditionId, groupRows]) => ({ conditionId, rows: groupRows }));
}

function cacheEntrySatisfies(entry: CachedTraderHistory, options: TraderQualityOptions): boolean {
  const ageMs = Date.now() - Date.parse(entry.fetchedAt);
  const maxAgeMs = options.cacheTtlHours * 60 * 60 * 1000;
  return (
    ageMs >= 0 &&
    ageMs <= maxAgeMs &&
    entry.tradePages >= options.tradePagesPerTrader &&
    entry.closedPositionPages >= options.closedPositionPagesPerTrader &&
    entry.positionPages >= options.positionPagesPerTrader &&
    Boolean(entry.metrics.odds && Array.isArray(entry.metrics.odds.buckets)) &&
    Array.isArray(entry.metrics.topicMetrics)
  );
}

function readCache(path: string): TraderQualityCacheFile {
  if (!existsSync(path)) {
    return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), traders: {} };
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as TraderQualityCacheFile;
  if (parsed.schemaVersion !== 1 || !parsed.traders) {
    return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), traders: {} };
  }
  return parsed;
}

function matchingAcceptedTraderIds(cache: TraderQualityCacheFile, scope?: TraderQualityCacheScope): Set<string> | undefined {
  if (!scope) return undefined;
  const latest = cache.latestQualityRun;
  if (!latest || !cacheScopeMatches(latest, scope)) return new Set();
  return new Set(latest.acceptedTraderIds.map((wallet) => wallet.toLowerCase()));
}

function cacheScopeMatches(latest: CachedTraderQualityRun | undefined, scope: TraderQualityCacheScope): boolean {
  return Boolean(
    latest &&
      latest.top === scope.top &&
      latest.category === scope.category &&
      latest.timePeriod === scope.timePeriod &&
      latest.orderBy === scope.orderBy,
  );
}

function writeCache(path: string, cache: TraderQualityCacheFile): void {
  cache.updatedAt = new Date().toISOString();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`);
}

export function validateTraderQualityOptions(options: TraderQualityOptions): void {
  if (options.top < 1) throw new Error("top must be 1 or greater.");
  if (!["OVERALL", "POLITICS", "SPORTS", "ESPORTS", "CRYPTO", "CULTURE", "MENTIONS", "WEATHER", "ECONOMICS", "TECH", "FINANCE"].includes(options.category)) throw new Error(`Unsupported category: ${options.category}`);
  if (!["DAY", "WEEK", "MONTH", "ALL"].includes(options.timePeriod)) throw new Error(`Unsupported timePeriod: ${options.timePeriod}`);
  if (!["PNL", "VOL"].includes(options.orderBy)) throw new Error(`Unsupported orderBy: ${options.orderBy}`);
  if (options.minVolume < 0) throw new Error("minVolume must be zero or greater.");
  if (options.minTrades < 0) throw new Error("minTrades must be zero or greater.");
  if (options.minMarkets < 0) throw new Error("minMarkets must be zero or greater.");
  if (options.minClosedMarkets < 0) throw new Error("minClosedMarkets must be zero or greater.");
  if (options.tradePagesPerTrader < 1 || options.tradePagesPerTrader > 3) throw new Error("tradePagesPerTrader must be between 1 and 3.");
  if (options.closedPositionPagesPerTrader < 1 || options.closedPositionPagesPerTrader > 20) throw new Error("closedPositionPagesPerTrader must be between 1 and 20.");
  if (options.positionPagesPerTrader < 1 || options.positionPagesPerTrader > 5) throw new Error("positionPagesPerTrader must be between 1 and 5.");
  if (options.concurrency < 1 || options.concurrency > 10) throw new Error("concurrency must be between 1 and 10.");
  if (options.cacheTtlHours < 0) throw new Error("cacheTtlHours must be zero or greater.");
}

function labelScore(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Good";
  if (score >= 50) return "Medium";
  if (score >= 35) return "Thin";
  return "Weak";
}

function timestampToIso(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
