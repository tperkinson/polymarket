import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { searchKalshiMarkets, type KalshiMarketSearchOptions } from "./kalshi/public-api.js";
import { runLeaderConsensus, type ConsensusOptions, type EntryRule } from "./polymarket/consensus.js";
import type { LeaderboardCategory, LeaderboardOrderBy, LeaderboardTimePeriod } from "./polymarket/data-api.js";
import { runSharpDisagreement, type SharpDisagreementOptions } from "./polymarket/sharp-disagreement.js";
import { runStrongTraderWatch, type StrongTraderWatchOptions } from "./polymarket/strong-trader-watch.js";
import {
  loadCachedTraderQualityBadges,
  runTraderQuality,
  type TraderQualityOptions,
} from "./polymarket/trader-quality.js";

const PORT = Number(process.env.PORT ?? 8787);

listen(PORT);

function listen(port: number): void {
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/") {
        sendHtml(response, pageHtml());
        return;
      }

      if (request.method === "POST" && request.url === "/api/consensus") {
        const body = await readJson(request);
        const options = normalizeConsensusOptions(body);
        const result = await runLeaderConsensus(options);
        sendJson(response, decorateConsensusWithQuality(result));
        return;
      }

      if (request.method === "POST" && request.url === "/api/trader-quality") {
        const body = await readJson(request);
        const options = normalizeTraderQualityOptions(body);
        const result = await runTraderQuality(options);
        sendJson(response, result);
        return;
      }

      if (request.method === "POST" && request.url === "/api/strong-watch") {
        const body = await readJson(request);
        const options = normalizeStrongTraderWatchOptions(body);
        const result = await runStrongTraderWatch(options);
        sendJson(response, result);
        return;
      }

      if (request.method === "POST" && request.url === "/api/sharp-disagreement") {
        const body = await readJson(request);
        const options = normalizeSharpDisagreementOptions(body);
        const result = await runSharpDisagreement(options);
        sendJson(response, result);
        return;
      }

      if (request.method === "POST" && request.url === "/api/kalshi-markets") {
        const body = await readJson(request);
        const options = normalizeKalshiMarketSearchOptions(body);
        const result = await searchKalshiMarkets(options);
        sendJson(response, result);
        return;
      }

      sendJson(response, { error: "Not found" }, 404);
    } catch (error) {
      sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  server.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT) {
      listen(port + 1);
      return;
    }
    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Polymarket research web tool running at http://127.0.0.1:${port}`);
  });
}

function normalizeConsensusOptions(input: Record<string, unknown>): ConsensusOptions {
  return {
    top: readInteger(input.top, 20),
    category: readEnum(input.category, "OVERALL") as LeaderboardCategory,
    timePeriod: readEnum(input.timePeriod, "DAY") as LeaderboardTimePeriod,
    orderBy: readEnum(input.orderBy, "PNL") as LeaderboardOrderBy,
    asOf: String(input.asOf || todayDate()),
    withinDays: readInteger(input.withinDays, 5),
    agreement: readPercent(input.agreement, 80),
    minLeaders: readInteger(input.minLeaders, 2),
    minPositionValue: readNumber(input.minPositionValue, 1000),
    entryRule: readString(input.entryRule, "within-range") as EntryRule,
    concurrency: readInteger(input.concurrency, 2),
    maxPagesPerTrader: readInteger(input.maxPagesPerTrader, 1),
  };
}

function normalizeTraderQualityOptions(input: Record<string, unknown>): TraderQualityOptions {
  return {
    top: readInteger(input.top, 20),
    category: readEnum(input.category, "OVERALL") as LeaderboardCategory,
    timePeriod: readEnum(input.timePeriod, "DAY") as LeaderboardTimePeriod,
    orderBy: readEnum(input.orderBy, "PNL") as LeaderboardOrderBy,
    minVolume: readNumber(input.minVolume, 1000),
    minRoiPct: readNumber(input.minRoiPct, 0),
    minTrades: readInteger(input.minTrades, 50),
    minMarkets: readInteger(input.minMarkets, 10),
    minClosedMarkets: readInteger(input.minClosedMarkets, 5),
    tradePagesPerTrader: readInteger(input.tradePagesPerTrader, 1),
    closedPositionPagesPerTrader: readInteger(input.closedPositionPagesPerTrader, 2),
    positionPagesPerTrader: readInteger(input.positionPagesPerTrader, 1),
    concurrency: readInteger(input.concurrency, 2),
    cacheTtlHours: readNumber(input.cacheTtlHours, 6),
    refreshCache: readBoolean(input.refreshCache, false),
  };
}

function normalizeStrongTraderWatchOptions(input: Record<string, unknown>): StrongTraderWatchOptions {
  return {
    top: readInteger(input.top, 20),
    category: readEnum(input.category, "OVERALL") as LeaderboardCategory,
    timePeriod: readEnum(input.timePeriod, "DAY") as LeaderboardTimePeriod,
    orderBy: readEnum(input.orderBy, "PNL") as LeaderboardOrderBy,
    asOf: String(input.asOf || todayDate()),
    withinDays: readInteger(input.withinDays, 30),
    qualityThreshold: readNumber(input.qualityThreshold, 80),
    minPositionValue: readNumber(input.minPositionValue, 1000),
    maxPagesPerTrader: readInteger(input.maxPagesPerTrader, 1),
    concurrency: readInteger(input.concurrency, 2),
    onlyWithOpposition: readBoolean(input.onlyWithOpposition, false),
  };
}

function normalizeSharpDisagreementOptions(input: Record<string, unknown>): SharpDisagreementOptions {
  return {
    top: readInteger(input.top, 30),
    category: readEnum(input.category, "OVERALL") as LeaderboardCategory,
    timePeriod: readEnum(input.timePeriod, "DAY") as LeaderboardTimePeriod,
    orderBy: readEnum(input.orderBy, "PNL") as LeaderboardOrderBy,
    asOf: String(input.asOf || todayDate()),
    withinDays: readInteger(input.withinDays, 30),
    strongQualityThreshold: readNumber(input.strongQualityThreshold, 75),
    weakQualityMax: readNumber(input.weakQualityMax, 50),
    minTopicScore: readNumber(input.minTopicScore, 45),
    minPositionValue: readNumber(input.minPositionValue, 500),
    maxPagesPerTrader: readInteger(input.maxPagesPerTrader, 1),
    concurrency: readInteger(input.concurrency, 2),
    requireWeakOpposition: readBoolean(input.requireWeakOpposition, false),
  };
}

function normalizeKalshiMarketSearchOptions(input: Record<string, unknown>): KalshiMarketSearchOptions {
  return {
    query: readString(input.query, ""),
    status: readString(input.status, "open").toLowerCase() as KalshiMarketSearchOptions["status"],
    limit: readInteger(input.limit, 25),
    closeWithinDays: readInteger(input.closeWithinDays, 0),
    minVolume: readNumber(input.minVolume, 0),
    mveFilter: readString(input.mveFilter, "exclude").toLowerCase() as KalshiMarketSearchOptions["mveFilter"],
    includeOrderbook: readBoolean(input.includeOrderbook, false),
    orderbookDepth: readInteger(input.orderbookDepth, 5),
  };
}

