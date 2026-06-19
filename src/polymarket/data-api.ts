export type PositionSortBy =
  | "CURRENT"
  | "INITIAL"
  | "TOKENS"
  | "CASHPNL"
  | "PERCENTPNL"
  | "TITLE"
  | "RESOLVING"
  | "PRICE"
  | "AVGPRICE";

export type SortDirection = "ASC" | "DESC";

export type TradeSide = "BUY" | "SELL";

export type LeaderboardCategory =
  | "OVERALL"
  | "POLITICS"
  | "SPORTS"
  | "ESPORTS"
  | "CRYPTO"
  | "CULTURE"
  | "MENTIONS"
  | "WEATHER"
  | "ECONOMICS"
  | "TECH"
  | "FINANCE";

export type LeaderboardTimePeriod = "DAY" | "WEEK" | "MONTH" | "ALL";

export type LeaderboardOrderBy = "PNL" | "VOL";

export type LeaderboardTrader = {
  rank: string;
  proxyWallet: string;
  userName: string;
  vol: number;
  pnl: number;
  profileImage?: string;
  xUsername?: string;
  verifiedBadge: boolean;
};

export type Trade = {
  proxyWallet: string;
  side: TradeSide;
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug?: string;
  outcome: string;
  outcomeIndex: number;
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
  transactionHash?: string;
};

export type Position = {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title: string;
  slug: string;
  icon?: string;
  eventId?: string;
  eventSlug?: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome?: string;
  oppositeAsset?: string;
  endDate?: string;
  negativeRisk: boolean;
};

export type ClosedPositionSortBy = "REALIZEDPNL" | "TITLE" | "PRICE" | "AVGPRICE" | "TIMESTAMP";

export type ClosedPosition = {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  avgPrice: number;
  totalBought: number;
  realizedPnl: number;
  curPrice: number;
  timestamp: number;
  title: string;
  slug: string;
  icon?: string;
  eventSlug?: string;
  outcome: string;
  outcomeIndex: number;
  oppositeOutcome?: string;
  oppositeAsset?: string;
  endDate?: string;
};

export type FetchUserPositionsOptions = {
  user: string;
  sortBy?: PositionSortBy;
  sortDirection?: SortDirection;
  sizeThreshold?: number;
  market?: string;
  eventId?: string;
};

export type FetchUserPositionsPageOptions = FetchUserPositionsOptions & {
  limit: number;
  offset: number;
};

export type FetchUserTradesOptions = {
  user: string;
  side?: TradeSide;
  takerOnly?: boolean;
};

export type FetchUserTradesPageOptions = FetchUserTradesOptions & {
  limit: number;
  offset: number;
};

export type FetchUserClosedPositionsOptions = {
  user: string;
  sortBy?: ClosedPositionSortBy;
  sortDirection?: SortDirection;
  market?: string;
  eventId?: string;
};

export type FetchUserClosedPositionsPageOptions = FetchUserClosedPositionsOptions & {
  limit: number;
  offset: number;
};

export type FetchLeaderboardRangeOptions = {
  fromRank: number;
  toRank: number;
  category?: LeaderboardCategory;
  timePeriod?: LeaderboardTimePeriod;
  orderBy?: LeaderboardOrderBy;
};

const DATA_API_BASE_URL = "https://data-api.polymarket.com";
const POSITIONS_PAGE_SIZE = 500;
const CLOSED_POSITIONS_PAGE_SIZE = 50;
const TRADES_PAGE_SIZE = 500;
const LEADERBOARD_PAGE_SIZE = 50;
const MAX_OFFSET = 10_000;
const TRADES_MAX_OFFSET = 1_000;
const LEADERBOARD_MAX_OFFSET = 1_000;
const REQUEST_TIMEOUT_MS = 10_000;

export async function fetchAllUserPositions({
  user,
  sortBy = "CURRENT",
  sortDirection = "DESC",
  sizeThreshold = 0,
  market,
  eventId,
}: FetchUserPositionsOptions): Promise<{ positions: Position[]; hitOffsetLimit: boolean }> {
  const positions: Position[] = [];

  for (let offset = 0; offset <= MAX_OFFSET; offset += POSITIONS_PAGE_SIZE) {
    const page = await fetchUserPositionsPage({
      user,
      sortBy,
      sortDirection,
      sizeThreshold,
      market,
      eventId,
      limit: POSITIONS_PAGE_SIZE,
      offset,
    });

    positions.push(...page);

    if (page.length < POSITIONS_PAGE_SIZE) {
      return { positions, hitOffsetLimit: false };
    }
  }

  return { positions, hitOffsetLimit: true };
}

export async function fetchAllUserTrades({
  user,
  side,
  takerOnly = false,
}: FetchUserTradesOptions): Promise<{ trades: Trade[]; hitOffsetLimit: boolean }> {
  const trades: Trade[] = [];

  for (let offset = 0; offset <= TRADES_MAX_OFFSET; offset += TRADES_PAGE_SIZE) {
    const page = await fetchUserTradesPage({
      user,
      side,
      takerOnly,
      limit: TRADES_PAGE_SIZE,
      offset,
    });

    trades.push(...page);

    if (page.length < TRADES_PAGE_SIZE) {
      return { trades, hitOffsetLimit: false };
    }
  }

  return { trades, hitOffsetLimit: true };
}

