export type MarketTopic =
  | "POLITICS"
  | "SPORTS"
  | "CRYPTO"
  | "FINANCE"
  | "ECONOMICS"
  | "TECH"
  | "CULTURE"
  | "WEATHER"
  | "ESPORTS"
  | "OTHER";

const TOPIC_KEYWORDS: Array<{ topic: MarketTopic; keywords: string[] }> = [
  {
    topic: "POLITICS",
    keywords: ["election", "president", "senate", "congress", "mayor", "governor", "trump", "biden", "democrat", "republican", "politic"],
  },
  {
    topic: "SPORTS",
    keywords: ["nba", "nfl", "mlb", "nhl", "ufc", "soccer", "football", "baseball", "basketball", "tennis", "golf", "fifa", "world cup"],
  },
  {
    topic: "CRYPTO",
    keywords: ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "token", "airdrop", "binance", "coinbase"],
  },
  {
    topic: "FINANCE",
    keywords: ["stock", "stocks", "spx", "s&p", "nasdaq", "dow", "fed", "rate cut", "earnings", "ipo", "market cap"],
  },
  {
    topic: "ECONOMICS",
    keywords: ["cpi", "inflation", "jobs report", "unemployment", "gdp", "recession", "tariff", "economy"],
  },
  {
    topic: "TECH",
    keywords: ["openai", "apple", "google", "microsoft", "nvidia", "tesla", "spacex", "ai", "iphone", "android"],
  },
  {
    topic: "WEATHER",
    keywords: ["weather", "temperature", "hurricane", "storm", "rain", "snow", "tornado", "heat"],
  },
  {
    topic: "ESPORTS",
    keywords: ["esports", "league of legends", "valorant", "counter-strike", "cs2", "dota"],
  },
  {
    topic: "CULTURE",
    keywords: ["oscars", "grammys", "box office", "movie", "album", "song", "celebrity", "tiktok", "twitter", "x.com"],
  },
];

export function inferMarketTopic(input: {
  title?: string;
  slug?: string;
  eventSlug?: string;
  outcome?: string;
}): MarketTopic {
  const text = `${input.title ?? ""} ${input.slug ?? ""} ${input.eventSlug ?? ""} ${input.outcome ?? ""}`.toLowerCase();
  let best: { topic: MarketTopic; score: number } = { topic: "OTHER", score: 0 };

  for (const definition of TOPIC_KEYWORDS) {
    const score = definition.keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
    if (score > best.score) best = { topic: definition.topic, score };
  }

  return best.topic;
}
