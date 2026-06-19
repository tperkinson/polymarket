import { createPublicPolymarketUSClient } from "../polymarket/us-client.js";

const client = createPublicPolymarketUSClient();

const [events, markets, sports] = await Promise.all([
  client.events.list({ limit: 5, active: true }),
  client.markets.list({ limit: 5, active: true }),
  client.sports.list(),
]);

console.log(
  JSON.stringify(
    {
      publicApi: "https://gateway.polymarket.us",
      activeEventCount: events.events.length,
      activeMarketCount: markets.markets.length,
      sportsCount: sports.sports.length,
      sampleEvents: events.events.map((event) => ({
        slug: event.slug,
        title: event.title,
      })),
      sampleMarkets: markets.markets.map((market) => ({
        slug: market.slug,
        title: market.title,
        outcome: market.outcome,
      })),
    },
    null,
    2,
  ),
);