function readInteger(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) throw new Error(`Expected integer, got ${value}`);
  return parsed;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) throw new Error(`Expected number, got ${value}`);
  return parsed;
}

function readPercent(value: unknown, fallback: number): number {
  const parsed = readNumber(value, fallback);
  return parsed > 1 ? parsed / 100 : parsed;
}

function readEnum(value: unknown, fallback: string): string {
  return String(value || fallback).toUpperCase();
}

function readString(value: unknown, fallback: string): string {
  return String(value || fallback);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function decorateConsensusWithQuality<T extends { candidates: Array<{ leaders: Array<{ proxyWallet: string }>; opposingSides?: Array<{ leaders: Array<{ proxyWallet: string }> }> }> }>(
  result: T,
): T {
  const badges = loadCachedTraderQualityBadges();

  for (const candidate of result.candidates) {
    for (const leader of candidate.leaders) addQualityBadge(leader, badges);
    for (const side of candidate.opposingSides ?? []) {
      for (const leader of side.leaders) addQualityBadge(leader, badges);
    }
  }

  return result;
}

function addQualityBadge(
  leader: { proxyWallet: string } & Record<string, unknown>,
  badges: ReturnType<typeof loadCachedTraderQualityBadges>,
): void {
  const badge = badges.get(leader.proxyWallet.toLowerCase());
  if (!badge) return;
  leader.qualityScore = badge.score;
  leader.qualityLabel = badge.scoreLabel;
  leader.qualityRank = badge.scoreRank;
  leader.qualityFetchedAt = badge.fetchedAt;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

function sendJson(response: ServerResponse, payload: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function todayDate(): string {
  return new Date().toLocaleDateString("en-CA");
}

function pageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Polymarket Research Tools</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --line: #d9dee7;
      --text: #1e2329;
      --muted: #64707d;
      --accent: #1769e0;
      --good: #0f7b4f;
      --warn: #9b5a00;
      --bad: #a13838;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      padding: 20px 24px 12px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    h1 { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: 0; }
    main { max-width: 1440px; margin: 0 auto; padding: 18px 20px 28px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .tab-button {
      width: auto;
      min-width: 150px;
      padding: 0 14px;
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--line);
    }
    .tab-button.active {
      background: var(--text);
      color: #fff;
      border-color: var(--text);
    }
    .legend-bar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin: -4px 0 14px;
      color: var(--muted);
      font-size: 12px;
    }
    .legend-label {
      color: var(--text);
      font-weight: 700;
      margin-right: 2px;
    }
    .tool-view[hidden] { display: none; }
    .layout { display: grid; grid-template-columns: 360px 1fr; gap: 18px; align-items: start; }
    form {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      display: grid;
      gap: 12px;
    }
    label { display: grid; gap: 5px; font-size: 12px; color: var(--muted); font-weight: 600; }
    input, select {
      width: 100%;
      height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 0 10px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }
    .checkbox-row {
      min-height: 36px;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 17px;
    }
    .checkbox-row input {
      width: 16px;
      height: 16px;
      padding: 0;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    button {
      height: 38px;
      border: 0;
      border-radius: 6px;
      background: var(--accent);
      color: #fff;
      font-weight: 650;
      cursor: pointer;
    }
    button:disabled { opacity: .55; cursor: wait; }
    .results { display: grid; gap: 14px; }
    .summary, .candidate, .empty, .warnings {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .summary-grid { display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 10px; }
    .metric { border: 1px solid var(--line); border-radius: 6px; padding: 10px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .metric strong { font-size: 18px; }
    .candidate h2 { margin: 0 0 8px; font-size: 17px; letter-spacing: 0; }
    .candidate h3 { margin: 14px 0 6px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    details { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px; }
    summary { cursor: pointer; color: var(--text); font-weight: 700; font-size: 13px; }
    .nested-table { margin-top: 8px; font-size: 12px; }
    .style-pill { font-weight: 700; color: var(--text); }
    .meta { display: flex; flex-wrap: wrap; gap: 8px; color: var(--muted); font-size: 13px; margin-bottom: 10px; }
    .pill { padding: 3px 8px; border: 1px solid var(--line); border-radius: 999px; background: #fbfcfe; }
    .good { color: var(--good); }
    .warn-text { color: var(--warn); }
    .bad-text { color: var(--bad); }
    .leader-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .quality-badge {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 750;
      line-height: 1;
      border: 1px solid var(--line);
      color: var(--muted);
      background: #f8fafc;
      white-space: nowrap;
    }
    .quality-strong { color: #075e43; background: #e7f5ef; border-color: #b8dfcf; }
    .quality-good { color: #1257a6; background: #eaf2ff; border-color: #bdd4f4; }
    .quality-medium { color: #7a5200; background: #fff5d9; border-color: #ead18c; }
    .quality-thin, .quality-weak { color: #7d3434; background: #fdecec; border-color: #efc1c1; }
    .quality-none { color: var(--muted); background: #f8fafc; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border-top: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 700; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; color: var(--muted); }
    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .summary-grid { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
    }
  </style>
</head>
<body>
  <header><h1>Polymarket Research Tools</h1></header>
  <main>
    <div class="tabs">
      <button class="tab-button active" type="button" data-tab="consensus">Consensus Screen</button>
      <button class="tab-button" type="button" data-tab="quality">Trader Quality</button>
      <button class="tab-button" type="button" data-tab="strong-watch">Strong Trader Watch</button>
      <button class="tab-button" type="button" data-tab="sharp-disagreement">Sharp Disagreement</button>
      <button class="tab-button" type="button" data-tab="kalshi-markets">Kalshi Markets</button>
    </div>
    <div class="legend-bar">
      <span class="legend-label">Quality badges</span>
      <span class="quality-badge quality-strong">Q80+ Strong</span>
      <span class="quality-badge quality-good">Q65+ Good</span>
      <span class="quality-badge quality-medium">Q50+ Medium</span>
      <span class="quality-badge quality-thin">Q35+ Thin</span>
      <span class="quality-badge quality-weak">Below 35 Weak</span>
      <span class="quality-badge quality-none">Q -- Not scored</span>
    </div>

    <section id="consensus-view" class="tool-view">
      <div class="layout">
        <form id="consensus-form">
          <div class="grid-2">
            <label>Top traders<input name="top" type="number" min="1" max="200" value="20"></label>
            <label>As of<input name="asOf" type="date"></label>
          </div>
          <div class="grid-2">
            <label>Category<select name="category"><option>OVERALL</option><option>SPORTS</option><option>POLITICS</option><option>CRYPTO</option><option>FINANCE</option><option>TECH</option><option>ECONOMICS</option><option>CULTURE</option><option>WEATHER</option><option>MENTIONS</option><option>ESPORTS</option></select></label>
            <label>Leaderboard window<select name="timePeriod"><option>DAY</option><option>WEEK</option><option>MONTH</option><option>ALL</option></select></label>
          </div>
          <div class="grid-2">
            <label>Rank by<select name="orderBy"><option>PNL</option><option>VOL</option></select></label>
            <label>Expiry days<input name="withinDays" type="number" min="0" max="30" value="5"></label>
          </div>
          <div class="grid-2">
            <label>Agreement %<input name="agreement" type="number" min="1" max="100" step="5" value="80"></label>
            <label>Min leaders<input name="minLeaders" type="number" min="1" max="20" value="2"></label>
          </div>
          <div class="grid-2">
            <label>Min value<input name="minPositionValue" type="number" min="0" step="100" value="1000"></label>
            <label>Largest pages/trader<input name="maxPagesPerTrader" type="number" min="1" max="5" value="1"></label>
          </div>
          <div class="grid-2">
            <label>Concurrency<input name="concurrency" type="number" min="1" max="5" value="2"></label>
            <label>Entry rule<select name="entryRule"><option value="within-range">Within range</option><option value="at-or-below-weighted">At/below weighted</option><option value="none">None</option></select></label>
          </div>
          <button id="consensus-button" type="button">Run Screen</button>
        </form>
        <section id="consensus-results" class="results">
          <div class="empty">Run a screen to see consensus candidates. Quality badges appear after the Trader Quality tab has cached scores.</div>
        </section>
      </div>
    </section>

    <section id="quality-view" class="tool-view" hidden>
      <div class="layout">
        <form id="quality-form">
          <div class="grid-2">
            <label>Top traders<input name="top" type="number" min="1" max="200" value="20"></label>
            <label>Category<select name="category"><option>OVERALL</option><option>SPORTS</option><option>POLITICS</option><option>CRYPTO</option><option>FINANCE</option><option>TECH</option><option>ECONOMICS</option><option>CULTURE</option><option>WEATHER</option><option>MENTIONS</option><option>ESPORTS</option></select></label>
          </div>
          <div class="grid-2">
            <label>Leaderboard window<select name="timePeriod"><option>DAY</option><option>WEEK</option><option>MONTH</option><option>ALL</option></select></label>
            <label>Rank by<select name="orderBy"><option>PNL</option><option>VOL</option></select></label>
          </div>
          <div class="grid-2">
            <label>Min volume<input name="minVolume" type="number" min="0" step="100" value="1000"></label>
            <label>Min ROI %<input name="minRoiPct" type="number" step="1" value="0"></label>
          </div>
          <div class="grid-2">
            <label>Min trades<input name="minTrades" type="number" min="0" value="50"></label>
            <label>Min markets<input name="minMarkets" type="number" min="0" value="10"></label>
          </div>
          <div class="grid-2">
            <label>Min closed markets<input name="minClosedMarkets" type="number" min="0" value="5"></label>
            <label>Trade pages/trader<input name="tradePagesPerTrader" type="number" min="1" max="3" value="1"></label>
          </div>
          <div class="grid-2">
            <label>Closed pages/trader<input name="closedPositionPagesPerTrader" type="number" min="1" max="20" value="2"></label>
            <label>Current pages/trader<input name="positionPagesPerTrader" type="number" min="1" max="5" value="1"></label>
          </div>
          <div class="grid-2">
            <label>Cache hours<input name="cacheTtlHours" type="number" min="0" max="168" step="1" value="6"></label>
            <label>Concurrency<input name="concurrency" type="number" min="1" max="5" value="2"></label>
          </div>
          <label class="checkbox-row"><input name="refreshCache" type="checkbox"> Force refresh cached history</label>
          <button id="quality-button" type="button">Run Quality Screen</button>
        </form>
        <section id="quality-results" class="results">
          <div class="empty">Run quality to score traders and populate badges on the consensus screen.</div>
        </section>
      </div>
    </section>

    <section id="strong-watch-view" class="tool-view" hidden>
      <div class="layout">
        <form id="strong-watch-form">
          <div class="grid-2">
            <label>Top traders<input name="top" type="number" min="1" max="200" value="20"></label>
            <label>As of<input name="asOf" type="date"></label>
          </div>
          <div class="grid-2">
            <label>Category<select name="category"><option>OVERALL</option><option>SPORTS</option><option>POLITICS</option><option>CRYPTO</option><option>FINANCE</option><option>TECH</option><option>ECONOMICS</option><option>CULTURE</option><option>WEATHER</option><option>MENTIONS</option><option>ESPORTS</option></select></label>
            <label>Leaderboard window<select name="timePeriod"><option>DAY</option><option>WEEK</option><option>MONTH</option><option>ALL</option></select></label>
          </div>
          <div class="grid-2">
            <label>Rank by<select name="orderBy"><option>PNL</option><option>VOL</option></select></label>
            <label>Expiry days<input name="withinDays" type="number" min="0" max="365" value="30"></label>
          </div>
          <div class="grid-2">
            <label>Quality threshold<input name="qualityThreshold" type="number" min="0" max="100" step="1" value="80"></label>
            <label>Min position value<input name="minPositionValue" type="number" min="0" step="100" value="1000"></label>
          </div>
          <div class="grid-2">
            <label>Largest pages/trader<input name="maxPagesPerTrader" type="number" min="1" max="5" value="1"></label>
            <label>Concurrency<input name="concurrency" type="number" min="1" max="5" value="2"></label>
          </div>
          <label class="checkbox-row"><input name="onlyWithOpposition" type="checkbox"> Only show markets with opposition</label>
          <button id="strong-watch-button" type="button">Run Strong Watch</button>
        </form>
        <section id="strong-watch-results" class="results">
          <div class="empty">Run Trader Quality first, then use this tab to inspect current positions held by high-Q traders and see which leaderboard traders align or oppose them.</div>
        </section>
      </div>
    </section>

    <section id="sharp-disagreement-view" class="tool-view" hidden>
      <div class="layout">
        <form id="sharp-disagreement-form">
          <div class="grid-2">
            <label>Top traders<input name="top" type="number" min="1" max="200" value="30"></label>
            <label>As of<input name="asOf" type="date"></label>
          </div>
          <div class="grid-2">
            <label>Category<select name="category"><option>OVERALL</option><option>SPORTS</option><option>POLITICS</option><option>CRYPTO</option><option>FINANCE</option><option>TECH</option><option>ECONOMICS</option><option>CULTURE</option><option>WEATHER</option><option>MENTIONS</option><option>ESPORTS</option></select></label>
            <label>Leaderboard window<select name="timePeriod"><option>DAY</option><option>WEEK</option><option>MONTH</option><option>ALL</option></select></label>
          </div>
          <div class="grid-2">
            <label>Rank by<select name="orderBy"><option>PNL</option><option>VOL</option></select></label>
            <label>Expiry days<input name="withinDays" type="number" min="0" max="365" value="30"></label>
          </div>
          <div class="grid-2">
            <label>Sharp Q minimum<input name="strongQualityThreshold" type="number" min="0" max="100" step="1" value="75"></label>
            <label>Weak Q maximum<input name="weakQualityMax" type="number" min="0" max="100" step="1" value="50"></label>
          </div>
          <div class="grid-2">
            <label>Topic score minimum<input name="minTopicScore" type="number" min="0" max="100" step="1" value="45"></label>
            <label>Min position value<input name="minPositionValue" type="number" min="0" step="100" value="500"></label>
          </div>
          <div class="grid-2">
            <label>Largest pages/trader<input name="maxPagesPerTrader" type="number" min="1" max="5" value="1"></label>
            <label>Concurrency<input name="concurrency" type="number" min="1" max="5" value="2"></label>
          </div>
          <label class="checkbox-row"><input name="requireWeakOpposition" type="checkbox"> Require weak opposition</label>
          <button id="sharp-disagreement-button" type="button">Run Sharp Disagreement</button>
        </form>
        <section id="sharp-disagreement-results" class="results">
          <div class="empty">Run Trader Quality with refresh first, then use this tab to find strong topic-fit traders positioned against weak traders.</div>
        </section>
      </div>
    </section>

    <section id="kalshi-markets-view" class="tool-view" hidden>
      <div class="layout">
        <form id="kalshi-markets-form">
          <label>Search<input name="query" type="search" placeholder="ticker, event, title, keyword"></label>
          <div class="grid-2">
            <label>Status<select name="status"><option value="open">Open</option><option value="">Any</option><option value="unopened">Unopened</option><option value="paused">Paused</option><option value="closed">Closed</option><option value="settled">Settled</option></select></label>
            <label>Max results<input name="limit" type="number" min="1" max="100" value="25"></label>
          </div>
          <div class="grid-2">
            <label>Close within days<input name="closeWithinDays" type="number" min="0" max="365" value="0"></label>
            <label>Min volume<input name="minVolume" type="number" min="0" step="1" value="0"></label>
          </div>
          <div class="grid-2">
            <label>Combos<select name="mveFilter"><option value="exclude">Exclude combos</option><option value="">Include all</option><option value="only">Only combos</option></select></label>
            <label>Book depth<input name="orderbookDepth" type="number" min="0" max="100" value="5"></label>
          </div>
          <label class="checkbox-row"><input name="includeOrderbook" type="checkbox"> Fetch orderbook levels</label>
          <button id="kalshi-markets-button" type="button">Search Kalshi</button>
        </form>
        <section id="kalshi-markets-results" class="results">
          <div class="empty">Search public Kalshi markets. This is read-only and does not use account credentials.</div>
        </section>
      </div>
    </section>
  </main>
  <script>
    const consensusForm = document.getElementById('consensus-form');
    const consensusResults = document.getElementById('consensus-results');
    const consensusButton = document.getElementById('consensus-button');
    const qualityForm = document.getElementById('quality-form');
    const qualityResults = document.getElementById('quality-results');
    const qualityButton = document.getElementById('quality-button');
    const strongWatchForm = document.getElementById('strong-watch-form');
    const strongWatchResults = document.getElementById('strong-watch-results');
    const strongWatchButton = document.getElementById('strong-watch-button');
    const sharpDisagreementForm = document.getElementById('sharp-disagreement-form');
    const sharpDisagreementResults = document.getElementById('sharp-disagreement-results');
    const sharpDisagreementButton = document.getElementById('sharp-disagreement-button');
    const kalshiMarketsForm = document.getElementById('kalshi-markets-form');
    const kalshiMarketsResults = document.getElementById('kalshi-markets-results');
    const kalshiMarketsButton = document.getElementById('kalshi-markets-button');

    consensusForm.asOf.value = new Date().toLocaleDateString('en-CA');
    strongWatchForm.asOf.value = new Date().toLocaleDateString('en-CA');
    sharpDisagreementForm.asOf.value = new Date().toLocaleDateString('en-CA');

    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        document.querySelectorAll('.tab-button').forEach(item => item.classList.toggle('active', item === button));
        document.getElementById('consensus-view').hidden = tab !== 'consensus';
        document.getElementById('quality-view').hidden = tab !== 'quality';
        document.getElementById('strong-watch-view').hidden = tab !== 'strong-watch';
        document.getElementById('sharp-disagreement-view').hidden = tab !== 'sharp-disagreement';
        document.getElementById('kalshi-markets-view').hidden = tab !== 'kalshi-markets';
      });
    });

    consensusForm.addEventListener('submit', runConsensus);
    consensusButton.addEventListener('click', runConsensus);

    async function runConsensus(event) {
      event.preventDefault();
      consensusButton.disabled = true;
      consensusResults.innerHTML = '<div class="empty">Running screen...</div>';
      const payload = Object.fromEntries(new FormData(consensusForm).entries());
      for (const key of ['top','withinDays','agreement','minLeaders','minPositionValue','maxPagesPerTrader','concurrency']) payload[key] = Number(payload[key]);
      try {
        const data = await postJson('/api/consensus', payload);
        renderConsensus(data);
      } catch (error) {
        consensusResults.innerHTML = '<div class="empty warn-text">' + escapeHtml(error.message || String(error)) + '</div>';
      } finally {
        consensusButton.disabled = false;
      }
    }

    qualityForm.addEventListener('submit', runQuality);
    qualityButton.addEventListener('click', runQuality);

    async function runQuality(event) {
      event.preventDefault();
      qualityButton.disabled = true;
      qualityResults.innerHTML = '<div class="empty">Running quality screen...</div>';
      const payload = Object.fromEntries(new FormData(qualityForm).entries());
      for (const key of ['top','minVolume','minRoiPct','minTrades','minMarkets','minClosedMarkets','tradePagesPerTrader','closedPositionPagesPerTrader','positionPagesPerTrader','cacheTtlHours','concurrency']) payload[key] = Number(payload[key]);
      payload.refreshCache = qualityForm.refreshCache.checked;
      try {
        const data = await postJson('/api/trader-quality', payload);
        renderQuality(data);
      } catch (error) {
        qualityResults.innerHTML = '<div class="empty warn-text">' + escapeHtml(error.message || String(error)) + '</div>';
      } finally {
        qualityButton.disabled = false;
      }
    }

    strongWatchForm.addEventListener('submit', runStrongWatch);
    strongWatchButton.addEventListener('click', runStrongWatch);

    async function runStrongWatch(event) {
      event.preventDefault();
      strongWatchButton.disabled = true;
      strongWatchResults.innerHTML = '<div class="empty">Running strong trader watch...</div>';
      const payload = Object.fromEntries(new FormData(strongWatchForm).entries());
      for (const key of ['top','withinDays','qualityThreshold','minPositionValue','maxPagesPerTrader','concurrency']) payload[key] = Number(payload[key]);
      payload.onlyWithOpposition = strongWatchForm.onlyWithOpposition.checked;
      try {
        const data = await postJson('/api/strong-watch', payload);
        renderStrongWatch(data);
      } catch (error) {
        strongWatchResults.innerHTML = '<div class="empty warn-text">' + escapeHtml(error.message || String(error)) + '</div>';
      } finally {
        strongWatchButton.disabled = false;
      }
    }

    sharpDisagreementForm.addEventListener('submit', runSharpDisagreement);
    sharpDisagreementButton.addEventListener('click', runSharpDisagreement);

    async function runSharpDisagreement(event) {
      event.preventDefault();
      sharpDisagreementButton.disabled = true;
      sharpDisagreementResults.innerHTML = '<div class="empty">Running sharp disagreement screen...</div>';
      const payload = Object.fromEntries(new FormData(sharpDisagreementForm).entries());
      for (const key of ['top','withinDays','strongQualityThreshold','weakQualityMax','minTopicScore','minPositionValue','maxPagesPerTrader','concurrency']) payload[key] = Number(payload[key]);
      payload.requireWeakOpposition = sharpDisagreementForm.requireWeakOpposition.checked;
      try {
        const data = await postJson('/api/sharp-disagreement', payload);
        renderSharpDisagreement(data);
      } catch (error) {
        sharpDisagreementResults.innerHTML = '<div class="empty warn-text">' + escapeHtml(error.message || String(error)) + '</div>';
      } finally {
        sharpDisagreementButton.disabled = false;
      }
    }

    kalshiMarketsForm.addEventListener('submit', runKalshiMarkets);
    kalshiMarketsButton.addEventListener('click', runKalshiMarkets);

    async function runKalshiMarkets(event) {
      event.preventDefault();
      kalshiMarketsButton.disabled = true;
      kalshiMarketsResults.innerHTML = '<div class="empty">Searching Kalshi markets...</div>';
      const payload = Object.fromEntries(new FormData(kalshiMarketsForm).entries());
      for (const key of ['limit','closeWithinDays','minVolume','orderbookDepth']) payload[key] = Number(payload[key]);
      payload.includeOrderbook = kalshiMarketsForm.includeOrderbook.checked;
      try {
        const data = await postJson('/api/kalshi-markets', payload);
        renderKalshiMarkets(data);
      } catch (error) {
        kalshiMarketsResults.innerHTML = '<div class="empty warn-text">' + escapeHtml(error.message || String(error)) + '</div>';
      } finally {
        kalshiMarketsButton.disabled = false;
      }
    }

    async function postJson(url, payload) {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    function renderConsensus(data) {
      const summary = '<div class="summary"><div class="summary-grid">' +
        metric('Candidates', data.acceptedCandidateCount) +
        metric('Agreement hits', data.agreementCandidateCount) +
        metric('Traders', data.scannedTraderCount) +
        metric('Rejected by entry', data.rejectedByEntryRule) +
        metric('Warnings', data.warnings.length) +
        '</div></div>';
      const warnings = data.warnings.length ? '<div class="warnings"><strong>Warnings</strong><pre>' + escapeHtml(data.warnings.join('\\n')) + '</pre></div>' : '';
      const candidates = data.candidates.length ? data.candidates.map(renderCandidate).join('') : '<div class="empty">No candidates matched these inputs.</div>';
      consensusResults.innerHTML = summary + warnings + candidates;
    }

    function renderCandidate(candidate) {
      return '<article class="candidate">' +
        '<h2>' + escapeHtml(candidate.title) + '</h2>' +
        '<div class="meta">' +
          pill('Side: ' + candidate.outcome) +
          pill('Score: ' + candidate.score) +
          pill(candidate.endDate) +
          pill(candidate.agreeingLeaderCount + '/' + candidate.marketLeaderCount + ' leaders') +
          pill(candidate.agreementPct + '% agreement') +
          pill('$' + money(candidate.totalCurrentValue) + ' leader value') +
          pill('$' + money(candidate.opposingCurrentValue || 0) + ' opposing value') +
          pill('price ' + candidate.currentPrice) +
          pill('entry ' + candidate.minAvgEntry + '-' + candidate.maxAvgEntry) +
        '</div>' +
        '<div class="meta">' +
          pill('score agreement ' + pct(candidate.scoreComponents.agreement)) +
          pill('breadth ' + pct(candidate.scoreComponents.leaderBreadth)) +
          pill('value ' + pct(candidate.scoreComponents.consensusValue)) +
          pill('entry ' + pct(candidate.scoreComponents.entry)) +
          pill('opposition ' + pct(candidate.scoreComponents.opposition)) +
        '</div>' +
        '<h3>Consensus leaders</h3>' +
        '<table><thead><tr><th>Rank</th><th>User</th><th>Side</th><th class="num">Value</th><th class="num">Avg</th><th class="num">Current</th><th class="num">PnL</th></tr></thead><tbody>' +
          candidate.leaders.map(leader => '<tr><td>' + leader.rank + '</td><td>' + leaderName(leader) + '</td><td>' + escapeHtml(candidate.outcome) + '</td><td class="num">$' + money(leader.currentValue) + '</td><td class="num">' + leader.avgPrice + '</td><td class="num">' + leader.curPrice + '</td><td class="num ' + (leader.cashPnl >= 0 ? 'good' : 'warn-text') + '">$' + money(leader.cashPnl) + '</td></tr>').join('') +
        '</tbody></table>' +
        renderOpposingSides(candidate) +
        '<div class="meta" style="margin-top:10px">' + pill(candidate.slug) + pill(candidate.conditionId) + '</div>' +
      '</article>';
    }
    function renderOpposingSides(candidate) {
      if (!candidate.opposingSides || !candidate.opposingSides.length) {
        return '<div class="meta" style="margin-top:10px">' + pill('No opposing qualifying leaders') + '</div>';
      }
      const rows = candidate.opposingSides.flatMap(side => side.leaders.map(leader => ({ side, leader })));
      return '<h3>Opposing leaders</h3>' +
        '<div class="meta">' +
          candidate.opposingSides.map(side => pill('Side: ' + side.outcome + ' | ' + side.leaderCount + ' leaders | $' + money(side.totalCurrentValue) + ' | entry ' + side.minAvgEntry + '-' + side.maxAvgEntry)).join('') +
        '</div>' +
        '<table><thead><tr><th>Rank</th><th>User</th><th>Side</th><th class="num">Value</th><th class="num">Avg</th><th class="num">Current</th><th class="num">PnL</th></tr></thead><tbody>' +
          rows.map(({ side, leader }) => '<tr><td>' + leader.rank + '</td><td>' + leaderName(leader) + '</td><td>' + escapeHtml(side.outcome) + '</td><td class="num">$' + money(leader.currentValue) + '</td><td class="num">' + leader.avgPrice + '</td><td class="num">' + leader.curPrice + '</td><td class="num ' + (leader.cashPnl >= 0 ? 'good' : 'warn-text') + '">$' + money(leader.cashPnl) + '</td></tr>').join('') +
        '</tbody></table>';
    }

    function renderQuality(data) {
      const summary = '<div class="summary"><div class="summary-grid">' +
        metric('Accepted', data.acceptedTraderCount) +
        metric('Scanned', data.scannedTraderCount) +
        metric('Cache hits', data.cacheHitCount) +
        metric('Cache misses', data.cacheMissCount) +
        metric('Warnings', data.warnings.length) +
        '</div></div>';
      const warnings = data.warnings.length ? '<div class="warnings"><strong>Warnings</strong><pre>' + escapeHtml(data.warnings.join('\\n')) + '</pre></div>' : '';
      const table = data.traders.length ? renderQualityTable(data.traders) : '<div class="empty">No traders matched these inputs.</div>';
      qualityResults.innerHTML = summary + warnings + table;
    }

    function renderQualityTable(traders) {
      return '<div class="summary">' +
        '<table><thead><tr>' +
          '<th>Q Rank</th><th>User</th><th>Style</th><th class="num">Score</th><th class="num">PnL</th><th class="num">ROI</th><th class="num">Avg odds</th><th class="num">Actual</th><th class="num">Edge</th><th class="num">Z</th><th class="num">Contra</th><th class="num">Trades</th><th>Last trade</th>' +
        '</tr></thead><tbody>' +
          traders.map(renderQualityRow).join('') +
        '</tbody></table></div>';
    }

    function renderQualityRow(row) {
      const odds = oddsFor(row);
      return '<tr>' +
        '<td>' + row.scoreRank + '</td>' +
        '<td>' + leaderName(row) + '<div class="meta" style="margin:4px 0 0">' + pill('LB #' + row.rank) + pill(row.proxyWallet) + '</div>' + renderOddsBucketDetails(odds) + '</td>' +
        '<td><span class="style-pill">' + escapeHtml(odds.style) + '</span></td>' +
        '<td class="num">' + row.score + '</td>' +
        '<td class="num ' + (row.pnl >= 0 ? 'good' : 'warn-text') + '">$' + money(row.pnl) + '</td>' +
        '<td class="num ' + (row.roiPct >= 0 ? 'good' : 'warn-text') + '">' + signedPct(row.roiPct) + '</td>' +
        '<td class="num">' + pctFromPercent(odds.avgEntryOddsPct) + '</td>' +
        '<td class="num">' + pctFromPercent(odds.actualWinPct) + '</td>' +
        '<td class="num ' + (odds.oddsEdgePct >= 0 ? 'good' : 'warn-text') + '">' + signedPct(odds.oddsEdgePct) + '</td>' +
        '<td class="num ' + (odds.edgeZScore >= 0 ? 'good' : 'warn-text') + '">' + signedNumber(odds.edgeZScore) + '</td>' +
        '<td class="num">' + pctFromPercent(odds.contrarianStakePct) + '</td>' +
        '<td class="num">' + row.metrics.tradeCount + '</td>' +
        '<td>' + shortDate(row.metrics.lastTradeAt) + '</td>' +
      '</tr>';
    }

    function oddsFor(row) {
      return row.metrics && row.metrics.odds ? row.metrics.odds : {
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
        style: 'Thin Sample',
        buckets: [],
      };
    }

    function renderOddsBucketDetails(odds) {
      if (!odds || !odds.buckets || !odds.resolvedPositionCount) {
        return '<div class="meta" style="margin:4px 0 0">' + pill('No resolved odds sample') + '</div>';
      }
      const rows = odds.buckets.filter(bucket => bucket.positionCount > 0).map(bucket =>
        '<tr><td>' + escapeHtml(bucket.label) + '</td>' +
        '<td class="num">' + bucket.positionCount + '</td>' +
        '<td class="num">$' + money(bucket.stakeValue) + '</td>' +
        '<td class="num">' + pctFromPercent(bucket.expectedWinPct) + '</td>' +
        '<td class="num">' + pctFromPercent(bucket.actualWinPct) + '</td>' +
        '<td class="num ' + (bucket.oddsEdgePct >= 0 ? 'good' : 'warn-text') + '">' + signedPct(bucket.oddsEdgePct) + '</td>' +
        '<td class="num ' + (bucket.roiPct >= 0 ? 'good' : 'warn-text') + '">' + signedPct(bucket.roiPct) + '</td></tr>'
      ).join('');
      return '<details><summary>Odds edge: ' + signedPct(odds.oddsEdgePct) + ' across ' + odds.resolvedPositionCount + ' resolved positions</summary>' +
        '<div class="meta" style="margin-top:8px">' +
          pill('Expected ' + pctFromPercent(odds.expectedWinPct)) +
          pill('Actual ' + pctFromPercent(odds.actualWinPct)) +
          pill('Z ' + signedNumber(odds.edgeZScore)) +
          pill('Contrarian edge ' + optionalSignedPct(odds.contrarianEdgePct)) +
          pill('Favorite edge ' + optionalSignedPct(odds.favoriteEdgePct)) +
        '</div>' +
        '<table class="nested-table"><thead><tr><th>Odds bucket</th><th class="num">Positions</th><th class="num">Stake</th><th class="num">Expected</th><th class="num">Actual</th><th class="num">Edge</th><th class="num">ROI</th></tr></thead><tbody>' + rows + '</tbody></table></details>';
    }

    function renderStrongWatch(data) {
      const summary = '<div class="summary"><div class="summary-grid">' +
        metric('Markets', data.candidateCount) +
        metric('Strong traders', data.strongTraderCount) +
        metric('Cached Q', data.cachedQualityCount + '/' + data.scannedTraderCount) +
        metric('Scanned', data.scannedTraderCount) +
        metric('Warnings', data.warnings.length) +
        '</div></div>';
      const warnings = data.warnings.length ? '<div class="warnings"><strong>Warnings</strong><pre>' + escapeHtml(data.warnings.join('\\n')) + '</pre></div>' : '';
      const candidates = data.candidates.length ? data.candidates.map(renderStrongWatchCandidate).join('') : '<div class="empty">No strong-trader current positions matched these inputs.</div>';
      strongWatchResults.innerHTML = summary + warnings + candidates;
    }

    function renderStrongWatchCandidate(candidate) {
      return '<article class="candidate">' +
        '<h2>' + escapeHtml(candidate.title) + '</h2>' +
        '<div class="meta">' +
          pill('Strong side: ' + candidate.outcome) +
          pill('Signal: ' + candidate.score) +
          pill(candidate.endDate) +
          pill(candidate.strongLeaderCount + ' strong') +
          pill(candidate.alignedLeaderCount + '/' + candidate.marketLeaderCount + ' aligned') +
          pill(candidate.opposedLeaderCount + ' opposed') +
          pill(candidate.opposedStrongLeaderCount + ' strong opposed') +
          pill('$' + money(candidate.strongCurrentValue) + ' strong value') +
          pill('$' + money(candidate.alignedCurrentValue) + ' aligned value') +
          pill('$' + money(candidate.opposedCurrentValue) + ' opposed value') +
          pill('price ' + candidate.currentPrice) +
          pill('entry ' + candidate.minAvgEntry + '-' + candidate.maxAvgEntry) +
        '</div>' +
        '<div class="meta">' +
          pill('score quality ' + pct(candidate.scoreComponents.quality)) +
          pill('strong value ' + pct(candidate.scoreComponents.strongValue)) +
          pill('breadth ' + pct(candidate.scoreComponents.strongBreadth)) +
          pill('alignment ' + pct(candidate.scoreComponents.alignment)) +
          pill('entry ' + pct(candidate.scoreComponents.entry)) +
        '</div>' +
        '<h3>Strong traders on this side</h3>' +
        renderLeaderTable(candidate.strongLeaders, candidate.outcome, true) +
        renderExpandableTable('Other aligned leaders', candidate.alignedLeaders, candidate.outcome) +
        renderOpposedWatchTable(candidate.opposedLeaders) +
        '<div class="meta" style="margin-top:10px">' + pill(candidate.slug) + pill(candidate.conditionId) + '</div>' +
      '</article>';
    }

    function renderExpandableTable(title, leaders, outcome) {
      if (!leaders.length) return '<div class="meta" style="margin-top:10px">' + pill('No ' + title.toLowerCase()) + '</div>';
      return '<details><summary>' + escapeHtml(title) + ' (' + leaders.length + ')</summary>' + renderLeaderTable(leaders, outcome, false) + '</details>';
    }

    function renderOpposedWatchTable(leaders) {
      if (!leaders.length) return '<div class="meta" style="margin-top:10px">' + pill('No opposed leaderboard traders') + '</div>';
      return '<details open><summary>Opposed leaders (' + leaders.length + ')</summary>' +
        '<table><thead><tr><th>Rank</th><th>User</th><th>Side</th><th class="num">Value</th><th class="num">Avg</th><th class="num">Current</th><th class="num">PnL</th></tr></thead><tbody>' +
          leaders.map(leader => leaderRow(leader, leader.outcome)) +
        '</tbody></table></details>';
    }

    function renderLeaderTable(leaders, outcome, showEmpty) {
      if (!leaders.length && showEmpty) return '<div class="empty">No leaders.</div>';
      return '<table><thead><tr><th>Rank</th><th>User</th><th>Side</th><th class="num">Value</th><th class="num">Avg</th><th class="num">Current</th><th class="num">PnL</th></tr></thead><tbody>' +
        leaders.map(leader => leaderRow(leader, outcome)).join('') +
      '</tbody></table>';
    }

    function leaderRow(leader, outcome) {
      return '<tr><td>' + leader.rank + '</td><td>' + leaderName(leader) + '</td><td>' + escapeHtml(outcome) + '</td><td class="num">$' + money(leader.currentValue) + '</td><td class="num">' + leader.avgPrice + '</td><td class="num">' + leader.curPrice + '</td><td class="num ' + (leader.cashPnl >= 0 ? 'good' : 'warn-text') + '">$' + money(leader.cashPnl) + '</td></tr>';
    }

    function renderSharpDisagreement(data) {
      const summary = '<div class="summary"><div class="summary-grid">' +
        metric('Markets', data.candidateCount) +
        metric('Sharp traders', data.sharpTraderCount) +
        metric('Cached profiles', data.cachedProfileCount + '/' + data.scannedTraderCount) +
        metric('Scanned', data.scannedTraderCount) +
        metric('Warnings', data.warnings.length) +
        '</div></div>';
      const warnings = data.warnings.length ? '<div class="warnings"><strong>Warnings</strong><pre>' + escapeHtml(data.warnings.join('\\n')) + '</pre></div>' : '';
      const candidates = data.candidates.length ? data.candidates.map(renderSharpDisagreementCandidate).join('') : '<div class="empty">No sharp-vs-weak disagreement matched these inputs.</div>';
      sharpDisagreementResults.innerHTML = summary + warnings + candidates;
    }

    function renderSharpDisagreementCandidate(candidate) {
      return '<article class="candidate">' +
        '<h2>' + escapeHtml(candidate.title) + '</h2>' +
        '<div class="meta">' +
          pill('Sharp side: ' + candidate.outcome) +
          pill('Signal: ' + candidate.score) +
          pill('Topic: ' + candidate.topic) +
          pill(candidate.endDate) +
          pill(candidate.sharpLeaderCount + ' sharp') +
          pill(candidate.alignedLeaderCount + '/' + candidate.marketLeaderCount + ' aligned') +
          pill(candidate.opposedLeaderCount + ' opposed') +
          pill(candidate.weakOpposedLeaderCount + ' weak opposed') +
          pill('$' + money(candidate.sharpCurrentValue) + ' sharp value') +
          pill('$' + money(candidate.weakOpposedCurrentValue) + ' weak opposed value') +
          pill('price ' + candidate.currentPrice) +
          pill('entry ' + candidate.weightedAvgEntry) +
          pill('discount ' + signedPct(candidate.entryDiscountPct)) +
        '</div>' +
        '<div class="meta">' +
          pill('score Q ' + pct(candidate.scoreComponents.quality)) +
          pill('topic fit ' + pct(candidate.scoreComponents.topicFit)) +
          pill('weak opposition ' + pct(candidate.scoreComponents.weakOpposition)) +
          pill('disagreement ' + pct(candidate.scoreComponents.disagreement)) +
          pill('entry ' + pct(candidate.scoreComponents.entry)) +
          pill('value ' + pct(candidate.scoreComponents.value)) +
        '</div>' +
        '<h3>Sharp topic-fit traders</h3>' +
        renderSharpLeaderTable(candidate.sharpLeaders, candidate.outcome, true) +
        renderExpandableSharpTable('Other aligned leaders', candidate.alignedLeaders, candidate.outcome) +
        renderOpposedSharpTable(candidate.opposedLeaders) +
        '<div class="meta" style="margin-top:10px">' + pill(candidate.slug) + pill(candidate.conditionId) + '</div>' +
      '</article>';
    }

    function renderExpandableSharpTable(title, leaders, outcome) {
      if (!leaders.length) return '<div class="meta" style="margin-top:10px">' + pill('No ' + title.toLowerCase()) + '</div>';
      return '<details><summary>' + escapeHtml(title) + ' (' + leaders.length + ')</summary>' + renderSharpLeaderTable(leaders, outcome, false) + '</details>';
    }

    function renderOpposedSharpTable(leaders) {
      if (!leaders.length) return '<div class="meta" style="margin-top:10px">' + pill('No opposed leaderboard traders') + '</div>';
      return '<details open><summary>Opposed leaders (' + leaders.length + ')</summary>' +
        '<table><thead><tr><th>Rank</th><th>User</th><th>Side</th><th class="num">Topic</th><th class="num">Edge</th><th class="num">Value</th><th class="num">Avg</th><th class="num">Current</th><th class="num">PnL</th></tr></thead><tbody>' +
          leaders.map(leader => sharpLeaderRow(leader, leader.outcome, leader.isWeak)) +
        '</tbody></table></details>';
    }

    function renderSharpLeaderTable(leaders, outcome, showEmpty) {
      if (!leaders.length && showEmpty) return '<div class="empty">No leaders.</div>';
      return '<table><thead><tr><th>Rank</th><th>User</th><th>Side</th><th class="num">Topic</th><th class="num">Edge</th><th class="num">Value</th><th class="num">Avg</th><th class="num">Current</th><th class="num">PnL</th></tr></thead><tbody>' +
        leaders.map(leader => sharpLeaderRow(leader, outcome, false)).join('') +
      '</tbody></table>';
    }

    function sharpLeaderRow(leader, outcome, isWeak) {
      const weakPill = isWeak ? ' ' + pill('weak') : '';
      const topicMeta = pct(leader.topicScore) + ' / ' + leader.topicResolvedPositions + ' res';
      return '<tr><td>' + leader.rank + '</td><td>' + leaderName(leader) + weakPill + '</td><td>' + escapeHtml(outcome) + '</td><td class="num">' + topicMeta + '</td><td class="num ' + (Number(leader.topicEdgePct || 0) >= 0 ? 'good' : 'warn-text') + '">' + optionalSignedPct(leader.topicEdgePct) + '</td><td class="num">$' + money(leader.currentValue) + '</td><td class="num">' + leader.avgPrice + '</td><td class="num">' + leader.curPrice + '</td><td class="num ' + (leader.cashPnl >= 0 ? 'good' : 'warn-text') + '">$' + money(leader.cashPnl) + '</td></tr>';
    }

    function renderKalshiMarkets(data) {
      const summary = '<div class="summary"><div class="summary-grid">' +
        metric('Markets', data.returnedMarketCount) +
        metric('Scanned', data.scannedMarketCount) +
        metric('Status', data.query.status || 'any') +
        metric('Orderbooks', data.query.includeOrderbook ? 'yes' : 'no') +
        metric('Warnings', data.warnings.length) +
        '</div></div>';
      const warnings = data.warnings.length ? '<div class="warnings"><strong>Warnings</strong><pre>' + escapeHtml(data.warnings.join('\\n')) + '</pre></div>' : '';
      const table = data.markets.length ? renderKalshiMarketTable(data.markets) : '<div class="empty">No Kalshi markets matched these inputs.</div>';
      kalshiMarketsResults.innerHTML = summary + warnings + table;
    }

    function renderKalshiMarketTable(markets) {
      return '<div class="summary">' +
        '<table><thead><tr><th>Market</th><th>Status</th><th>Close</th><th class="num">YES bid</th><th class="num">YES ask</th><th class="num">Spread</th><th class="num">Last</th><th class="num">24h Vol</th><th class="num">Liquidity</th></tr></thead><tbody>' +
          markets.map(renderKalshiMarketRow).join('') +
        '</tbody></table></div>';
    }

    function renderKalshiMarketRow(market) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(market.title) + '</strong><div class="meta" style="margin:4px 0 0">' + pill(market.ticker) + pill(market.eventTicker) + (market.isCombo ? pill('combo') : '') + '</div>' + renderKalshiOrderbook(market.orderbook) + '</td>' +
        '<td>' + escapeHtml(market.status) + '</td>' +
        '<td>' + shortDateTime(market.closeTime) + '</td>' +
        '<td class="num">' + price(market.yesBid) + '</td>' +
        '<td class="num">' + price(market.yesAsk) + '</td>' +
        '<td class="num">' + price(market.yesSpread) + '</td>' +
        '<td class="num">' + price(market.lastPrice) + '</td>' +
        '<td class="num">' + money(market.volume24h) + '</td>' +
        '<td class="num">' + money(market.liquidity) + '</td>' +
      '</tr>';
    }

    function renderKalshiOrderbook(orderbook) {
      if (!orderbook) return '';
      const yesRows = orderbook.yesLevels.map(level => '<tr><td>YES bid</td><td class="num">' + price(level.price) + '</td><td class="num">' + money(level.contracts) + '</td></tr>').join('');
      const noRows = orderbook.noLevels.map(level => '<tr><td>NO bid</td><td class="num">' + price(level.price) + '</td><td class="num">' + money(level.contracts) + '</td></tr>').join('');
      const rows = yesRows + noRows || '<tr><td colspan="3">No visible book levels</td></tr>';
      return '<details><summary>Orderbook' +
        (Number.isFinite(Number(orderbook.impliedYesAsk)) ? ' | implied YES ask ' + price(orderbook.impliedYesAsk) : '') +
        '</summary><table class="nested-table"><thead><tr><th>Side</th><th class="num">Price</th><th class="num">Contracts</th></tr></thead><tbody>' + rows + '</tbody></table></details>';
    }

    function leaderName(leader) {
      return '<span class="leader-name">' + escapeHtml(leader.userName) + qualityBadge(leader) + '</span>';
    }

    function qualityBadge(leader) {
      const score = Number(leader.qualityScore ?? leader.score);
      const label = leader.qualityLabel || leader.scoreLabel;
      if (!Number.isFinite(score)) return '<span class="quality-badge quality-none" title="No cached trader quality score">Q --</span>';
      const rank = leader.qualityRank || leader.scoreRank;
      const title = 'Trader quality: ' + score + ' (' + label + ')' + (rank ? ', local rank #' + rank : '');
      return '<span class="quality-badge ' + qualityClass(label) + '" title="' + escapeHtml(title) + '">Q' + Math.round(score) + (rank ? ' #' + rank : '') + '</span>';
    }

    function qualityClass(label) {
      return 'quality-' + String(label || 'none').toLowerCase();
    }

    function metric(label, value) { return '<div class="metric"><span>' + label + '</span><strong>' + value + '</strong></div>'; }
    function pill(value) { return '<span class="pill">' + escapeHtml(String(value)) + '</span>'; }
    function money(value) { return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
    function price(value) { return Number(value) > 0 ? '$' + Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '--'; }
    function pct(value) { return Math.round(Number(value) * 100) + '%'; }
    function signedPct(value) { return (Number(value) >= 0 ? '+' : '') + Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%'; }
    function optionalSignedPct(value) { return Number.isFinite(Number(value)) ? signedPct(value) : '--'; }
    function pctFromPercent(value) { return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%'; }
    function signedNumber(value) { return (Number(value) >= 0 ? '+' : '') + Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
    function rate(value, denominator) { return denominator ? pct(value) + ' (' + denominator + ')' : '--'; }
    function shortDate(value) { return value ? new Date(value).toLocaleDateString() : '--'; }
    function shortDateTime(value) { return value ? new Date(value).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '--'; }
    function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
  </script>
</body>
</html>`;
}
