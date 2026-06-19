export type KalshiMarketStatus = "unopened" | "open" | "paused" | "closed" | "settled" | "";
export type KalshiMveFilter = "exclude" | "only" | "";

export type KalshiMarketSearchOptions = {
  query: string;
  status: KalshiMarketStatus;
  limit: number;
  closeWithinDays: number;
  minVolume: number;
  mveFilter: KalshiMveFilter;
  includeOrderbook: boolean;
  orderbookDepth: number;
};

export type KalshiMarket = {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  status: string;
  market_type: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  open_time?: string;
  close_time?: string;
  expected_expiration_time?: string;
  expiration_time?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  yes_bid_size_fp?: string;
  yes_ask_size_fp?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  previous_price_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  open_interest_fp?: string;
  liquidity_dollars?: string;
  can_close_early?: boolean;
  fractional_trading_enabled?: boolean;
  mve_collection_ticker?: string;
};

export type KalshiOrderbook = {
  orderbook_fp?: {
    yes_dollars?: Array<[string, string]>;
    no_dollars?: Array<[string, string]>;
  };
};

export type KalshiMarketRow = {
  ticker: string;
  eventTicker: string;
  title: string;
  status: string;
  marketType: string;
  closeTime?: string;
  expectedExpirationTime?: string;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  previousPrice: number;
  yesSpread: number;
  volume: number;
  volume24h: number;
  openInterest: number;
  liquidity: number;
  isCombo: boolean;
  orderbook?: KalshiOrderbookSummary;
};

export type KalshiOrderbookSummary = {
  yesLevels: KalshiOrderbookLevel[];
  noLevels: KalshiOrderbookLevel[];
  bestYesBid?: number;
  bestNoBid?: number;
  impliedYesAsk?: number;
  impliedNoAsk?: number;
};

export type KalshiOrderbookLevel = {
  price: number;
  contracts: number;
};

export type KalshiMarketSearchResult = {
  schemaVersion: 1;
  fetchedAt: string;
  source: {
    markets: string;
    orderbook: string;
  };
  query: KalshiMarketSearchOptions;
  scannedMarketCount: number;
  returnedMarketCount: number;
  warnings: string[];
  markets: KalshiMarketRow[];
};

type KalshiMarketsResponse = {
  markets?: KalshiMarket[];
  cursor?: string;
};

const KALSHI_API_BASE_URL = "https://external-api.kalshi.com/trade-api/v2";
const REQUEST_TIMEOUT_MS = 10_000;

export async function searchKalshiMarkets(options: KalshiMarketSearchOptions): Promise<KalshiMarketSearchResult> {
  validateKalshiMarketSearchOptions(options);

  const warnings: string[] = [];
  const response = await fetchKalshiMarkets(options);
  const through = options.closeWithinDays > 0 ? Date.now() + options.closeWithinDays * 86_400_000 : 0;
  const query = options.query.trim().toLowerCase();
  const filtered = (response.markets ?? [])
    .filter((market) => !query || marketMatchesQuery(market, query))
    .filter((market) => options.closeWithinDays <= 0 || isBeforeThrough(market.close_time, through))
    .filter((market) => dollarValue(market.volume_fp) >= options.minVolume)
    .map(toMarketRow)
    .sort(
      (a, b) =>
        b.volume24h - a.volume24h ||
        b.volume - a.volume ||
        b.liquidity - a.liquidity ||
        a.ticker.localeCompare(b.ticker),
    )
    .slice(0, options.limit);

  if (options.includeOrderbook) {
    await addOrderbooks(filtered, options, warnings);
  }

  return {
    schemaVersion: 1,
    fetchedAt: new Date().toISOString(),
    source: {
      markets: `${KALSHI_API_BASE_URL}/markets`,
      orderbook: `${KALSHI_API_BASE_URL}/markets/{ticker}/orderbook`,
    },
    query: options,
    scannedMarketCount: response.markets?.length ?? 0,
    returnedMarketCount: filtered.length,
    warnings,
    markets: filtered,
  };
}

async function fetchKalshiMarkets(options: KalshiMarketSearchOptions): Promise<KalshiMarketsResponse> {
  const url = new URL("/trade-api/v2/markets", "https://external-api.kalshi.com");
  const needsLocalFiltering = Boolean(options.query.trim()) || options.closeWithinDays > 0 || options.minVolume > 0;
  url.searchParams.set("limit", String(needsLocalFiltering ? 1000 : Math.min(1000, Math.max(options.limit * 5, options.limit))));
  if (options.status) url.searchParams.set("status", options.status);
  if (options.mveFilter) url.searchParams.set("mve_filter", options.mveFilter);

  return fetchKalshiJson<KalshiMarketsResponse>(url, "markets");
}