export async function fetchAllUserClosedPositions({
  user,
  sortBy = "TIMESTAMP",
  sortDirection = "DESC",
  market,
  eventId,
}: FetchUserClosedPositionsOptions): Promise<{ positions: ClosedPosition[]; hitOffsetLimit: boolean }> {
  const positions: ClosedPosition[] = [];

  for (let offset = 0; offset <= MAX_OFFSET; offset += CLOSED_POSITIONS_PAGE_SIZE) {
    const page = await fetchUserClosedPositionsPage({
      user,
      sortBy,
      sortDirection,
      market,
      eventId,
      limit: CLOSED_POSITIONS_PAGE_SIZE,
      offset,
    });

    positions.push(...page);

    if (page.length < CLOSED_POSITIONS_PAGE_SIZE) {
      return { positions, hitOffsetLimit: false };
    }
  }

  return { positions, hitOffsetLimit: true };
}

export async function fetchLeaderboardRange({
  fromRank,
  toRank,
  category = "OVERALL",
  timePeriod = "DAY",
  orderBy = "PNL",
}: FetchLeaderboardRangeOptions): Promise<{ traders: LeaderboardTrader[]; hitOffsetLimit: boolean }> {
  if (fromRank < 1) throw new Error("fromRank must be 1 or greater.");
  if (toRank < fromRank) throw new Error("toRank must be greater than or equal to fromRank.");

  const firstOffset = fromRank - 1;
  if (firstOffset > LEADERBOARD_MAX_OFFSET) {
    throw new Error(`Leaderboard offset ${firstOffset} exceeds documented maximum ${LEADERBOARD_MAX_OFFSET}.`);
  }

  const traders: LeaderboardTrader[] = [];

  for (let offset = firstOffset; offset <= toRank - 1; offset += LEADERBOARD_PAGE_SIZE) {
    if (offset > LEADERBOARD_MAX_OFFSET) {
      return { traders, hitOffsetLimit: true };
    }

    const remaining = toRank - fromRank + 1 - traders.length;
    const limit = Math.min(LEADERBOARD_PAGE_SIZE, remaining);
    const page = await fetchLeaderboardPage({
      category,
      timePeriod,
      orderBy,
      limit,
      offset,
    });

    traders.push(...page);

    if (page.length < limit) {
      return { traders, hitOffsetLimit: false };
    }
  }

  return { traders, hitOffsetLimit: false };
}

export async function fetchUserPositionsPage({
  user,
  sortBy = "CURRENT",
  sortDirection = "DESC",
  sizeThreshold = 0,
  market,
  eventId,
  limit,
  offset,
}: FetchUserPositionsPageOptions): Promise<Position[]> {
  const url = new URL("/positions", DATA_API_BASE_URL);
  url.searchParams.set("user", user);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sortBy", sortBy);
  url.searchParams.set("sortDirection", sortDirection);
  url.searchParams.set("sizeThreshold", String(sizeThreshold));

  if (market) url.searchParams.set("market", market);
  if (eventId) url.searchParams.set("eventId", eventId);

  return fetchDataApiJson<Position[]>(url, "positions");
}

export async function fetchUserTradesPage({
  user,
  side,
  takerOnly = false,
  limit,
  offset,
}: FetchUserTradesPageOptions): Promise<Trade[]> {
  const url = new URL("/trades", DATA_API_BASE_URL);
  url.searchParams.set("user", user);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("takerOnly", String(takerOnly));

  if (side) url.searchParams.set("side", side);

  return fetchDataApiJson<Trade[]>(url, "trades");
}

export async function fetchUserClosedPositionsPage({
  user,
  sortBy = "TIMESTAMP",
  sortDirection = "DESC",
  market,
  eventId,
  limit,
  offset,
}: FetchUserClosedPositionsPageOptions): Promise<ClosedPosition[]> {
  const url = new URL("/closed-positions", DATA_API_BASE_URL);
  url.searchParams.set("user", user);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sortBy", sortBy);
  url.searchParams.set("sortDirection", sortDirection);

  if (market) url.searchParams.set("market", market);
  if (eventId) url.searchParams.set("eventId", eventId);

  return fetchDataApiJson<ClosedPosition[]>(url, "closed positions");
}

async function fetchLeaderboardPage(params: {
  category: LeaderboardCategory;
  timePeriod: LeaderboardTimePeriod;
  orderBy: LeaderboardOrderBy;
  limit: number;
  offset: number;
}): Promise<LeaderboardTrader[]> {
  const url = new URL("/v1/leaderboard", DATA_API_BASE_URL);
  url.searchParams.set("category", params.category);
  url.searchParams.set("timePeriod", params.timePeriod);
  url.searchParams.set("orderBy", params.orderBy);
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("offset", String(params.offset));

  return fetchDataApiJson<LeaderboardTrader[]>(url, "leaderboard");
}

async function fetchDataApiJson<T>(url: URL, label: string, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        if (response.status === 404) return [] as T;
        throw new Error(`Data API ${label} request failed: ${response.status} ${response.statusText} - ${await response.text()}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(500 * attempt);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
