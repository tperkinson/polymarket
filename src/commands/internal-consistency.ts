import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hasMatchingCachedTraderQualityRun,
  loadCachedTraderQualityBadges,
  type TraderQualityCacheScope,
} from "../polymarket/trader-quality.js";
import { inferMarketTopic } from "../polymarket/topic-classifier.js";

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function buildMetrics() {
  return {
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    uniqueMarketCount: 0,
    grossTradeValue: 0,
    closedPositionCount: 0,
    closedMarketCount: 0,
    profitableClosedMarketCount: 0,
    closedMarketProfitRate: 0,
    heldToResolutionMarketCount: 0,
    heldToResolutionPct: 0,
    soldBeforeResolutionMarketCount: 0,
    soldBeforeResolutionPct: 0,
    hedgedMarketCount: 0,
    hedgedMarketPct: 0,
    currentPositionCount: 0,
    currentMarketCount: 0,
    currentValue: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    odds: {
      resolvedPositionCount: 0,
      resolvedMarketCount: 0,
      stakeValue: 0,
      avgEntryOddsPct: 0,
      expectedWinPct: 0,
      actualWinPct: 0,
      oddsEdgePct: 0,
      edgeZScore: 0,
      roiPct: 0,
      contrarianStakePct: 0,
      favoriteStakePct: 0,
      style: "Thin Sample",
      buckets: [],
    },
    topicMetrics: [],
  };
}

function writeTraderQualityCache(cachePath: string, scope: TraderQualityCacheScope) {
  const now = new Date().toISOString();
  const cache = {
    schemaVersion: 1,
    updatedAt: now,
    latestQualityRun: {
      ...scope,
      fetchedAt: now,
      acceptedTraderIds: ["0xaccepted"],
    },
    traders: {
      "0xaccepted": {
        proxyWallet: "0xaccepted",
        userName: "accepted-trader",
        fetchedAt: now,
        tradePages: 1,
        closedPositionPages: 1,
        positionPages: 1,
        metrics: buildMetrics(),
        lastScore: 86,
        lastScoreLabel: "Strong",
        lastScoreRank: 1,
        lastQualityFetchedAt: now,
      },
      "0xstale": {
        proxyWallet: "0xstale",
        userName: "stale-trader",
        fetchedAt: now,
        tradePages: 1,
        closedPositionPages: 1,
        positionPages: 1,
        metrics: buildMetrics(),
        lastScore: 92,
        lastScoreLabel: "Strong",
        lastScoreRank: 2,
        lastQualityFetchedAt: now,
      },
    },
  };

  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "polymarket-consistency-"));
  const cachePath = join(tempDir, "trader-quality.json");
  const scope: TraderQualityCacheScope = {
    top: 10,
    category: "OVERALL",
    timePeriod: "DAY",
    orderBy: "PNL",
  };

  try {
    writeTraderQualityCache(cachePath, scope);

    const tests: TestCase[] = [
      {
        name: "matching Trader Quality scope is recognized",
        run: () => {
          assert(hasMatchingCachedTraderQualityRun(scope, cachePath), "expected matching cache scope");
        },
      },
      {
        name: "matching scope exposes only accepted trader badges",
        run: () => {
          const badges = loadCachedTraderQualityBadges(cachePath, scope);
          assert(badges.size === 1, `expected 1 accepted badge, got ${badges.size}`);
          assert(badges.has("0xaccepted"), "accepted trader badge missing");
          assert(!badges.has("0xstale"), "stale trader badge leaked into scoped result");
        },
      },
      {
        name: "mismatched scope rejects stale cached badges",
        run: () => {
          const mismatchedScope = { ...scope, top: 11 };
          assert(!hasMatchingCachedTraderQualityRun(mismatchedScope, cachePath), "unexpected matching cache scope");
          const badges = loadCachedTraderQualityBadges(cachePath, mismatchedScope);
          assert(badges.size === 0, `expected no badges for mismatched scope, got ${badges.size}`);
        },
      },
      {
        name: "unscoped badge loading still supports broad cache consumers",
        run: () => {
          const badges = loadCachedTraderQualityBadges(cachePath);
          assert(badges.size === 2, `expected 2 unscoped badges, got ${badges.size}`);
        },
      },
      {
        name: "topic inference returns expected broad categories",
        run: () => {
          assert(inferMarketTopic({ title: "Will Bitcoin hit a new all-time high?" }) === "CRYPTO", "bitcoin topic mismatch");
          assert(inferMarketTopic({ title: "Will the NBA Finals go to game 7?" }) === "SPORTS", "NBA topic mismatch");
          assert(inferMarketTopic({ title: "Will CPI inflation come in above forecast?" }) === "ECONOMICS", "CPI topic mismatch");
        },
      },
    ];

    const failures: Array<{ name: string; error: unknown }> = [];

    for (const test of tests) {
      try {
        await test.run();
        console.log(`PASS ${test.name}`);
      } catch (error) {
        failures.push({ name: test.name, error });
        console.error(`FAIL ${test.name}`);
        console.error(error instanceof Error ? error.message : String(error));
      }
    }

    if (failures.length > 0) {
      console.error(`\n${failures.length} internal consistency check(s) failed.`);
      process.exitCode = 1;
      return;
    }

    console.log(`\n${tests.length} internal consistency checks passed.`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