async function addOrderbooks(
  markets: KalshiMarketRow[],
  options: KalshiMarketSearchOptions,
  warnings: string[],
): Promise<void> {
  await Promise.all(
    markets.map(async (market) => {
      try {
        const orderbook = await fetchKalshiOrderbook(market.ticker, options.orderbookDepth);
        market.orderbook = summarizeOrderbook(orderbook);
      } catch (error) {
        warnings.push(`Could not fetch Kalshi orderbook for ${market.ticker}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );
}

async function fetchKalshiOrderbook(ticker: string, depth: number): Promise<KalshiOrderbook> {
  const url = new URL(`/trade-api/v2/markets/${encodeURIComponent(ticker)}/orderbook`, "https://external-api.kalshi.com");
  url.searchParams.set("depth", String(depth));
  return fetchKalshiJson<KalshiOrderbook>(url, "orderbook");
}

async function fetchKalshiJson<T>(url: URL, label: string, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        throw new Error(`Kalshi ${label} request failed: ${response.status} ${response.statusText} - ${await response.text()}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(400 * attempt);
    }
  }

  throw lastError;
}

function toMarketRow(market: KalshiMarket): KalshiMarketRow {
  const yesBid = dollarValue(market.yes_bid_dollars);
  const yesAsk = dollarValue(market.yes_ask_dollars);
  const noBid = dollarValue(market.no_bid_dollars);
  const noAsk = dollarValue(market.no_ask_dollars);

  return {
    ticker: market.ticker,
    eventTicker: market.event_ticker,
    title: market.title || market.yes_sub_title || market.ticker,
    status: market.status,
    marketType: market.market_type,
    closeTime: market.close_time,
    expectedExpirationTime: market.expected_expiration_time,
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    lastPrice: dollarValue(market.last_price_dollars),
    previousPrice: dollarValue(market.previous_price_dollars),
    yesSpread: yesAsk > 0 && yesBid > 0 ? round4(yesAsk - yesBid) : 0,
    volume: dollarValue(market.volume_fp),
    volume24h: dollarValue(market.volume_24h_fp),
    openInterest: dollarValue(market.open_interest_fp),
    liquidity: dollarValue(market.liquidity_dollars),
    isCombo: Boolean(market.mve_collection_ticker),
  };
}

function summarizeOrderbook(orderbook: KalshiOrderbook): KalshiOrderbookSummary {
  const yesLevels = (orderbook.orderbook_fp?.yes_dollars ?? []).map(toOrderbookLevel).sort((a, b) => b.price - a.price);
  const noLevels = (orderbook.orderbook_fp?.no_dollars ?? []).map(toOrderbookLevel).sort((a, b) => b.price - a.price);
  const bestYesBid = yesLevels[0]?.price;
  const bestNoBid = noLevels[0]?.price;

  return {
    yesLevels,
    noLevels,
    bestYesBid,
    bestNoBid,
    impliedYesAsk: bestNoBid === undefined ? undefined : round4(1 - bestNoBid),
    impliedNoAsk: bestYesBid === undefined ? undefined : round4(1 - bestYesBid),
  };
}

function toOrderbookLevel(level: [string, string]): KalshiOrderbookLevel {
  return {
    price: dollarValue(level[0]),
    contracts: dollarValue(level[1]),
  };
}

function marketMatchesQuery(market: KalshiMarket, query: string): boolean {
  return [
    market.ticker,
    market.event_ticker,
    market.title,
    market.subtitle,
    market.yes_sub_title,
    market.no_sub_title,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function isBeforeThrough(value: string | undefined, through: number): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= through;
}

export function validateKalshiMarketSearchOptions(options: KalshiMarketSearchOptions): void {
  if (options.limit < 1 || options.limit > 100) throw new Error("limit must be between 1 and 100.");
  if (!["", "unopened", "open", "paused", "closed", "settled"].includes(options.status)) throw new Error(`Unsupported Kalshi status: ${options.status}`);
  if (!["", "exclude", "only"].includes(options.mveFilter)) throw new Error(`Unsupported Kalshi combo filter: ${options.mveFilter}`);
  if (options.closeWithinDays < 0) throw new Error("closeWithinDays must be zero or greater.");
  if (options.minVolume < 0) throw new Error("minVolume must be zero or greater.");
  if (options.orderbookDepth < 0 || options.orderbookDepth > 100) throw new Error("orderbookDepth must be between 0 and 100.");
}

function dollarValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
